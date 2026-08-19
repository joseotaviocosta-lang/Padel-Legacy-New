import React, { useState } from 'react';
import { Dumbbell, AlertTriangle, Sparkles } from 'lucide-react';
import { TRAINING_CATEGORIES, INTENSITY_LEVELS, getPredictedGain } from '@/lib/trainingSystemV2';
import { ATTRIBUTE_LABELS } from '@/lib/initialCareerProfiles';
import { getAttributeIcon } from '@/components/padel/Shared';
import { Button, CompactActionCard, ProgressBar, StatusBadge } from '@/components/design-system';

// Mobile M4 (docs/MOBILE_M4_COMPACT_UX.md, M4.3 — gate obrigatório): fechado,
// o card mostra só o que decide a escolha (duração/fadiga/energia + o ganho
// previsto nos 2 atributos principais) e o botão Treinar — ~110-160px, sem
// a caixa de ganho/linha de stats/seletor de intensidade sempre expandidos
// como antes. Intensidade vira um segmented control dentro do "expandir",
// junto do nível atual/afinidade/risco/bônus que já era secundário.
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

  const category = TRAINING_CATEGORIES[activity.category];
  const Icon = getAttributeIcon(activity.icon);
  const prediction = getPredictedGain(profile, activity, intensity, weeklyCount, coachBonus);

  const intensityObj = INTENSITY_LEVELS.find(i => i.id === intensity) || INTENSITY_LEVELS[1];
  const energyCost = prediction.energyCost;
  const fatigueCost = intensityObj.fatigueCost + (activity.fatigueExtra || 0);
  const lowEnergy = (profile?.energy || 100) < energyCost;
  const isDisabled = disabled || busy || lowEnergy;
  const topGains = Object.entries(prediction.gains).slice(0, 2);

  const summary = (
    <div className="space-y-0.5">
      <p>
        {activity.duration}min · <span className={fatigueCost >= 12 ? 'text-red-400 font-bold' : 'text-amber-400 font-bold'}>+{fatigueCost} fadiga</span> · <span className={lowEnergy ? 'text-red-400 font-bold' : 'text-primary font-bold'}>-{energyCost} energia</span>
      </p>
      <p className="text-foreground/90">
        {/* Redesign Checkpoint Hotfix 1 (scripts/test-visual-checkpoint-hotfix1.mjs):
            mostra o valor ATUAL do atributo (mesma fonte do gameplay,
            `profile?.[attribute]`), não só o ganho — já foi perdido uma vez
            antes por engano e corrigido de propósito. */}
        {topGains.length
          ? topGains.map(([attribute, gain]) => `${ATTRIBUTE_LABELS[attribute] || attribute} ${Math.round(Number(profile?.[attribute]) || 0)} +${gain.toFixed(2)}`).join(' · ')
          : 'Sessão de manutenção'}
      </p>
      {weeklyCount >= 2 && (
        <p className="flex items-center gap-1 text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {weeklyCount}x esta semana · {Math.round(prediction.diminishing * 100)}% eficiência
        </p>
      )}
    </div>
  );

  const details = (
    <>
      <div>
        <div className="mb-1 flex justify-between text-[10px]">
          <span className="text-muted-foreground">Nível atual</span>
          <span className="font-bold text-primary tabular-nums">{prediction.currentVal}/100</span>
        </div>
        <ProgressBar value={prediction.currentVal} max={100} tone="brand" />
      </div>
      <div>
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Intensidade</p>
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
    </>
  );

  return (
    <CompactActionCard
      icon={Icon}
      iconClassName={category?.color || 'text-primary'}
      title={activity.label}
      badge={recommended && <StatusBadge tone="premium" icon={Sparkles}>Recomendado</StatusBadge>}
      summary={summary}
      details={details}
      tone={recommended ? 'premium' : 'default'}
      primaryAction={
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
      }
    />
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
