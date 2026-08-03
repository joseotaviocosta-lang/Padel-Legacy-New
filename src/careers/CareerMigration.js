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
  if (version < 3) {
    const validSides = ['direita', 'esquerda'];
    const legacySide = validSides.includes(data.player?.court_side)
      ? data.player.court_side
      : validSides.includes(data.player?.position) ? data.player.position : null;
    const canonicalSide = data.metadata?.side_selected === true || legacySide
      ? (legacySide || data.metadata?.court_side || null)
      : null;

    data.player = { ...(data.player || {}), court_side: canonicalSide };
    delete data.player.position;
    data.metadata = {
      ...(data.metadata || {}),
      court_side: canonicalSide,
      play_style: data.player.play_style || (data.metadata?.style_selected ? data.metadata?.play_style : null),
      side_selected: Boolean(canonicalSide),
      style_selected: Boolean(data.player.play_style || data.metadata?.style_selected),
    };
    data.save_schema_version = 3;
    version = 3;
  }
  if (version < 4) {
    data.career_name = String(data.career_name || data.save_name || data.metadata?.player_name || 'Carreira importada').trim();
    data.calendar = {
      ...(data.calendar || {}),
      preferences: data.calendar?.preferences || { default_view: 'week' },
    };
    data.entities = data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : {};
    data.save_schema_version = 4;
    version = 4;
  }
  return { migrated: version !== fromVersion, fromVersion, toVersion, data };
}

export function migrateIndex(index) {
  const data = cloneDeep(index);
  const fromVersion = Number(data.schema_version ?? 1);
  const toVersion = CAREER_INDEX_SCHEMA_VERSION;
  if (fromVersion > toVersion) throw new Error(`Versão futura desconhecida do índice: ${fromVersion}.`);
  let version = fromVersion;
  if (version < 2) {
    data.careers = (data.careers || []).map((item, position) => ({
      ...item,
      save_name: String(item.save_name || item.career_name || item.player_name || `Carreira ${position + 1}`).trim(),
    }));
    data.schema_version = 2;
    version = 2;
  }
  return { migrated: version !== fromVersion, fromVersion, toVersion, data };
}
