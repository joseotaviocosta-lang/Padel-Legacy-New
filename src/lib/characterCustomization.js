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

const NUMERIC_FIELDS = ['height_cm', 'voice_pitch', 'voice_speed'];

export function normalizeCharacterCustomization(value, profileId = '') {
  const source = value && typeof value === 'object' ? value : {};
  const normalized = {
    ...DEFAULT_CHARACTER_CUSTOMIZATION,
    ...source,
    profile_id: source.profile_id || profileId,
    accessories: Array.isArray(source.accessories) ? source.accessories.filter(Boolean) : [],
    languages: Array.isArray(source.languages) && source.languages.length > 0
      ? source.languages.filter(Boolean)
      : [...DEFAULT_CHARACTER_CUSTOMIZATION.languages],
  };

  for (const field of NUMERIC_FIELDS) {
    const raw = source[field];
    const parsed = raw === null || raw === '' || raw === undefined ? Number.NaN : Number(raw);
    normalized[field] = Number.isFinite(parsed) ? parsed : DEFAULT_CHARACTER_CUSTOMIZATION[field];
  }
  return normalized;
}
