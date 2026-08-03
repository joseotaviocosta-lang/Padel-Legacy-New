import { generateFictionalAthletes } from './athleteGenerator.js';
import { getRealAthletes } from './realAthletes.js';

export const ATHLETE_CATALOG_SEED = 'padel-legacy-world-v1';
export const FICTIONAL_ATHLETE_COUNT = 240;

export function realAthletesEnabled(env = import.meta.env) {
  return String(env?.VITE_REAL_ATHLETES_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export function buildAthleteCatalog({ includeReal = realAthletesEnabled(), fictionalCount = FICTIONAL_ATHLETE_COUNT, seed = ATHLETE_CATALOG_SEED } = {}) {
  const fictional = generateFictionalAthletes({ count: fictionalCount, seed });
  const real = includeReal ? getRealAthletes() : [];
  const records = [...real, ...fictional];
  const ids = new Set();
  return records.filter(athlete => !ids.has(athlete.id) && ids.add(athlete.id));
}
