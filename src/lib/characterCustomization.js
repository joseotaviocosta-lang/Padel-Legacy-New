import {
  ACCESSORIES, BUILDS, CELEBRATIONS, COLORS, EYE_COLORS, FACE_TYPES,
  HAIR_COLORS, HAIR_STYLES, IDLE_ANIMATIONS, LANGUAGES, NATIONALITIES,
  RACKET_MODELS, SIGNATURE_EMOJIS, SKIN_TONES, TITLES, VICTORY_POSES, VOICE_TYPES,
} from './characterCatalog.js';

export const DEFAULT_CHARACTER_CUSTOMIZATION = Object.freeze({
  skin_tone: 'media', hair_style: 'curto', hair_color: 'preto', eye_color: 'castanho',
  face_type: 'oval', height_cm: 178, build: 'atletico',
  shirt_color: '#a3e635', shorts_color: '#1e293b', shoes_color: '#f8fafc',
  headband: false, headband_color: '#a3e635', wristband: false, wristband_color: '#a3e635',
  racket_model: 'classic', racket_color: '#a3e635', grip_color: '#1e293b',
  idle_animation: 'repouso', celebration: 'soco_ar', victory_pose: 'bracos_cruzados',
  accessories: [], title: 'O Novato', nationality: 'Brasil', languages: ['Português'],
  voice_type: 'medio', voice_pitch: 50, voice_speed: 50,
  primary_color: '#a3e635', secondary_color: '#0ea5e9', signature_emoji: '🎾', backstory: '',
});

const ids = items => items.map(item => typeof item === 'string' ? item : item.id);
const CATALOG_IDS = Object.freeze({
  skin_tone: ids(SKIN_TONES), hair_style: ids(HAIR_STYLES), hair_color: ids(HAIR_COLORS),
  eye_color: ids(EYE_COLORS), face_type: ids(FACE_TYPES), build: ids(BUILDS),
  shirt_color: ids(COLORS), shorts_color: ids(COLORS), shoes_color: ids(COLORS),
  headband_color: ids(COLORS), wristband_color: ids(COLORS), racket_model: ids(RACKET_MODELS),
  racket_color: ids(COLORS), grip_color: ids(COLORS), idle_animation: ids(IDLE_ANIMATIONS),
  celebration: ids(CELEBRATIONS), victory_pose: ids(VICTORY_POSES), title: TITLES,
  nationality: NATIONALITIES, voice_type: ids(VOICE_TYPES), primary_color: ids(COLORS),
  secondary_color: ids(COLORS), signature_emoji: SIGNATURE_EMOJIS,
});

const LEGACY_ALIASES = Object.freeze({
  skin_tone: ['skinTone', 'skinColor', 'skin'],
  hair_style: ['hairStyle', 'hairstyle', 'hair_type', 'hair'],
  hair_color: ['hairColor'], eye_color: ['eyeColor'], face_type: ['faceType', 'face'],
  build: ['body', 'bodyType', 'body_type'], shirt_color: ['shirtColor', 'shirt'],
  shorts_color: ['shortsColor', 'shorts'], shoes_color: ['shoesColor', 'shoes'],
  racket_model: ['racketModel', 'racket'], accessories: ['accessory'],
});

const LEGACY_VALUES = Object.freeze({
  hair_color: { '#3b2a1f': 'castanho', '#1a1a1a': 'preto' },
  celebration: { fist_pump: 'soco_ar' },
  hair_style: { short: 'curto', medium: 'medio', long: 'longo', shaved: 'rapado', braids: 'trençado', tied: 'preso' },
});

function readField(source, field) {
  if (source[field] !== undefined && source[field] !== null && source[field] !== '') return source[field];
  for (const alias of LEGACY_ALIASES[field] || []) {
    if (source[alias] !== undefined && source[alias] !== null && source[alias] !== '') return source[alias];
  }
  return undefined;
}

function normalizeCatalogValue(field, raw) {
  const allowed = CATALOG_IDS[field];
  if (!allowed) return raw;
  const migrated = LEGACY_VALUES[field]?.[raw] ?? raw;
  if (allowed.includes(migrated)) return migrated;
  const numericIndex = typeof migrated === 'number' || /^\d+$/.test(String(migrated || '')) ? Number(migrated) : -1;
  return Number.isInteger(numericIndex) && allowed[numericIndex]
    ? allowed[numericIndex]
    : DEFAULT_CHARACTER_CUSTOMIZATION[field];
}

function finiteInRange(raw, fallback, min, max) {
  const parsed = raw === null || raw === '' || raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function canSelectCharacterOption(option) {
  return Boolean(option) && option.unlocked !== false && option.disabled !== true;
}

export function normalizeCharacterCustomization(value, profileId = '') {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = { ...DEFAULT_CHARACTER_CUSTOMIZATION, ...source };

  for (const field of Object.keys(CATALOG_IDS)) {
    normalized[field] = normalizeCatalogValue(field, readField(source, field));
  }

  const rawAccessories = readField(source, 'accessories');
  const accessories = Array.isArray(rawAccessories) ? rawAccessories : rawAccessories ? [rawAccessories] : [];
  normalized.accessories = [...new Set(accessories.filter(item => ids(ACCESSORIES).includes(item)))];
  normalized.languages = Array.isArray(source.languages)
    ? [...new Set(source.languages.filter(item => LANGUAGES.includes(item)))]
    : [...DEFAULT_CHARACTER_CUSTOMIZATION.languages];
  if (normalized.languages.length === 0) normalized.languages = [...DEFAULT_CHARACTER_CUSTOMIZATION.languages];

  normalized.height_cm = finiteInRange(source.height_cm ?? source.height, 178, 155, 210);
  normalized.voice_pitch = finiteInRange(source.voice_pitch, 50, 0, 100);
  normalized.voice_speed = finiteInRange(source.voice_speed, 50, 0, 100);
  normalized.headband = Boolean(source.headband);
  normalized.wristband = Boolean(source.wristband);
  normalized.profile_id = source.profile_id || profileId;
  normalized.backstory = String(source.backstory || '');
  return normalized;
}

export function applyCharacterCustomizationChange(current, field, value) {
  return normalizeCharacterCustomization({ ...(current || {}), [field]: value }, current?.profile_id || '');
}
