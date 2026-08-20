// Tutorial 4.1 — fluxo expandido completo (docs/TUTORIAL_4_1_EXPANDED_
// ONBOARDING_AND_COACH_CLARITY.md, Parte N). Estende test-tutorial-
// complete-flow.mjs (que já cobre identidade → dupla → treinador → treino
// → inscrição → torneio → primeira partida oficial) através das 12 novas
// etapas de descoberta (comissão, economia, patrocínios, oportunidades,
// loja, equipamentos, atletas, ranking, mundo, notícias, imprensa,
// notificações) até autonomy. Gate central: a primeira partida oficial
// NÃO conclui mais o tutorial inteiro — ela é só o fim da Fase 1.
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
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { getCurrentTutorialStep, getTutorialProgress } = await server.ssrLoadModule('/src/onboarding/tutorialState.js');
  const { reconcilePersistedTutorial } = await server.ssrLoadModule('/src/onboarding/tutorialReconciliation.js');
  const { completeTutorialStep } = await server.ssrLoadModule('/src/onboarding/tutorialEngine.js');
  const { TUTORIAL_STEPS } = await server.ssrLoadModule('/src/onboarding/tutorialSteps.js');
  const { ensureTutorialMissionCatalog } = await server.ssrLoadModule('/src/lib/padel.js');
  const { hirePrimaryCoach, ensureCoachCatalog } = await server.ssrLoadModule('/src/game-core/coachLifecycle.js');

  gate('Auditoria: 27 etapas no total (15 originais + 12 novas de descoberta)', TUTORIAL_STEPS.length === 27);

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-tutorial-expanded', name: 'QA Tutorial Expanded' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-tutorial-expanded', sport_name: 'Novo Atleta', career_date: '2026-01-01', energy: 100, fatigue: 0, coins: 500,
  });

  const reconcile = async (facts) => {
    const missions = await ensureTutorialMissionCatalog();
    const progressRows = await localGame.entities.MissionProgress.filter({ profile_id: profile.id });
    return reconcilePersistedTutorial(profile, facts, missions, progressRows);
  };
  const confirmStep = async (stepId) => {
    const result = await completeTutorialStep({ profile, stepId, triggerSource: 'test-expanded-flow' });
    profile = result.profile;
    return result.state;
  };
  const currentFacts = { registrations: [], matches: [], trainings: [] };

  // ── Fase 1: até a primeira partida oficial (mesmo pipeline já provado em
  // test-tutorial-complete-flow.mjs — versão resumida aqui só para chegar
  // ao ponto que interessa a este teste) ──────────────────────────────────
  const { incrementMissionProgress } = await server.ssrLoadModule('/src/lib/padel.js');
  let state = (await reconcile(currentFacts)).state;
  state = await confirmStep('career-created');
  profile = await localGame.entities.PlayerProfile.update(profile.id, { sport_name: 'Ale Tester' });
  await incrementMissionProgress(profile.id, 'set_player_name', 1, profile.career_date);
  state = (await reconcile(currentFacts)).state;
  profile = await localGame.entities.PlayerProfile.update(profile.id, { handedness: 'right', dominant_hand: 'right', court_side: 'direita', preferred_side: 'direita' });
  await incrementMissionProgress(profile.id, 'choose_court_side', 1, profile.career_date);
  state = (await reconcile(currentFacts)).state;
  profile = await localGame.entities.PlayerProfile.update(profile.id, { career_difficulty: 'normal' });
  await incrementMissionProgress(profile.id, 'choose_career_difficulty', 1, profile.career_date);
  state = (await reconcile(currentFacts)).state;
  profile = await localGame.entities.PlayerProfile.update(profile.id, { play_style: 'agressivo' });
  await incrementMissionProgress(profile.id, 'choose_play_style', 1, profile.career_date);
  state = (await reconcile(currentFacts)).state;
  state = await confirmStep('appearance-known');
  state = await confirmStep('profile-reviewed');
  state = await confirmStep('offers-reviewed');
  profile = await localGame.entities.PlayerProfile.update(profile.id, { partner_id: 'bot-partner-1' });
  state = (await reconcile(currentFacts)).state;
  const catalog = await ensureCoachCatalog();
  const coach = catalog.find((c) => c.tier === 'iniciante');
  profile = await hirePrimaryCoach(profile, coach, 12);
  state = (await reconcile(currentFacts)).state;
  currentFacts.trainings = [{ id: 'training-1', profile_id: profile.id }];
  state = (await reconcile(currentFacts)).state;
  state = await confirmStep('calendar-known');
  currentFacts.registrations = [{ id: 'reg-1', profile_id: profile.id, tournament_id: 't1', status: 'confirmed' }];
  state = (await reconcile(currentFacts)).state;
  currentFacts.matches = [{ id: 'official-match-1', profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true }];
  profile = await localGame.entities.PlayerProfile.update(profile.id, { tournaments_played: 1 });
  state = (await reconcile(currentFacts)).state;
  gate('Primeira partida oficial concluída → avança para a Fase 2 (staff-known), NÃO para autonomy direto', getCurrentTutorialStep(state)?.id === 'staff-known');
  gate('GATE CENTRAL (Parte A/E): partida oficial NÃO conclui o tutorial inteiro (status continua in_progress)', state.status === 'in_progress');
  gate('GATE CENTRAL: tutorial explicitamente diferente de "completed" logo após a 1ª partida', state.status !== 'completed');

  // ── Fase 2 (Tutorial 4.1): construa sua equipe + economia ───────────────
  console.log('\n--- Fase D/E: comissão técnica e economia ---');
  state = await confirmStep('staff-known');
  gate('staff-known → economy-known', getCurrentTutorialStep(state)?.id === 'economy-known');
  state = await confirmStep('economy-known');
  gate('economy-known → sponsors-known', getCurrentTutorialStep(state)?.id === 'sponsors-known');
  state = await confirmStep('sponsors-known');
  gate('sponsors-known → opportunities-known', getCurrentTutorialStep(state)?.id === 'opportunities-known');
  state = await confirmStep('opportunities-known');
  gate('opportunities-known → shop-known', getCurrentTutorialStep(state)?.id === 'shop-known');
  state = await confirmStep('shop-known');
  gate('shop-known → equipment-known', getCurrentTutorialStep(state)?.id === 'equipment-known');
  state = await confirmStep('equipment-known');
  gate('equipment-known → athletes-known (fim da Fase E, início da Fase F)', getCurrentTutorialStep(state)?.id === 'athletes-known');

  // ── Fase F (Tutorial 4.1): conheça o circuito ────────────────────────────
  console.log('\n--- Fase F: conheça o circuito ---');
  state = await confirmStep('athletes-known');
  gate('athletes-known → ranking-known', getCurrentTutorialStep(state)?.id === 'ranking-known');
  state = await confirmStep('ranking-known');
  gate('ranking-known → world-known', getCurrentTutorialStep(state)?.id === 'world-known');
  state = await confirmStep('world-known');
  gate('world-known → news-known', getCurrentTutorialStep(state)?.id === 'news-known');
  state = await confirmStep('news-known');
  gate('news-known → press-known', getCurrentTutorialStep(state)?.id === 'press-known');
  state = await confirmStep('press-known');
  gate('press-known → notifications-known', getCurrentTutorialStep(state)?.id === 'notifications-known');
  state = await confirmStep('notifications-known');
  gate('notifications-known → autonomy (só agora chega ao fim de verdade)', getCurrentTutorialStep(state)?.id === 'autonomy');
  gate('Ainda in_progress até confirmar autonomy explicitamente', state.status === 'in_progress');

  // ── Fase G: carreira livre ────────────────────────────────────────────
  state = await confirmStep('autonomy');
  gate('Tutorial expandido concluído de ponta a ponta (status completed)', state.status === 'completed');
  gate('getTutorialProgress reporta 27/27 (100%)', getTutorialProgress(state).completed === 27 && getTutorialProgress(state).total === 27);

  console.log(`\n${gates} gates executados, todos PASS — Tutorial 4.1 fluxo expandido (primeira partida oficial não encerra o tutorial; 12 novas etapas de descoberta até a carreira livre).`);
} finally {
  await server.close();
}
