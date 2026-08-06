import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bot, ChevronRight, Sparkles, X } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { buildCareerAssistantInsights, assistantGreeting } from '@/lib/careerAssistant.js';
import { StatusBadge } from '@/components/design-system';

const toneClasses = {
  danger: 'border-red-500/25 bg-red-500/8',
  warning: 'border-amber-500/25 bg-amber-500/8',
  info: 'border-cyan-500/25 bg-cyan-500/8',
  premium: 'border-violet-500/25 bg-violet-500/8',
  success: 'border-emerald-500/25 bg-emerald-500/8',
  neutral: 'border-border/70 bg-secondary/30',
};

export default function CareerAssistant() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [context, setContext] = useState({ unreadCount: 0, nextTournament: null, activeMission: null });

  const load = useCallback(async () => {
    try {
      const user = await localGame.auth.me();
      const current = await ensureMyProfile(user);
      if (!current?.id) return;
      setProfile(current);
      const [messages, tournaments, missions, progressRows] = await Promise.all([
        localGame.entities.CareerMessage.filter({ profile_id: current.id }, '-created_date', 80).catch(() => []),
        localGame.entities.Tournament.filter({ status: 'inscricoes' }).catch(() => []),
        localGame.entities.Mission.filter({ is_active: true }).catch(() => []),
        localGame.entities.MissionProgress.filter({ profile_id: current.id }).catch(() => []),
      ]);
      const unreadCount = (messages || []).filter((message) => ['nao_lida', 'decisao_pendente'].includes(message.status) || (!message.is_read && !message.status)).length;
      const nextTournament = (tournaments || [])
        .filter((tournament) => tournament.start_date && tournament.start_date >= (current.career_date || '2026-01-01'))
        .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] || null;
      const progressByMission = new Map((progressRows || []).map((row) => [row.mission_id, row]));
      const activeMission = (missions || []).find((mission) => {
        const progress = progressByMission.get(mission.id);
        return !progress || !['completed', 'claimed'].includes(progress.status);
      }) || null;
      setContext({ unreadCount, nextTournament, activeMission });
    } catch (error) {
      console.warn('[CareerAssistant] indisponível', error);
    }
  }, []);

  useEffect(() => { load(); }, [load, location.pathname]);
  useEffect(() => {
    const refresh = () => load();
    window.addEventListener('padel:profile-updated', refresh);
    window.addEventListener('padel:communications-updated', refresh);
    window.addEventListener('padel:mission-completed', refresh);
    return () => {
      window.removeEventListener('padel:profile-updated', refresh);
      window.removeEventListener('padel:communications-updated', refresh);
      window.removeEventListener('padel:mission-completed', refresh);
    };
  }, [load]);

  const insights = useMemo(() => buildCareerAssistantInsights(profile, context), [profile, context]);
  if (!profile || location.pathname === '/careers') return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="career-assistant-fab fixed bottom-[calc(5.2rem+env(safe-area-inset-bottom))] right-3 z-50 flex h-12 w-12 min-w-0 shrink-0 items-center justify-center rounded-full border border-primary/35 bg-primary p-0 text-primary-foreground shadow-[0_14px_40px_hsl(var(--primary)/0.28)] transition-transform hover:scale-105 md:bottom-5 md:right-5"
        aria-label="Abrir assistente da carreira"
        title="Assistente da carreira"
      >
        <Bot className="h-5 w-5" />
        {insights.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-black">{insights.length}</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] bg-black/55 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <aside className="absolute inset-y-0 right-0 flex w-[min(92vw,25rem)] flex-col border-l border-border/70 bg-background/97 shadow-2xl" aria-label="Assistente da carreira">
            <header className="border-b border-border/60 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary"><Sparkles className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Assistente da carreira</p>
                  <h2 className="mt-1 text-lg font-black">{assistantGreeting(profile)}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Estas são as prioridades mais relevantes para o momento atual.</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Fechar assistente"><X className="h-5 w-5" /></button>
              </div>
            </header>

            <div className="scrollbar-premium flex-1 space-y-3 overflow-y-auto p-4">
              {insights.length ? insights.map((insight, index) => (
                <Link key={insight.id} to={insight.route} onClick={() => setOpen(false)} className={`block rounded-2xl border p-4 transition-transform hover:-translate-y-0.5 ${toneClasses[insight.tone] || toneClasses.neutral}`}>
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge tone={insight.tone === 'premium' ? 'premium' : insight.tone === 'neutral' ? 'neutral' : insight.tone}>{index === 0 ? 'Prioridade' : 'Sugestão'}</StatusBadge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <h3 className="mt-3 text-sm font-black">{insight.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{insight.description}</p>
                  <p className="mt-3 text-xs font-bold text-primary">{insight.actionLabel}</p>
                </Link>
              )) : (
                <div className="rounded-2xl border border-border/70 bg-secondary/25 p-5 text-center">
                  <Sparkles className="mx-auto h-7 w-7 text-primary" />
                  <h3 className="mt-3 font-black">Tudo sob controle</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Não existe nenhuma urgência agora. Siga seu planejamento normalmente.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
