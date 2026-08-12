import React, { useState } from 'react';
import { Dumbbell, Zap, Clock, AlertTriangle, TrendingDown, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { TRAINING_CATEGORIES, INTENSITY_LEVELS, getPredictedGain } from '@/lib/trainingSystemV2';
import { getAttributeIcon } from '@/components/padel/Shared';
import { Button, ProgressBar, StatusBadge } from '@/components/design-system';

// ── Card de treino ──────────────────────────────────────────────────────
// Prioriza o que decide a escolha (seção 4 do redesign): ganho previsto,
// fadiga e duração ficam sempre visíveis; nível atual/afinidade/detalhamento
// completo viram secundários, atrás do "Ver detalhes".
export default function TrainingActivityCard({
  activity,
  profile,
  weeklyCount = 0,
  coachBonus = 0,
  recommended = false,
  onExecute,
  busy = false,
  disabled = false,
  disabledReason = null,
}) {
  const [intensity, setIntensity] = useState('moderado');
  const [expanded, setExpanded] = useState(false);

  const category = TRAINING_CATEGORIES[activity.category];
  const Icon = getAttributeIcon(activity.icon);
  const prediction = getPredictedGain(profile, activity, intensity, weeklyCount, coachBonus);

  const intensityObj = INTENSITY_LEVELS.find(i => i.id === intensity) || INTENSITY_LEVELS[1];
  const energyCost = prediction.energyCost;
  const fatigueCost = intensityObj.fatigueCost + (activity.fatigueExtra || 0);
  const lowEnergy = (profile?.energy || 100) < energyCost;
  const isDisabled = disabled || busy || lowEnergy;
  const topGains = Object.entries(prediction.gains).slice(0, 2);

  return (
    <div className={`glass rounded-2xl p-4 border ${expanded ? 'border-primary/30' : recommended ? 'border-premium/35' : 'border-border/40'} transition-all`}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`h-10 w-10 rounded-xl ${category?.dot ? 'bg-secondary/60' : 'bg-primary/15'} flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${category?.color || 'text-primary'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold text-sm leading-tight">{activity.label}</p>
            {recommended && <StatusBadge tone="premium" icon={Sparkles}>Recomendado</StatusBadge>}
          </div>
          <span className={`text-[9px] font-bold uppercase ${category?.color}`}>{category?.label}</span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Ver menos detalhes' : 'Ver mais detalhes'}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Ganho previsto — o que decide a escolha, sempre visível */}
      <div className="mb-3 space-y-1 rounded-xl bg-primary/5 border border-primary/15 p-2.5">
        {topGains.length ? topGains.map(([attribute, gain]) => (
          <div key={attribute} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{attribute}</span>
            <span className="font-bold text-primary tabular-nums">+{gain.toFixed(2)}</span>
          </div>
        )) : <p className="text-xs text-muted-foreground">Sessão de manutenção</p>}
      </div>

      {/* Duração / Fadiga / Energia — sempre visíveis (seção 4) */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat icon={Clock} label="Duração" value={`${activity.duration}min`} color="text-muted-foreground" />
        <Stat icon={TrendingDown} label="Fadiga" value={`+${fatigueCost}`} color={fatigueCost >= 12 ? 'text-red-400' : 'text-amber-400'} />
        <Stat icon={Zap} label="Energia" value={`${energyCost}`} color={lowEnergy ? 'text-red-400' : 'text-primary'} />
      </div>

      {weeklyCount >= 2 && (
        <div className="flex items-center gap-1.5 mb-3 text-[10px] text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          <span>Retornos decrescentes: {weeklyCount}x esta semana ({Math.round(prediction.diminishing * 100)}% eficiência)</span>
        </div>
      )}

      {/* Detalhes secundários — nível atual, afinidade, risco, bônus */}
      {expanded && (
        <div className="mb-3 space-y-2 animate-fade-in">
          <div>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-muted-foreground">Nível atual</span>
              <span className="font-bold text-primary tabular-nums">{prediction.currentVal}/100</span>
            </div>
            <ProgressBar value={prediction.currentVal} max={100} tone="brand" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <DetailRow label="Afinidade" value={prediction.affinity.label} highlight />
            <DetailRow label="Risco de lesão" value={`${Math.round(prediction.chance > 0 ? intensityObj.injuryRisk * 100 : 0)}%`} />
          </div>
          <div className="glass rounded-xl p-2.5 space-y-1.5">
            <DetailRow label="XP" value={`+${activity.xp}`} />
            <DetailRow label="Moedas" value={`+${activity.coins}`} />
            {activity.formBoost && <DetailRow label="Bônus de forma" value={`+${activity.formBoost}`} highlight />}
            {activity.moraleBoost && <DetailRow label="Bônus de moral" value={`+${activity.moraleBoost}`} highlight />}
            {activity.confidenceBoost && <DetailRow label="Bônus de confiança" value={`+${activity.confidenceBoost}`} highlight />}
            {activity.fatigueReduction && <DetailRow label="Redução de fadiga" value={`-${activity.fatigueReduction}`} highlight />}
            {prediction.coachMultiplier > 1 && <DetailRow label="Bônus do treinador" value={`+${Math.round((prediction.coachMultiplier - 1) * 100)}%`} highlight />}
            {prediction.fatiguePenalty < 0 && <DetailRow label="Penalidade de fadiga" value={`${prediction.fatiguePenalty}`} />}
          </div>
          <p className="text-[10px] text-muted-foreground">{category?.description}</p>
        </div>
      )}

      {/* Intensidade */}
      <div className="mb-3">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold mb-1.5">Intensidade</p>
        <div className="grid grid-cols-3 gap-1.5">
          {INTENSITY_LEVELS.map(int => (
            <button
              key={int.id}
              type="button"
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
      </div>

      <Button level="primary" size="touch" onClick={() => onExecute(activity, intensity)} disabled={isDisabled} className="w-full">
        {busy ? (
          <><div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> Treinando...</>
        ) : disabledReason ? (
          disabledReason
        ) : lowEnergy ? (
          'Sem energia'
        ) : (
          <><Dumbbell className="h-4 w-4" /> Treinar</>
        )}
      </Button>
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
