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

// Entidades de identidade (User/PlayerProfile) e de histórico/progresso
// pessoal (Match/TrainingSession/MissionProgress) nunca herdam conteúdo de
// demonstração do LOCAL_SEED — mesmo remapeado para o profile_id real, dar a
// uma carreira nova partidas/treinos/progresso que ela nunca viveu corrompe
// tanto o histórico exibido quanto a inferência de conclusão do tutorial
// (Onboarding 2.0, docs/ONBOARDING_V3_COMMUNICATIONS.md): a primeira
// confirmação de etapa do tutorial busca Match/TrainingSession antes de
// qualquer partida/treino real terem acontecido, e via ensureCollection()
// (CareerEntityRepository.js) essas coleções ainda não inicializadas caíam
// no fallback de demonstração — marcando "primeiro treino"/"primeira
// partida" como concluídos antes do jogador fazer qualquer coisa.
// Hotfix crítico de notícias (mesma classe de bug do comentário acima):
// LOCAL_SEED.PressArticle traz um artigo estático de demonstração cujo
// `content` tem o nome do atleta hardcoded ("José Costa inicia sua
// trajetória no circuito") — remapSeedRow só troca `profile_id`/
// `created_by_id`, nunca o texto. Qualquer carreira nova cujo primeiro
// acesso a PressArticle caísse no fallback de demonstração (ensureCollection,
// CareerEntityRepository.js) via essa linha ganhava essa notícia mostrando o
// nome do perfil de demonstração, não o nome do atleta que o jogador criou.
const NEVER_SEED_WITH_DEMO_DATA = new Set(['User', 'PlayerProfile', 'Match', 'TrainingSession', 'MissionProgress', 'PressArticle']);

export function seedCollection(entityName, activePlayerId = null) {
  if (NEVER_SEED_WITH_DEMO_DATA.has(entityName)) return [];
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
