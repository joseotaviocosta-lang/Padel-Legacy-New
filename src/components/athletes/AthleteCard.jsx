import React from 'react';
import { Star, Eye, Flame, Waves, Zap, Crown, Target, TrendingUp, TrendingDown, Clock, Brain, Gauge } from 'lucide-react';
import { getPersonalityMeta, getPhaseMeta } from '@/lib/athleteBehavior';

const PERSONALITY_ICONS = { Star, Eye, Flame, Waves, Zap, Crown, Target };
const PHASE_ICONS = { TrendingUp, Star, TrendingDown, Clock };

const PHASE_COLOR = {
  Ascensão: 'bg-green-500/15 text-green-400',
  Auge: 'bg-amber-500/15 text-amber-400',
  Declínio: 'bg-orange-500/15 text-orange-400',
  Veterano: 'bg-slate-500/15 text-slate-400',
};

export default function AthleteCard({ athlete, onClick }) {
  const personality = getPersonalityMeta(athlete.personality);
  const PhaseIcon = PHASE_ICONS[getPhaseMeta(athlete.career_phase).icon] || TrendingUp;
  const PersonalityIcon = PERSONALITY_ICONS[personality.icon] || Star;

  return (
    <div onClick={onClick} className="glass rounded-2xl p-4 cursor-pointer glass-hover">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/25 to-secondary flex items-center justify-center shrink-0">
          <span className="font-black text-primary text-lg">{(athlete.name || '?')[0]?.toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm truncate">{athlete.name}</h3>
          <p className="text-[10px] text-muted-foreground">{athlete.country} · {athlete.age} anos</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-black text-primary tabular-nums leading-none">{athlete.overall_rating || 50}</p>
          <p className="text-[8px] text-muted-foreground uppercase">OVR</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${PHASE_COLOR[athlete.career_phase] || PHASE_COLOR.Ascensão}`}>
          <PhaseIcon className="h-2.5 w-2.5" /> {athlete.career_phase}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${personality.color} bg-secondary/50`}>
          <PersonalityIcon className="h-2.5 w-2.5" /> {athlete.personality_label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <MiniBar label="Forma" value={athlete.form || athlete.current_form || 60} color="bg-green-400" />
        <MiniBar label="Decisões" value={athlete.behavior_axes?.clutch || 50} color="bg-amber-400" />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Brain className="h-3 w-3" /> {athlete.play_style || 'Equilibrado'}</span>
        <span className="inline-flex items-center gap-1"><Gauge className="h-3 w-3" /> {athlete.preferred_side || '—'}</span>
      </div>

      {athlete.current_injury && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[10px] text-red-300 font-semibold truncate">{athlete.current_injury}</span>
        </div>
      )}
    </div>
  );
}

function MiniBar({ label, value, color }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-0.5">
        <span className="text-[9px] text-muted-foreground">{label}</span>
        <span className="text-[9px] font-bold tabular-nums">{value}</span>
      </div>
      <div className="h-1 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}