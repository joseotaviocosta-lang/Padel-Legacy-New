import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDefaultCareerData } from '../src/careers/careerDefaults.js';
import { TUTORIAL_CHAPTERS, TUTORIAL_STEPS, TUTORIAL_VERSION } from '../src/onboarding/tutorialSteps.js';
import { getCurrentTutorialStep, getTutorialProgress, normalizeTutorialState, reconcileTutorialProgress } from '../src/onboarding/tutorialState.js';

const fresh = createDefaultCareerData({ saveName: 'Fluxo E2E', playerName: 'Novo Atleta', careerType: 'normal' });
assert.equal(TUTORIAL_VERSION, 5);
assert.equal(getCurrentTutorialStep(fresh.tutorial).id, 'career-created', 'new career starts with an explicit dashboard explanation');
assert(TUTORIAL_CHAPTERS.length >= 6 && TUTORIAL_STEPS.length >= 40, 'tutorial covers the complete career in progressive chapters');
assert.equal(new Set(TUTORIAL_STEPS.map(step => step.id)).size, TUTORIAL_STEPS.length, 'step IDs are stable and unique');
assert(TUTORIAL_STEPS.every(step => step.route && step.objectiveType), 'every step has route and domain objective');

const earlyPartnerCareer = { ...fresh, player: { id: 'p1', sport_name: 'Novo Atleta', partner_id: 'player-fictional-early' } };
const early = normalizeTutorialState(null, earlyPartnerCareer);
assert(early.completedStepIds.includes('partner-selected'), 'early partner is recognized');
assert.equal(early.currentStepId, 'career-created', 'early future action does not skip missing identity');
const earlyAgain = reconcileTutorialProgress(earlyPartnerCareer, early);
assert.deepEqual(earlyAgain, early, 'reconciliation is idempotent');

let career = { ...fresh, player: { id: 'p1', sport_name: 'Novo Atleta' } };
let state = normalizeTutorialState(null, career);
for (let index = 0; index < TUTORIAL_STEPS.length; index += 1) {
  const completedObjectiveTypes = TUTORIAL_STEPS.slice(0, index + 1).map(step => step.objectiveType);
  state = normalizeTutorialState(state, career, { completedObjectiveTypes });
  assert(state.completedStepIds.includes(TUTORIAL_STEPS[index].id), `step ${TUTORIAL_STEPS[index].id} did not complete`);
  assert.equal(state.currentStepId, TUTORIAL_STEPS[index + 1]?.id || null, 'tutorial advanced out of sequence');
}
assert.equal(state.status, 'completed'); assert.equal(state.currentStepId, null); assert.ok(state.completedAt); assert.equal(getTutorialProgress(state).percent, 100);

const skipped = normalizeTutorialState({ ...early, status: 'skipped', tutorialSkipped: true }, earlyPartnerCareer);
assert.equal(skipped.status, 'skipped');
const resumed = normalizeTutorialState({ ...skipped, status: 'in_progress', tutorialSkipped: false }, earlyPartnerCareer);
assert.equal(resumed.status, 'in_progress'); assert.equal(resumed.currentStepId, 'career-created');

const missionsSource = await readFile(new URL('../src/pages/Missions.jsx', import.meta.url), 'utf8');
const guideSource = await readFile(new URL('../src/components/onboarding/OnboardingGuide.jsx', import.meta.url), 'utf8');
const hubSource = await readFile(new URL('../src/pages/CareerHub.jsx', import.meta.url), 'utf8');
const bridgeSource = await readFile(new URL('../src/components/missions/MissionNotificationBridge.jsx', import.meta.url), 'utf8');
assert.match(missionsSource, /if \(savingChoice\) return;/, 'double-submit guard exists');
assert.match(missionsSource, /role="status"/); assert.match(missionsSource, /role="alert"/);
assert.match(missionsSource, /type="submit"/); assert.match(missionsSource, /Salvando\.\.\./);
assert.match(guideSource, /!isMissionCenter.*Orientação contextual do tutorial/s, 'global guide is suppressed in mission center');
assert(!missionsSource.includes('onboarding_completed: true'), 'style selection no longer ends onboarding');
assert.match(hubSource, /Começar carreira livre/); assert.match(hubSource, /finishingTutorial/);
assert(!bridgeSource.includes("visit_career_after_intro"), 'visiting the dashboard does not complete the tutorial');

console.log('TutorialChronologyTest: cronologia v5, capítulos, ações antecipadas, idempotência e retomada aprovados.');
