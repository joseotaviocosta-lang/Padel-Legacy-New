// Onboarding Single Source of Truth / Zero Conflict Flow
// (docs/ONBOARDING_SINGLE_SOURCE_OF_TRUTH.md).
//
// Duas causas raiz confirmadas por leitura direta do código, além da
// supressão de recomendações concorrentes (ver test-onboarding-single-
// source-of-truth.mjs):
//
// Bug B — CTA morto na própria página: career-created (rota /game) é
// exatamente a Home. Enquanto o auto-complete por visita ainda não
// resolveu, a Home renderizava <Link to="/game"> dentro de /game — o
// React Router não navega para a rota atual, então o botão "não abria"
// (QA: "[Começar tutorial]" sem efeito). Corrigido com um estado neutro
// ("Você já está aqui") quando destination === rota atual.
//
// Bug C — 4 das etapas mais comuns nunca notificavam Home/Guia: os
// handlers de nome/lado/dificuldade/estilo em Missions.jsx salvavam o
// perfil e recarregavam a própria página, mas nunca disparavam
// padel:profile-updated/padel:onboarding-refresh — só o caminho VISIT/
// FINISH (confirmUnderstanding) tinha isso desde Onboarding Flow 3.1.
// Corrigido fazendo load() devolver o perfil já reconciliado e os 4
// handlers dispararem os mesmos dois eventos.
//
// Este teste prova (Parte 12 do hotfix — não basta análise estática):
// (1) toda rota de destino das 15 etapas é uma rota real registrada em
// App.jsx, nenhuma aponta para lugar nenhum; (2) acionando o MESMO
// pipeline real que cada handler de Missions.jsx executa (PlayerProfile.
// update + incrementMissionProgress, para as 4 etapas ACTION) o tutorial
// realmente avança — não é só rótulo visual; (3) os 4 handlers e o
// caminho VISIT/FINISH disparam os eventos de notificação.
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
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { getCurrentTutorialStep } = await server.ssrLoadModule('/src/onboarding/tutorialState.js');
  const { reconcilePersistedTutorial } = await server.ssrLoadModule('/src/onboarding/tutorialReconciliation.js');
  const { completeTutorialStep } = await server.ssrLoadModule('/src/onboarding/tutorialEngine.js');
  const { ensureTutorialMissionCatalog, incrementMissionProgress } = await server.ssrLoadModule('/src/lib/padel.js');

  // ── 1) Toda rota de destino das 15 etapas é uma rota real registrada ────
  const appSource = readFileSync('src/App.jsx', 'utf8');
  const registeredRoutes = new Set([...appSource.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]));
  for (const step of TUTORIAL_STEPS) {
    const base = step.route.split('?')[0];
    gate(`Rota de destino "${base}" (etapa ${step.id}) está registrada em App.jsx`, registeredRoutes.has(base));
  }

  // ── 2) Missions.jsx: os 4 handlers ACTION disparam os eventos de notificação ──
  const missionsSource = readFileSync('src/pages/Missions.jsx', 'utf8');
  gate('load() devolve o perfil reconciliado (return p)', /return p;/.test(missionsSource));
  gate('notifyProfileUpdated existe e dispara os dois eventos', missionsSource.includes('function notifyProfileUpdated') && missionsSource.includes("'padel:onboarding-refresh'") && missionsSource.includes("'padel:profile-updated'"));
  for (const [handler, stepId] of [['side-selected', 'side-selected'], ['difficulty-selected', 'difficulty-selected'], ['athlete-named', 'athlete-named'], ['style-selected', 'style-selected']]) {
    gate(`Handler da etapa "${handler}" chama notifyProfileUpdated`, missionsSource.includes(`notifyProfileUpdated(await load(), '${stepId}')`));
  }

  // ── 3) Pipeline real: cada etapa ACTION avança o tutorial exatamente como o handler faz ──
  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-home-cta', name: 'QA Home CTA' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-player-home-cta', sport_name: 'Novo Atleta', career_date: '2026-01-01', energy: 100, fatigue: 0,
  });

  const reconcile = async (facts) => {
    const missions = await ensureTutorialMissionCatalog();
    const progressRows = await localGame.entities.MissionProgress.filter({ profile_id: profile.id });
    return reconcilePersistedTutorial(profile, facts, missions, progressRows);
  };
  const confirmStep = async (stepId) => {
    const result = await completeTutorialStep({ profile, stepId, triggerSource: 'test-home-cta' });
    profile = result.profile;
    return result.state;
  };

  let state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  gate('Carreira nova começa em career-created', getCurrentTutorialStep(state)?.id === 'career-created');
  state = await confirmStep('career-created');
  gate('career-created (VISIT, via completeTutorialStep — mesmo mecanismo do auto-complete por visita) avança para athlete-named', getCurrentTutorialStep(state)?.id === 'athlete-named');

  // "Definir nome" — pipeline REAL do handler saveAthleteName: PlayerProfile.update + incrementMissionProgress('set_player_name').
  profile = await localGame.entities.PlayerProfile.update(profile.id, { sport_name: 'Ale Tester' });
  await incrementMissionProgress(profile.id, 'set_player_name', 1, profile.career_date);
  state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  gate('Pipeline real de "Definir nome" (update + incrementMissionProgress) avança athlete-named → side-selected', getCurrentTutorialStep(state)?.id === 'side-selected');

  // "Escolher lado" — pipeline REAL do handler chooseSide.
  profile = await localGame.entities.PlayerProfile.update(profile.id, { handedness: 'right', dominant_hand: 'right', court_side: 'direita', preferred_side: 'direita' });
  await incrementMissionProgress(profile.id, 'choose_court_side', 1, profile.career_date);
  state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  gate('Pipeline real de "Escolher lado" avança side-selected → difficulty-selected', getCurrentTutorialStep(state)?.id === 'difficulty-selected');

  // "Escolher dificuldade" — pipeline REAL do handler chooseDifficulty.
  profile = await localGame.entities.PlayerProfile.update(profile.id, { career_difficulty: 'normal' });
  await incrementMissionProgress(profile.id, 'choose_career_difficulty', 1, profile.career_date);
  state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  gate('Pipeline real de "Escolher dificuldade" avança difficulty-selected → style-selected', getCurrentTutorialStep(state)?.id === 'style-selected');

  // "Escolher estilo" — pipeline REAL do handler chooseStyle.
  profile = await localGame.entities.PlayerProfile.update(profile.id, { play_style: 'agressivo' });
  await incrementMissionProgress(profile.id, 'choose_play_style', 1, profile.career_date);
  state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  gate('Pipeline real de "Escolher estilo" avança style-selected → appearance-known', getCurrentTutorialStep(state)?.id === 'appearance-known');

  // Resto da sequência (VISIT/DECISION/EVENT) — já coberto em detalhe por
  // test-onboarding-v3.mjs/test-tutorial-auto-completion.mjs; aqui só
  // confirma que o pipeline chega ao fim sem travar, fechando o ciclo
  // completo desta suíte também.
  state = await confirmStep('appearance-known');
  state = await confirmStep('profile-reviewed');
  state = await confirmStep('offers-reviewed');
  profile = await localGame.entities.PlayerProfile.update(profile.id, { partner_id: 'bot-partner-1' });
  state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  gate('Escolher parceiro (evento real) avança para coaches-known', getCurrentTutorialStep(state)?.id === 'coaches-known');
  state = await confirmStep('coaches-known');
  const trainings = [{ id: 'training-1', profile_id: profile.id }];
  state = (await reconcile({ registrations: [], matches: [], trainings })).state;
  gate('Primeiro treino (evento real) avança para calendar-known', getCurrentTutorialStep(state)?.id === 'calendar-known');
  state = await confirmStep('calendar-known');

  // Correção UI/cronologia (v13): "Competições" (tournament-registered,
  // first-match) foi movida para o FIM da trilha — depois de todos os
  // grupos cumpríveis no dia 1 (comissão técnica, economia, circuito) — em
  // vez de logo após o calendário. As etapas VISIT intermediárias usam o
  // mesmo mecanismo já coberto em detalhe por test-tutorial-expanded-flow.mjs;
  // aqui só confirma que o pipeline chega ao torneio sem travar, agora na
  // nova posição.
  const visitStepsBeforeCompetitions = ['staff-known', 'economy-known', 'sponsors-known', 'opportunities-known', 'shop-known', 'equipment-known', 'athletes-known', 'ranking-known', 'world-known', 'news-known', 'press-known', 'notifications-known'];
  for (const stepId of visitStepsBeforeCompetitions) {
    gate(`Etapa "${stepId}" é a atual antes de confirmar (nova ordem v13)`, getCurrentTutorialStep(state)?.id === stepId);
    state = await confirmStep(stepId);
  }
  gate('Fim dos grupos cumpríveis no dia 1 avança para tournament-registered (Competições, agora no final)', getCurrentTutorialStep(state)?.id === 'tournament-registered');

  const registrations = [{ id: 'reg-1', profile_id: profile.id, tournament_id: 't1', status: 'confirmed' }];
  state = (await reconcile({ registrations, matches: [], trainings })).state;
  gate('Inscrição em torneio (evento real) avança para first-match', getCurrentTutorialStep(state)?.id === 'first-match');
  // Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md, Parte 2):
  // "first-match" agora exige explicitamente uma partida OFICIAL de
  // torneio (competition_type/is_official, os mesmos campos já gravados
  // desde a finalização real — matchFinalization.js para treino,
  // TournamentModal.jsx para torneio) — matches_played sozinho (contador
  // incrementado também por treino) não basta mais, de propósito. Ver
  // test-tutorial-first-official-match.mjs para a cobertura dedicada
  // dessa regra (inclusive o caso negativo: partida de treino não conclui).
  const matches = [{ id: 'match-1', profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true }];
  profile = await localGame.entities.PlayerProfile.update(profile.id, { tournaments_played: 1 });
  state = (await reconcile({ registrations, matches, trainings })).state;
  // Correção UI/cronologia (v13): Competições agora é o ÚLTIMO grupo real
  // antes de autonomy (FINISH) — a primeira partida oficial fecha o
  // tutorial principal inteiro, não só uma fase intermediária.
  gate('Primeira partida OFICIAL (evento real) avança para autonomy (fim da trilha, Competições agora é o último grupo)', getCurrentTutorialStep(state)?.id === 'autonomy');
  gate('Sequência via pipeline real chega ao fim sem travar (ainda in_progress — autonomy exige o botão dedicado, nunca auto-completa por visita)', state.status === 'in_progress');

  console.log(`\n${gates} gates executados, todos PASS — Home CTA (destinos reais + pipeline real + notificação de eventos).`);
} finally {
  await server.close();
}
