import React from 'react';
import { Zap, Battery, Heart, Brain, Activity, Shield, AlertTriangle, Users } from 'lucide-react';
import { getConditionScore, getConditionLabel, getOvertrainingStatus } from '@/lib/trainingSystem';
import { isInjured, injuryRecoveryDays, chemistryLabel } from '@/lib/padel';

// ── Condition Bar ─────────────────────────────────────────────────────────
function ConditionBar({ icon: Icon, label, value, max = 100, color, warning = false }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const barColor = color || (pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-primary' : pct >= 20 ? 'bg-amber-500' : 'bg-red-500');
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
        <Icon className={`h-4 w-4 ${warning ? 'text-amber-400' : 'text-muted-foreground'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-[10px] mb-0.5">
          <span className="text-muted-foreground font-semibold">{label}</span>
          <span className="font-bold tabular-nums">{Math.round(value)}/{max}</span>
        </div>
        <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── Main Condition Panel ──────────────────────────────────────────────────
export default function ConditionPanel({ profile }) {
  if (!profile) return null;

  const score = getConditionScore(profile);
  const condLabel = getConditionLabel(score);
  const overtraining = getOvertrainingStatus(profile);
  const chemLabel = chemistryLabel(profile.partner_chemistry || 50);
  const injured = isInjured(profile);

  return (
    <div className="space-y-4">
      {/* Overall Score + Overtraining Alert */}
      <div className="glass rounded-2xl p-4 grid-bg relative overflow-hidden">
        <div className="absolute -top-8 -right-8 h-28 w-28 bg-primary/10 rounded-full blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">Condição Geral</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black tabular-nums">{score}</span>
              <span className={`text-sm font-bold ${condLabel.color}`}>{condLabel.label}</span>
            </div>
          </div>
          <div className={`px-3 py-2 rounded-xl ${overtraining.bg} ${overtraining.border} border`}>
            <p className={`text-[10px] uppercase font-bold ${overtraining.color}`}>{overtraining.label}</p>
          </div>
        </div>
        {overtraining.level !== 'none' && (
          <div className={`relative mt-3 flex items-start gap-2 text-xs ${overtraining.color}`}>
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{overtraining.message}</p>
          </div>
        )}
      </div>

      {/* Injury Alert */}
      {injured && (
        <div className="glass rounded-2xl p-4 border border-red-500/40 bg-red-500/5 flex items-center gap-3">
          <Shield className="h-5 w-5 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-300">Lesionado</p>
            <p className="text-xs text-red-400/70">Recupera em {injuryRecoveryDays(profile)} dias. Avance o calendário; um fisioterapeuta contratado reduz a fadiga diária e o risco de recaída.</p>
          </div>
        </div>
      )}

      {/* Condition Bars */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold mb-1">Métricas de Condição</p>
        <ConditionBar icon={Zap} label="Energia" value={profile.energy || 100} warning={(profile.energy || 100) < 30} />
        <ConditionBar icon={Activity} label="Fadiga" value={profile.fatigue || 0} color={(profile.fatigue || 0) >= 60 ? 'bg-red-500' : (profile.fatigue || 0) >= 40 ? 'bg-amber-500' : 'bg-green-500'} />
        <ConditionBar icon={Heart} label="Moral" value={profile.morale || 70} />
        <ConditionBar icon={Brain} label="Confiança" value={profile.confidence || 50} />
        <ConditionBar icon={Battery} label="Forma Física" value={profile.form || 50} />
      </div>

      {/* Partner Chemistry */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-bold">Entrosamento da Dupla</p>
              <p className="text-[10px] text-muted-foreground">{profile.partner_name || 'Sem parceiro'}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-sm font-bold ${chemLabel.color}`}>{chemLabel.label}</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">{profile.partner_chemistry || 50}/100</p>
          </div>
        </div>
      </div>
    </div>
  );
}