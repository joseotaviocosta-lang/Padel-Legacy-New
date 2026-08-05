import React from 'react';
import { Star, Coins, Award, MapPin } from 'lucide-react';
import { COACH_TIERS, COACH_SPECIALTY_INFO, getAffinityLabel, getCoachImpactSummary, getCoachCompetencies } from '@/lib/coaches';

export default function CoachCard({ coach, profile, affinity, onClick, isHired }) {
  if (!coach) return null;
  const tier = COACH_TIERS[coach.tier] || COACH_TIERS.regional;
  const aff = affinity != null ? getAffinityLabel(affinity) : null;
  const impact = getCoachImpactSummary(coach, profile);
  const specialty = COACH_SPECIALTY_INFO[coach.specialty];
  const competencies = getCoachCompetencies(coach);

  return (
    <button onClick={onClick} className={`glass glass-hover rounded-2xl p-4 text-left w-full border ${tier.border} hover-lift ${isHired ? 'ring-1 ring-primary/40' : ''}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`h-12 w-12 rounded-xl ${tier.bg} flex items-center justify-center shrink-0 border ${tier.border}`}>
          <span className={`font-black text-lg ${tier.color}`}>{(coach.name || '?')[0]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{coach.name}</p>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <MapPin className="h-2.5 w-2.5" /> {coach.city}, {coach.nationality}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[9px] font-bold uppercase tracking-wide ${tier.color}`}>{tier.label}</span>
            <span className="text-muted-foreground text-[9px]">·</span>
            <span className="text-[9px] text-muted-foreground">{specialty?.label || coach.specialty}</span>
          </div>
        </div>
        {isHired && (
          <span className="text-[9px] font-bold uppercase text-primary bg-primary/15 px-2 py-0.5 rounded-full">Ativo</span>
        )}
      </div>

      <div className="mb-3 rounded-xl border border-border/50 bg-background/35 p-2.5">
        <p className="text-[9px] font-bold uppercase tracking-wider text-primary">Como ajuda seu atleta</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{impact.summary}</p>
        {impact.highlights[0] && <p className="mt-1.5 text-[10px] font-semibold text-foreground/85">{impact.highlights[0]}</p>}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Star className="h-3 w-3 text-amber-400" />
          <span className="text-xs font-bold tabular-nums">{coach.reputation}</span>
        </div>
        <div className="flex items-center gap-1">
          <Award className="h-3 w-3 text-primary" />
          <span className="text-xs font-bold tabular-nums">{coach.track_record?.titles_won || 0}</span>
        </div>
        <div className="flex items-center gap-1">
          <Coins className="h-3 w-3 text-yellow-400" />
          <span className="text-xs font-bold tabular-nums">{coach.market_salary || coach.monthly_cost}/mês</span>
        </div>
        {aff && (
          <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${aff.bg} ${aff.color}`}>
            {aff.label}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 mt-3">
        {[['Técnica', competencies.technical], ['Tática', competencies.tactical], ['Dupla', competencies.partnership]].map(([label,value]) => (
          <div key={label} className="rounded-lg bg-secondary/35 px-2 py-1.5">
            <p className="text-[8px] uppercase text-muted-foreground">{label}</p><p className="text-xs font-black">{value}</p>
          </div>
        ))}
      </div>

      {/* Specializations */}
      <div className="flex gap-1 mt-2 flex-wrap">
        {(coach.specializations || []).slice(0, 3).map(s => (
          <span key={s} className="text-[8px] uppercase tracking-wide bg-secondary/60 text-muted-foreground px-1.5 py-0.5 rounded-md">{s}</span>
        ))}
      </div>
    </button>
  );
}