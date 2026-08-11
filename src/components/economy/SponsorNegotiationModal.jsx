import React, { useState } from 'react';
import { Coins, TrendingUp, Calendar, Target, AlertTriangle, CheckCircle2, Handshake } from 'lucide-react';
import { getSponsorTierStyle, negotiateOffer, canSign, calculateProfileMatch, MARKETING_LABELS, GOAL_LABELS, getSponsorCategory } from '@/lib/sponsors';
import { ModalShell } from '@/components/design-system';

export default function SponsorNegotiationModal({ sponsor, profile, onSign, onClose, busy }) {
  const [step, setStep] = useState('overview'); // overview → offer → confirm
  const check = canSign(sponsor, profile);
  const offer = negotiateOffer(sponsor, profile);
  const match = calculateProfileMatch(sponsor, profile);
  const tier = getSponsorTierStyle(sponsor.tier);
  const category = getSponsorCategory(sponsor);
  const potential = (sponsor.commercial_goals || []).reduce((sum, goal) => sum + Math.max(0, Number(goal.reward) || 0), 0);
  const riskLabel = potential > offer.monthly_salary * 0.5 ? 'Contrato agressivo' : offer.duration_months >= 12 ? 'Contrato de longo prazo' : 'Contrato seguro';

  return (
    <ModalShell
      open
      onClose={onClose}
      title={(
        <span className="flex items-center gap-3">
          <span className="h-10 w-10 shrink-0 rounded-2xl bg-secondary/40 flex items-center justify-center text-xl">
            {sponsor.logo_emoji || '🏢'}
          </span>
          <span className="flex flex-col">
            <span className="font-black text-base">{sponsor.name}</span>
            <span className="flex items-center gap-1.5">
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${tier.badge}`}>{tier.label}</span>
              <span className="text-[10px] font-normal text-muted-foreground">{sponsor.industry} · {sponsor.country}</span>
            </span>
          </span>
        </span>
      )}
      size="sm"
    >
        <p className="text-xs text-muted-foreground mb-4 italic">{sponsor.description}</p>
        <div className="grid grid-cols-3 gap-2 mb-4 text-center"><div className="rounded-lg bg-secondary/30 p-2"><p className="text-[8px] text-muted-foreground uppercase">Slot</p><p className="text-[10px] font-bold capitalize">{category}</p></div><div className="rounded-lg bg-secondary/30 p-2"><p className="text-[8px] text-muted-foreground uppercase">Perfil</p><p className="text-[10px] font-bold">{riskLabel}</p></div><div className="rounded-lg bg-secondary/30 p-2"><p className="text-[8px] text-muted-foreground uppercase">Potencial</p><p className="text-[10px] font-bold text-green-400">+{potential}/mês</p></div></div>

        {step === 'overview' && (
          <div className="space-y-4">
            {/* Profile match */}
            <div className="glass rounded-xl p-3 border border-primary/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Compatibilidade</span>
                <span className={`text-sm font-black ${match.score >= 70 ? 'text-green-400' : match.score >= 50 ? 'text-primary' : 'text-amber-400'}`}>
                  {match.score}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary/50 overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full ${match.score >= 70 ? 'bg-green-400' : match.score >= 50 ? 'bg-primary' : 'bg-amber-400'}`}
                  style={{ width: `${match.score}%` }}
                />
              </div>
              {match.reasons.length > 0 && (
                <div className="space-y-1">
                  {match.reasons.map((r, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5 text-primary shrink-0" /> {r}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Preferences */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Preferências do patrocinador</p>
              <div className="flex flex-wrap gap-1.5">
                {sponsor.preferred_styles?.map(s => (
                  <span key={s} className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary/10 text-primary">{s}</span>
                ))}
                {sponsor.preferred_levels?.map(l => (
                  <span key={l} className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-500/10 text-cyan-400">{l}</span>
                ))}
                {sponsor.preferred_positions?.map(p => (
                  <span key={p} className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-500/10 text-purple-400">Posição: {p}</span>
                ))}
              </div>
            </div>

            {/* Marketing requirements */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Exigências de marketing</p>
              <div className="grid grid-cols-2 gap-1.5">
                {sponsor.marketing_requirements?.map(req => {
                  const meta = MARKETING_LABELS[req] || { label: req, icon: '📋' };
                  return (
                    <div key={req} className="flex items-center gap-1.5 text-[10px]">
                      <span>{meta.icon}</span>
                      <span className="text-muted-foreground">{meta.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Commercial goals */}
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Metas comerciais</p>
              <div className="space-y-1.5">
                {sponsor.commercial_goals?.map((goal, i) => (
                  <div key={i} className="glass rounded-lg p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold">{GOAL_LABELS[goal.type] || goal.type}</p>
                      <p className="text-[9px] text-muted-foreground">Meta: {goal.target} · {goal.period}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-green-400">+{goal.reward}</p>
                      <p className="text-[9px] text-destructive">{goal.penalty}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance clauses */}
            <div className="glass rounded-xl p-3 border border-amber-500/20">
              <p className="text-[10px] uppercase tracking-wide text-amber-400 font-bold mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Cláusulas de desempenho
              </p>
              <div className="space-y-1 text-[10px] text-muted-foreground">
                {sponsor.performance_clauses?.min_win_rate && (
                  <p>• Taxa mínima de vitórias: <span className="font-bold text-foreground">{sponsor.performance_clauses.min_win_rate}%</span></p>
                )}
                {sponsor.performance_clauses?.tournament_participation && (
                  <p>• Torneios por período: <span className="font-bold text-foreground">{sponsor.performance_clauses.tournament_participation}</span></p>
                )}
                {sponsor.performance_clauses?.termination_threshold && (
                  <p>• Rescisão se satisfação &lt; <span className="font-bold text-destructive">{sponsor.performance_clauses.termination_threshold}</span></p>
                )}
              </div>
            </div>

            {!check.ok ? (
              <div className="glass rounded-xl p-3 border border-destructive/30 bg-destructive/5 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive">{check.reason}</p>
              </div>
            ) : (
              <button
                onClick={() => setStep('offer')}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <Handshake className="h-4 w-4" /> Negociar Contrato
              </button>
            )}
          </div>
        )}

        {step === 'offer' && (
          <div className="space-y-4">
            {/* Offer details */}
            <div className="glass rounded-xl p-4 border border-primary/20">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-3">Proposta negociada</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Coins className="h-4 w-4 text-yellow-400" /> Salário mensal
                  </span>
                  <span className="text-lg font-black text-yellow-400 tabular-nums">{offer.monthly_salary.toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-green-400" /> Bônus de assinatura
                  </span>
                  <span className="text-lg font-black text-green-400 tabular-nums">+{offer.sign_bonus.toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-cyan-400" /> Duração
                  </span>
                  <span className="text-sm font-bold text-cyan-400">{offer.duration_months} meses</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-primary" /> Compatibilidade
                  </span>
                  <span className={`text-sm font-black ${offer.match_score >= 70 ? 'text-green-400' : offer.match_score >= 50 ? 'text-primary' : 'text-amber-400'}`}>
                    {offer.match_score}%
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              A proposta foi calculada com base na compatibilidade entre seu perfil e as preferências do patrocinador.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setStep('overview')}
                className="flex-1 py-2.5 rounded-xl glass text-muted-foreground font-semibold text-sm hover:text-foreground transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={() => onSign(sponsor)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? 'Assinando...' : <><CheckCircle2 className="h-4 w-4" /> Assinar</>}
              </button>
            </div>
          </div>
        )}
    </ModalShell>
  );
}
