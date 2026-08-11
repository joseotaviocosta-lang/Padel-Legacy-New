import React from 'react';
import { Star, Eye, Flame, Waves, Zap, Crown, Target, TrendingUp, TrendingDown, Clock, Heart, Brain, Dumbbell, Users, Activity, Shield, Gauge, Swords, Handshake, Sparkles } from 'lucide-react';
import { getPersonalityMeta, getCoachMeta, getPhaseMeta } from '@/lib/athleteBehavior';
import { TraitList } from '@/components/athletes/TraitBadge';
import { getInterviewStyle, generateInterviewQuote } from '@/lib/personalityTraits';
import { AttributeBar } from '@/components/padel/Shared';
import { ModalShell } from '@/components/design-system';
import { normalizeFatigue } from '@/game-core/physicalStats.js';

const PERSONALITY_ICONS = { Star, Eye, Flame, Waves, Zap, Crown, Target };
const PHASE_ICONS = { TrendingUp, Star, TrendingDown, Clock };

const ATTR_LABELS = {
  serve: 'Saque', forehand: 'Forehand', backhand: 'Backhand', volley: 'Voleio',
  bandeja: 'Bandeja', smash: 'Smash', defense: 'Defesa', agility: 'Agilidade',
  strategy: 'Estratégia', emotional_control: 'Controle Emocional',
};

const ATTR_ICONS = {
  serve: Zap, forehand: TrendingUp, backhand: TrendingDown, volley: Waves,
  bandeja: Target, smash: Flame, defense: Shield, agility: Activity,
  strategy: Brain, emotional_control: Heart,
};

export default function AthleteDetail({ athlete, onClose }) {
  if (!athlete) return null;
  const personality = getPersonalityMeta(athlete.personality);
  const coach = getCoachMeta(athlete.coach_preference);
  const phase = getPhaseMeta(athlete.career_phase);
  const PhaseIcon = PHASE_ICONS[phase.icon] || TrendingUp;
  const PersonalityIcon = PERSONALITY_ICONS[personality.icon] || Star;

  return (
    <ModalShell open={Boolean(athlete)} onClose={onClose} title="Perfil de atleta" description={`${athlete.name} · ${athlete.country || 'Circuito mundial'}`} size="sm">
      <div className="space-y-3">

        {/* Identity */}
        <div className="flex items-center gap-3 mb-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/30 to-secondary flex items-center justify-center shrink-0">
            <span className="font-black text-primary text-2xl">{(athlete.name || '?')[0]?.toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base">{athlete.name}</h3>
            <p className="text-xs text-muted-foreground">{athlete.country} · {athlete.age} anos · Pico aos {athlete.peak_age}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-black text-primary">{athlete.overall_rating}</span>
              <span className="text-[10px] text-muted-foreground uppercase">Overall</span>
            </div>
          </div>
        </div>
        {/* Personality */}
        <div className="glass rounded-xl p-3 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <PersonalityIcon className={`h-4 w-4 ${personality.color}`} />
            <span className="text-xs font-bold">{personality.label}</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{personality.desc}</p>
        </div>

        {/* Personality Traits */}
        {athlete.personality_traits && athlete.personality_traits.length > 0 && (
          <div className="glass rounded-xl p-3 mb-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Traços de Personalidade</p>
            <TraitList traitIds={athlete.personality_traits} />
          </div>
        )}

        {/* Appeal & Relationship Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <AppealStat icon={Heart} label="Torcida" value={athlete.fan_appeal} color="text-pink-400" barColor="bg-pink-400" />
          <AppealStat icon={Star} label="Patrocinadores" value={athlete.sponsor_appeal} color="text-amber-400" barColor="bg-amber-400" />
          <AppealStat icon={Brain} label="Treinador" value={athlete.coach_relationship} color="text-purple-400" barColor="bg-purple-400" />
        </div>

        {/* Interview Style & Quote */}
        {athlete.personality_traits && athlete.personality_traits.length > 0 && (
          <div className="glass rounded-xl p-3 mb-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Entrevista</p>
            <p className="text-[10px] text-muted-foreground italic mb-2">{getInterviewStyle(athlete.personality_traits)}</p>
            <div className="glass rounded-lg p-2.5 border-l-2 border-primary/50">
              <p className="text-[11px] text-foreground/90 italic leading-relaxed">"{generateInterviewQuote(athlete.personality_traits, 'neutral')}"</p>
            </div>
          </div>
        )}

        {/* Phase */}
        <div className="glass rounded-xl p-3 mb-3 flex items-center gap-2">
          <PhaseIcon className={`h-4 w-4 ${phase.color}`} />
          <div>
            <span className="text-xs font-bold">{athlete.career_phase}</span>
            <p className="text-[10px] text-muted-foreground">{phase.desc}</p>
          </div>
        </div>

        {/* Injury */}
        {athlete.current_injury ? (
          <div className="glass rounded-xl p-3 mb-3 border border-red-500/30 bg-red-500/5 flex items-center gap-2">
            <Activity className="h-4 w-4 text-red-400" />
            <div>
              <span className="text-xs font-bold text-red-300">{athlete.current_injury}</span>
              <p className="text-[10px] text-muted-foreground">Recuperação: {athlete.injury_recovery_days || 0} dias</p>
            </div>
          </div>
        ) : null}

        {/* Traits */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <TraitBar icon={Flame} label="Ambição" value={athlete.ambition} color="text-red-400" barColor="bg-red-400" />
          <TraitBar icon={Dumbbell} label="Disciplina" value={athlete.discipline} color="text-cyan-400" barColor="bg-cyan-400" />
          <TraitBar icon={Heart} label="Moral" value={athlete.morale} color="text-pink-400" barColor="bg-pink-400" />
          <TraitBar icon={Activity} label="Fadiga" value={normalizeFatigue(athlete.fatigue)} color="text-orange-400" barColor="bg-orange-400" />
        </div>

        {/* Game Core 2.5 — Athletic intelligence */}
        <div className="glass rounded-xl p-3 mb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Inteligência competitiva
            </p>
            <span className="text-[9px] rounded-full bg-primary/10 text-primary px-2 py-0.5 font-bold">IA 2.5</span>
          </div>
          <p className="text-[11px] leading-relaxed text-foreground/90 mb-3">{athlete.behavior_summary || 'Perfil competitivo em formação.'}</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <TraitBar icon={Swords} label="Agressividade" value={athlete.behavior_axes?.aggression || 50} color="text-red-400" barColor="bg-red-400" />
            <TraitBar icon={Gauge} label="Consistência" value={athlete.behavior_axes?.consistency || 50} color="text-cyan-400" barColor="bg-cyan-400" />
            <TraitBar icon={Crown} label="Decisões" value={athlete.behavior_axes?.clutch || 50} color="text-amber-400" barColor="bg-amber-400" />
            <TraitBar icon={Handshake} label="Jogo em dupla" value={athlete.behavior_axes?.teamwork || 50} color="text-green-400" barColor="bg-green-400" />
            <TraitBar icon={Brain} label="Leitura tática" value={athlete.behavior_axes?.tactical_intelligence || 50} color="text-purple-400" barColor="bg-purple-400" />
            <TraitBar icon={Zap} label="Tolerância ao risco" value={athlete.behavior_axes?.risk_tolerance || 50} color="text-orange-400" barColor="bg-orange-400" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-lg bg-secondary/40 p-2"><span className="text-muted-foreground">Lado preferido</span><strong className="block mt-0.5">{athlete.preferred_side || 'Não definido'}</strong></div>
            <div className="rounded-lg bg-secondary/40 p-2"><span className="text-muted-foreground">Sob pressão</span><strong className="block mt-0.5">{athlete.pressure_profile || 'Em avaliação'}</strong></div>
            <div className="rounded-lg bg-secondary/40 p-2"><span className="text-muted-foreground">Forma atual</span><strong className="block mt-0.5">{Math.round(athlete.form || athlete.current_form || 60)}/100</strong></div>
            <div className="rounded-lg bg-secondary/40 p-2"><span className="text-muted-foreground">Confiança</span><strong className="block mt-0.5">{Math.round(athlete.confidence || athlete.morale || 65)}/100</strong></div>
          </div>
        </div>

        {/* Coach preference */}
        <div className="glass rounded-xl p-3 mb-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Treinador Preferido</p>
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-400" />
            <span className="text-xs font-bold">{coach.label}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{coach.desc}</p>
        </div>

        {/* Attributes */}
        <div className="glass rounded-xl p-3 mb-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2">Atributos Evolutivos</p>
          <div className="space-y-2">
            {Object.entries(athlete.attributes || {}).map(([key, val]) => (
              <AttributeBar key={key} label={ATTR_LABELS[key] || key} value={val} icon={ATTR_ICONS[key]} />
            ))}
          </div>
        </div>

        {/* Relationships */}
        {(athlete.relationships || []).length > 0 && (
          <div className="glass rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-2 flex items-center gap-1">
              <Users className="h-3 w-3" /> Relacionamentos
            </p>
            <div className="space-y-1.5">
              {(athlete.relationships || []).map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${r.type === 'rival' ? 'bg-red-400' : r.type === 'amigo' ? 'bg-green-400' : 'bg-blue-400'}`} />
                  <span className="text-xs font-semibold flex-1 truncate">{r.target_name}</span>
                  <span className={`text-[9px] font-bold uppercase ${r.type === 'rival' ? 'text-red-400' : r.type === 'amigo' ? 'text-green-400' : 'text-blue-400'}`}>
                    {r.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function TraitBar({ icon: Icon, label, value, color, barColor }) {
  return (
    <div className="glass rounded-xl p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`h-3 w-3 ${color}`} />
        <span className="text-[9px] text-muted-foreground font-semibold">{label}</span>
        <span className="text-[10px] font-black ml-auto tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function AppealStat({ icon: Icon, label, value, color, barColor }) {
  return (
    <div className="glass rounded-xl p-2">
      <div className="flex items-center gap-1 mb-1">
        <Icon className={`h-3 w-3 ${color}`} />
        <span className="text-[8px] text-muted-foreground font-semibold uppercase">{label}</span>
      </div>
      <span className="text-sm font-black tabular-nums block mb-1">{value || 0}</span>
      <div className="h-1 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, value || 0)}%` }} />
      </div>
    </div>
  );
}
