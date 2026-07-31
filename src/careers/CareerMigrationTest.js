import { migrateCareer } from './CareerMigration.js';
import { validateCareerData } from './CareerValidator.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLegacyV1Career() {
  const now = new Date().toISOString();
  return {
    save_schema_version: 1,
    career_id: 'migration-test-v1',
    career_name: 'Carreira antiga',
    career_type: 'experiment',
    created_at: now,
    updated_at: now,
    last_played_at: now,
    metadata: {
      player_name: 'Teste',
      court_side: 'direita',
      play_style: 'equilibrado',
      career_date: now.slice(0, 10),
      ranking_position: null,
      season: new Date().getFullYear(),
      archived: false,
    },
    player: {},
    world: {},
    calendar: {},
    ranking: {},
    market: {},
    tournaments: {},
    training: {},
    economy: {},
    inventory: {},
    statistics: {},
    history: {},
  };
}

export async function runCareerMigrationTest() {
  const original = createLegacyV1Career();
  const untouched = clone(original);
  const result = migrateCareer(original);
  const validated = validateCareerData(result.data);

  const success = result.migrated
    && result.fromVersion === 1
    && result.toVersion === 2
    && validated.save_schema_version === 2
    && validated.entities
    && typeof validated.entities === 'object'
    && !Array.isArray(validated.entities)
    && JSON.stringify(original) === JSON.stringify(untouched);

  if (!success) throw new Error('Falha na migração automática da carreira v1 para v2.');

  return {
    success: true,
    migrated: result.migrated,
    fromVersion: result.fromVersion,
    toVersion: result.toVersion,
    entitiesCreated: true,
    originalPreserved: true,
  };
}

export function setupCareerMigrationTest() {
  if (typeof window !== 'undefined') {
    window.PadelMigrationTest = { run: runCareerMigrationTest };
  }
}
