import { CAREER_INDEX_SCHEMA_VERSION, CAREER_SAVE_SCHEMA_VERSION } from './careerSchema.js';
import { normalizeCharacterCustomization } from '../lib/characterCustomization.js';

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
  if (version < 5) {
    data.entities = data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : {};
    data.entities.PressJournalist = Array.isArray(data.entities.PressJournalist)
      ? data.entities.PressJournalist.filter(item => item?.id && item?.name)
      : [];

    const persistedIds = new Set(data.entities.PressJournalist.map(item => item.id));
    const canonicalTemplateId = value => /^j(?:[1-9]|1[0-2])$/.test(String(value || ''));
    const referenceKeys = ['pressJournalistId', 'press_journalist_id', 'active_journalist_id'];
    for (const container of [data.metadata, data.player, data.world]) {
      if (!container || typeof container !== 'object') continue;
      for (const key of referenceKeys) {
        const value = container[key];
        if (value && !persistedIds.has(value) && !canonicalTemplateId(value)) delete container[key];
      }
    }
    data.save_schema_version = 5;
    version = 5;
  }
  if (version < 6) {
    data.entities = data.entities && typeof data.entities === 'object' && !Array.isArray(data.entities) ? data.entities : {};
    const playerId = data.player?.id || '';
    const rows = Array.isArray(data.entities.CharacterCustomization)
      ? data.entities.CharacterCustomization.filter(item => item && typeof item === 'object')
      : [];
    if (rows.length > 0) {
      data.entities.CharacterCustomization = rows.map(item => normalizeCharacterCustomization(item, item.profile_id || playerId));
    } else if (playerId) {
      const legacyAppearance = data.player?.appearance || data.player?.customization || null;
      data.entities.CharacterCustomization = [normalizeCharacterCustomization({
        ...(legacyAppearance && typeof legacyAppearance === 'object' ? legacyAppearance : {}),
        id: `character-customization-${playerId}`,
        profile_id: playerId,
      }, playerId)];
    } else {
      data.entities.CharacterCustomization = [];
    }
    data.save_schema_version = 6;
    version = 6;
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
