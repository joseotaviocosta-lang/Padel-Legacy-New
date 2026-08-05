import assert from 'node:assert/strict';
import { TUTORIAL_STEPS } from '../src/onboarding/tutorialSteps.js';
import { isTutorialRouteMatch, resolveTutorialMission, tutorialMissionCatalogKey } from '../src/onboarding/tutorialIdentity.js';

const rankingStep = TUTORIAL_STEPS.find(step => step.id === 'ranking-known');
assert(rankingStep, 'ranking tutorial step exists');
const persisted = [
  { id: 'legacy-ranking', mission_type: 'tutorial', objective_type: 'visit_ranking', tutorial_order: 15, is_active: false },
  { id: 'db-ranking', catalog_key: tutorialMissionCatalogKey('ranking-known'), mission_type: 'tutorial', objective_type: 'visit_ranking', tutorial_order: TUTORIAL_STEPS.indexOf(rankingStep) + 1, is_active: true },
];
assert.equal(resolveTutorialMission(rankingStep, persisted)?.id, 'db-ranking', 'canonical active mission wins over legacy rows');
assert.equal(isTutorialRouteMatch('/ranking', '/ranking'), true);
assert.equal(isTutorialRouteMatch('/clubs', '/clubs/club-003'), true);
assert.equal(isTutorialRouteMatch('/ranking', '/rankings'), false);

for (const step of TUTORIAL_STEPS) {
  assert(step.id && step.objectiveType && step.route, `invalid tutorial step ${step.id}`);
  assert.equal(tutorialMissionCatalogKey(step.id), `tutorial-${step.id}`);
}
console.log(`TutorialEngineV2Test: ${TUTORIAL_STEPS.length} etapas canônicas e rotas validadas.`);
