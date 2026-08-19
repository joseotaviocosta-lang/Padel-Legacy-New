import React from 'react';
import { Star, TrendingUp, TrendingDown, Clock, ChevronRight } from 'lucide-react';
import { getPhaseMeta } from '@/lib/athleteBehavior';

const PHASE_ICONS = { TrendingUp, Star, TrendingDown, Clock };

const PHASE_COLOR = {
  Ascensão: 'bg-green-500/15 text-green-400',
  Auge: 'bg-amber-500/15 text-amber-400',
  Declínio: 'bg-orange-500/15 text-orange-400',
  Veterano: 'bg-slate-500/15 text-slate-400',
};

// Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.10): o card mostrava até 12
// campos sempre visíveis (badge de personalidade, 2 mini-barras de
// forma/decisões, estilo/lado no rodapé...). O clique inteiro do card já
// abre AthleteDetail (a superfície de detalhe completo) — em vez de um
// segundo toggle de expandir dentro do card, os campos secundários só
// ficam disponíveis ali, e o card mostra só o que permite comparação
// rápida entre atletas: nome, país/idade, OVR, fase de carreira.
export default function AthleteCard({ athlete, onClick }) {
  const PhaseIcon = PHASE_ICONS[getPhaseMeta(athlete.career_phase).icon] || TrendingUp;

  return (
    <button type="button" onClick={onClick} className="pl-scout-row flex w-full cursor-pointer items-center gap-3 border-b border-border/45 p-3 text-left transition-colors hover:bg-secondary/25 last:border-b-0">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/25 to-secondary flex items-center justify-center shrink-0">
          <span className="font-black text-primary text-sm">{(athlete.name || '?')[0]?.toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm truncate">{athlete.name}</h3>
          <p className="truncate text-[10px] text-muted-foreground">{athlete.country} · {athlete.court_side || athlete.preferred_side || 'lado livre'} · {athlete.age}a · {athlete.play_style || athlete.archetype_label || athlete.career_phase}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[9px] font-bold text-muted-foreground">#{athlete.ranking_position || '—'}</p>
          <p className="text-lg font-black text-primary tabular-nums leading-none">{athlete.overall_rating || 50}</p>
          <p className="text-[8px] text-muted-foreground uppercase">OVR</p>
        </div>
        <span className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase sm:inline-flex ${PHASE_COLOR[athlete.career_phase] || PHASE_COLOR.Ascensão}`}>
          <PhaseIcon className="h-2.5 w-2.5" /> {athlete.current_injury ? 'Lesionado' : athlete.career_phase}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
