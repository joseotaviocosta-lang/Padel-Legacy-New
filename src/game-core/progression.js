import { levelForXp } from '@/lib/padel';
import { getDifficultyModifier } from '@/gameplay/difficulty/difficultyConfig.js';
import { clamp } from './utils';

export function calculatePracticeProgress(profile, won, balance) {
  const xpGain = Math.round((won ? balance.winXp : balance.lossXp) * getDifficultyModifier(profile, 'careerXpMultiplier'));
  const coinsGain = won ? balance.winCoins : balance.lossCoins;
  const newXp = (Number(profile?.xp) || 0) + xpGain;
  return {
    xpGain,
    coinsGain,
    updates: {
      xp: newXp,
      level: levelForXp(newXp),
      coins: (Number(profile?.coins) || 0) + coinsGain,
      matches_played: (Number(profile?.matches_played) || 0) + 1,
      wins: (Number(profile?.wins) || 0) + (won ? 1 : 0),
      losses: (Number(profile?.losses) || 0) + (won ? 0 : 1),
      confidence: clamp((Number(profile?.confidence) || 50) + (won ? balance.winConfidence : balance.lossConfidence)),
      morale: clamp((Number(profile?.morale) || 70) + (won ? balance.winMorale : balance.lossMorale)),
      form: clamp((Number(profile?.form) || 50) + (won ? 2 : -1)),
    },
  };
}
