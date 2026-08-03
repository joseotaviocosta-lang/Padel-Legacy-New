import React, { useState } from 'react';
import { Dumbbell, Zap, Clock, AlertTriangle, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { TRAINING_CATEGORIES, INTENSITY_LEVELS, getPredictedGain } from '@/lib/trainingSystem';
import { getAttributeIcon } from '@/components/padel/Shared';
import { ProgressBar } from '@/components/padel/GameShared';

// ── Training Activity Card ────────────────────────────────────────────────
// Shows full details: duration, energy cost, fatigue, injury risk, predicted
// gain with diminishing returns, attributes affected, and intensity selector.
export default function TrainingActivityCard({
  activity,
  profile,
  weeklyCount = 0,
  coachBonus = 0,
  onExecute,
  busy = false,
  disabled = false,
  disabledReason = null,
}) {
  const [intensity, setIntensity] = useState('moderado');
  const [expanded, setExpanded] = useState(false);

  const category = TRAINING_CATEGORIES[activity.category];
  const Icon = getAttributeIcon(activity.icon);
  const prediction = getPredictedGain(profile, activity, intensity, weeklyCount);

  const intensityObj = INTENSITY_LEVELS.find(i => i.id === intensity) || INTENSITY_LEVELS[1];
  const energyCost = Math.round(intensityObj.energyCost + ((profile?.trainings_today || 0) > 0 ? intensityObj.energyCost * 0.5 : 0));
  const lowEnergy = (profile?.energy || 100) < energyCost;
  const isDisabled = disabled || busy || lowEnergy;

  return (
    <div className={`glass rounded-2xl p-4 border ${expanded ? 'border-primary/30' : 'border-border/40'} transition-all`}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`h-10 w-10 rounded-xl ${category?.dot ? 'bg-secondary/60' : 'bg-primary/15'} flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${category?.color || 'text-primary'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight">{activity.label}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[9px] font-bold uppercase ${category?.color}`}>{category?.label}</span>
            <span className="text-[9px] text-muted-foreground">·</span>
            <span className="text-[9px] text-muted-foreground uppercase">{activity.attribute}</span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Current attribute level */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-muted-foreground">Nível atual</span>
          <span className="font-bold text-primary tabular-nums">{prediction.currentVal}/100</span>
        </div>
        <ProgressBar value={prediction.currentVal} max={100} />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat icon={Clock} label="Duração" value={`${activity.duration}min`} color="text-muted-foreground" />
        <Stat icon={Zap} label="Energia" value={`${energyCost}`} color={lowEnergy ? 'text-red-400' : 'text-primary'} />
        <Stat icon={AlertTriangle} label="Risco" value={`${Math.round(prediction.chance > 0 ? intensityObj.injuryRisk * 100 : 0)}%`} color={intensityObj.injuryRisk >= 0.05 ? 'text-red-400' : 'text-amber-400'} />
      </div>

      {/* Predicted gain */}
      <div className="glass rounded-xl p-2.5 mb-3 flex items-center justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold">Ganho Previsto</p>
          <p className="text-sm font-bold text-primary">+{prediction.expected} {activity.attribute}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold">Chance</p>
          <p className="text-sm font-bold tabular-nums">{prediction.chance}%</p>
        </div>
      </div>

      {/* Diminishing returns warning */}
      {weeklyCount >= 2 && (
        <div className="flex items-center gap-1.5 mb-3 text-[10px] text-amber-400">
          <TrendingDown className="h-3 w-3" />
          <span>Retornos decrescentes: {weeklyCount}x treinos esta semana ({Math.round(prediction.diminishing * 100)}% eficiência)</span>
        </div>
      )}

      {/* Fatigue penalty warning */}
      {prediction.fatiguePenalty < 0 && (
        <div className="flex items-center gap-1.5 mb-3 text-[10px] text-red-400">
          <TrendingDown className="h-3 w-3" />
          <span>Penalidade de fadiga: {prediction.fatiguePenalty} ao ganho</span>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="mb-3 space-y-2 animate-fade-in">
          <div className="glass rounded-xl p-2.5 space-y-1.5">
            <DetailRow label="Fadiga gerada" value={`${intensityObj.fatigueCost + (activity.fatigueExtra || 0)}`} />
            <DetailRow label="XP" value={`+${activity.xp}`} />
            <DetailRow label="Moedas" value={`+${activity.coins}`} />
            {activity.formBoost && <DetailRow label="Bônus de forma" value={`+${activity.formBoost}`} highlight />}
            {activity.moraleBoost && <DetailRow label="Bônus de moral" value={`+${activity.moraleBoost}`} highlight />}
            {activity.confidenceBoost && <DetailRow label="Bônus de confiança" value={`+${activity.confidenceBoost}`} highlight />}
            {activity.fatigueReduction && <DetailRow label="Redução de fadiga" value={`-${activity.fatigueReduction}`} highlight />}
            {coachBonus > 0 && <DetailRow label="Bônus do treinador" value={`+${coachBonus}`} highlight />}
          </div>
          <p className="text-[10px] text-muted-foreground">{category?.description}</p>
        </div>
      )}

      {/* Intensity selector */}
      <div className="mb-3">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold mb-1.5">Intensidade</p>
        <div className="grid grid-cols-3 gap-1.5">
          {INTENSITY_LEVELS.map(int => (
            <button
              key={int.id}
              onClick={() => setIntensity(int.id)}
              className={`py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                intensity === int.id
                  ? `bg-primary/20 ${int.color} border border-primary/40`
                  : 'bg-secondary/40 text-muted-foreground hover:text-foreground border border-transparent'
              }`}
            >
              {int.label}
            </button>
          ))}
        </div>
        <p className="text-[9px] text-muted-foreground mt-1">{intensityObj.description}</p>
      </div>

      {/* Execute button */}
      <button
        onClick={() => onExecute(activity, intensity)}
        disabled={isDisabled}
        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {busy ? (
          <><div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Treinando...</>
        ) : disabledReason ? (
          disabledReason
        ) : lowEnergy ? (
          'Sem energia'
        ) : (
          <><Dumbbell className="h-4 w-4" /> Treinar</>
        )}
      </button>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="glass rounded-lg p-2 text-center">
      <Icon className={`h-3 w-3 ${color} mx-auto mb-0.5`} />
      <p className="text-[9px] text-muted-foreground uppercase">{label}</p>
      <p className={`text-xs font-bold ${color}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between text-[10px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}