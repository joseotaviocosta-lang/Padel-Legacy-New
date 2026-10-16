import React from 'react';
import { Award, MapPin, Quote, Sparkles, CheckCircle, XCircle, TrendingUp, Zap, Heart, Shield, Brain, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { COACH_TIERS, COACHING_STYLES, TRAINING_METHODS, COACH_SPECIALTY_INFO, getCoachImpactSummary, getCoachEffects, evaluateCoachForCareer, calculateAffinity, getCoachCompetencies, getCoachCompatibilityReasons, resolveCoachCanonicalSalary } from '@/lib/coaches';
import { ModalShell, Button, CollapsibleSection } from '@/components/design-system';

export default function CoachDetail({ coach, profile, evaluation: providedEvaluation, currentCoach, onHire, onFire, onClose, isHired }) {
  if (!coach) return null;

  const tier = COACH_TIERS[coach.tier] || COACH_TIERS.regional;
  const style = COACHING_STYLES[coach.coaching_style] || {};
  const effects = getCoachEffects(coach, profile);
  const competencies = getCoachCompetencies(coach);
  const compatibilityReasons = getCoachCompatibilityReasons(coach, profile);
  const evaluation = providedEvaluation || evaluateCoachForCareer(coach, profile);
  const hireCheck = evaluation.availability;
  const affinity = calculateAffinity(coach, profile);
  const impact = getCoachImpactSummary(coach, profile);
  const specialtyInfo = COACH_SPECIALTY_INFO[coach.specialty];

  return (
    <ModalShell open={Boolean(coach)} onClose={onClose} title={coach.name} description={`${tier.label} · ${specialtyInfo?.label || coach.specialty}`} size="sm" footer={isHired ? (
      <Button level="danger" size="touch" onClick={onFire} className="w-full">Demitir treinador</Button>
    ) : (
      // 5.28: rótulo curto + custo na linha auxiliar (antes um rótulo único
      // "CONTRATAR · 1800 / MÊS + 3000 DE ASSINATURA" estourava o modal no celular).
      <Button
        level="primary"
        size="touch"
        disabled={!hireCheck.allowed}
        onClick={onHire}
        className="w-full"
        sublabel={hireCheck.allowed ? `${Number(evaluation.salary || 0).toLocaleString('pt-BR')}/mês${evaluation.signingCost > 0 ? ` · luvas ${Number(evaluation.signingCost).toLocaleString('pt-BR')}` : ''}` : null}
      >
        {hireCheck.allowed ? <><CheckCircle className="h-4 w-4" /> Contratar treinador</> : <><XCircle className="h-4 w-4" /> {hireCheck.reason}</>}
      </Button>
    )}>
      {/* Fase 5.31 — DETALHE NA ORDEM DA DECISÃO: (1) pode contratar? (2) quem
          é (3) benefício principal (4) competências (5) por que combina (6)
          custo — e o CTA no rodapé. Filosofia, estilo, métodos,
          especializações, histórico, conquistas e biografia ficam em "Perfil
          completo". Antes: ~1.700px com 13 blocos abertos. Mesmas fontes
          (getCoachImpactSummary/getCoachEffects/getCoachCompetencies). */}
      <div className="space-y-3" data-coach-detail>
        <div className={`rounded-xl border p-2.5 ${isHired || hireCheck.allowed ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5'}`} data-coach-hire-state>
          <p className={`flex items-center gap-1.5 text-xs font-black ${isHired || hireCheck.allowed ? 'text-emerald-400' : 'text-amber-400'}`}>
            {isHired || hireCheck.allowed ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            {isHired ? 'Técnico principal ativo' : hireCheck.allowed ? 'Pode ser contratado agora' : 'Contratação bloqueada'}
          </p>
          {!isHired && !hireCheck.allowed && <div className="mt-1 space-y-0.5">{hireCheck.reasons.map((reason) => <p key={reason} className="text-[11px] text-muted-foreground">• {reason}</p>)}</div>}
          {!isHired && hireCheck.allowed && evaluation.recommendationReason && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{evaluation.recommendationReason}</p>}
          {isHired && <p className="mt-0.5 text-[11px] text-muted-foreground">Contrato atual da dupla; o mercado não interfere no vínculo vigente.</p>}
        </div>

        {/* 5.28: o nome já é o título do modal — aqui só a identificação. */}
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${tier.bg} ${tier.border}`}>
            <span className={`text-lg font-black ${tier.color}`}>{(coach.name || '?')[0]}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" /> {coach.city}, {coach.nationality} · {coach.age} anos</p>
            <p className={`truncate text-[10px] font-bold uppercase tracking-wide ${tier.color}`}>{tier.label} · {specialtyInfo?.label || coach.specialty}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-sm font-black ${effects.affinityLabel.color}`}>{affinity}/100</p>
            <p className="text-[9px] uppercase text-muted-foreground">afinidade · {effects.affinityLabel.label}</p>
          </div>
        </div>

        {/* Benefício principal em destaque; o resto dos efeitos em grade curta. */}
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3" data-coach-main-benefit>
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Benefício principal</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {impact.highlights.slice(0, 2).map((item) => <span key={item} className="rounded-lg bg-primary/15 px-2 py-1 text-xs font-black text-primary">{item}</span>)}
          </div>
          {impact.highlights.length > 2 && <p className="mt-1.5 text-[11px] text-muted-foreground">{impact.highlights.slice(2).join(' · ')}</p>}
          <p className="mt-1.5 text-[11px] text-muted-foreground">{impact.summary} Rende mais com boa afinidade e treinos das especializações.</p>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <EffectRow icon={Zap} label="Treino" value={effects.trainingBoost > 0 ? `+${effects.trainingBoost}` : effects.trainingBoost} color="text-primary" />
          <EffectRow icon={Heart} label="Confiança" value={effects.moraleBonus > 0 ? `+${effects.moraleBonus}` : '—'} color="text-pink-400" />
          <EffectRow icon={TrendingUp} label="Recuperação" value={effects.energyBonus > 0 ? `+${effects.energyBonus}` : '—'} color="text-green-400" />
          <EffectRow icon={Shield} label="Prevenção" value={effects.injuryReduction > 0 ? `-${effects.injuryReduction}%` : '—'} color="text-cyan-400" />
          <EffectRow icon={Brain} label="Tática" value={effects.strategyBonus > 0 ? `+${effects.strategyBonus}` : '—'} color="text-purple-400" />
          <EffectRow icon={Sparkles} label="Focos" value={`${effects.specMatch}/${(coach.specializations || []).length}`} color="text-amber-400" />
        </div>

        <div data-coach-competencies>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Competências</p>
          <div className="space-y-1">
            {Object.entries({ Técnica: competencies.technical, Tática: competencies.tactical, Mental: competencies.mental, Físico: competencies.physical, Dupla: competencies.partnership }).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">{label}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} /></div>
                <strong className="text-right tabular-nums">{value}</strong>
              </div>
            ))}
          </div>
        </div>

        {compatibilityReasons.length > 0 && (
          <div className="rounded-lg bg-secondary/30 p-2.5">
            <p className="text-[10px] font-bold uppercase text-primary">Por que combina com sua dupla</p>
            {compatibilityReasons.slice(0, 2).map((item) => <p key={item} className="mt-0.5 text-[11px] text-muted-foreground">• {item}</p>)}
          </div>
        )}

        {currentCoach && currentCoach.id !== coach.id && (
          <CoachComparison candidate={coach} current={currentCoach} candidateSalary={evaluation.salary} currentSalary={profile?.coach_paid_by_club ? 0 : profile?.coach_monthly_salary} />
        )}

        {/* Custo numa linha; o alerta de orçamento só quando pesa. */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5" data-coach-cost>
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-400">Custo</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            <span><strong className="text-yellow-400 tabular-nums">{resolveCoachCanonicalSalary(coach) ?? '—'}</strong> <span className="text-muted-foreground">/mês</span></span>
            <span><strong className="text-yellow-400 tabular-nums">{coach.market_signing_bonus ?? coach.sign_on_bonus ?? 0}</strong> <span className="text-muted-foreground">assinatura</span></span>
            <span><strong className="text-green-400 tabular-nums">{Math.max(0, Number(coach.performance_bonus_pct) || 0)}%</strong> <span className="text-muted-foreground">por vitória</span></span>
          </p>
          {coach.demands && (
            <p className="mt-1 flex flex-wrap gap-x-2 text-[10px]">
              {coach.demands.min_level && <span className="text-amber-300">Nível: {coach.demands.min_level}</span>}
              {coach.demands.min_reputation && <span className="text-amber-300">Reputação: {coach.demands.min_reputation}+</span>}
              {coach.demands.min_club_level && <span className="text-amber-300">Clube: Nível {coach.demands.min_club_level}</span>}
              {coach.demands.exclusivity && <span className="text-red-400">Exclusividade total</span>}
            </p>
          )}
          {hireCheck.affordability?.salaryShare !== null && (
            <p className={`mt-1 flex items-start gap-1.5 text-[10px] ${hireCheck.affordability.salaryShare >= 30 ? 'text-amber-300' : 'text-emerald-300'}`}>
              {hireCheck.affordability.salaryShare >= 30 && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
              {hireCheck.affordability.salaryShare}% da sua última receita mensal{hireCheck.affordability.salaryShare >= 30 ? ' — alerta de planejamento, não bloqueio' : ''}.
            </p>
          )}
        </div>

        <CollapsibleSection icon={Quote} title="Perfil completo" description="Filosofia, estilo, métodos, histórico e biografia">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-primary">Filosofia</p>
            <p className="mt-1 text-xs italic text-foreground/90">"{coach.philosophy}"</p>
            {coach.signature_quote && <p className="mt-1 text-[10px] italic text-muted-foreground">— {coach.signature_quote}</p>}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Estilo de comando</p>
            <p className="text-xs font-bold">{style.label}</p>
            <p className="text-[10px] text-muted-foreground">{style.desc}</p>
          </div>
          {(coach.training_methods || []).length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Métodos de treino</p>
              <div className="flex flex-wrap gap-1.5">{coach.training_methods.map((m) => <span key={m} className="rounded-lg bg-secondary/60 px-2 py-1 text-[10px] text-foreground/80">{TRAINING_METHODS[m]?.label || m}</span>)}</div>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Especializações</p>
            <div className="flex flex-wrap gap-1.5">{(coach.specializations || []).map((sp) => <span key={sp} className="rounded-lg bg-primary/15 px-2 py-1 text-[10px] font-semibold uppercase text-primary">{sp}</span>)}</div>
          </div>
          {coach.track_record && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Histórico</p>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Atletas" value={coach.track_record.athletes_coached} />
                <Stat label="Títulos" value={coach.track_record.titles_won} />
                <Stat label="Melhor Rank" value={`#${coach.track_record.top_ranking_achieved}`} />
                <Stat label="Grand Slams" value={coach.track_record.grand_slams} />
              </div>
            </div>
          )}
          {(coach.achievements || []).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Conquistas</p>
              {coach.achievements.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Award className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <div><p className="text-[11px] font-bold">{a.title} <span className="font-normal text-muted-foreground">({a.year})</span></p><p className="text-[10px] text-muted-foreground">{a.description}</p></div>
                </div>
              ))}
            </div>
          )}
          {coach.bio && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Biografia</p>
              <p className="text-[11px] leading-relaxed text-foreground/80">{coach.bio}</p>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </ModalShell>
  );
}

function CoachComparison({ candidate, current, candidateSalary, currentSalary }) {
  const next = getCoachCompetencies(candidate);
  const active = getCoachCompetencies(current);
  const rows = [
    ['Técnica', 'technical'], ['Tática', 'tactical'], ['Mental', 'mental'], ['Físico', 'physical'], ['Dupla', 'partnership'],
  ];
  return (
    <div className="glass rounded-xl border border-primary/20 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-primary"><ArrowRightLeft className="h-3.5 w-3.5" /> Comparação com {current.name}</p>
      <div className="mt-2 divide-y divide-border/35">
        {rows.map(([label, key]) => {
          const delta = Number(next[key] || 0) - Number(active[key] || 0);
          return <div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1.5 text-[10px]"><span className="text-muted-foreground">{label}</span><strong>{next[key]}</strong><span className={`w-9 text-right font-bold ${delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>{delta > 0 ? `+${delta}` : delta}</span></div>;
        })}
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1.5 text-[10px]"><span className="text-muted-foreground">Salário/mês</span><strong>{candidateSalary}</strong><span className="w-9 text-right font-bold text-muted-foreground">vs {Math.max(0, Number(currentSalary) || 0)}</span></div>
      </div>
    </div>
  );
}

function EffectRow({ icon: Icon, label, value, color }) {
  return (
    <div className="glass rounded-xl p-2 flex items-center gap-2">
      <Icon className={`h-3.5 w-3.5 ${color} shrink-0`} />
      <div className="min-w-0">
        <p className={`text-xs font-black ${color}`}>{value}</p>
        <p className="text-[8px] text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon = null, color = 'text-foreground' }) {
  return (
    <div className="flex items-center gap-1">
      {Icon && <Icon className={`h-3 w-3 ${color}`} />}
      <div>
        <p className={`text-sm font-black tabular-nums ${color}`}>{value}</p>
        <p className="text-[8px] text-muted-foreground uppercase">{label}</p>
      </div>
    </div>
  );
}
