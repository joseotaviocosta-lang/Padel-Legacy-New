import React from 'react';
import { ArrowRight, Coins, LockKeyhole, MapPin, Sparkles, Star, WalletCards } from 'lucide-react';
import { COACH_SPECIALTY_INFO, COACH_TIERS } from '@/lib/coaches';
import { Button } from '@/components/design-system';

function Badge({ children, tone = 'brand' }) {
  const tones = {
    brand: 'border-primary/30 bg-primary/10 text-primary',
    value: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    muted: 'border-border/60 bg-secondary/45 text-muted-foreground',
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

export default function CoachCard({ evaluation, onDetails, onHire }) {
  const coach = evaluation?.coach;
  if (!coach) return null;
  const tier = COACH_TIERS[coach.tier] || COACH_TIERS.regional;
  const specialty = COACH_SPECIALTY_INFO[coach.specialty];
  const available = evaluation.availability.available;

  return (
    <article className={`glass rounded-2xl border p-4 transition ${available ? `${tier.border} hover:border-primary/35` : 'border-border/45 opacity-85'}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${tier.bg} ${tier.border}`}>
          <span className={`text-lg font-black ${tier.color}`}>{(coach.name || '?')[0]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-black">{coach.name}</h3>
            {evaluation.recommended && <Badge>Recomendado</Badge>}
            {evaluation.bestValue && <Badge tone="value">Melhor custo-benefício</Badge>}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="h-3 w-3" /> {coach.city || coach.nationality || 'Circuito mundial'}
          </p>
          <p className="mt-1 text-[10px] font-bold text-foreground/80">{specialty?.label || coach.specialty} · {tier.label}</p>
        </div>
        <div className="rounded-xl bg-secondary/45 px-2.5 py-1.5 text-center">
          <p className="text-[8px] font-bold uppercase text-muted-foreground">OVR</p>
          <p className="text-lg font-black tabular-nums">{evaluation.overall}</p>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 min-h-8 text-[11px] leading-relaxed text-muted-foreground">{evaluation.recommendationReason}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-secondary/35 p-2.5">
          <p className="flex items-center gap-1 text-[9px] font-bold uppercase text-muted-foreground"><Coins className="h-3 w-3" /> Salário mensal</p>
          <p className="mt-0.5 text-sm font-black tabular-nums">{evaluation.salary.toLocaleString('pt-BR')} moedas</p>
        </div>
        <div className="rounded-xl bg-secondary/35 p-2.5">
          <p className="flex items-center gap-1 text-[9px] font-bold uppercase text-muted-foreground"><Star className="h-3 w-3" /> Afinidade</p>
          <p className="mt-0.5 text-sm font-black tabular-nums">{evaluation.affinity}/100</p>
        </div>
      </div>

      <div className={`mt-3 rounded-xl border p-2.5 ${available ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5'}`}>
        <p className={`flex items-center gap-1 text-[10px] font-black ${available ? 'text-emerald-400' : 'text-amber-400'}`}>
          {available ? <Sparkles className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
          {available ? 'Disponível para contratar agora' : 'Ainda não disponível'}
        </p>
        {!available && <p className="mt-1 text-[10px] text-muted-foreground">{evaluation.availability.reason}</p>}
        {available && evaluation.availability.affordability?.risk !== 'low' && (
          <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-300"><WalletCards className="h-3 w-3" /> Contratação possível, mas com risco financeiro.</p>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Button level="secondary" size="sm" onClick={onDetails} className="flex-1">Ver detalhes</Button>
        {available ? (
          <Button level="primary" size="sm" onClick={onHire} className="flex-1">Contratar <ArrowRight className="h-3.5 w-3.5" /></Button>
        ) : (
          <Button level="ghost" size="sm" onClick={onDetails} className="flex-1 border border-amber-500/25 bg-amber-500/10 text-amber-300">Ver requisitos</Button>
        )}
      </div>
    </article>
  );
}
