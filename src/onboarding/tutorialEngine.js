import { localGame } from '@/api/localGameClient.js';
import { ensureTutorialMissionCatalog, incrementMissionProgress } from '@/lib/padel.js';
import { getTutorialStepById, resolveTutorialMission } from './tutorialIdentity.js';
export { getTutorialStepById, isTutorialRouteMatch, resolveTutorialMission, tutorialMissionCatalogKey } from './tutorialIdentity.js';
import { reconcilePersistedTutorial } from './tutorialReconciliation.js';

/**
 * Complete exactly one canonical tutorial step and verify persistence before
 * reconciling the profile. This is the only API UI buttons should use.
 */
export async function completeTutorialStep({ profile, stepId, triggerSource = 'tutorial-ui' }) {
  if (!profile?.id) throw new Error('Perfil da carreira não encontrado.');
  const step = getTutorialStepById(stepId);
  if (!step) throw new Error(`Etapa de tutorial desconhecida: ${stepId}`);

  const missions = await ensureTutorialMissionCatalog();
  const mission = resolveTutorialMission(step, missions);
  if (!mission?.id) throw new Error(`A missão persistida da etapa “${step.title}” não foi encontrada.`);

  const triggerEventId = `${triggerSource}:${profile.id}:${step.id}`;
  await incrementMissionProgress(profile.id, step.objectiveType, 1, profile.career_date, {
    missionId: mission.id,
    onlyMissionTypes: ['tutorial'],
    triggerEventId,
    // Confirmation buttons are explicit user actions and must work even if the
    // global event runtime has not yet changed from hydration to ready.
    allowDuringHydration: true,
    throwOnError: true,
  });

  let progressRows = await localGame.entities.MissionProgress.filter({ profile_id: profile.id });
  const row = progressRows.find(item => item.mission_id === mission.id && item.period_key === 'tutorial:career')
    || progressRows.find(item => item.mission_id === mission.id);
  if (!row || !(row.completed || row.claimed || row.reward_delivered)) {
    throw new Error('A confirmação não foi gravada. Tente novamente.');
  }

  const [registrations, matches, trainings] = await Promise.all([
    localGame.entities.CalendarEvent.filter({ profile_id: profile.id, event_type: 'tournament' }).catch(() => []),
    localGame.entities.Match.list('-created_date', 50).catch(() => []),
    localGame.entities.TrainingSession.filter({ profile_id: profile.id }).catch(() => []),
  ]);
  const reconciliation = await reconcilePersistedTutorial(
    profile,
    { registrations, matches, trainings },
    missions,
    progressRows,
  );
  progressRows = reconciliation.progressRows || progressRows;

  const completedIds = reconciliation.state?.completedStepIds || [];
  if (!completedIds.includes(step.id)) {
    throw new Error('A missão foi registrada, mas o tutorial não avançou. Reabra a carreira e tente novamente.');
  }

  return {
    step,
    mission,
    progress: row,
    profile: reconciliation.profile || profile,
    state: reconciliation.state,
    progressRows,
  };
}
