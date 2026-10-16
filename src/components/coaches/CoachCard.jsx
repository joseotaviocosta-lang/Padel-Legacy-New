import React from 'react';
import { Check, Coins, LockKeyhole, Sparkles, Star, WalletCards } from 'lucide-react';
import { COACH_TIERS, getCoachImpactSummary } from '@/lib/coaches';
import { Button } from '@/components/design-system';

function Badge({ children, tone = 'brand' }) {
  const tones = {
    brand: 'border-primary/30 bg-primary/10 text-primary',
    value: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    muted: 'border-border/60 bg-secondary/45 text-muted-foreground',
  };
  return <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

// Fase 5.31 — card compacto: nome, função/nível, efeito principal, custo
// mensal (+ assinatura), afinidade e disponibilidade, com UMA ação. Antes
// eram dois botões ("Ver detalhes" + "Contratar") que abriam o MESMO modal;
// a contratação de fato continua só no modal (CoachDetail).
export default function CoachCard({ evaluation, profile, onDetails, onHire }) {
  const coach = evaluation?.coach;
  if (!coach) return null;
  const tier = COACH_TIERS[coach.tier] || COACH_TIERS.regional;
  const available = evaluation.availability.available;
  // Tutorial 4.1 (Parte F/G): impacto REAL, mesma função do modal
  // (getCoachImpactSummary) — card e modal nunca divergem.
  const impact = getCoachImpactSummary(coach, profile);
  const highlights = impact.highlights?.length ? impact.highlights.slice(0, 3) : [];

  return (
    <article data-coach-card className={`glass rounded-2xl border p-3 transition ${evaluation.recommended ? 'border-primary/50' : 'border-transparent'} ${available ? 'hover:bg-secondary/20' : 'opacity-75'}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${tier.bg} ${tier.border}`}>
          <span className={`text-base font-black ${tier.color}`}>{(coach.name || '?')[0]}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-sm font-black">{coach.name}</h3>
            {evaluation.recommended && <Badge>Recomendado</Badge>}
            {evaluation.bestValue && <Badge tone="value">Melhor custo-benefício</Badge>}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">{impact.title || coach.specialty} · {tier.label} · {coach.city || coach.nationality || 'Circuito mundial'}</p>
        </div>
        <div className="shrink-0 text-center">
          <p className="text-lg font-black leading-none tabular-nums">{evaluation.overall}</p>
          <p className="text-[8px] font-bold uppercase text-muted-foreground">OVR</p>
        </div>
      </div>

      {/* Efeito principal em destaque; os demais na mesma linha, sob demanda no modal. */}
      {highlights.length > 0 && (
        <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px]">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <strong className="shrink-0 text-foreground">{highlights[0]}</strong>
          {highlights.length > 1 && <span className="truncate text-muted-foreground">· {highlights.slice(1).join(' · ')}</span>}
        </p>
      )}

      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
        <span className="flex items-center gap-1 font-bold"><Coins className="h-3.5 w-3.5 shrink-0 text-primary" /> {evaluation.salary.toLocaleString('pt-BR')} <span className="font-semibold text-muted-foreground">moedas/mês</span></span>
        {evaluation.signingCost > 0 && <span className="font-bold text-muted-foreground">{evaluation.signingCost.toLocaleString('pt-BR')} <span className="font-semibold">assinatura</span></span>}
        <span className="flex items-center gap-1 font-bold"><Star className="h-3 w-3 shrink-0 text-primary" /> {evaluation.affinity}/100 <span className="font-semibold text-muted-foreground">afinidade</span></span>
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={`flex items-center gap-1 text-[10px] font-black ${available ? 'text-emerald-400' : 'text-amber-400'}`}>
            {available ? <Sparkles className="h-3.5 w-3.5 shrink-0" /> : <LockKeyhole className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{available ? 'Disponível para contratar agora' : 'Ainda não disponível'}</span>
          </p>
          {!available && <p className="line-clamp-1 text-[10px] text-muted-foreground">{evaluation.availability.reason}</p>}
          {available && evaluation.availability.affordability?.risk !== 'low' && (
            <p className="flex items-center gap-1 text-[10px] text-amber-300"><WalletCards className="h-3 w-3 shrink-0" /> Possível, com risco financeiro.</p>
          )}
        </div>
        {/* 5.28/5.31: em lista, uma ação secundária; o primário fica no modal. */}
        {available
          ? <Button level="secondary" size="sm" onClick={onDetails || onHire} className="shrink-0">Ver detalhes</Button>
          : <Button level="ghost" size="sm" onClick={onDetails} className="shrink-0 border border-amber-500/25 bg-amber-500/10 text-amber-300">Ver requisitos</Button>}
      </div>
    </article>
  );
}
