import assert from 'node:assert/strict';
import { createDefaultCareerData } from '../src/careers/careerDefaults.js';
import { migrateCareer } from '../src/careers/CareerMigration.js';
import { CAREER_SAVE_SCHEMA_VERSION } from '../src/careers/careerSchema.js';
import { getCareerRecommendations } from '../src/onboarding/careerRecommendations.js';
import { getPageIntroduction, PAGE_INTRODUCTIONS } from '../src/onboarding/pageIntroductions.js';
import { getNextTutorialStep, normalizeTutorialState } from '../src/onboarding/tutorialState.js';

const career = createDefaultCareerData({ saveName: 'Teste onboarding', playerName: 'Atleta', careerType: 'normal' });
assert.equal(career.tutorial.version, 3);
assert.equal(getNextTutorialStep(career.tutorial).id, 'athlete-named');

const progressed = {
  ...career,
  player: { id: 'p1', sport_name: 'Atleta Teste', handedness: 'right', court_side: 'direita', play_style: 'controle', partner_id: 'bot-1', matches_played: 1 },
  entities: {
    TrainingSession: [{ id: 'training-1', profile_id: 'p1' }],
    TournamentRegistration: [{ id: 'registration-1', profile_id: 'p1', tournament_id: 't1', status: 'confirmed' }],
    Match: [{ id: 'match-1', profile_id: 'p1' }],
  },
};
const state = normalizeTutorialState(null, progressed, { completedObjectiveTypes: ['finish_tutorial'] });
assert.deepEqual(state.completedSteps, ['career-created', 'athlete-named', 'side-selected', 'style-selected', 'first-training', 'energy-understood', 'partner-selected', 'tournament-registered', 'first-match', 'autonomy']);
assert.equal(state.status, 'completed');

const legacy = { ...progressed, save_schema_version: 7, tutorial: undefined, player: { ...progressed.player, tutorial_onboarding: undefined } };
const first = migrateCareer(legacy);
const second = migrateCareer(first.data);
assert.equal(first.data.save_schema_version, CAREER_SAVE_SCHEMA_VERSION);
assert.equal(first.data.player.tutorial_onboarding.status, 'completed');
assert.equal(second.migrated, false);

assert.equal(getCareerRecommendations({ court_side: 'direita', play_style: 'controle', energy: 20, coins: 500 })[0].id, 'recover-energy');
assert.equal(getCareerRecommendations({ court_side: 'direita', play_style: 'controle', energy: 100, coins: 500 })[0].id, 'find-partner');
assert.ok(Object.keys(PAGE_INTRODUCTIONS).length >= 15);
assert.match(getPageIntroduction('/tournaments').purpose, /ranking/i);

console.log('OnboardingV2Test: estado, migration, recomendações e introduções aprovados.');
