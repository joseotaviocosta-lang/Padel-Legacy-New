import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, ChevronRight, Inbox, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { ensureContextualCareerCommunications, isCareerMessageUnread, listCareerCommunications, resolveAndOpenNotification } from '@/lib/careerCommunications.js';
import { countUnreadCareerMessages } from '@/lib/notificationSelectors.js';
import { NotificationBadge } from '@/components/design-system';
import { useOverlayBehavior } from '@/components/design-system/useOverlayBehavior.js';
import {
  getNotificationAttentionLevel,
  getNotificationCategoryLabel,
  groupNotificationsByPriority,
} from '@/lib/notificationCenter.js';
import { useCareer } from '@/careers/useCareer.js';
import { getMatchCheckpointRepository } from '@/careers/MatchCheckpointRepository.js';
import { useRenderCounter } from '@/dev/performanceProbe.js';
import { APP_ROUTES } from '@/navigation/routes.js';

// Mobile M3.5 (docs/MOBILE_M3_5_RENDER_STORM.md): memoizado — montado 2x no
// shell global (header compacto + barra desktop) e antes re-renderizava a
// cada mudança de estado do AppLayout sem relação com notificações. Sua
// única prop (`compact`) é um booleano estático por instância.
function CommunicationBell({ compact = false }) {
  useRenderCounter('CommunicationBell');
  const { activeCareer } = useCareer();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [view, setView] = useState('unread');
  const closeCenter = useCallback(() => setOpen(false), []);
  const { closeRef, panelRef } = useOverlayBehavior({ open, onClose: closeCenter });

  const load = useCallback(async () => {
    const user = await localGame.auth.me().catch(() => null);
    const profile = user ? await ensureMyProfile(user).catch(() => null) : null;
    if (!profile?.id) return;

    // O sino também executa a reconciliação contextual. Assim novas mensagens
    // aparecem mesmo quando o jogador avança o calendário sem voltar à Home.
    const [tournaments, matches, partnerships, sponsorContracts, calendarEvents, registrations, pressArticles, activeMatchCheckpoint] = await Promise.all([
      localGame.entities.Tournament.filter({ status: 'inscricoes' }).catch(() => []),
      localGame.entities.Match.filter({ profile_id: profile.id }, '-created_date', 40).catch(() => []),
      localGame.entities.Partnership.filter({ profile_id: profile.id, status: 'ativa' }, '-started_career_date', 1).catch(() => []),
      localGame.entities.PlayerContract.filter({ profile_id: profile.id, is_active: true }, '-created_date', 20).catch(() => []),
      localGame.entities.CalendarEvent.filter({ profile_id: profile.id }, 'start_date', 100).catch(() => []),
      localGame.entities.TournamentRegistration.filter({ profile_id: profile.id }, '-registered_at', 100).catch(() => []),
      localGame.entities.PressArticle.filter({ profile_id: profile.id }, '-created_date', 100).catch(() => []),
      getMatchCheckpointRepository().read(activeCareer?.career_id).catch(() => null),
    ]);
    const nextTournament = (tournaments || [])
      .filter((item) => item.start_date && item.start_date >= (profile.career_date || '2026-01-01'))
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
    const recentWins = (matches || []).slice(0, 8).filter((match) => (
      match.winner_id === profile.id
      || match.winner_player_id === profile.id
      || match.player_won === true
      || match.is_winner === true
    )).length;

    const created = await ensureContextualCareerCommunications(profile, {
      nextTournament,
      matches,
      partnership: partnerships?.[0] || null,
      sponsorContracts,
      recentWins,
      partnerName: profile.partner_name,
      calendarEvents,
      registrations,
      pressArticles,
      activeMatchCheckpoint,
    }).catch(() => []);

    const rows = await listCareerCommunications(profile.id, 200, { matches, profile, pressArticles });
    setMessages(rows);
    if (created.length) window.dispatchEvent(new CustomEvent('padel:communications-created', { detail: { count: created.length } }));
  }, [activeCareer?.career_id]);

  useEffect(() => {
    let active = true;
    const safeLoad = async () => {
      if (!active || document.hidden) return;
      await load();
    };
    safeLoad();
    // Um único avanço de dia dispara profile-updated + communications-refresh
    // duas vezes (fase rápida + fase secundária), o que sem debounce chamava
    // as sete consultas de reconciliação até quatro vezes por clique.
    let timer = null;
    const debouncedLoad = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; safeLoad(); }, 150);
    };
    window.addEventListener('padel:communications-refresh', debouncedLoad);
    window.addEventListener('padel:communications-updated', debouncedLoad);
    window.addEventListener('padel:profile-updated', debouncedLoad);
    window.addEventListener('focus', safeLoad);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener('padel:communications-refresh', debouncedLoad);
      window.removeEventListener('padel:communications-updated', debouncedLoad);
      window.removeEventListener('padel:profile-updated', debouncedLoad);
      window.removeEventListener('focus', safeLoad);
    };
  }, [load]);

  // M3.4 (docs/MOBILE_M3_4_DEVICE_PERFORMANCE.md, Parte 13): o sino vive no
  // shell global (renderiza em toda página) — sem memo, esse filtro sobre
  // até 200 mensagens rodava de novo a cada render do AppLayout, não só
  // quando `messages` de fato mudava.
  const unread = useMemo(() => countUnreadCareerMessages(messages), [messages]);
  const visibleMessages = useMemo(
    () => (view === 'unread' ? messages.filter(isCareerMessageUnread) : messages),
    [messages, view],
  );
  // Onboarding 2.0 + Central de Notificações (docs/ONBOARDING_V3_COMMUNICATIONS.md,
  // itens 26/34): agrupar por prioridade (Ação necessária > Atualizações >
  // Relatórios) em vez de só Hoje/Anteriores — um relatório semanal
  // passivo não deve competir visualmente com uma entrevista ou torneio
  // pendente. Não esconde nada, só reordena.
  const groupedMessages = useMemo(
    () => groupNotificationsByPriority(visibleMessages.slice(0, 8)),
    [visibleMessages],
  );

  function handleToggle() {
    setOpen((current) => !current);
  }

  // Mobile M2: usa o mesmo handler central que a Central de Notificações
  // (resolveAndOpenNotification) — marca como lida e navega em um único
  // toque sempre que a notificação tiver destino, igual em qualquer lugar
  // que a aciona. A atualização otimista da lista continua local (é só a
  // linha desta lista, não faz parte da regra de negócio compartilhada).
  async function handleMessageClick(message) {
    if (isCareerMessageUnread(message)) {
      setMessages((current) => current.map((item) => item.id === message.id
        ? { ...item, is_read: true, is_new: false, ...(item.status === 'nao_lida' ? { status: 'lida' } : {}) }
        : item));
    }
    setOpen(false);
    try {
      await resolveAndOpenNotification(message, { navigate });
    } catch {
      load();
    }
  }

  const center = open && typeof document !== 'undefined' ? createPortal(
    <div
      className="pl-layer-notification pointer-events-auto fixed inset-0 h-[100dvh] w-[100dvw] overflow-hidden"
      data-notification-overlay
      data-scroll-lock="body"
    >
      <button
        type="button"
        aria-label="Fechar notificações"
        className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-[2px]"
        onClick={closeCenter}
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Central de notificações"
        className="pl-safe-t pl-safe-b absolute inset-y-0 right-0 z-10 flex h-[100dvh] w-full max-w-sm min-w-0 flex-col overflow-hidden border-l border-border/70 bg-card shadow-2xl sm:inset-y-3 sm:right-3 sm:h-[calc(100dvh-1.5rem)] sm:rounded-2xl sm:border"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3 pr-[calc(0.75rem+var(--pl-safe-r))]">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Central única</p>
            <p className="truncate font-black">Notificações</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {unread > 0 && <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-black text-primary">{unread}</span>}
            <button ref={closeRef} type="button" aria-label="Fechar notificações" onClick={closeCenter} className="pl-icon-tap flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-b border-border/60 px-3 py-2" aria-label="Filtro de notificações">
          {[
            { id: 'unread', label: 'Não lidas' },
            { id: 'all', label: 'Todas' },
          ].map((item) => (
            <button key={item.id} type="button" onClick={() => setView(item.id)} className={`min-h-11 rounded-lg px-3 py-1.5 text-[11px] font-bold ${view === item.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground'}`}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="scrollbar-premium min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-2" data-notification-scroll>
          {groupedMessages.length ? groupedMessages.map((group) => {
            const isReports = group.id === 'reports';
            return (
              <section key={group.id} aria-label={group.label} className="mb-2 last:mb-0">
                <p className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">{group.label}</p>
                {group.messages.map((message) => (
                  <button type="button" key={message.id} onClick={() => handleMessageClick(message)} className={`flex min-h-11 w-full gap-3 rounded-xl text-left hover:bg-secondary/60 ${isReports ? 'p-2' : 'p-3'}`}>
                    <div className={`flex shrink-0 items-center justify-center rounded-xl ${isReports ? 'h-7 w-7 bg-secondary/70' : 'h-9 w-9 bg-primary/10'}`}><Inbox className={isReports ? 'h-3.5 w-3.5 text-muted-foreground' : 'h-4 w-4 text-primary'} /></div>
                    <div className="min-w-0 flex-1">
                      {!isReports && <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wide text-muted-foreground"><span>{getNotificationCategoryLabel(message)}</span><span>·</span><span>{getNotificationAttentionLevel(message)}</span></div>}
                      <p className={`truncate font-bold ${isReports ? 'text-[11px]' : 'mt-1 text-xs'}`}>{message.title}</p>
                      <p className={`text-muted-foreground ${isReports ? 'line-clamp-1 text-[9px]' : 'mt-1 line-clamp-2 text-[10px]'}`}>{message.content}</p>
                    </div>
                    {isCareerMessageUnread(message) && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" title="Não lida" />}
                  </button>
                ))}
              </section>
            );
          }) : <div className="p-8 text-center text-xs text-muted-foreground"><p className="font-bold text-foreground">Você está em dia.</p><p className="mt-1">Nenhuma notificação exige sua atenção.</p></div>}
        </div>

        <Link to={APP_ROUTES.COMMUNICATIONS} onClick={closeCenter} className="flex min-h-11 shrink-0 items-center justify-between border-t border-border/60 px-4 py-3 text-xs font-bold text-primary">
          Abrir Central de Notificações <ChevronRight className="h-4 w-4" />
        </Link>
      </section>
    </div>,
    document.body,
  ) : null;

  return (
    <>
    <div className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Abrir notificações — ${unread} não lida${unread === 1 ? '' : 's'}` : 'Abrir notificações'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notificações"
        onClick={handleToggle}
        className={`pl-icon-tap relative inline-flex items-center justify-center rounded-xl border border-border/70 bg-card/70 text-muted-foreground transition-colors hover:text-foreground ${compact ? 'h-9 w-9' : 'h-10 w-10'}`}
      >
        <Bell className="h-4.5 w-4.5" />
        <NotificationBadge count={unread} />
      </button>

    </div>
    {center}
    </>
  );
}

export default React.memo(CommunicationBell);
