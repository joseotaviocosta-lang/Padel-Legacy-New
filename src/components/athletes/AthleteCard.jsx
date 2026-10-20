import React from 'react';
import { ChevronRight, Crown } from 'lucide-react';
import { CountryFlag, PlayerAvatar } from '@/components/design-system';
import { ageOf, isRetiredAthlete, overallOf, sideLabel } from '@/lib/athleteProfileDisplay.js';

// Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.10): linha de scouting — só o
// que permite comparar atletas rapidamente; o resto vive no perfil.
// Fase 5.32-C: a posição é a Mundial ATUAL (autoridade do Ranking, recebida
// em `worldRank`); sem posição a linha diz por quê (aposentado / sem
// ranking) — nunca cai no `ranking_position` gravado pelo circuito.
export default function AthleteCard({ athlete, worldRank = null, onClick }) {
  const retired = isRetiredAthlete(athlete);
  const age = ageOf(athlete);
  const side = sideLabel(athlete);
  const overall = overallOf(athlete);
  const meta = [age ? `${age} anos` : null, side].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={onClick}
      data-athlete-row={athlete.id}
      data-retired={retired || undefined}
      className="pl-scout-row flex w-full min-w-0 cursor-pointer items-center gap-3 border-b border-border/45 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-secondary/25"
    >
      <span className="flex w-10 shrink-0 flex-col items-center leading-none" data-athlete-rank={worldRank || ''}>
        {retired ? (
          <span className="text-[9px] font-black uppercase text-muted-foreground">Apos.</span>
        ) : worldRank ? (
          <>
            {worldRank === 1 && <Crown className="mb-0.5 h-3 w-3 text-amber-400" aria-hidden="true" />}
            <span className={`text-[15px] font-black tabular-nums ${worldRank === 1 ? 'text-amber-400' : worldRank <= 3 ? 'text-foreground' : 'text-muted-foreground'}`}>{worldRank}</span>
          </>
        ) : (
          <span className="text-[15px] font-black text-muted-foreground/60" aria-label="sem ranking">—</span>
        )}
      </span>
      <PlayerAvatar name={athlete.name} size="sm" className={retired ? 'opacity-60' : ''} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`truncate text-sm font-bold ${retired ? 'text-muted-foreground' : ''}`}>{athlete.name}</span>
          {retired && <span className="shrink-0 rounded-full bg-secondary/70 px-1.5 py-0.5 text-[9px] font-black uppercase text-muted-foreground">Aposentado</span>}
          {!retired && athlete.current_injury && <span className="shrink-0 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-destructive">Lesionado</span>}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {athlete.country && <CountryFlag country={athlete.country} showLabel className="min-w-0 truncate" />}
          {meta && <span className="shrink-0">· {meta}</span>}
        </span>
      </span>
      <span className="shrink-0 text-right leading-none">
        <span className="block text-lg font-black tabular-nums text-primary">{overall ?? '—'}</span>
        <span className="text-[9px] font-bold uppercase text-muted-foreground">OVR</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
