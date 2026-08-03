import { ALLOWED_COURT_SIDES, ALLOWED_PLAY_STYLES, ALLOWED_CAREER_TYPES, CAREER_SAVE_SCHEMA_VERSION } from './careerSchema.js';

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `career-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function nowIsoDate() {
  return new Date().toISOString();
}

function requireString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} deve ser uma string não vazia.`);
  }
  return value.trim();
}

function requireOption(value, allowed, fieldName) {
  const normalized = requireString(value, fieldName).toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new Error(`${fieldName} deve ser uma das opções válidas: ${allowed.join(', ')}.`);
  }
  return normalized;
}

export function createDefaultCareerData({ saveName = 'Nova Carreira', playerName = 'Novo Atleta', courtSide = 'direita', playStyle = 'equilibrado', careerType = 'normal' }) {
  const normalizedSaveName = requireString(saveName, 'saveName');
  const normalizedPlayerName = requireString(playerName, 'playerName');
  const normalizedCourtSide = requireOption(courtSide, ALLOWED_COURT_SIDES, 'courtSide');
  const normalizedPlayStyle = requireOption(playStyle, ALLOWED_PLAY_STYLES, 'playStyle');
  const normalizedCareerType = requireOption(careerType, ALLOWED_CAREER_TYPES, 'careerType');
  const createdAt = nowIsoDate();
  const careerDate = createdAt.slice(0, 10);

  return {
    save_schema_version: CAREER_SAVE_SCHEMA_VERSION,
    career_id: createUuid(),
    career_name: normalizedSaveName,
    career_type: normalizedCareerType,
    created_at: createdAt,
    updated_at: createdAt,
    last_played_at: createdAt,
    metadata: {
      player_name: normalizedPlayerName,
      court_side: normalizedCourtSide,
      play_style: normalizedPlayStyle,
      career_date: careerDate,
      ranking_position: null,
      season: new Date().getFullYear(),
      archived: false,
      onboarding_completed: false,
      side_selected: false,
      style_selected: false,
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
    entities: {},
  };
}
