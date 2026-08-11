import { CAREER_INDEX_SCHEMA_VERSION, CAREER_SAVE_SCHEMA_VERSION, ALLOWED_CAREER_TYPES, ALLOWED_COURT_SIDES, ALLOWED_PLAY_STYLES, ALLOWED_CAREER_DIFFICULTIES } from './careerSchema.js';
import { normalizePlayerPhysicalStats } from '../game-core/physicalStats.js';

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
}

function isValidIsoDate(value) {
  // Reject non-strings and empty strings
  if (typeof value !== 'string' || value.trim() === '') return false;

  // Reject values that are plain Date objects or numbers disguised as strings
  // (we only accept strings representing dates)
  try {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return false;
    const d = new Date(parsed);
    if (Number.isNaN(d.getTime())) return false;
    // Do not require exact textual equality with toISOString() because
    // input may include offsets or omit milliseconds; accept any parseable ISO-like string.
    return true;
  } catch (e) {
    return false;
  }
}

function cloneDeep(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function fail(message) {
  throw new Error(message);
}

function validateSummaryItem(summary) {
  if (!isObject(summary)) fail('Resumo de carreira deve ser um objeto.');
  if (!isSafeId(summary.id)) fail('Resumo de carreira inválido: id deve ser seguro.');
  if (!isNonEmptyString(summary.save_name)) fail('Resumo de carreira inválido: save_name obrigatório.');
  if (!isNonEmptyString(summary.player_name)) fail('Resumo de carreira inválido: player_name obrigatório.');
  if (summary.court_side !== null && !ALLOWED_COURT_SIDES.includes(summary.court_side)) fail('Resumo de carreira inválido: court_side inválido.');
  if (summary.play_style !== null && !ALLOWED_PLAY_STYLES.includes(summary.play_style)) fail('Resumo de carreira inválido: play_style inválido.');
  if (summary.career_difficulty !== null && !ALLOWED_CAREER_DIFFICULTIES.includes(summary.career_difficulty)) fail('Resumo de carreira inválido: career_difficulty inválido.');
  if (!ALLOWED_CAREER_TYPES.includes(summary.career_type)) fail('Resumo de carreira inválido: career_type inválido.');
  if (!isValidIsoDate(summary.career_date)) fail('Resumo de carreira inválido: career_date deve ser uma data ISO.');
  if (summary.ranking_position !== null && typeof summary.ranking_position !== 'number') {
    fail('Resumo de carreira inválido: ranking_position deve ser número ou null.');
  }
  if (typeof summary.season !== 'number' || Number.isNaN(summary.season)) {
    fail('Resumo de carreira inválido: season deve ser número.');
  }
  if (!isValidIsoDate(summary.created_at)) fail('Resumo de carreira inválido: created_at deve ser data ISO.');
  if (!isValidIsoDate(summary.updated_at)) fail('Resumo de carreira inválido: updated_at deve ser data ISO.');
  if (!isValidIsoDate(summary.last_played_at)) fail('Resumo de carreira inválido: last_played_at deve ser data ISO.');
  if (typeof summary.archived !== 'boolean') fail('Resumo de carreira inválido: archived deve ser booleano.');
}

export function validateCareerData(career) {
  if (!isObject(career)) fail('Carreira deve ser um objeto.');
  if (!isSafeId(career.career_id)) fail('career_id inválido.');
  if (!isNonEmptyString(career.career_name)) fail('career_name obrigatório.');
  if (!ALLOWED_CAREER_TYPES.includes(career.career_type)) fail('career_type inválido.');
  if (typeof career.save_schema_version !== 'number') fail('save_schema_version deve ser um número.');
  if (career.save_schema_version !== CAREER_SAVE_SCHEMA_VERSION) fail(`save_schema_version desconhecido: ${career.save_schema_version}.`);
  if (!isValidIsoDate(career.created_at)) fail('created_at deve ser uma data ISO válida.');
  if (!isValidIsoDate(career.updated_at)) fail('updated_at deve ser uma data ISO válida.');
  if (!isValidIsoDate(career.last_played_at)) fail('last_played_at deve ser uma data ISO válida.');

  if (!isObject(career.metadata)) fail('metadata deve ser um objeto.');
  const metadata = career.metadata;
  if (!isNonEmptyString(metadata.player_name)) fail('metadata.player_name obrigatório.');
  if (metadata.court_side !== null && !ALLOWED_COURT_SIDES.includes(metadata.court_side)) fail('metadata.court_side inválido.');
  if (metadata.play_style !== null && !ALLOWED_PLAY_STYLES.includes(metadata.play_style)) fail('metadata.play_style inválido.');
  if (metadata.career_difficulty !== null && !ALLOWED_CAREER_DIFFICULTIES.includes(metadata.career_difficulty)) fail('metadata.career_difficulty inválido.');
  if (!isNonEmptyString(metadata.career_date) || !isValidIsoDate(`${metadata.career_date}T00:00:00`)) {
    fail('metadata.career_date deve ser uma data ISO válida (YYYY-MM-DD).');
  }
  if (metadata.ranking_position !== null && typeof metadata.ranking_position !== 'number') {
    fail('metadata.ranking_position deve ser número ou null.');
  }
  if (typeof metadata.season !== 'number' || Number.isNaN(metadata.season)) fail('metadata.season deve ser número.');
  if (typeof metadata.archived !== 'boolean') fail('metadata.archived deve ser booleano.');

  const requiredDataObjects = ['player', 'world', 'calendar', 'ranking', 'market', 'tournaments', 'training', 'economy', 'inventory', 'statistics', 'history', 'entities'];
  for (const key of requiredDataObjects) {
    if (!isObject(career[key])) fail(`${key} deve ser um objeto.`);
  }

  const validated = cloneDeep(career);
  validated.player = normalizePlayerPhysicalStats(validated.player);
  return validated;
}

export function validateCareerIndex(index) {
  if (!isObject(index)) fail('Índice de carreiras deve ser um objeto.');
  if (typeof index.schema_version !== 'number') fail('schema_version do índice deve ser um número.');
  if (index.schema_version !== CAREER_INDEX_SCHEMA_VERSION) fail(`schema_version do índice desconhecido: ${index.schema_version}.`);
  if (index.last_career_id !== null && !isSafeId(index.last_career_id)) fail('last_career_id inválido.');
  if (!Array.isArray(index.careers)) fail('index.careers deve ser um array.');

  const ids = new Set();
  for (const item of index.careers) {
    validateSummaryItem(item);
    if (ids.has(item.id)) fail(`IDs duplicados no índice: ${item.id}.`);
    ids.add(item.id);
  }

  return cloneDeep(index);
}

// Dev-only basic assertions to catch obvious validator regressions during development
if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
  try {
    // valid
    if (!isValidIsoDate(new Date().toISOString())) throw new Error('ISO validator failed on valid ISO string');
    // invalid cases
    if (isValidIsoDate('')) throw new Error('ISO validator incorrectly accepted empty string');
    if (isValidIsoDate(null)) throw new Error('ISO validator incorrectly accepted null');
    if (isValidIsoDate({})) throw new Error('ISO validator incorrectly accepted object');
    if (isValidIsoDate('not-a-date')) throw new Error('ISO validator incorrectly accepted garbage');
  } catch (e) {
    // Log without throwing to avoid breaking app startup; developer will see console error
    console.error('[career-validator] self-test failed:', e?.message || e);
  }
}
