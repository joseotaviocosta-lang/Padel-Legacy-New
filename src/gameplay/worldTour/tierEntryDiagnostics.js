import { isRankInTierDiagnosticCore, tierPreferenceFit } from '@/lib/circuitCatalog.js';
import { eligibleForTier } from './EntryManager.js';

export const DIAGNOSTIC_TIER_ORDER = Object.freeze(['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown']);

// Classificação exclusivamente observacional. Nenhum fluxo de inscrição,
// escolha, sorteio, seeding, qualifying ou rescue importa este módulo.
export function classifyTierEntryLayer(rank, tier, tiers = DIAGNOSTIC_TIER_ORDER) {
  if (isRankInTierDiagnosticCore(rank, tier)) return 'CORE';
  const tierIndex = tiers.indexOf(tier);
  const inAdjacentCore = tiers.some((other, index) => Math.abs(index - tierIndex) === 1 && isRankInTierDiagnosticCore(rank, other));
  // Qualifying é uma via normal e deliberada de entrada. Mesmo além do core
  // adjacente estrito, continua sendo proximidade plausível — não stretch.
  if (inAdjacentCore || eligibleForTier(rank, tier, {}, { aiFieldContext: true })) return 'NEAR';
  // Fora da rede normal, um fit positivo ainda permite rescue ordenado por
  // adequação. Fit zero é o único fallback verdadeiramente emergencial.
  if (tierPreferenceFit(rank, tier) > 0) return 'STRETCH';
  return 'EMERGENCY';
}
