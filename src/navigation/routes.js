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
