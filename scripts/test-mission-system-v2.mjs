import assert from 'node:assert/strict';
import { migrateCareer } from '../src/careers/CareerMigration.js';
import { CAREER_SAVE_SCHEMA_VERSION } from '../src/careers/careerSchema.js';
import {
  deterministicMissionSelection,
  getMissionDifficultyTier,
  missionRuntime,
  missionStatus,
  requirementsMet,
  validateMissionCatalog,
  validateMissionReward,
} from '../src/missions/missionSystem.js';
import { TUTORIAL_MISSION_CATALOG, TUTORIAL_STEPS } from '../src/onboarding/tutorialSteps.js';

missionRuntime.setHydrationStatus('loading');
assert.equal(missionRuntime.canProcessEvents(), false, 'events were accepted during hydration');
missionRuntime.setHydrationStatus('ready');
assert.equal(missionRuntime.canProcessEvents(), true, 'events were blocked after hydration');
assert.throws(() => missionRuntime.setHydrationStatus('invalid'));

assert.equal(missionStatus(null), 'available');
assert.equal(missionStatus({ progress: 1 }), 'in_progress');
assert.equal(missionStatus({ completed: true }), 'completed');
assert.equal(missionStatus({ completed: true, reward_delivered: true }), 'rewarded');
assert.equal(missionStatus(null, { locked: true }), 'locked');
assert.equal(missionStatus(null, { expired: true }), 'expired');

assert.equal(validateMissionReward({ id: 'valid', xp_reward: 20, coins_reward: 0 }).valid, true);
assert.equal(validateMissionReward({ id: 'invalid', xp_reward: Number.NaN }).valid, false);
assert.equal(validateMissionReward({ id: 'invalid', coins_reward: -1 }).valid, false);

const pool = Array.from({ length: 8 }, (_, index) => ({ id: `daily-${index}` }));
const selectionA = deterministicMissionSelection(pool, { careerId: 'career-a', cycleId: '2026-08-04', category: 'diaria', limit: 3 });
const selectionB = deterministicMissionSelection(pool, { careerId: 'career-a', cycleId: '2026-08-04', category: 'diaria', limit: 3 });
assert.deepEqual(selectionA, selectionB, 'same career/cycle produced different missions');
assert.equal(selectionA.length, 3);

assert.equal(getMissionDifficultyTier({ level: 1, matches_played: 0 }), 'iniciante');
assert.equal(getMissionDifficultyTier({ level: 31 }), 'elite');
assert.equal(requirementsMet({ requirements: ['has-partner'] }, { partner_id: 'p2' }), true);

const routes = [...new Set(TUTORIAL_STEPS.map(step => step.route.split('?')[0]))];
const catalogValidation = validateMissionCatalog(TUTORIAL_MISSION_CATALOG, routes);
assert.equal(catalogValidation.valid, true, catalogValidation.errors.join('\n'));
assert.equal(new Set(TUTORIAL_MISSION_CATALOG.map(mission => mission.id)).size, TUTORIAL_STEPS.length);

const legacy = {
  save_schema_version: 14,
  player: { id: 'p1', xp: 777, coins: 888 },
  entities: {
    Mission: [{ id: 'm1', title: 'Legada', description: 'Teste', mission_type: 'daily', objective_type: 'visit', target_count: 1, reward_xp: 10, reward_coins: 5 }],
    MissionProgress: [{ id: 'mp1', profile_id: 'p1', mission_id: 'm1', progress: 1, completed: true, claimed: true }],
  },
};
const first = migrateCareer(legacy);
const second = migrateCareer(first.data);
assert.equal(first.data.save_schema_version, CAREER_SAVE_SCHEMA_VERSION);
assert.equal(first.data.player.xp, 777, 'migration changed XP');
assert.equal(first.data.player.coins, 888, 'migration changed coins');
assert.equal(first.data.entities.Mission[0].xp_reward, 10);
assert.equal(first.data.entities.MissionProgress[0].status, 'rewarded');
assert.equal(first.data.entities.MissionProgress[0].reward_delivered, true);
assert.equal(second.migrated, false, 'mission migration is not idempotent');

console.log('MissionSystemV2Test: hydration, estados, recompensas, seleção, catálogo e migration aprovados.');
