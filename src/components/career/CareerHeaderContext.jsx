import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, HeartPulse, Trophy, Zap } from 'lucide-react';
import { localGame } from '@/api/localGameClient.js';
import { buildCareerHeaderContext } from '@/lib/careerHeaderContext.js';
import { buildTournamentPlayRoute } from '@/lib/tournamentNextAction.js';

const ICON_BY_KIND = {
  injured: { icon: HeartPulse, tone: 'text-rose-400' },
  tournament_today: { icon: Trophy, tone: 'text-amber-400' },
  tournament_soon: { icon: Trophy, tone: 'text-amber-400' },
  fatigue: { icon: HeartPulse, tone: 'text-orange-400' },
  energy: { icon: Zap, tone: 'text-yellow-400' },
  tournament_upcoming: { icon: CalendarDays, tone: 'text-cyan-400' },
  idle: { icon: CalendarDays, tone: 'text-cyan-400' },
};

export default function CareerHeaderContext({ profile, compact = false }) {
  const [context, setContext] = useState(null);

  const load = useCallback(async () => {
    try {
      if (!profile) return;
      const tournaments = await localGame.entities.Tournament.filter({ status: 'inscricoes' }).catch(() => []);
      setContext(buildCareerHeaderContext({ profile, tournaments }));
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
  const { icon: Icon, tone } = ICON_BY_KIND[context.kind] || ICON_BY_KIND.idle;
  const label = compact ? context.label.compact : context.label.full;
  const className = `inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-border/55 bg-card/45 px-2 py-1 ${compact ? 'max-w-[9rem]' : 'max-w-[17rem]'}`;
  const inner = (
    <>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
      <span className="truncate text-[10px] font-bold text-muted-foreground">{label}</span>
    </>
  );

  // Hotfix page chrome (docs/PAGE_CHROME_TUTORIAL_HOTFIX.md, item 3): só o
  // contexto de "próximo torneio" tem um destino único e óbvio — clicar
  // reaproveita o mesmo deep link canônico do bloqueio de avanço/CTA "Ir
  // para o torneio" (buildTournamentPlayRoute já cai em detalhes quando não
  // há campanha ativa, via resolveTournamentOpenMode em Tournaments.jsx —
  // nenhuma lógica nova de roteamento aqui).
  if (context.tournamentId) {
    return (
      <Link to={buildTournamentPlayRoute(context.tournamentId)} className={`${className} transition-colors hover:border-primary/40 hover:bg-card/70`} title={context.ariaLabel || label} aria-label={context.ariaLabel || label}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={className} title={context.ariaLabel || label}>
      {inner}
    </div>
  );
}
