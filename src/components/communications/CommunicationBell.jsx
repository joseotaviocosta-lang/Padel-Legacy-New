import React, { useCallback, useEffect, useState } from 'react';
import { Bell, ChevronRight, Inbox } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { ensureContextualCareerCommunications, isCareerMessageUnread, listCareerCommunications, markCareerCommunicationRead } from '@/lib/careerCommunications.js';
import { resolveNotificationDestination } from '@/lib/notificationDestinations.js';

export default function CommunicationBell({ compact = false }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);

  const load = useCallback(async () => {
    const user = await localGame.auth.me().catch(() => null);
    const profile = user ? await ensureMyProfile(user).catch(() => null) : null;
    if (!profile?.id) return;

    // O sino também executa a reconciliação contextual. Assim novas mensagens
    // aparecem mesmo quando o jogador avança o calendário sem voltar à Home.
    const [tournaments, matches, partnerships, sponsorContracts, calendarEvents, registrations, pressArticles] = await Promise.all([
      localGame.entities.Tournament.filter({ status: 'inscricoes' }).catch(() => []),
      localGame.entities.Match.filter({ profile_id: profile.id }, '-created_date', 40).catch(() => []),
      localGame.entities.Partnership.filter({ profile_id: profile.id, status: 'ativa' }, '-started_career_date', 1).catch(() => []),
      localGame.entities.PlayerContract.filter({ profile_id: profile.id, is_active: true }, '-created_date', 20).catch(() => []),
      localGame.entities.CalendarEvent.filter({ profile_id: profile.id }, 'start_date', 100).catch(() => []),
      localGame.entities.TournamentRegistration.filter({ profile_id: profile.id }, '-registered_at', 100).catch(() => []),
      localGame.entities.PressArticle.filter({ profile_id: profile.id }, '-created_date', 100).catch(() => []),
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
    }).catch(() => []);

    const rows = await listCareerCommunications(profile.id, 8);
    setMessages(rows);
    if (created.length) window.dispatchEvent(new CustomEvent('padel:communications-created', { detail: { count: created.length } }));
  }, []);

  useEffect(() => {
    let active = true;
    const safeLoad = async () => {
      if (!active || document.hidden) return;
      await load();
    };
    safeLoad();
    window.addEventListener('padel:communications-refresh', safeLoad);
    window.addEventListener('padel:communications-updated', safeLoad);
    window.addEventListener('padel:profile-updated', safeLoad);
    window.addEventListener('focus', safeLoad);
    // A reconciliação continua orientada a eventos; o polling é apenas uma
    // rede de segurança e não precisa consultar sete coleções a cada 15 s.
    const intervalId = window.setInterval(safeLoad, 60000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('padel:communications-refresh', safeLoad);
      window.removeEventListener('padel:communications-updated', safeLoad);
      window.removeEventListener('padel:profile-updated', safeLoad);
      window.removeEventListener('focus', safeLoad);
    };
  }, [load]);

  const unread = messages.filter(isCareerMessageUnread).length;

  function handleToggle() {
    setOpen((current) => !current);
  }

  async function handleMessageClick(message) {
    const destination = resolveNotificationDestination(message);
    if (isCareerMessageUnread(message)) {
      setMessages((current) => current.map((item) => item.id === message.id
        ? { ...item, is_read: true, is_new: false, ...(item.status === 'nao_lida' ? { status: 'lida' } : {}) }
        : item));
      void markCareerCommunicationRead(message)
        .then(() => {
          window.dispatchEvent(new CustomEvent('padel:communications-updated'));
          window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
        })
        .catch(() => load());
    }
    setOpen(false);

    navigate(destination.route);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Abrir comunicações"
        onClick={handleToggle}
        className={`relative inline-flex items-center justify-center rounded-xl border border-border/70 bg-card/70 text-muted-foreground transition-colors hover:text-foreground ${compact ? 'h-9 w-9' : 'h-10 w-10'}`}
      >
        <Bell className="h-4.5 w-4.5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-primary-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button type="button" aria-label="Fechar comunicações" className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+0.6rem)] z-[60] w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Living Career</p>
                <p className="font-black">Comunicações</p>
              </div>
              {unread > 0 && <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-black text-primary">{unread}</span>}
            </div>

            <div className="max-h-[min(32rem,65vh)] overflow-y-auto p-2 scrollbar-premium">
              {messages.length ? messages.slice(0, 8).map((message) => (
                <button type="button" key={message.id} onClick={() => handleMessageClick(message)} className="flex w-full gap-3 rounded-xl p-3 text-left hover:bg-secondary/60">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Inbox className="h-4 w-4 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{message.title}</p>
                    <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{message.content}</p>
                  </div>
                  {message.status === 'decisao_pendente' && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Decisão pendente" />}
                </button>
              )) : <div className="p-8 text-center text-xs text-muted-foreground">Nenhuma comunicação nova.</div>}
            </div>

            <Link to="/communications" onClick={() => setOpen(false)} className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-xs font-bold text-primary">
              Abrir Central de Comunicações <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
