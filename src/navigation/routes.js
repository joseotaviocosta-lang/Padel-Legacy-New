export const TRAINING_CENTER_VIEWS = Object.freeze({
  TRAINING: 'training',
  MATCH: 'match',
  AGENDA: 'agenda',
  PROGRESS: 'progress',
  CENTER: 'center',
});

const TRAINING_CENTER_PATH = '/game/training-center';

/** @param {string} [view] @param {Record<string, unknown>} [params] */
export function buildTrainingCenterRoute(view = TRAINING_CENTER_VIEWS.TRAINING, params = {}) {
  const search = new URLSearchParams({ view });
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  return `${TRAINING_CENTER_PATH}?${search.toString()}`;
}

export function isTrainingCenterView(value) {
  return /** @type {string[]} */ (Object.values(TRAINING_CENTER_VIEWS)).includes(value);
}

export const APP_ROUTES = Object.freeze({
  HOME: '/game',
  // Playthrough 5.20, Partes B/E/F/G/H/N/P/S — ROTAS CANONICAS DOS HUBS.
  //
  // A auditoria da Parte A mediu 38 itens de menu para 57 rotas, com 11 itens
  // so em "Carreira" e paginas de 135-157 linhas ocupando entrada propria.
  // Cada hub agrupa paginas que JA EXISTEM em abas (?tab=), sem reescrever
  // nenhuma. As rotas antigas seguem atendidas por redirect que preserva query
  // params (LegacyRedirect) — nada de deep link quebrado (Parte AH).
  CAREER_ATHLETE: '/career/athlete',
  CAREER_TRAINING: '/career/training',
  CAREER_TEAM: '/career/team',
  CAREER_RELATIONS: '/career/relations',
  WORLD_CIRCUIT: '/world/circuit',
  WORLD_DIRECTORY: '/world/directory',
  TRAINING_CENTER: TRAINING_CENTER_PATH,
  TRAINING: buildTrainingCenterRoute(TRAINING_CENTER_VIEWS.TRAINING),
  MATCHES: buildTrainingCenterRoute(TRAINING_CENTER_VIEWS.MATCH),
  TRAINING_AGENDA: buildTrainingCenterRoute(TRAINING_CENTER_VIEWS.AGENDA),
  TRAINING_PROGRESS: buildTrainingCenterRoute(TRAINING_CENTER_VIEWS.PROGRESS),
  TRAINING_FACILITIES: buildTrainingCenterRoute(TRAINING_CENTER_VIEWS.CENTER),
  MISSIONS: '/game/missions',
  SHOP: '/game/shop',
  INVENTORY: '/game/inventory',
  ECONOMY: '/game/economy',
  CALENDAR: '/game/calendar',
  TOURNAMENTS: '/tournaments',
  PRESS: '/press',
  COMMUNICATIONS: '/communications',
  RANKING: '/ranking',
  PARTNERS: '/partners',
  ATHLETES: '/athletes',
});
