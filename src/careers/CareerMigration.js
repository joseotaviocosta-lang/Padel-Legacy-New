import { CAREER_INDEX_SCHEMA_VERSION, CAREER_SAVE_SCHEMA_VERSION } from './careerSchema.js';

function cloneDeep(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function migrateCareer(career) {
  const data = cloneDeep(career);
  const fromVersion = Number(data.save_schema_version ?? 1);
  const toVersion = CAREER_SAVE_SCHEMA_VERSION;
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new Error(`Versão de carreira inválida: ${data.save_schema_version}.`);
  }
  if (fromVersion > toVersion) throw new Error(`Versão futura desconhecida de carreira: ${fromVersion}.`);
  let version = fromVersion;
  if (version < 2) {
    if (!data.entities || typeof data.entities !== 'object' || Array.isArray(data.entities)) data.entities = {};
    data.save_schema_version = 2;
    version = 2;
  }
  return { migrated: version !== fromVersion, fromVersion, toVersion, data };
}

export function migrateIndex(index) {
  const data = cloneDeep(index);
  const fromVersion = Number(data.schema_version ?? 1);
  const toVersion = CAREER_INDEX_SCHEMA_VERSION;
  if (fromVersion > toVersion) throw new Error(`Versão futura desconhecida do índice: ${fromVersion}.`);
  return { migrated: false, fromVersion, toVersion, data };
}
