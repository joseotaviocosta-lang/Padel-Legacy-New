const MIN_FATIGUE = 0;
const MAX_FATIGUE = 100;

/**
 * Canonical fatigue boundary for player state and persisted saves.
 *
 * Fatigue is a discrete 0-100 gameplay stat. Calculations may use decimals,
 * but state leaving a domain operation must always be finite and integer.
 */
export function normalizeFatigue(value, fallback = MIN_FATIGUE) {
  let fallbackNumber = MIN_FATIGUE;
  let number = Number.NaN;
  try { fallbackNumber = Number(fallback); } catch { /* use the safe default */ }
  try { number = Number(value); } catch { /* use the safe fallback */ }
  const safeFallback = Number.isFinite(fallbackNumber) ? fallbackNumber : MIN_FATIGUE;
  const safeValue = Number.isFinite(number) ? number : safeFallback;
  return Math.round(Math.max(MIN_FATIGUE, Math.min(MAX_FATIGUE, safeValue)));
}

export function normalizeFatiguePatch(patch = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  if (!Object.prototype.hasOwnProperty.call(patch, 'fatigue')) return patch;
  return { ...patch, fatigue: normalizeFatigue(patch.fatigue) };
}

export function normalizePlayerPhysicalStats(player = {}) {
  if (!player || typeof player !== 'object' || Array.isArray(player)) return player;
  return { ...player, fatigue: normalizeFatigue(player.fatigue) };
}
