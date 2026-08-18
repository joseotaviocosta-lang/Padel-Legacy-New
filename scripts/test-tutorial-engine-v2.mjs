import assert from 'node:assert/strict';
import { TUTORIAL_STEPS } from '../src/onboarding/tutorialSteps.js';
import { isTutorialRouteMatch, resolveTutorialMission, tutorialMissionCatalogKey } from '../src/onboarding/tutorialIdentity.js';

// Onboarding 2.0 (docs/ONBOARDING_V3_COMMUNICATIONS.md): a v9 removeu
// etapas legadas como 'ranking-known' do catálogo curto de 15 passos — este
// teste não fixa mais um id específico, usa a primeira etapa viva para não
// ficar obsoleto na próxima revisão do conteúdo do tutorial.
const referenceStep = TUTORIAL_STEPS[0];
assert(referenceStep, 'tutorial has at least one canonical step');
const persisted = [
  { id: 'legacy-row', mission_type: 'tutorial', objective_type: referenceStep.objectiveType, tutorial_order: 99, is_active: false },
  { id: 'db-row', catalog_key: tutorialMissionCatalogKey(referenceStep.id), mission_type: 'tutorial', objective_type: referenceStep.objectiveType, tutorial_order: TUTORIAL_STEPS.indexOf(referenceStep) + 1, is_active: true },
];
assert.equal(resolveTutorialMission(referenceStep, persisted)?.id, 'db-row', 'canonical active mission wins over legacy rows');
assert.equal(isTutorialRouteMatch('/ranking', '/ranking'), true);
assert.equal(isTutorialRouteMatch('/clubs', '/clubs/club-003'), true);
assert.equal(isTutorialRouteMatch('/ranking', '/rankings'), false);

for (const step of TUTORIAL_STEPS) {
  assert(step.id && step.objectiveType && step.route, `invalid tutorial step ${step.id}`);
  assert.equal(tutorialMissionCatalogKey(step.id), `tutorial-${step.id}`);
}
console.log(`TutorialEngineV2Test: ${TUTORIAL_STEPS.length} etapas canônicas e rotas validadas.`);
