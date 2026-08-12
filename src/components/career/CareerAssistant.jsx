import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bot, ChevronRight, Sparkles } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { ensureMyProfile } from '@/lib/padel';
import { buildCareerAssistantInsights, assistantGreeting } from '@/lib/careerAssistant.js';
import { StatusBadge, DrawerShell } from '@/components/design-system';
import { isCareerCommunicationVisible, normalizeCareerMessage } from '@/lib/careerCommunications.js';
import { countUnreadCareerMessages } from '@/lib/notificationSelectors.js';

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
  const [dismissedInsights, setDismissedInsights] = useState(() => new Set());

  const load = useCallback(async () => {
    try {
      const user = await localGame.auth.me();
      const current = await ensureMyProfile(user);
      if (!current?.id) return;
      setProfile(current);
      const [messages, tournaments, missions, progressRows, matches] = await Promise.all([
        localGame.entities.CareerMessage.filter({ profile_id: current.id }, '-created_date', 80).catch(() => []),
        localGame.entities.Tournament.filter({ status: 'inscricoes' }).catch(() => []),
        localGame.entities.Mission.filter({ is_active: true }).catch(() => []),
        localGame.entities.MissionProgress.filter({ profile_id: current.id }).catch(() => []),
        localGame.entities.Match.filter({ profile_id: current.id }, '-created_date', 40).catch(() => []),
      ]);
      const unreadCount = countUnreadCareerMessages(
        (messages || [])
          .map(normalizeCareerMessage)
          .filter((message) => isCareerCommunicationVisible(message, { matches, profile: current }))
      );
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
    // Um avanço de dia dispara profile-updated duas vezes (fase rápida +
    // secundária); sem debounce isso repetia as quatro consultas em paralelo
    // duas vezes para o mesmo clique.
    let timer = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; load(); }, 150);
    };
    window.addEventListener('padel:profile-updated', refresh);
    window.addEventListener('padel:communications-updated', refresh);
    window.addEventListener('padel:mission-completed', refresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('padel:profile-updated', refresh);
      window.removeEventListener('padel:communications-updated', refresh);
      window.removeEventListener('padel:mission-completed', refresh);
    };
  }, [load]);

  const insights = useMemo(() => buildCareerAssistantInsights(profile, context), [profile, context]);
  const insightSignature = useCallback((insight) => `${insight.id}::${insight.title}::${insight.description}`, []);
  const visibleInsights = useMemo(
    () => insights.filter((insight) => !dismissedInsights.has(insightSignature(insight))),
    [insights, dismissedInsights, insightSignature],
  );

  useEffect(() => {
    if (!profile?.id) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`padel:assistant-seen:${profile.id}`) || '[]');
      setDismissedInsights(new Set(Array.isArray(saved) ? saved : []));
    } catch {
      setDismissedInsights(new Set());
    }
  }, [profile?.id]);

  const dismissInsight = useCallback((insight) => {
    if (!profile?.id || !insight) return;
    const signature = insightSignature(insight);
    setDismissedInsights((current) => {
      const next = new Set(current);
      next.add(signature);
      try { localStorage.setItem(`padel:assistant-seen:${profile.id}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [profile?.id, insightSignature]);
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
        {visibleInsights.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-black text-black">{visibleInsights.length > 99 ? '99+' : visibleInsights.length}</span>}
      </button>

      <DrawerShell
        open={open}
        onClose={() => setOpen(false)}
        title={assistantGreeting(profile)}
        description="Estas são as prioridades mais relevantes para o momento atual."
      >
        {visibleInsights.length ? visibleInsights.map((insight, index) => (
          <Link key={`${insight.id}-${insight.title}`} to={insight.route} onClick={() => { dismissInsight(insight); setOpen(false); }} className={`block rounded-2xl border p-4 transition-transform hover:-translate-y-0.5 ${toneClasses[insight.tone] || toneClasses.neutral} ${index > 0 ? 'mt-3' : ''}`}>
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
      </DrawerShell>
    </>
  );
}
