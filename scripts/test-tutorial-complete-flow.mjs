// Tutorial 4.0 — fluxo completo (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md,
// Parte 16). Simula uma carreira nova do início ao fim usando o pipeline
// real (mesmas funções que os handlers de UI chamam): identidade → dupla →
// treinador → treino → inscrição → avanço até o torneio → primeira partida
// OFICIAL → tutorial concluído. Assertion explícita da Parte 2: uma partida
// de TREINO jogada depois da inscrição, mas antes da partida oficial, NÃO
// conclui o tutorial.
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
  const { ensureTutorialMissionCatalog, incrementMissionProgress } = await server.ssrLoadModule('/src/lib/padel.js');
  const { hirePrimaryCoach } = await server.ssrLoadModule('/src/game-core/coachLifecycle.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-tutorial-complete-flow', name: 'QA Tutorial Flow' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-tutorial-flow', sport_name: 'Novo Atleta', career_date: '2026-01-01', energy: 100, fatigue: 0, coins: 500,
  });

  const reconcile = async (facts) => {
    const missions = await ensureTutorialMissionCatalog();
    const progressRows = await localGame.entities.MissionProgress.filter({ profile_id: profile.id });
    return reconcilePersistedTutorial(profile, facts, missions, progressRows);
  };
  const confirmStep = async (stepId) => {
    const result = await completeTutorialStep({ profile, stepId, triggerSource: 'test-complete-flow' });
    profile = result.profile;
    return result.state;
  };
  const currentFacts = { registrations: [], matches: [], trainings: [] };

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 1 — Criar o atleta
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Fase 1: identidade do atleta ---');
  let state = (await reconcile(currentFacts)).state;
  gate('Carreira nova começa em career-created', getCurrentTutorialStep(state)?.id === 'career-created');
  state = await confirmStep('career-created');

  profile = await localGame.entities.PlayerProfile.update(profile.id, { sport_name: 'Ale Tester' });
  await incrementMissionProgress(profile.id, 'set_player_name', 1, profile.career_date);
  state = (await reconcile(currentFacts)).state;
  gate('Nome definido → side-selected', getCurrentTutorialStep(state)?.id === 'side-selected');

  profile = await localGame.entities.PlayerProfile.update(profile.id, { handedness: 'right', dominant_hand: 'right', court_side: 'direita', preferred_side: 'direita' });
  await incrementMissionProgress(profile.id, 'choose_court_side', 1, profile.career_date);
  state = (await reconcile(currentFacts)).state;
  gate('Lado escolhido → difficulty-selected', getCurrentTutorialStep(state)?.id === 'difficulty-selected');

  profile = await localGame.entities.PlayerProfile.update(profile.id, { career_difficulty: 'normal' });
  await incrementMissionProgress(profile.id, 'choose_career_difficulty', 1, profile.career_date);
  state = (await reconcile(currentFacts)).state;
  gate('Dificuldade escolhida → style-selected', getCurrentTutorialStep(state)?.id === 'style-selected');

  profile = await localGame.entities.PlayerProfile.update(profile.id, { play_style: 'agressivo' });
  await incrementMissionProgress(profile.id, 'choose_play_style', 1, profile.career_date);
  state = (await reconcile(currentFacts)).state;
  gate('Estilo escolhido → appearance-known', getCurrentTutorialStep(state)?.id === 'appearance-known');

  state = await confirmStep('appearance-known');
  state = await confirmStep('profile-reviewed');
  gate('Fase 1 completa → offers-reviewed (Fase 2)', getCurrentTutorialStep(state)?.id === 'offers-reviewed');

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 2 — Formar a equipe
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Fase 2: dupla e treinador ---');
  state = await confirmStep('offers-reviewed');
  profile = await localGame.entities.PlayerProfile.update(profile.id, { partner_id: 'bot-partner-1', partner_name: 'Bot Partner' });
  state = (await reconcile(currentFacts)).state;
  gate('Parceiro escolhido (evento real) → coaches-known', getCurrentTutorialStep(state)?.id === 'coaches-known');

  const [coach] = await localGame.entities.Coach.list('-reputation', 1);
  gate('Catálogo de treinadores tem ao menos 1 elegível para o teste', Boolean(coach));
  profile = await hirePrimaryCoach(profile, coach, 12);
  state = (await reconcile(currentFacts)).state;
  gate('Treinador contratado de verdade (hirePrimaryCoach) → first-training', getCurrentTutorialStep(state)?.id === 'first-training');

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 3 — Preparar
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Fase 3: primeiro treino ---');
  currentFacts.trainings = [{ id: 'training-1', profile_id: profile.id }];
  state = (await reconcile(currentFacts)).state;
  gate('Primeiro treino (evento real) → calendar-known', getCurrentTutorialStep(state)?.id === 'calendar-known');

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 4 — Competir (o bug real corrigido nesta fase)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Fase 4: calendário, inscrição, torneio ---');
  state = await confirmStep('calendar-known');
  currentFacts.registrations = [{ id: 'reg-1', profile_id: profile.id, tournament_id: 't1', status: 'confirmed' }];
  state = (await reconcile(currentFacts)).state;
  gate('Inscrição em torneio (evento real) → first-match', getCurrentTutorialStep(state)?.id === 'first-match');

  // Regra de parada da Parte 4: a estreia pode estar a dias de distância —
  // o jogador continua livre para treinar/avançar o calendário. Nada aqui
  // bloqueia isso; só confirma que o tutorial não finge que a partida já
  // aconteceu.
  gate('Ainda em first-match: onboarding continua "in_progress" (não trava o resto do jogo)', state.status === 'in_progress');

  // BUG REAL (Parte 2): uma partida de TREINO jogada agora não pode
  // concluir "jogue sua primeira partida de torneio".
  currentFacts.matches = [{ id: 'practice-match-1', profile_id: profile.id, competition_type: 'practice', is_official: false, is_tournament: false }];
  profile = await localGame.entities.PlayerProfile.update(profile.id, { matches_played: 1 });
  state = (await reconcile(currentFacts)).state;
  gate('BUG REPRODUZIDO E CORRIGIDO: partida de TREINO não conclui first-match', getCurrentTutorialStep(state)?.id === 'first-match');
  gate('BUG REPRODUZIDO E CORRIGIDO: partida de TREINO não conclui o tutorial (ainda in_progress)', state.status === 'in_progress');

  // Partida OFICIAL de torneio — agora sim conclui.
  currentFacts.matches.push({ id: 'official-match-1', profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true });
  profile = await localGame.entities.PlayerProfile.update(profile.id, { tournaments_played: 1 });
  state = (await reconcile(currentFacts)).state;
  gate('Partida OFICIAL de torneio conclui first-match → autonomy', getCurrentTutorialStep(state)?.id === 'autonomy');

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 5 — Carreira livre
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Fase 5: carreira livre ---');
  state = await confirmStep('autonomy');
  gate('Tutorial concluído de ponta a ponta (status completed)', state.status === 'completed');
  gate('getTutorialProgress reporta 100%', getTutorialProgress(state).percent === 100);

  console.log(`\n${gates} gates executados, todos PASS — Tutorial 4.0 fluxo completo (identidade → dupla → treinador → treino → inscrição → torneio → partida oficial → concluído; partida de treino não conclui).`);
} finally {
  await server.close();
}
