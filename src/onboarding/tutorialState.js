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
    sideSelected: Boolean((player.court_side || player.preferred_side) && (player.handedness || player.dominant_hand)),
    difficultySelected: Boolean(player.career_difficulty),
    styleSelected: Boolean(player.play_style) && player.play_style !== 'Equilibrado',
    trainingCompleted: Number(player.trainings_completed || player.total_trainings || 0) > 0 || trainings.length > 0,
    partnerSelected: Boolean(player.partner_id || player.current_partner_id),
    // Fase 15.2 (Bug 5/D1/D3): a etapa é "inscrever-se", não "jogar a
    // primeira partida" — precisa concluir assim que existir uma inscrição
    // válida confirmada, nunca esperando o torneio começar. O caminho real
    // de inscrição (registerTournament, src/lib/tournamentRegistration.js)
    // sempre grava metadata.registration_id, mas saves mais antigos (ou o
    // ramo legado de calendarSystem.js) podem não ter esse campo — a
    // condição aceita também um CalendarEvent de torneio agendado e
    // obrigatório com o torneio já referenciado, para reconciliar saves já
    // inscritos sem depender de um campo que pode faltar.
    tournamentRegistered: registrations.some(item => item.tournament_id
      ? item.status === 'confirmed'
      : ['tournament', 'torneio'].includes(item.event_type)
        && item.status === 'scheduled'
        && Boolean(item.related_id || item.tournament_id)
        && (Boolean(item.metadata?.registration_id) || item.is_mandatory === true)),
    // Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md): a etapa
    // "first-match" pede explicitamente uma PARTIDA OFICIAL DE TORNEIO —
    // `matches_played` é um contador de carreira único, incrementado por
    // partida de treino e de torneio igualmente (progression.js/padel.js),
    // e `matches.length > 0` nem olhava o tipo. Os campos reais já existem
    // em todo Match desde a finalização (competition_type/is_official,
    // matchFinalization.js para treino, TournamentModal.jsx para torneio) —
    // só faltava consultá-los aqui.
    //
    // Fase 3, item 3C.3: com o evento de Exibição/Pré-Temporada (sem
    // pontos de ranking, aberto desde o dia 1), a etapa final do tutorial
    // precisa continuar exigindo um evento do CIRCUITO MUNDIAL, não
    // qualquer torneio — senão a Exibição sozinha "formatura" o jogador
    // antes de ele nunca ter visto uma partida real do circuito.
    // `item.world_tour_event !== false` (não `=== true`) de propósito:
    // partidas já existentes em saves de ANTES desta mudança não têm esse
    // campo (`undefined`) — tratadas como do circuito (era a única
    // categoria de torneio que existia até aqui), preservando o progresso
    // de quem já cumpriu esta etapa. Só uma partida NOVA da Exibição
    // (que grava `world_tour_event:false` explicitamente) deixa de contar.
    matchCompleted: matches.some(item => item.competition_type === 'tournament' && item.is_official === true && item.world_tour_event !== false),
    tutorialFinished: Boolean(player.tutorial_onboarding?.completedAt || player.onboarding_completed || facts.tutorialFinished || facts.completedObjectiveTypes?.includes('finish_tutorial')),
  };
}

const STEP_FACT = {
  // A existência do save não é uma ação do jogador; o primeiro passo exige
  // confirmação explícita na central de missões.
  'career-created': () => false,
  'athlete-named': facts => facts.athleteNamed,
  'side-selected': facts => facts.sideSelected,
  'difficulty-selected': facts => facts.difficultySelected,
  'style-selected': facts => facts.styleSelected,
  'first-training': facts => facts.trainingCompleted,
  'partner-selected': facts => facts.partnerSelected,
  'tournament-registered': facts => facts.tournamentRegistered,
  'first-match': facts => facts.matchCompleted,
  autonomy: facts => facts.matchCompleted && facts.tutorialFinished,
};

export function inferCompletedSteps(career = {}, facts = {}) {
  const derived = deriveTutorialFacts(career, facts);
  return TUTORIAL_STEPS.filter(step => STEP_FACT[step.id]?.(derived) || facts.completedObjectiveTypes?.includes(step.objectiveType)).map(step => step.id);
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
    currentStepId: current?.id || null,
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
    completedAt: status === 'completed' ? (old.completedAt || old.lastUpdatedAt || new Date().toISOString()) : null,
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

export function completeTutorialState(value, career = {}, completedAt = new Date().toISOString()) {
  const next = reconcileTutorialProgress(career, value, { completedObjectiveTypes: ['finish_tutorial'], tutorialFinished: true });
  return { ...next, status: 'completed', currentStepId: null, completedAt, minimized: false, tutorialSkipped: false };
}
