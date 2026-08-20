import { TUTORIAL_STEPS } from './tutorialSteps.js';

const normalizePath = value => {
  const raw = String(value || '/').split('?')[0].split('#')[0] || '/';
  return raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
};

export function getTutorialStepById(stepId) {
  return TUTORIAL_STEPS.find(step => step.id === stepId) || null;
}

export function tutorialMissionCatalogKey(stepId) {
  return `tutorial-${stepId}`;
}

export function resolveTutorialMission(step, missions = []) {
  if (!step) return null;
  const expectedKey = tutorialMissionCatalogKey(step.id);
  const expectedOrder = TUTORIAL_STEPS.findIndex(item => item.id === step.id) + 1;
  const active = missions.filter(mission => mission?.mission_type === 'tutorial' && mission?.is_active !== false);
  return active.find(mission => mission.catalog_key === expectedKey)
    || active.find(mission => mission.objective_type === step.objectiveType && Number(mission.tutorial_order || 0) === expectedOrder)
    || active.find(mission => mission.objective_type === step.objectiveType)
    || null;
}

// Tutorial 4.1 (docs/TUTORIAL_4_1_EXPANDED_ONBOARDING_AND_COACH_CLARITY.md,
// Parte L): algumas etapas de descoberta vivem na MESMA rota, diferenciadas
// só pela query string (ex.: /game/economy?view=sponsors vs ?view=dashboard).
// `search` é opcional (undefined) para não quebrar nenhum chamador antigo —
// e só é exigido quando a própria `stepRoute` declara parâmetros.
export function isTutorialRouteMatch(stepRoute, pathname, search = '') {
  const [routePath, routeQuery] = String(stepRoute || '/').split('?');
  const expected = normalizePath(routePath);
  const current = normalizePath(pathname);
  const pathMatches = expected === current
    || ['/clubs', '/athletes', '/matches'].some(prefix => expected === prefix && current.startsWith(`${prefix}/`));
  if (!pathMatches) return false;
  if (!routeQuery) return true;
  const expectedParams = new URLSearchParams(routeQuery);
  const currentParams = new URLSearchParams(search || '');
  let allMatch = true;
  expectedParams.forEach((value, key) => { if (currentParams.get(key) !== value) allMatch = false; });
  if (!allMatch) return false;
  return true;
}
