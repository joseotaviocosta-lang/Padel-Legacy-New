import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  isNotificationFromCareerDate,
} from '@/lib/notificationCenter.js';
import { useCareer } from '@/careers/useCareer.js';
import { getMatchCheckpointRepository } from '@/careers/MatchCheckpointRepository.js';
import { useRenderCounter } from '@/dev/performanceProbe.js';

export default function CommunicationBell({ compact = false }) {
  useRenderCounter('CommunicationBell');
  const { activeCareer } = useCareer();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('unread');
  const closeCenter = useCallback(() => setOpen(false), []);
  const { closeRef, panelRef } = useOverlayBehavior({ open, onClose: closeCenter });

  const load = useCallback(async () => {
    const user = await localGame.auth.me().catch(() => null);
    const profile = user ? await ensureMyProfile(user).catch(() => null) : null;
    if (!profile?.id) return;
    setProfile(profile);

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
  const groupedMessages = useMemo(() => {
    const preview = visibleMessages.slice(0, 8);
    const today = preview.filter((message) => isNotificationFromCareerDate(message, profile?.career_date));
    const previous = preview.filter((message) => !isNotificationFromCareerDate(message, profile?.career_date));
    return [
      { id: 'today', label: 'Hoje', messages: today },
      { id: 'previous', label: 'Anteriores', messages: previous },
    ].filter((group) => group.messages.length > 0);
  }, [profile?.career_date, visibleMessages]);

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

  return (
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

      {open && (
        <>
          <button type="button" aria-label="Fechar notificações" className="pl-layer-dropdown fixed inset-0" onClick={closeCenter} />
          <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Central de notificações" className="pl-layer-dropdown absolute right-0 top-[calc(100%+0.6rem)] w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Central única</p>
                <p className="font-black">Notificações</p>
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-black text-primary">{unread}</span>}
                <button ref={closeRef} type="button" aria-label="Fechar notificações" onClick={closeCenter} className="pl-icon-tap flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="flex gap-2 border-b border-border/60 px-3 py-2" aria-label="Filtro de notificações">
              {[
                { id: 'unread', label: 'Não lidas' },
                { id: 'all', label: 'Todas' },
              ].map((item) => (
                <button key={item.id} type="button" onClick={() => setView(item.id)} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${view === item.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground'}`}>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="max-h-[min(32rem,65vh)] overflow-y-auto p-2 scrollbar-premium">
              {groupedMessages.length ? groupedMessages.map((group) => (
                <section key={group.id} aria-label={group.label} className="mb-2 last:mb-0">
                  <p className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">{group.label}</p>
                  {group.messages.map((message) => (
                    <button type="button" key={message.id} onClick={() => handleMessageClick(message)} className="flex w-full gap-3 rounded-xl p-3 text-left hover:bg-secondary/60">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Inbox className="h-4 w-4 text-primary" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-wide text-muted-foreground"><span>{getNotificationCategoryLabel(message)}</span><span>·</span><span>{getNotificationAttentionLevel(message)}</span></div>
                        <p className="mt-1 truncate text-xs font-bold">{message.title}</p>
                        <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{message.content}</p>
                      </div>
                      {isCareerMessageUnread(message) && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" title="Não lida" />}
                    </button>
                  ))}
                </section>
              )) : <div className="p-8 text-center text-xs text-muted-foreground"><p className="font-bold text-foreground">Você está em dia.</p><p className="mt-1">Nenhuma notificação exige sua atenção.</p></div>}
            </div>

            <Link to="/communications" onClick={closeCenter} className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-xs font-bold text-primary">
              Abrir Central de Notificações <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
