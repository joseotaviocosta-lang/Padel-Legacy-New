import { normalizeAthlete } from './athleteSchema.js';
import { getRealAthleteRegistry, getRealAthleteRegistryMeta } from './realAthleteRegistry.js';

// Fase 2A: catálogo de adversários de prática — antes uma lista de 10
// hardcoded, com um id scheme próprio (`fip-2026:key`), desconectada do
// pool de ranking/mundo. Agora deriva do mesmo registro canônico único
// (src/players/realAthleteRegistry.js) que semeia o mundo — os 100 atletas
// reais aparecem aqui automaticamente, sem lista duplicada.
const registryMeta = getRealAthleteRegistryMeta();

function courtSideFromPosition(position) {
  return position === 'esquerda' ? 'left' : position === 'direita' ? 'right' : 'flex';
}

const REAL_TEMPLATES = getRealAthleteRegistry().map((athlete) => normalizeAthlete({
  template_id: athlete.id, source_type: 'real', licensing_mode: 'reference',
  name: athlete.name, country: athlete.country, nationality_code: athlete.country_code,
  ranking_position: athlete.fip_rank, world_rank: athlete.fip_rank,
  preferred_side: courtSideFromPosition(athlete.position), play_style: athlete.play_style,
  overall: athlete.overall_rating, overall_rating: athlete.overall_rating,
  potential: athlete.potential, side_flexibility: athlete.position ? 0.3 : 0.82,
  market_status: 'livre', career_status: 'ativo',
  tags: [`fip-ranking-snapshot-${registryMeta.snapshotDate}`],
}));

export const REAL_ATHLETE_REFERENCE_DATE = registryMeta.snapshotDate;
export const REAL_ATHLETE_SOURCE_URL = 'https://www.padelfip.com/fip-rankings/?gender=Male';
export function getRealAthletes() { return REAL_TEMPLATES.map(athlete => ({ ...athlete, attributes: { ...athlete.attributes }, side_experience: { ...athlete.side_experience } })); }
