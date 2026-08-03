import { TUTORIAL_STEPS, TUTORIAL_VERSION } from './tutorialSteps.js';

const unique = values => [...new Set((values || []).filter(Boolean))];

export function inferCompletedSteps(career = {}, facts = {}) {
  const player = career.player || career;
  const entities = career.entities || {};
  const completed = ['career-created'];
  if (player.sport_name && player.sport_name !== 'Novo Atleta') completed.push('athlete-named');
  if (player.court_side) completed.push('side-selected');
  if (player.play_style && player.play_style !== 'Equilibrado') completed.push('style-selected');
  if (Number(player.trainings_completed || player.total_trainings || 0) > 0 || (facts.trainings || entities.TrainingSession || []).length > 0) completed.push('first-training', 'energy-understood');
  if (player.partner_id) completed.push('partner-selected');
  if ((facts.registrations || entities.CalendarEvent || []).some(event => event.event_type === 'tournament' && event.status !== 'cancelled')) completed.push('tournament-registered');
  if (Number(player.matches_played || 0) > 0 || (facts.matches || entities.Match || []).length > 0) completed.push('first-match');
  if (completed.includes('first-match')) completed.push('autonomy');
  return unique(completed);
}

export function normalizeTutorialState(value, career = {}, facts = {}) {
  const old = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const completedSteps = unique([...old.completedSteps || [], ...inferCompletedSteps(career, facts)]);
  const next = TUTORIAL_STEPS.find(step => !completedSteps.includes(step.id));
  const legacyCompleted = Boolean(career.player?.onboarding_completed || career.onboarding_completed);
  return {
    version: TUTORIAL_VERSION,
    status: old.status === 'skipped' ? 'skipped' : (!next || legacyCompleted && completedSteps.includes('first-match') ? 'completed' : 'in_progress'),
    currentStepId: next?.id || 'autonomy',
    completedSteps,
    dismissedHints: unique(old.dismissedHints),
    pageIntroductionsSeen: unique(old.pageIntroductionsSeen),
    collapsedIntroductions: unique(old.collapsedIntroductions),
    tutorialSkipped: Boolean(old.tutorialSkipped || old.status === 'skipped'),
    minimized: Boolean(old.minimized),
    welcomeSeen: Boolean(old.welcomeSeen),
  };
}

export function getNextTutorialStep(state) {
  return TUTORIAL_STEPS.find(step => !state?.completedSteps?.includes(step.id)) || TUTORIAL_STEPS.at(-1);
}
