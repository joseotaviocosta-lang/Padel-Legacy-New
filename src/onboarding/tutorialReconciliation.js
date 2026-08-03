import { localGame } from '@/api/localGameClient.js';
import { incrementMissionProgress } from '@/lib/padel.js';
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

  // MissionProgress is a reward/history projection. Domain state remains the
  // source of truth; completing these in chronological order keeps rewards safe.
  for (const step of TUTORIAL_STEPS) {
    if (!state.completedStepIds.includes(step.id) || !step.objectiveType) continue;
    const mission = missions.find(item => item.objective_type === step.objectiveType);
    const row = mission && progressRows.find(item => item.mission_id === mission.id);
    if (mission && !row?.claimed) {
      await incrementMissionProgress(profile.id, step.objectiveType, 1, profile.career_date);
      progressRows = await localGame.entities.MissionProgress.filter({ profile_id: profile.id });
    }
  }
  return { profile: updatedProfile, state, progressRows, changed: !same(previous, state), autoCompletedStepIds };
}
