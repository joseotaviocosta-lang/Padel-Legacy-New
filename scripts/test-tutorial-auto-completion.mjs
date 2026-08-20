// Onboarding Flow 3.1 (docs/ONBOARDING_FLOW_3_1.md, Parte 1).
//
// QA real: várias etapas do tutorial só existiam para o jogador provar que
// "viu a página" clicando em "Entendi" dentro do Guia — lento e artificial
// para uma etapa cujo único objetivo é visitar uma rota. Decisão: etapas
// `kind: 'VISIT'` completam sozinhas ao visitar a rota correta
// (OnboardingGuide.jsx, novo efeito reagindo a `location.pathname`);
// "Entendi" deixa de ser o gatilho de conclusão para elas (continua
// existindo só como dispensa visual). ACTION/DECISION/EVENT não mudam —
// já completavam por ação real/evento de domínio antes desta fase.
//
// Este teste prova: (1) toda etapa tem uma classificação `kind` válida e a
// composição exata bate com o design aprovado; (2) a etapa final
// (`autonomy`) está EXPLICITAMENTE fora do auto-complete — ela compartilha
// rota (/game) com career-created e tem fluxo próprio dedicado
// (CareerHub.jsx, "Começar carreira livre"); (3) o motor real
// (`completeTutorialStep`) continua funcionando sem mudança nenhuma para
// uma etapa VISIT — só o gatilho na UI mudou, não a lógica de conclusão;
// (4) o novo efeito de auto-complete e o branch de 3 vias em Missions.jsx
// existem no código-fonte; (5) o guard histórico contra reintroduzir o
// mecanismo `visit_career_after_intro` (removido no commit 573fed7, v20)
// continua válido — esta fase não usa esse nome/mecanismo.
import assert from 'node:assert/strict';
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
  const { TUTORIAL_STEPS, TUTORIAL_VERSION } = await server.ssrLoadModule('/src/onboarding/tutorialSteps.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { getCurrentTutorialStep } = await server.ssrLoadModule('/src/onboarding/tutorialState.js');
  const { reconcilePersistedTutorial } = await server.ssrLoadModule('/src/onboarding/tutorialReconciliation.js');
  const { completeTutorialStep } = await server.ssrLoadModule('/src/onboarding/tutorialEngine.js');
  const { ensureTutorialMissionCatalog } = await server.ssrLoadModule('/src/lib/padel.js');

  // ── 1) Toda etapa tem `kind` válido ──────────────────────────────────────
  const VALID_KINDS = ['VISIT', 'ACTION', 'DECISION', 'EVENT', 'FINISH'];
  for (const step of TUTORIAL_STEPS) {
    gate(`Etapa "${step.id}" tem kind conhecido`, VALID_KINDS.includes(step.kind));
  }

  // ── 2) Composição exata bate com o design aprovado (docs/ONBOARDING_FLOW_3_1.md,
  // docs/STARTER_COACH_FLOW.md) — coaches-known migrou de VISIT para DECISION
  // no hotfix "Starter Coach Flow" (só conclui numa contratação real, nunca
  // por visitar /coaches sozinho) — atualizado aqui de propósito, mesma
  // propriedade real (nenhum id perdido, só reclassificado).
  const byKind = (kind) => TUTORIAL_STEPS.filter((step) => step.kind === kind).map((step) => step.id);
  // Tutorial 4.1 (docs/TUTORIAL_4_1_EXPANDED_ONBOARDING_AND_COACH_CLARITY.md,
  // Parte B): 12 novas etapas de descoberta (comissão, economia,
  // patrocínios, oportunidades, loja, equipamentos, atletas, ranking,
  // mundo, notícias, imprensa, notificações) — todas VISIT, mesmo
  // mecanismo de auto-complete, nenhuma mudou de kind. Atualizado aqui de
  // propósito, mesma propriedade real (nenhum id perdido, só expandido).
  gate('VISIT = as 17 etapas de visita pura (5 originais + 12 novas de descoberta)', byKind('VISIT').join(',') === [
    'career-created', 'appearance-known', 'profile-reviewed', 'offers-reviewed', 'calendar-known',
    'staff-known', 'economy-known', 'sponsors-known', 'opportunities-known', 'shop-known', 'equipment-known',
    'athletes-known', 'ranking-known', 'world-known', 'news-known', 'press-known', 'notifications-known',
  ].join(','));
  gate('ACTION = as 4 etapas de formulário/escolha salva', byKind('ACTION').join(',') === [
    'athlete-named', 'side-selected', 'difficulty-selected', 'style-selected',
  ].join(','));
  gate('DECISION = escolher parceiro + escolher primeiro treinador', byKind('DECISION').join(',') === ['partner-selected', 'coaches-known'].join(','));
  gate('EVENT = as 3 etapas de evento de jogo real', byKind('EVENT').join(',') === [
    'first-training', 'tournament-registered', 'first-match',
  ].join(','));
  gate('FINISH = só a etapa de encerramento', byKind('FINISH').join(',') === ['autonomy'].join(','));

  // ── 3) autonomy explicitamente NÃO é VISIT (guard de regressão) ─────────
  const autonomyStep = TUTORIAL_STEPS.find((step) => step.id === 'autonomy');
  gate('autonomy existe e não é kind VISIT (rota /game compartilhada com career-created; fluxo dedicado próprio)', Boolean(autonomyStep) && autonomyStep.kind !== 'VISIT');
  gate('career-created é VISIT (a própria etapa "conhecer Home" do enunciado)', TUTORIAL_STEPS.find((step) => step.id === 'career-created')?.kind === 'VISIT');

  // ── 4) Guard histórico: nunca reintroduzir visit_career_after_intro ─────
  // (removido no commit 573fed7/v20 junto com o botão dedicado "Começar
  // carreira livre" — ver docs/ONBOARDING_FLOW_3_1.md). Já existe em
  // test-tutorial-chronology.mjs; duplicado aqui porque este é o teste mais
  // diretamente sobre o mecanismo que esse guard protege.
  const bridgeSource = readFileSync('src/components/missions/MissionNotificationBridge.jsx', 'utf8');
  gate('MissionNotificationBridge.jsx não reintroduziu visit_career_after_intro', !bridgeSource.includes('visit_career_after_intro'));

  // ── 5) Motor real: completeTutorialStep continua correto para uma etapa VISIT ──
  // (só o gatilho na UI mudou — abrir o Guia e clicar "Entendi" vira um
  // efeito automático ao visitar a rota — a chamada ao motor é idêntica.)
  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-auto-completion', name: 'QA Auto Completion' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-player-auto', sport_name: 'Ale Auto', career_date: '2026-01-01', energy: 100, fatigue: 0,
    handedness: 'right', court_side: 'direita', career_difficulty: 'normal', play_style: 'agressivo',
  });

  const reconcile = async (facts) => {
    const missions = await ensureTutorialMissionCatalog();
    const progressRows = await localGame.entities.MissionProgress.filter({ profile_id: profile.id });
    return reconcilePersistedTutorial(profile, facts, missions, progressRows);
  };

  let state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  gate('Carreira nova começa em career-created (VISIT)', getCurrentTutorialStep(state)?.id === 'career-created');

  const confirmStep = async (stepId) => {
    const result = await completeTutorialStep({ profile, stepId, triggerSource: 'auto-visit' });
    profile = result.profile;
    return result.state;
  };

  state = await confirmStep('career-created');
  gate('completeTutorialStep continua avançando career-created → appearance-known (VISIT → VISIT)', getCurrentTutorialStep(state)?.id === 'appearance-known');
  state = await confirmStep('appearance-known');
  gate('completeTutorialStep continua avançando appearance-known → profile-reviewed (VISIT → VISIT)', getCurrentTutorialStep(state)?.id === 'profile-reviewed');

  // ── 6) Efeito de auto-complete existe em OnboardingGuide.jsx ────────────
  const guideSource = readFileSync('src/components/onboarding/OnboardingGuide.jsx', 'utf8');
  assert.match(guideSource, /step\.kind !== 'VISIT' \|\| !isOnStepPage/, 'auto-complete effect gates on VISIT + isOnStepPage');
  assert.match(guideSource, /triggerSource: 'auto-visit'/, 'auto-complete effect calls completeTutorialStep with a distinct trigger source');
  assert.match(guideSource, /autoCompletingStepIdRef/, 'auto-complete effect has an in-flight guard against re-firing');
  gate('OnboardingGuide.jsx tem o efeito de auto-complete de etapas VISIT', /step\.kind !== 'VISIT' \|\| !isOnStepPage/.test(guideSource) && guideSource.includes("triggerSource: 'auto-visit'"));
  gate('Botão "Entendi, continuar" não é mais o gatilho para etapas VISIT', guideSource.includes("step.completionType === 'confirm_understanding' && step.kind !== 'VISIT'"));
  gate('Conclusão de etapa (efeito automático) propaga padel:profile-updated para a Home não ficar desatualizada', guideSource.includes("new CustomEvent('padel:profile-updated'"));

  // ── 7) Branch de 3 vias em Missions.jsx ──────────────────────────────────
  const missionsSource = readFileSync('src/pages/Missions.jsx', 'utf8');
  gate('Missions.jsx distingue VISIT (sem botão Entendi) de outras confirm_understanding', missionsSource.includes("tutorialStep?.kind !== 'VISIT'") && missionsSource.includes("tutorialStep?.kind === 'VISIT'"));
  // Tutorial 4.1 (Parte L): isTutorialRouteMatch ganhou um 3º argumento
  // (location.search) para diferenciar etapas que dividem a mesma rota
  // base por query string — mesma função reaproveitada, só o call site
  // passa mais contexto agora.
  gate('Missions.jsx reusa isTutorialRouteMatch em vez da comparação improvisada antiga', missionsSource.includes('isTutorialRouteMatch(nextTutorial.tutorial_route, location.pathname, location.search)'));

  console.log(`\n${gates} gates executados, todos PASS — Onboarding Flow 3.1 (auto-complete de etapas VISIT), TUTORIAL_VERSION v${TUTORIAL_VERSION}.`);
} finally {
  await server.close();
}
