import React, { useCallback, useEffect, useState } from 'react';
import { Bell, ChevronRight, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { listCareerCommunications, markAllCommunicationsRead } from '@/lib/careerCommunications.js';

export default function CommunicationBell({ compact = false }) {
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState(null);
  const [messages, setMessages] = useState([]);

  const load = useCallback(async () => {
    const user = await localGame.auth.me().catch(() => null);
    const profile = user ? await ensureMyProfile(user).catch(() => null) : null;
    if (!profile?.id) return;
    setProfileId(profile.id);
    const rows = await listCareerCommunications(profile.id, 8);
    setMessages(rows);
  }, []);

  useEffect(() => {
    let active = true;
    const safeLoad = async () => {
      if (!active) return;
      await load();
    };
    safeLoad();
    window.addEventListener('padel:communications-refresh', safeLoad);
    window.addEventListener('padel:communications-updated', safeLoad);
    return () => {
      active = false;
      window.removeEventListener('padel:communications-refresh', safeLoad);
      window.removeEventListener('padel:communications-updated', safeLoad);
    };
  }, [load]);

  const unread = messages.filter((item) => item.status === 'nao_lida').length;

  async function handleToggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen || !profileId || unread === 0) return;

    // Abrir o painel equivale a visualizar as notificações. Decisões pendentes
    // continuam pendentes, mas deixam de manter o badge do sino aceso.
    setMessages((current) => current.map((item) => (
      item.status === 'nao_lida' ? { ...item, status: 'lida', is_new: false } : item
    )));
    await markAllCommunicationsRead(profileId).catch(() => null);
    window.dispatchEvent(new CustomEvent('padel:communications-updated'));
    window.dispatchEvent(new CustomEvent('padel:communications-refresh'));
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
          <button type="button" aria-label="Fechar comunicações" className="fixed inset-0 z-[74]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+0.6rem)] z-[75] w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Living Career</p>
                <p className="font-black">Comunicações</p>
              </div>
              {unread > 0 && <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-black text-primary">{unread}</span>}
            </div>

            <div className="max-h-[min(32rem,65vh)] overflow-y-auto p-2 scrollbar-premium">
              {messages.length ? messages.slice(0, 8).map((message) => (
                <Link key={message.id} to="/communications" onClick={() => setOpen(false)} className="flex gap-3 rounded-xl p-3 hover:bg-secondary/60">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Inbox className="h-4 w-4 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{message.title}</p>
                    <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{message.content}</p>
                  </div>
                  {message.status === 'decisao_pendente' && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Decisão pendente" />}
                </Link>
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
