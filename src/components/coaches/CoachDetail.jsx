import React from 'react';
import { X, Coins, Award, MapPin, Quote, Sparkles, CheckCircle, XCircle, TrendingUp, Zap, Heart, Shield, Brain } from 'lucide-react';
import { COACH_TIERS, COACHING_STYLES, TRAINING_METHODS, COACH_SPECIALTY_INFO, getCoachImpactSummary, getCoachEffects, canHireCoach, calculateAffinity } from '@/lib/coaches';

export default function CoachDetail({ coach, profile, onHire, onFire, onClose, isHired }) {
  if (!coach) return null;

  const tier = COACH_TIERS[coach.tier] || COACH_TIERS.regional;
  const style = COACHING_STYLES[coach.coaching_style] || {};
  const effects = getCoachEffects(coach, profile);
  const hireCheck = canHireCoach(coach, profile);
  const affinity = calculateAffinity(coach, profile);
  const impact = getCoachImpactSummary(coach, profile);
  const specialtyInfo = COACH_SPECIALTY_INFO[coach.specialty];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 md:absolute md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg p-4">
        <div className="glass-premium rounded-t-3xl md:rounded-3xl p-5 max-h-[88vh] overflow-y-auto scrollbar-none animate-slide-up">
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
            {onClose && (
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary/60">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
          </div>

          <div className="mb-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Impacto no atleta · {specialtyInfo?.label || coach.specialty}</p>
            <p className="mt-1 text-xs leading-relaxed">{impact.summary}</p>
            <div className="mt-2 space-y-1">
              {impact.highlights.map(item => <p key={item} className="text-[10px] text-muted-foreground">• {item}</p>)}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground"><strong>Importante:</strong> os efeitos são maiores quando a afinidade é boa e quando você escolhe treinos ligados às especializações do treinador.</p>
          </div>

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
              <Stat label="Mensal" value={coach.monthly_cost} icon={Coins} color="text-yellow-400" />
              <Stat label="Assinatura" value={coach.sign_on_bonus} icon={Coins} color="text-yellow-400" />
              <Stat label="% Vitória" value={`${coach.performance_bonus_pct}%`} color="text-green-400" />
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
          </div>

          {/* Action */}
          {isHired ? (
            <button onClick={onFire} className="w-full py-3 rounded-xl bg-red-500/15 text-red-400 font-bold text-sm hover:bg-red-500/25 transition-colors">
              Demitir Treinador
            </button>
          ) : (
            <button
              disabled={!hireCheck.allowed}
              onClick={onHire}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                hireCheck.allowed
                  ? 'bg-primary text-primary-foreground hover:opacity-90 glow-primary'
                  : 'bg-secondary/50 text-muted-foreground cursor-not-allowed'
              }`}
            >
              {hireCheck.allowed ? (
                <><CheckCircle className="h-4 w-4" /> Contratar por {(coach.monthly_cost || 0) + (coach.sign_on_bonus || 0)} moedas</>
              ) : (
                <><XCircle className="h-4 w-4" /> {hireCheck.reason}</>
              )}
            </button>
          )}
        </div>
      </div>
    </>
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

function Stat({ label, value, icon: Icon, color = 'text-foreground' }) {
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