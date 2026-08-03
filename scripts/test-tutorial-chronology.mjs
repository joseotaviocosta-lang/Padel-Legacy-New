import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDefaultCareerData } from '../src/careers/careerDefaults.js';
import { TUTORIAL_STEPS, TUTORIAL_VERSION } from '../src/onboarding/tutorialSteps.js';
import { getCurrentTutorialStep, getTutorialProgress, normalizeTutorialState, reconcileTutorialProgress } from '../src/onboarding/tutorialState.js';

const fresh = createDefaultCareerData({ saveName: 'Fluxo E2E', playerName: 'Novo Atleta', careerType: 'normal' });
assert.equal(TUTORIAL_VERSION, 3);
assert.equal(getCurrentTutorialStep(fresh.tutorial).id, 'athlete-named', 'new career starts at athlete name');
assert.equal(new Set(TUTORIAL_STEPS.map(step => step.id)).size, TUTORIAL_STEPS.length, 'step IDs are stable and unique');
assert(TUTORIAL_STEPS.every(step => step.route && step.objectiveType), 'every step has route and domain objective');

const earlyPartnerCareer = { ...fresh, player: { id: 'p1', sport_name: 'Novo Atleta', partner_id: 'player-fictional-early' } };
const early = normalizeTutorialState(null, earlyPartnerCareer);
assert(early.completedStepIds.includes('partner-selected'), 'early partner is recognized');
assert.equal(early.currentStepId, 'athlete-named', 'early future action does not skip missing identity');
const earlyAgain = reconcileTutorialProgress(earlyPartnerCareer, early);
assert.deepEqual(earlyAgain, early, 'reconciliation is idempotent');

let career = { ...fresh, player: { id: 'p1', sport_name: 'Novo Atleta' } };
let state = normalizeTutorialState(null, career);
const expected = ['athlete-named', 'side-selected', 'style-selected', 'first-training', 'partner-selected', 'tournament-registered', 'first-match', 'autonomy'];
assert.equal(state.currentStepId, expected.shift());
career.player.sport_name = 'Lia Monteiro'; state = normalizeTutorialState(state, career); assert.equal(state.currentStepId, expected.shift());
career.player.handedness = 'right'; career.player.court_side = 'direita'; state = normalizeTutorialState(state, career); assert.equal(state.currentStepId, expected.shift());
career.player.play_style = 'controle'; state = normalizeTutorialState(state, career); assert.equal(state.currentStepId, expected.shift());
career.entities.TrainingSession = [{ id: 'training-1' }]; state = normalizeTutorialState(state, career); assert(state.completedStepIds.includes('energy-understood')); assert.equal(state.currentStepId, expected.shift());
career.player.partner_id = 'partner-1'; state = normalizeTutorialState(state, career); assert.equal(state.currentStepId, expected.shift());
career.entities.TournamentRegistration = [{ id: 'registration-1', profile_id: 'p1', tournament_id: 't1', status: 'confirmed' }]; state = normalizeTutorialState(state, career); assert.equal(state.currentStepId, expected.shift());
career.entities.Match = [{ id: 'match-1' }]; state = normalizeTutorialState(state, career); assert.equal(state.currentStepId, expected.shift());
state = normalizeTutorialState(state, career, { completedObjectiveTypes: ['visit_career_after_intro'] });
assert.equal(state.status, 'completed'); assert.equal(getTutorialProgress(state).percent, 100);

const skipped = normalizeTutorialState({ ...early, status: 'skipped', tutorialSkipped: true }, earlyPartnerCareer);
assert.equal(skipped.status, 'skipped');
const resumed = normalizeTutorialState({ ...skipped, status: 'in_progress', tutorialSkipped: false }, earlyPartnerCareer);
assert.equal(resumed.status, 'in_progress'); assert.equal(resumed.currentStepId, 'athlete-named');

const missionsSource = await readFile(new URL('../src/pages/Missions.jsx', import.meta.url), 'utf8');
const guideSource = await readFile(new URL('../src/components/onboarding/OnboardingGuide.jsx', import.meta.url), 'utf8');
assert.match(missionsSource, /if \(savingChoice\) return;/, 'double-submit guard exists');
assert.match(missionsSource, /role="status"/); assert.match(missionsSource, /role="alert"/);
assert.match(missionsSource, /type="submit"/); assert.match(missionsSource, /Salvando\.\.\./);
assert.match(guideSource, /!isMissionCenter.*Orientação contextual do tutorial/s, 'global guide is suppressed in mission center');
assert(!missionsSource.includes('onboarding_completed: true'), 'style selection no longer ends onboarding');

console.log('TutorialChronologyTest: cronologia v3, ações antecipadas, idempotência, retomada e CTAs aprovados.');
