import { TUTORIAL_STEPS, TUTORIAL_VERSION } from './tutorialSteps.js';

const unique = values => [...new Set((values || []).filter(Boolean))];
const usefulName = value => Boolean(String(value || '').trim()) && !['Novo Atleta', 'Novo Jogador', 'Atleta'].includes(String(value).trim());

export function deriveTutorialFacts(career = {}, facts = {}) {
  const player = career.player || career;
  const entities = career.entities || {};
  const trainings = facts.trainings || entities.TrainingSession || [];
  const registrations = facts.registrations || entities.TournamentRegistration || entities.CalendarEvent || [];
  const matches = facts.matches || entities.Match || [];
  return {
    careerCreated: Boolean(career.career_id || player.id),
    athleteNamed: usefulName(player.sport_name || player.name),
    sideSelected: Boolean(player.court_side || player.preferred_side),
    styleSelected: Boolean(player.play_style) && player.play_style !== 'Equilibrado',
    trainingCompleted: Number(player.trainings_completed || player.total_trainings || 0) > 0 || trainings.length > 0,
    partnerSelected: Boolean(player.partner_id || player.current_partner_id),
    tournamentRegistered: registrations.some(item => (!item.event_type || ['tournament', 'torneio'].includes(item.event_type)) && item.status !== 'cancelled'),
    matchCompleted: Number(player.matches_played || 0) > 0 || matches.length > 0,
    autonomyVisited: Boolean(facts.autonomyVisited || facts.completedObjectiveTypes?.includes('visit_career_after_intro')),
  };
}

const STEP_FACT = {
  'career-created': facts => facts.careerCreated,
  'athlete-named': facts => facts.athleteNamed,
  'side-selected': facts => facts.sideSelected,
  'style-selected': facts => facts.styleSelected,
  'first-training': facts => facts.trainingCompleted,
  'energy-understood': facts => facts.trainingCompleted,
  'partner-selected': facts => facts.partnerSelected,
  'tournament-registered': facts => facts.tournamentRegistered,
  'first-match': facts => facts.matchCompleted,
  autonomy: facts => facts.matchCompleted && facts.autonomyVisited,
};

export function inferCompletedSteps(career = {}, facts = {}) {
  const derived = deriveTutorialFacts(career, facts);
  return TUTORIAL_STEPS.filter(step => STEP_FACT[step.id]?.(derived)).map(step => step.id);
}

export function reconcileTutorialProgress(career = {}, value = {}, facts = {}) {
  const old = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const legacyCompleted = old.completedStepIds || old.completedSteps || [];
  const completedStepIds = unique([...legacyCompleted, ...inferCompletedSteps(career, facts)]);
  const current = TUTORIAL_STEPS.find(step => !completedStepIds.includes(step.id));
  const explicitlySkipped = old.status === 'skipped' || old.tutorialSkipped;
  const status = explicitlySkipped ? 'skipped' : current ? 'in_progress' : 'completed';
  const next = {
    version: TUTORIAL_VERSION,
    status,
    currentStepId: current?.id || TUTORIAL_STEPS.at(-1).id,
    completedStepIds,
    // Read-only compatibility alias for older consumers; v3 selectors use completedStepIds.
    completedSteps: completedStepIds,
    skippedStepIds: unique(old.skippedStepIds),
    dismissedHints: unique(old.dismissedHints),
    pageIntroductionsSeen: unique(old.pageIntroductionsSeen),
    collapsedIntroductions: unique(old.collapsedIntroductions),
    tutorialSkipped: explicitlySkipped,
    minimized: Boolean(old.minimized),
    welcomeSeen: Boolean(old.welcomeSeen),
    lastUpdatedAt: old.lastUpdatedAt || null,
  };
  const comparableOld = { ...old, lastUpdatedAt: null };
  const comparableNext = { ...next, lastUpdatedAt: null };
  if (JSON.stringify(comparableOld) !== JSON.stringify(comparableNext)) next.lastUpdatedAt = new Date().toISOString();
  return next;
}

export function normalizeTutorialState(value, career = {}, facts = {}) {
  return reconcileTutorialProgress(career, value, facts);
}

export function getCurrentTutorialStep(state) {
  return TUTORIAL_STEPS.find(step => step.id === state?.currentStepId)
    || TUTORIAL_STEPS.find(step => !(state?.completedStepIds || state?.completedSteps || []).includes(step.id))
    || null;
}

export function getNextValidTutorialStep(career, state, facts = {}) {
  return getCurrentTutorialStep(reconcileTutorialProgress(career, state, facts));
}

export function isTutorialStepComplete(stepId, state) {
  return (state?.completedStepIds || state?.completedSteps || []).includes(stepId);
}

export function getTutorialProgress(state) {
  const completed = TUTORIAL_STEPS.filter(step => isTutorialStepComplete(step.id, state)).length;
  return { completed, total: TUTORIAL_STEPS.length, percent: Math.round(completed / TUTORIAL_STEPS.length * 100) };
}

export const getNextTutorialStep = getCurrentTutorialStep;
