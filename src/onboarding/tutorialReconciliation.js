import { localGame } from '@/api/localGameClient.js';
import { TUTORIAL_STEPS } from './tutorialSteps.js';
import { reconcileTutorialProgress } from './tutorialState.js';

const same = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

export async function reconcilePersistedTutorial(profile, facts = {}, missions = [], progressRows = []) {
  if (!profile?.id) return { profile, state: null, progressRows, changed: false, autoCompletedStepIds: [] };
  const previous = profile.tutorial_onboarding || {};
  const missionById = new Map(missions.map(mission => [mission.id, mission]));
  const completedObjectiveTypes = progressRows.filter(row => row.claimed || row.completed).map(row => missionById.get(row.mission_id)?.objective_type).filter(Boolean);
  const state = reconcileTutorialProgress(profile, previous, { ...facts, completedObjectiveTypes });
  const previousCompleted = new Set(previous.completedStepIds || previous.completedSteps || []);
  const autoCompletedStepIds = state.completedStepIds.filter(id => !previousCompleted.has(id));

  let updatedProfile = profile;
  if (!same(previous, state)) {
    updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, {
      tutorial_onboarding: state,
      onboarding_completed: state.status === 'completed',
      onboarding_stage: state.status === 'completed' ? 'completed' : state.currentStepId,
    });
  }

  // Reconciliação reconhece fatos antigos silenciosamente. Ela nunca concede
  // recompensa nem emite notificações durante a hidratação.
  for (const step of TUTORIAL_STEPS) {
    if (!state.completedStepIds.includes(step.id) || !step.objectiveType) continue;
    const mission = missions.find(item => item.objective_type === step.objectiveType);
    const row = mission && progressRows.find(item => item.mission_id === mission.id);
    if (mission && !row?.claimed) {
      const timestamp = new Date().toISOString();
      if (row) await localGame.entities.MissionProgress.update(row.id, { status: 'rewarded', progress: Number(mission.target_count || 1), completed: true, claimed: true, reward_delivered: true, completed_at: row.completed_at || timestamp, reward_claimed_at: row.reward_claimed_at || timestamp, completion_notified_at: row.completion_notified_at || timestamp, migration_recognized: true });
      else await localGame.entities.MissionProgress.create({ mission_id: mission.id, profile_id: profile.id, status: 'rewarded', progress: Number(mission.target_count || 1), completed: true, claimed: true, reward_delivered: true, period_key: 'tutorial:career', completed_at: timestamp, reward_claimed_at: timestamp, completion_notified_at: timestamp, migration_recognized: true });
      progressRows = await localGame.entities.MissionProgress.filter({ profile_id: profile.id });
    }
  }
  return { profile: updatedProfile, state, progressRows, changed: !same(previous, state), autoCompletedStepIds };
}
