import React from 'react';
import { Coins, Award, MapPin, Quote, Sparkles, CheckCircle, XCircle, TrendingUp, Zap, Heart, Shield, Brain, AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { COACH_TIERS, COACHING_STYLES, TRAINING_METHODS, COACH_SPECIALTY_INFO, getCoachImpactSummary, getCoachEffects, evaluateCoachForCareer, calculateAffinity, getCoachCompetencies, getCoachCompatibilityReasons } from '@/lib/coaches';
import { ModalShell } from '@/components/design-system';

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
      <button onClick={onFire} className="w-full rounded-xl bg-red-500/15 py-3 text-sm font-bold text-red-400 hover:bg-red-500/25">Demitir treinador</button>
    ) : (
      <button disabled={!hireCheck.allowed} onClick={onHire} className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold ${hireCheck.allowed ? 'bg-primary text-primary-foreground hover:opacity-90' : 'cursor-not-allowed bg-secondary/50 text-muted-foreground'}`}>
        {hireCheck.allowed ? <><CheckCircle className="h-4 w-4" /> Contratar · {evaluation.salary} / mês{evaluation.signingCost > 0 ? ` + ${evaluation.signingCost} de assinatura` : ''}</> : <><XCircle className="h-4 w-4" /> {hireCheck.reason}</>}
      </button>
    )}>
      <div className="space-y-3">
          <div className={`rounded-xl border p-3 ${isHired || hireCheck.allowed ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5'}`}>
            <p className={`flex items-center gap-1.5 text-xs font-black ${isHired || hireCheck.allowed ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isHired || hireCheck.allowed ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {isHired ? 'Técnico principal ativo' : hireCheck.allowed ? 'Pode ser contratado agora' : 'Contratação bloqueada'}
            </p>
            {!isHired && !hireCheck.allowed && <div className="mt-2 space-y-1">{hireCheck.reasons.map((reason) => <p key={reason} className="text-[10px] text-muted-foreground">• {reason}</p>)}</div>}
            {!isHired && hireCheck.allowed && evaluation.recommendationReason && <p className="mt-1 text-[10px] text-muted-foreground">{evaluation.recommendationReason}</p>}
            {isHired && <p className="mt-1 text-[10px] text-muted-foreground">Contrato atual da dupla; sua disponibilidade no mercado não interfere no vínculo vigente.</p>}
          </div>
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`h-14 w-14 rounded-2xl ${tier.bg} flex items-center justify-center border ${tier.border}`}>
                <span className={`font-black text-xl ${tier.color}`}>{(coach.name || '?')[0]}</span>
              </div>
              <div>
                <h2 className="text-lg font-black">{coach.name}</h2>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {coach.city}, {coach.nationality} · {coach.age} anos
                </p>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${tier.color}`}>{tier.label} · {coach.specialty}</span>
              </div>
            </div>
          </div>

          <div className="mb-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Impacto no atleta · {specialtyInfo?.label || coach.specialty}</p>
            <p className="mt-1 text-xs leading-relaxed">{impact.summary}</p>
            <div className="mt-2 space-y-1">
              {impact.highlights.map(item => <p key={item} className="text-[10px] text-muted-foreground">• {item}</p>)}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground"><strong>Importante:</strong> os efeitos são maiores quando a afinidade é boa e quando você escolhe treinos ligados às especializações do treinador.</p>
          </div>

          <div className="glass rounded-xl p-3 mb-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Competências do treinador</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries({Técnica:competencies.technical,Tática:competencies.tactical,Mental:competencies.mental,Físico:competencies.physical,Dupla:competencies.partnership}).map(([label,value]) => (
                <div key={label} className="rounded-lg bg-secondary/30 p-2"><div className="flex justify-between text-[10px]"><span>{label}</span><strong>{value}</strong></div><div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden"><div className="h-full rounded-full bg-primary" style={{width:`${value}%`}} /></div></div>
              ))}
            </div>
            {compatibilityReasons.length > 0 && <div className="mt-3 rounded-lg bg-primary/5 p-2"><p className="text-[9px] font-bold uppercase text-primary">Por que combina com sua dupla</p>{compatibilityReasons.map(item => <p key={item} className="text-[10px] text-muted-foreground mt-1">• {item}</p>)}</div>}
          </div>

          {currentCoach && currentCoach.id !== coach.id && (
            <CoachComparison candidate={coach} current={currentCoach} candidateSalary={evaluation.salary} currentSalary={profile?.coach_paid_by_club ? 0 : profile?.coach_monthly_salary} />
          )}

          {/* Philosophy */}
          <div className="glass rounded-xl p-3 mb-3 border border-primary/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Quote className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] uppercase tracking-wide text-primary font-bold">Filosofia</span>
            </div>
            <p className="text-xs italic text-foreground/90">"{coach.philosophy}"</p>
            {coach.signature_quote && (
              <p className="text-[10px] text-muted-foreground mt-1.5 italic">— {coach.signature_quote}</p>
            )}
          </div>

          {/* Coaching Style */}
          <div className="glass rounded-xl p-3 mb-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Estilo de Comando</p>
            <p className="text-xs font-bold">{style.label}</p>
            <p className="text-[10px] text-muted-foreground">{style.desc}</p>
          </div>

          {/* Affinity */}
          <div className={`glass rounded-xl p-3 mb-3 border ${effects.affinityLabel.color.replace('text-', 'border-').replace('-400', '-500/30')}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Afinidade</span>
              <span className={`text-sm font-black ${effects.affinityLabel.color}`}>{effects.affinityLabel.label}</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className={`h-full rounded-full ${effects.affinityLabel.color.replace('text-', 'bg-').replace('-400', '-500')}`} style={{ width: `${affinity}%` }} />
            </div>
            <p className="text-[9px] text-muted-foreground mt-1">{affinity}/100</p>
          </div>

          {/* Effects */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <EffectRow icon={Zap} label="Eficiência treino" value={effects.trainingBoost > 0 ? `+${effects.trainingBoost}` : effects.trainingBoost} color="text-primary" />
            <EffectRow icon={Heart} label="Confiança" value={effects.moraleBonus > 0 ? `+${effects.moraleBonus}` : '—'} color="text-pink-400" />
            <EffectRow icon={TrendingUp} label="Recuperação" value={effects.energyBonus > 0 ? `+${effects.energyBonus}` : '—'} color="text-green-400" />
            <EffectRow icon={Shield} label="Prevenção" value={effects.injuryReduction > 0 ? `-${effects.injuryReduction}%` : '—'} color="text-cyan-400" />
            <EffectRow icon={Brain} label="Leitura tática" value={effects.strategyBonus > 0 ? `+${effects.strategyBonus}` : '—'} color="text-purple-400" />
            <EffectRow icon={Sparkles} label="Focos compatíveis" value={`${effects.specMatch}/${(coach.specializations || []).length}`} color="text-amber-400" />
          </div>

          {/* Training Methods */}
          {(coach.training_methods || []).length > 0 && (
            <div className="glass rounded-xl p-3 mb-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Métodos de Treino</p>
              <div className="flex gap-1.5 flex-wrap">
                {coach.training_methods.map(m => {
                  const method = TRAINING_METHODS[m];
                  return (
                    <span key={m} className="text-[10px] bg-secondary/60 text-foreground/80 px-2 py-1 rounded-lg">
                      {method?.label || m}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Specializations */}
          <div className="glass rounded-xl p-3 mb-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Especializações</p>
            <div className="flex gap-1.5 flex-wrap">
              {(coach.specializations || []).map(s => (
                <span key={s} className="text-[10px] bg-primary/15 text-primary px-2 py-1 rounded-lg font-semibold uppercase">{s}</span>
              ))}
            </div>
          </div>

          {/* Track Record */}
          {coach.track_record && (
            <div className="glass rounded-xl p-3 mb-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Histórico</p>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Atletas" value={coach.track_record.athletes_coached} />
                <Stat label="Títulos" value={coach.track_record.titles_won} />
                <Stat label="Melhor Rank" value={`#${coach.track_record.top_ranking_achieved}`} />
                <Stat label="Grand Slams" value={coach.track_record.grand_slams} />
              </div>
            </div>
          )}

          {/* Achievements */}
          {(coach.achievements || []).length > 0 && (
            <div className="glass rounded-xl p-3 mb-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Conquistas</p>
              <div className="space-y-1.5">
                {coach.achievements.map((a, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Award className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-bold">{a.title} <span className="text-muted-foreground font-normal">({a.year})</span></p>
                      <p className="text-[10px] text-muted-foreground">{a.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bio */}
          {coach.bio && (
            <div className="glass rounded-xl p-3 mb-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Biografia</p>
              <p className="text-[11px] text-foreground/80 leading-relaxed">{coach.bio}</p>
            </div>
          )}

          {/* Financial */}
          <div className="glass rounded-xl p-3 mb-3 border border-amber-500/20 bg-amber-500/5">
            <p className="text-[10px] uppercase tracking-wide text-amber-400 font-bold mb-2">Exigências Financeiras</p>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Mensal" value={coach.market_salary || coach.monthly_cost} icon={Coins} color="text-yellow-400" />
              <Stat label="Assinatura" value={coach.market_signing_bonus ?? coach.sign_on_bonus ?? 0} icon={Coins} color="text-yellow-400" />
              <Stat label="% Vitória" value={`${Math.max(0, Number(coach.performance_bonus_pct) || 0)}%`} color="text-green-400" />
            </div>
            {coach.demands && (
              <div className="mt-2 pt-2 border-t border-border/40">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Exigências</p>
                <div className="flex gap-2 flex-wrap">
                  {coach.demands.min_level && <span className="text-[9px] text-amber-300">Nível: {coach.demands.min_level}</span>}
                  {coach.demands.min_reputation && <span className="text-[9px] text-amber-300">Reputação: {coach.demands.min_reputation}+</span>}
                  {coach.demands.min_club_level && <span className="text-[9px] text-amber-300">Clube: Nível {coach.demands.min_club_level}</span>}
                  {coach.demands.exclusivity && <span className="text-[9px] text-red-400">Exclusividade total</span>}
                </div>
              </div>
            )}
            {hireCheck.affordability?.salaryShare !== null && (
              <div className={`mt-2 flex items-start gap-2 rounded-lg p-2 ${hireCheck.affordability.salaryShare >= 30 ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                {hireCheck.affordability.salaryShare >= 30 && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <p className="text-[10px]">Este salário representa {hireCheck.affordability.salaryShare}% da sua última receita mensal. Isso é um alerta de planejamento, não um bloqueio.</p>
              </div>
            )}
          </div>

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
