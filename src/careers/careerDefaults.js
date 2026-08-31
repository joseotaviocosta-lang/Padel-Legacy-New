import { ALLOWED_CAREER_TYPES, CAREER_SAVE_SCHEMA_VERSION } from './careerSchema.js';
import { normalizeTutorialState } from '../onboarding/tutorialState.js';

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

export function normalizeSaveName(value) {
  const normalized = requireString(value, 'Nome da carreira');
  if (normalized.length > 40) {
    throw new Error('O nome da carreira deve ter no máximo 40 caracteres.');
  }
  if (/[<>:"/\\|?*\u0000-\u001F]/u.test(normalized)) {
    throw new Error('O nome da carreira contém caracteres inválidos: < > : " / \\ | ? *');
  }
  return normalized;
}

function requireOption(value, allowed, fieldName) {
  const normalized = requireString(value, fieldName).toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new Error(`${fieldName} deve ser uma das opções válidas: ${allowed.join(', ')}.`);
  }
  return normalized;
}

export function createDefaultCareerData({ saveName = 'Nova Carreira', playerName = 'Novo Atleta', careerType = 'normal' }) {
  const normalizedSaveName = normalizeSaveName(saveName);
  const normalizedPlayerName = requireString(playerName, 'playerName');
  const normalizedCareerType = requireOption(careerType, ALLOWED_CAREER_TYPES, 'careerType');
  const createdAt = nowIsoDate();
  const careerDate = createdAt.slice(0, 10);

  const career = {
    save_schema_version: CAREER_SAVE_SCHEMA_VERSION,
    // Hotfix persistência crítica (parte 9): incrementado a cada
    // CareerManager.saveCareer — puramente diagnóstico (não bloqueia writes),
    // permite identificar em relatórios de beta se uma gravação antiga
    // sobrescreveu uma mais nova.
    save_version: 0,
    career_id: createUuid(),
    career_name: normalizedSaveName,
    career_type: normalizedCareerType,
    created_at: createdAt,
    updated_at: createdAt,
    last_played_at: createdAt,
    metadata: {
      player_name: normalizedPlayerName,
      court_side: null,
      play_style: null,
      career_difficulty: null,
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
    calendar: { preferences: { default_view: 'week' } },
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
  career.tutorial = normalizeTutorialState(null, career);
  return career;
}
