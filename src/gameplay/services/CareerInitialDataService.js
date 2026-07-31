import { LOCAL_SEED, LOCAL_PROFILE } from '@/local/localSeed.js';

const CORE_ENTITY_NAMES = Object.freeze([
  'AthleteProfile',
  'TeamRanking',
  'Tournament',
  'Season',
  'CircuitSeason',
  'CalendarEvent',
  'Mission',
  'Achievement',
  'Sponsor',
  'Coach',
  'Club',
  'ShopItem',
  'MarketEvent',
  'WorldEvent',
  'Post',
]);

function clone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function remapSeedRow(row, activePlayerId) {
  const seeded = { ...clone(row) };
  if (!activePlayerId) return seeded;

  if (seeded.profile_id === LOCAL_PROFILE.id) seeded.profile_id = activePlayerId;
  if (seeded.created_by_id === LOCAL_PROFILE.id) seeded.created_by_id = activePlayerId;
  return seeded;
}

export function seedCollection(entityName, activePlayerId = null) {
  if (entityName === 'User' || entityName === 'PlayerProfile') return [];
  return clone(LOCAL_SEED[entityName] || []).map((row) => remapSeedRow(row, activePlayerId));
}

/**
 * Materializa uma única vez os dados básicos usados pelas telas iniciais.
 *
 * A função é idempotente: coleções existentes nunca são substituídas e uma
 * segunda execução não duplica registros. O chamador deve persistir a carreira
 * na mesma transação em que esta função for usada.
 */
export function initializeCareerInitialData(career, { entityNames = CORE_ENTITY_NAMES } = {}) {
  if (!career || typeof career !== 'object') {
    throw new Error('Carreira inválida para inicialização dos dados básicos.');
  }

  if (!career.entities || typeof career.entities !== 'object' || Array.isArray(career.entities)) {
    career.entities = {};
  }

  const playerId = career.player?.id || null;
  const initialized = [];

  for (const entityName of entityNames) {
    if (Array.isArray(career.entities[entityName])) continue;
    career.entities[entityName] = seedCollection(entityName, playerId);
    initialized.push(entityName);
  }

  if (!career.world || typeof career.world !== 'object' || Array.isArray(career.world)) {
    career.world = {};
  }
  if (!career.ranking || typeof career.ranking !== 'object' || Array.isArray(career.ranking)) {
    career.ranking = {};
  }

  career.world.initial_data_version = 1;
  career.world.initial_data_initialized_at = career.world.initial_data_initialized_at || new Date().toISOString();
  career.ranking.status = career.ranking.status || 'ready';

  return {
    initialized,
    alreadyInitialized: initialized.length === 0,
    entityCount: entityNames.length,
  };
}

export { CORE_ENTITY_NAMES };
