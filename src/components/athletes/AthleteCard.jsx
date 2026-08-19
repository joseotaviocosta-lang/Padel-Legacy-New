import React from 'react';
import { Star, TrendingUp, TrendingDown, Clock } from 'lucide-react';
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
    <div onClick={onClick} className="glass rounded-2xl p-3 cursor-pointer glass-hover">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/25 to-secondary flex items-center justify-center shrink-0">
          <span className="font-black text-primary text-sm">{(athlete.name || '?')[0]?.toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm truncate">{athlete.name}</h3>
          <p className="text-[10px] text-muted-foreground">{athlete.country} · {athlete.age} anos</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-black text-primary tabular-nums leading-none">{athlete.overall_rating || 50}</p>
          <p className="text-[8px] text-muted-foreground uppercase">OVR</p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${PHASE_COLOR[athlete.career_phase] || PHASE_COLOR.Ascensão}`}>
          <PhaseIcon className="h-2.5 w-2.5" /> {athlete.career_phase}
        </span>
        {athlete.current_injury && (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500 animate-pulse" />
            <span className="truncate text-[9px] text-red-300 font-semibold">{athlete.current_injury}</span>
          </span>
        )}
      </div>
    </div>
  );
}