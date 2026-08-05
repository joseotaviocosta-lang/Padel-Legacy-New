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

export function isTutorialRouteMatch(stepRoute, pathname) {
  const expected = normalizePath(stepRoute);
  const current = normalizePath(pathname);
  if (expected === current) return true;
  return ['/clubs', '/athletes', '/matches'].some(prefix => expected === prefix && current.startsWith(`${prefix}/`));
}
