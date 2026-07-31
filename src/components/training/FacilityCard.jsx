import React from 'react';
import { ArrowUp, Check, Lock } from 'lucide-react';
import { FACILITIES, getFacilityLevel, getUpgradeCost } from '@/lib/trainingCenter';

const FACILITY_ICONS = {
  courts: 'Circle', gym: 'Dumbbell', physio: 'Heart', medical: 'Stethoscope',
  performance_analysis: 'BarChart3', biomechanics: 'Activity', nutrition: 'Apple',
  psychology: 'Brain', accommodation: 'Home', laboratory: 'FlaskConical', vip: 'Crown',
};

export default function FacilityCard({ facilityId, center, profile, onUpgrade, busy }) {
  const facility = FACILITIES[facilityId];
  if (!facility) return null;

  const currentLevel = getFacilityLevel(center, facilityId);
  const isMaxed = currentLevel >= facility.maxLevel;
  const upgradeCost = getUpgradeCost(center, facilityId);
  const canAfford = (profile?.coins || 0) >= (upgradeCost || 0);
  const currentBenefits = facility.levels[currentLevel];
  const nextBenefits = facility.levels[currentLevel + 1];
  const isBusy = busy === facilityId;

  // Level dots
  const dots = Array.from({ length: facility.maxLevel }, (_, i) => i < currentLevel);

  return (
    <div className="glass rounded-2xl p-4 hover-lift">
      <div className="flex items-start gap-3 mb-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${currentLevel > 0 ? 'bg-primary/15' : 'bg-secondary/60'}`}>
          <span className="text-base">{getIcon(facilityId)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm truncate">{facility.name}</p>
            {isMaxed && <span className="text-[8px] font-bold uppercase text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">Máx</span>}
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">{facility.description}</p>
        </div>
      </div>

      {/* Level dots */}
      <div className="flex gap-1 mb-2">
        {dots.map((filled, i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full ${filled ? 'bg-primary' : 'bg-secondary/60'}`} />
        ))}
      </div>

      {/* Current benefit */}
      <div className="glass rounded-xl p-2.5 mb-2 bg-secondary/30">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold mb-0.5">Nível {currentLevel} — Atual</p>
        <p className="text-[11px] text-foreground/90">{currentBenefits?.desc}</p>
      </div>

      {/* Next benefit */}
      {!isMaxed && nextBenefits && (
        <div className="glass rounded-xl p-2.5 mb-3 border border-primary/20 bg-primary/5">
          <p className="text-[9px] uppercase tracking-wide text-primary font-bold mb-0.5">Nível {currentLevel + 1} — Próximo</p>
          <p className="text-[11px] text-foreground/90">{nextBenefits.desc}</p>
        </div>
      )}

      {/* Upgrade button */}
      {isMaxed ? (
        <div className="w-full py-2 rounded-xl bg-amber-500/10 text-amber-400 font-semibold text-xs flex items-center justify-center gap-1.5">
          <Check className="h-3.5 w-3.5" /> Nível Máximo
        </div>
      ) : (
        <button
          onClick={() => onUpgrade(facilityId)}
          disabled={!canAfford || isBusy}
          className={`w-full py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all ${
            canAfford && !isBusy
              ? 'bg-primary/15 text-primary hover:bg-primary/25 active:scale-[0.97]'
              : 'bg-secondary/50 text-muted-foreground cursor-not-allowed'
          }`}
        >
          {isBusy ? (
            <><div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Construindo...</>
          ) : canAfford ? (
            <><ArrowUp className="h-3.5 w-3.5" /> Evoluir · {upgradeCost?.toLocaleString('pt-BR')} moedas</>
          ) : (
            <><Lock className="h-3.5 w-3.5" /> {upgradeCost?.toLocaleString('pt-BR')} moedas</>
          )}
        </button>
      )}
    </div>
  );
}

function getIcon(id) {
  const icons = {
    courts: '🎾', gym: '💪', physio: '💆', medical: '🏥',
    performance_analysis: '📊', biomechanics: '⚙️', nutrition: '🍎',
    psychology: '🧠', accommodation: '🏠', laboratory: '🔬', vip: '👑',
  };
  return icons[id] || '⭐';
}