// Tutorial 4.1 — auto-conclusão por visita das 12 novas etapas
// (docs/TUTORIAL_4_1_EXPANDED_ONBOARDING_AND_COACH_CLARITY.md, Parte L/N).
//
// Prova, para cada nova etapa VISIT: (1) isTutorialRouteMatch reconhece a
// rota real correta, inclusive quando 3 delas dividem a MESMA rota base
// (/game/economy) distinguidas só por ?view= — o bug real que Part L
// descreve (visitar qualquer aba de economia completando as 3 juntas) fica
// bloqueado; (2) uma rota/():view errado NÃO completa a etapa; (3) o
// pipeline real de conclusão (mesmo completeTutorialStep que o efeito de
// auto-complete em OnboardingGuide.jsx chama) avança para a etapa
// seguinte correta; (4) Home/Guia/Objetivos continuam vindo da MESMA
// fonte (getOnboardingNextAction/TUTORIAL_STEPS) — nenhuma cópia
// hardcoded divergente foi criada para as etapas novas.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); },
    async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; },
    async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { TUTORIAL_STEPS } = await server.ssrLoadModule('/src/onboarding/tutorialSteps.js');
  const { isTutorialRouteMatch } = await server.ssrLoadModule('/src/onboarding/tutorialIdentity.js');
  const { getOnboardingNextAction } = await server.ssrLoadModule('/src/onboarding/onboardingNextAction.js');

  const NEW_STEP_IDS = ['staff-known', 'economy-known', 'sponsors-known', 'opportunities-known', 'shop-known', 'equipment-known', 'athletes-known', 'ranking-known', 'world-known', 'news-known', 'press-known', 'notifications-known'];
  const newSteps = NEW_STEP_IDS.map((id) => TUTORIAL_STEPS.find((s) => s.id === id));

  // ═══════════════════════════════════════════════════════════════════════
  // 1) Cada etapa nova é mesmo VISIT, com rota real declarada
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- 1) Auditoria das 12 novas etapas ---');
  gate('As 12 etapas novas existem no array (nenhuma foi perdida/renomeada)', newSteps.every(Boolean));
  for (const step of newSteps) {
    gate(`Etapa "${step.id}" é kind:VISIT (auto-completa, sem "Entendi")`, step.kind === 'VISIT');
    gate(`Etapa "${step.id}" tem rota declarada`, typeof step.route === 'string' && step.route.length > 0);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2) isTutorialRouteMatch: rota certa completa, rota/query errada não
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- 2) Correspondência de rota (inclusive query string) ---');
  for (const step of newSteps) {
    const [path, query] = step.route.split('?');
    gate(`"${step.id}": rota+query exatas casam`, isTutorialRouteMatch(step.route, path, query ? `?${query}` : ''));
    gate(`"${step.id}": rota errada nunca casa`, !isTutorialRouteMatch(step.route, '/definitely-not-a-real-route', query ? `?${query}` : ''));
  }

  // O caso real que o bug de Part L descreve: 3 etapas na MESMA rota base,
  // diferenciadas só por ?view=.
  const economySteps = ['economy-known', 'sponsors-known', 'opportunities-known'].map((id) => TUTORIAL_STEPS.find((s) => s.id === id));
  for (const step of economySteps) {
    const [, query] = step.route.split('?');
    for (const other of economySteps) {
      if (other.id === step.id) continue;
      const [, otherQuery] = other.route.split('?');
      gate(`"${step.id}" NÃO completa com a query de "${other.id}" (bug de Part L bloqueado)`, !isTutorialRouteMatch(step.route, '/game/economy', `?${otherQuery}`));
    }
    gate(`"${step.id}" completa com a própria query`, isTutorialRouteMatch(step.route, '/game/economy', `?${query}`));
    gate(`"${step.id}" NÃO completa em /game/economy sem nenhuma query`, !isTutorialRouteMatch(step.route, '/game/economy', ''));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3) Pipeline real: completar via completeTutorialStep (mesma função que
  //    o efeito de auto-complete de OnboardingGuide.jsx chama) avança
  //    corretamente
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- 3) Pipeline real de conclusão ---');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { getCurrentTutorialStep } = await server.ssrLoadModule('/src/onboarding/tutorialState.js');
  const { reconcilePersistedTutorial } = await server.ssrLoadModule('/src/onboarding/tutorialReconciliation.js');
  const { completeTutorialStep } = await server.ssrLoadModule('/src/onboarding/tutorialEngine.js');
  const { ensureTutorialMissionCatalog, incrementMissionProgress } = await server.ssrLoadModule('/src/lib/padel.js');
  const { hirePrimaryCoach, ensureCoachCatalog } = await server.ssrLoadModule('/src/game-core/coachLifecycle.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-visit-auto-completion', name: 'QA Visit Auto Completion' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-visit-auto-completion', sport_name: 'Novo Atleta', career_date: '2026-01-01', coins: 500,
  });
  const currentFacts = { registrations: [], matches: [], trainings: [] };
  const reconcile = async () => {
    const missions = await ensureTutorialMissionCatalog();
    const progressRows = await localGame.entities.MissionProgress.filter({ profile_id: profile.id });
    return reconcilePersistedTutorial(profile, currentFacts, missions, progressRows);
  };
  const confirmStep = async (stepId) => {
    const result = await completeTutorialStep({ profile, stepId, triggerSource: 'test-visit-auto-completion' });
    profile = result.profile;
    return result.state;
  };

  // Mesma sequência real já provada em test-tutorial-complete-flow.mjs —
  // reconcilePersistedTutorial recalcula completedObjectiveTypes a partir
  // de MissionProgress de verdade (não aceita um override em `facts`),
  // então este teste precisa mesmo percorrer a Fase 1-4 via pipeline real.
  let state = (await reconcile()).state;
  state = await confirmStep('career-created');
  profile = await localGame.entities.PlayerProfile.update(profile.id, { sport_name: 'Ale Tester' });
  await incrementMissionProgress(profile.id, 'set_player_name', 1, profile.career_date);
  state = (await reconcile()).state;
  profile = await localGame.entities.PlayerProfile.update(profile.id, { handedness: 'right', dominant_hand: 'right', court_side: 'direita', preferred_side: 'direita' });
  await incrementMissionProgress(profile.id, 'choose_court_side', 1, profile.career_date);
  state = (await reconcile()).state;
  profile = await localGame.entities.PlayerProfile.update(profile.id, { career_difficulty: 'normal' });
  await incrementMissionProgress(profile.id, 'choose_career_difficulty', 1, profile.career_date);
  state = (await reconcile()).state;
  profile = await localGame.entities.PlayerProfile.update(profile.id, { play_style: 'agressivo' });
  await incrementMissionProgress(profile.id, 'choose_play_style', 1, profile.career_date);
  state = (await reconcile()).state;
  state = await confirmStep('appearance-known');
  state = await confirmStep('profile-reviewed');
  state = await confirmStep('offers-reviewed');
  profile = await localGame.entities.PlayerProfile.update(profile.id, { partner_id: 'bot-partner-1' });
  state = (await reconcile()).state;
  const catalog = await ensureCoachCatalog();
  const coach = catalog.find((c) => c.tier === 'iniciante');
  profile = await hirePrimaryCoach(profile, coach, 12);
  state = (await reconcile()).state;
  currentFacts.trainings = [{ id: 'training-1', profile_id: profile.id }];
  state = (await reconcile()).state;
  state = await confirmStep('calendar-known');
  currentFacts.registrations = [{ id: 'reg-1', profile_id: profile.id, tournament_id: 't1', status: 'confirmed' }];
  state = (await reconcile()).state;
  currentFacts.matches = [{ id: 'official-match-1', profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true }];
  profile = await localGame.entities.PlayerProfile.update(profile.id, { tournaments_played: 1 });
  state = (await reconcile()).state;
  gate('Perfil pós-Fase-1 (pipeline real) começa na primeira etapa nova (staff-known)', getCurrentTutorialStep(state)?.id === 'staff-known');

  for (let i = 0; i < NEW_STEP_IDS.length; i += 1) {
    const stepId = NEW_STEP_IDS[i];
    const result = await completeTutorialStep({ profile, stepId, triggerSource: 'test-visit-auto-completion' });
    profile = result.profile;
    state = result.state;
    const expectedNext = NEW_STEP_IDS[i + 1] || 'autonomy';
    gate(`"${stepId}" concluída via pipeline real (completeTutorialStep) → avança para "${expectedNext}"`, getCurrentTutorialStep(state)?.id === expectedNext);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4) Home/Guia/Objetivos continuam na MESMA fonte para as etapas novas
  //    (nenhuma cópia hardcoded divergente foi criada)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- 4) Fonte única (getOnboardingNextAction) para as etapas novas ---');
  for (const step of newSteps) {
    const action = getOnboardingNextAction({ tutorial_onboarding: { status: 'in_progress', currentStepId: step.id, completedStepIds: [] } });
    gate(`getOnboardingNextAction("${step.id}"): to/cta/description vêm de TUTORIAL_STEPS, não de uma cópia`, action?.stepId === step.id && action.to === step.route && action.cta === step.actionLabel && action.description === step.explanation);
  }

  const hubSource = readFileSync('src/pages/CareerHub.jsx', 'utf8');
  for (const stepId of NEW_STEP_IDS) {
    gate(`CareerHub.jsx não tem um caso especial hardcoded para "${stepId}" (só first-match precisa de resolução dinâmica)`, !hubSource.includes(`stepId === '${stepId}'`) && !hubSource.includes(`'${stepId}'`));
  }
  const guideSource = readFileSync('src/components/onboarding/OnboardingGuide.jsx', 'utf8');
  gate('OnboardingGuide.jsx passa location.search para isTutorialRouteMatch (fix de Part L)', guideSource.includes('isTutorialRouteMatch(step.route, location.pathname, location.search)'));
  const missionsSource = readFileSync('src/pages/Missions.jsx', 'utf8');
  gate('Missions.jsx passa location.search para isTutorialRouteMatch (fix de Part L)', (missionsSource.match(/isTutorialRouteMatch\(nextTutorial\.tutorial_route, location\.pathname, location\.search\)/g) || []).length === 2);

  console.log(`\n${gates} gates executados, todos PASS — Auto-conclusão por visita das 12 novas etapas (rota+query correta, pipeline real, fonte única preservada).`);
} finally {
  await server.close();
}
