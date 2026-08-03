import { normalizeAthlete } from './athleteSchema.js';

// Names, nationalities and ranking snapshot: official FIP ranking, 20 July 2026.
// Sides, styles and ratings below are gameplay metadata, not official measurements.
const REAL_TEMPLATES = [
  ['arturo-coello', 'Arturo Coello', 'Espanha', 'ESP', 1, 'left', 'Potência', 97],
  ['agustin-tapia', 'Agustín Tapia', 'Argentina', 'ARG', 1, 'right', 'Agressivo', 97],
  ['alejandro-galan', 'Alejandro Galán', 'Espanha', 'ESP', 3, 'left', 'Agressivo', 95],
  ['federico-chingotto', 'Federico Chingotto', 'Argentina', 'ARG', 3, 'right', 'Defensivo', 94],
  ['juan-lebron', 'Juan Lebrón', 'Espanha', 'ESP', 5, 'flex', 'Agressivo', 93],
  ['leandro-augsburger', 'Leandro Augsburger', 'Argentina', 'ARG', 6, 'left', 'Potência', 92],
  ['franco-stupaczuk', 'Franco Stupaczuk', 'Argentina', 'ARG', 7, 'left', 'Equilibrado', 91],
  ['miguel-yanguas', 'Miguel Yanguas', 'Espanha', 'ESP', 8, 'right', 'Equilibrado', 90],
  ['francisco-navarro', 'Francisco Navarro', 'Espanha', 'ESP', 9, 'left', 'Tático', 89],
  ['jorge-nieto', 'Jorge Nieto', 'Espanha', 'ESP', 10, 'right', 'Defensivo', 88],
].map(([key, name, country, nationality_code, rank, preferred_side, play_style, overall]) => normalizeAthlete({
  template_id: `fip-2026:${key}`, source_type: 'real', licensing_mode: 'reference', name, country,
  nationality_code, ranking_position: rank, world_rank: rank, preferred_side, play_style, overall,
  overall_rating: overall, potential: Math.min(100, overall + 2), side_flexibility: preferred_side === 'flex' ? 0.82 : 0.3,
  market_status: 'livre', career_status: 'ativo', tags: ['fip-ranking-snapshot-2026-07-20'],
}));

export const REAL_ATHLETE_REFERENCE_DATE = '2026-07-20';
export const REAL_ATHLETE_SOURCE_URL = 'https://www.padelfip.com/fip-rankings/?gender=Male';
export function getRealAthletes() { return REAL_TEMPLATES.map(athlete => ({ ...athlete, attributes: { ...athlete.attributes }, side_experience: { ...athlete.side_experience } })); }
