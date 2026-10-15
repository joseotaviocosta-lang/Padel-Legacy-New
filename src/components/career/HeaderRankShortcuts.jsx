import React from 'react';
import { Link } from 'react-router-dom';
import { Crown, Users, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatIndividualRankLabel, formatTeamRankLabel } from '@/lib/rankingDisplay.js';
import { APP_ROUTES } from '@/navigation/routes.js';

// Playthrough 5.24, Parte B — atalhos do header superior:
//   ranking individual → Ranking > Mundial > Individual
//   ranking da dupla   → Ranking > Mundial > Duplas
//   OVR                → página do jogador (/career/athlete)
//
// São links reais (semântica de âncora, foco e teclado), com rótulo/aria
// explícitos. Sem dupla ativa, o atalho de Dupla mostra "Sem dupla" e ainda
// leva ao ranking de duplas — nunca parece bug.
const INDIVIDUAL_ROUTE = `${APP_ROUTES.RANKING}?scope=world&type=individual`;
const DOUBLES_ROUTE = `${APP_ROUTES.RANKING}?scope=world&type=doubles`;

export default function HeaderRankShortcuts({ ranking, teamRank, overall, compact = false, className }) {
  const individualLabel = formatIndividualRankLabel(ranking);
  const hasPartner = Boolean(teamRank) && !teamRank?.noPartner;
  const doublesLabel = hasPartner ? formatTeamRankLabel(teamRank) : 'Sem dupla';
  const ovrLabel = Number.isFinite(Number(overall)) ? String(Math.round(Number(overall))) : '—';

  const items = [
    {
      key: 'ranking',
      to: INDIVIDUAL_ROUTE,
      icon: Crown,
      tone: 'text-premium',
      label: 'Ranking',
      value: individualLabel,
      aria: `Abrir ranking mundial individual. Posição atual: ${individualLabel}`,
    },
    {
      key: 'doubles',
      to: DOUBLES_ROUTE,
      icon: Users,
      tone: 'text-primary',
      label: 'Dupla',
      value: doublesLabel,
      aria: `Abrir ranking mundial de duplas. Posição atual: ${doublesLabel}`,
    },
    {
      key: 'ovr',
      to: APP_ROUTES.CAREER_ATHLETE,
      icon: Gauge,
      tone: 'text-info',
      label: 'OVR',
      value: ovrLabel,
      aria: `Abrir sua página de atleta. OVR atual: ${ovrLabel}`,
    },
  ];

  return (
    <div className={cn('pl-header-shortcuts flex min-w-0 items-center gap-1', className)} aria-label="Atalhos de ranking e OVR">
      {items.map(({ key, to, icon: Icon, tone, label, value, aria }) => (
        <Link
          key={key}
          to={to}
          title={`${label}: ${value}`}
          aria-label={aria}
          className={cn(
            'pl-header-shortcut flex min-h-[var(--pl-touch-min)] min-w-0 items-center gap-1.5 rounded-xl border border-border/55 bg-card/70 px-2 py-1 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            compact && 'px-1.5',
          )}
        >
          <Icon className={cn('h-3.5 w-3.5 shrink-0', tone)} aria-hidden="true" />
          <span className="min-w-0 leading-none">
            <span className="block text-[8px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
            <span className="mt-0.5 block truncate text-[11px] font-black tabular-nums text-foreground">{value}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
