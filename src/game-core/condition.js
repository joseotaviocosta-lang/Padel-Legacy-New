import { getDifficultyModifier } from '@/gameplay/difficulty/difficultyConfig.js';
import { clamp } from './utils';
import { normalizeFatigue } from './physicalStats.js';

export function calculatePostMatchCondition(profile, won, balance) {
  return {
    energy: clamp((Number(profile?.energy) || 100) - balance.energyCost),
    fatigue: normalizeFatigue((Number(profile?.fatigue) || 0) + balance.fatigueGain * getDifficultyModifier(profile, 'fatigueGainMultiplier')),
    partner_chemistry: clamp((Number(profile?.partner_chemistry) || 50) + (won ? balance.chemistryWin : balance.chemistryLoss)),
    practice_matches_today: (Number(profile?.practice_matches_today) || 0) + 1,
  };
}
