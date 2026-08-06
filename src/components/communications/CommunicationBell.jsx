import React, { useEffect, useState } from 'react';
import { Bell, ChevronRight, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { listCareerCommunications } from '@/lib/careerCommunications.js';

export default function CommunicationBell({ compact = false }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    let active = true;
    async function load() {
      const user = await localGame.auth.me().catch(() => null);
      const profile = user ? await ensureMyProfile(user).catch(() => null) : null;
      if (!profile || !active) return;
      const rows = await listCareerCommunications(profile.id, 8);
      if (active) setMessages(rows);
    }
    load();
    const refresh = () => load();
    window.addEventListener('padel:communications-refresh', refresh);
    return () => { active = false; window.removeEventListener('padel:communications-refresh', refresh); };
  }, []);

  const unread = messages.filter((item) => item.status === 'nao_lida' || item.status === 'decisao_pendente').length;

  return <div className="relative"><button type="button" aria-label="Abrir comunicações" onClick={() => setOpen((value) => !value)} className={`relative inline-flex items-center justify-center rounded-xl border border-border/70 bg-card/70 text-muted-foreground transition-colors hover:text-foreground ${compact ? 'h-9 w-9' : 'h-10 w-10'}`}><Bell className="h-4.5 w-4.5" />{unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-primary-foreground">{Math.min(unread, 99)}</span>}</button>{open && <><button type="button" aria-label="Fechar comunicações" className="fixed inset-0 z-[74]" onClick={() => setOpen(false)} /><div className="absolute right-0 top-[calc(100%+0.6rem)] z-[75] w-[min(23rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl"><div className="flex items-center justify-between border-b border-border/60 p-4"><div><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Living Career</p><p className="font-black">Comunicações</p></div><span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-black text-primary">{unread}</span></div><div className="max-h-80 overflow-y-auto p-2">{messages.length ? messages.slice(0, 5).map((message) => <Link key={message.id} to="/communications" onClick={() => setOpen(false)} className="flex gap-3 rounded-xl p-3 hover:bg-secondary/60"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Inbox className="h-4 w-4 text-primary" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{message.title}</p><p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{message.content}</p></div>{(message.status === 'nao_lida' || message.status === 'decisao_pendente') && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}</Link>) : <div className="p-8 text-center text-xs text-muted-foreground">Nenhuma comunicação nova.</div>}</div><Link to="/communications" onClick={() => setOpen(false)} className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-xs font-bold text-primary">Abrir Central de Comunicações <ChevronRight className="h-4 w-4" /></Link></div></>}</div>;
}
