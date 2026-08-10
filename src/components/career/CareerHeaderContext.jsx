import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, HeartPulse, Trophy, Zap } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';

function daysUntil(from, to) {
  if (!from || !to) return null;
  return Math.max(0, Math.ceil((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000));
}

export default function CareerHeaderContext({ profile, compact = false }) {
  const [context, setContext] = useState(null);

  const load = useCallback(async () => {
    try {
      if (!profile) return;
      const tournaments = await localGame.entities.Tournament.filter({ status: 'inscricoes' }).catch(() => []);
      const next = (tournaments || [])
        .filter((item) => item.start_date >= (profile.career_date || '2026-01-01'))
        .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0];
      const injured = profile.injury_status === 'injured' || profile.is_injured;
      const fatigue = Number(profile.fatigue) || 0;
      const energy = Number(profile.energy) || 0;
      const until = next ? daysUntil(profile.career_date, next.start_date) : null;
      const value = injured
        ? { icon: HeartPulse, tone: 'text-rose-400', label: `Recuperação · ${profile.injury_days_remaining || '—'} dias` }
        : next && until <= 5
          ? { icon: Trophy, tone: 'text-amber-400', label: `${next.name} · ${until}d` }
          : fatigue >= 70
            ? { icon: HeartPulse, tone: 'text-orange-400', label: `Fadiga alta · ${Math.round(fatigue)}%` }
            : energy <= 30
              ? { icon: Zap, tone: 'text-yellow-400', label: `Energia baixa · ${Math.round(energy)}%` }
              : { icon: CalendarDays, tone: 'text-cyan-400', label: next ? `${next.name} · ${until}d` : 'Semana de desenvolvimento' };
      setContext(value);
    } catch (error) {
      console.warn('[CareerHeaderContext] contexto indisponível', error);
    }
  }, [profile]);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
    };
  }, [load]);

  if (!context) return null;
  const Icon = context.icon;
  return (
    <div className={`inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-border/55 bg-card/45 px-2 py-1 ${compact ? 'max-w-[9rem]' : 'max-w-[17rem]'}`} title={context.label}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${context.tone}`} />
      <span className="truncate text-[10px] font-bold text-muted-foreground">{context.label}</span>
    </div>
  );
}
