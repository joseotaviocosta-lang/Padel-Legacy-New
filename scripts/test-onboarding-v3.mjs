// Onboarding 2.0 (docs/ONBOARDING_V3_COMMUNICATIONS.md).
//
// QA real: tutorial longo (57 etapas — praticamente "visite toda página do
// jogo"), fragmentado, ainda ensinando hubs legados (`/development`,
// `/team-hub`, `/competitions`, `/world`, `/management` — mantidos vivos só
// para o tutorial) que a navegação em grupos já substituiu. Reduzido para
// 15 etapas essenciais: criar o atleta, formar a dupla, conhecer o
// treinador, treinar, entender o calendário, disputar a primeira partida.
// O resto virou Guia flutuante opcional/contextual (já existente,
// `OnboardingGuide.jsx`), nunca bloqueia a conclusão do onboarding
// principal.
//
// Este teste roda o pipeline real (GameStorage -> CareerRepository ->
// CareerManager, sem mocks das etapas críticas) e prova: a nova sequência
// completa de ponta a ponta, a migração automática de uma carreira salva
// em etapas antigas/removidas (sem crash, sem etapa impossível), e as
// métricas antes/depois pedidas pela auditoria.
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
  const { TUTORIAL_STEPS, TUTORIAL_VERSION, TUTORIAL_MISSION_CATALOG } = await server.ssrLoadModule('/src/onboarding/tutorialSteps.js');
  const { reconcileTutorialProgress, getNextTutorialStep, getCurrentTutorialStep, getTutorialProgress } = await server.ssrLoadModule('/src/onboarding/tutorialState.js');
  const { reconcilePersistedTutorial } = await server.ssrLoadModule('/src/onboarding/tutorialReconciliation.js');
  const { completeTutorialStep, isTutorialRouteMatch } = await server.ssrLoadModule('/src/onboarding/tutorialEngine.js');
  const { ensureTutorialMissionCatalog } = await server.ssrLoadModule('/src/lib/padel.js');

  // ── Métricas: antes vs depois (item 19/47 do hotfix) ────────────────────
  // "Antes" é o inventário travado desta auditoria (v8, 57 etapas — antes de
  // qualquer edição desta sessão); "depois" é lido ao vivo de TUTORIAL_STEPS.
  const BEFORE = {
    version: 8,
    totalSteps: 57,
    mandatoryRoutes: new Set([
      '/game', '/game/missions', '/profile', '/character', '/achievements', '/game/stats',
      '/development', '/game/training', '/training-center', '/coaches', '/game/inventory', '/game/shop',
      '/team-hub', '/partners', '/relationships', '/press', '/fans',
      '/competitions', '/tournaments', '/game/calendar', '/matches', '/ranking', '/game/season',
      '/world', '/journal', '/world-events', '/world-market', '/weather', '/athletes', '/clubs', '/community', '/social', '/encyclopedia',
      '/management', '/game/economy', '/history', '/hall-of-fame', '/game/legacy', '/admin', '/database',
    ]).size,
  };
  // "Depois" é lido ao vivo de TUTORIAL_VERSION (não fixado num número) —
  // Onboarding Flow 3.1 avançou de v9 para v10 (docs/ONBOARDING_FLOW_3_1.md,
  // Parte 1: campo `kind` novo por etapa, mecanismo de conclusão de 6
  // etapas mudou de clique em "Entendi" para auto-complete por visita).
  gate(`TUTORIAL_VERSION avançou (v${BEFORE.version} → v${TUTORIAL_VERSION}) — revisão estrutural real, documentada`, TUTORIAL_VERSION > BEFORE.version);
  gate(`Total de etapas obrigatórias reduziu ao menos pela metade (${BEFORE.totalSteps} → ${TUTORIAL_STEPS.length})`, TUTORIAL_STEPS.length <= BEFORE.totalSteps * 0.5);
  const afterRoutes = new Set(TUTORIAL_STEPS.map((step) => step.route.split('?')[0]));
  gate(`Páginas obrigatórias reduziram ao menos pela metade (${BEFORE.mandatoryRoutes} → ${afterRoutes.size})`, afterRoutes.size <= BEFORE.mandatoryRoutes * 0.5);
  console.log(`  [métricas] etapas: ${BEFORE.totalSteps} → ${TUTORIAL_STEPS.length} · páginas: ${BEFORE.mandatoryRoutes} → ${afterRoutes.size}`);

  // ── Etapas obsoletas/hubs legados realmente saíram da lista obrigatória ──
  const stepIds = new Set(TUTORIAL_STEPS.map((step) => step.id));
  for (const removedId of [
    'development-hub', 'team-hub', 'competitions-hub', 'world-hub-known', 'management-hub-known',
    'training-groups', 'energy-understood', 'first-recovery', 'training-center-known', 'inventory-known', 'item-equipped',
    'compatibility-known', 'chemistry-known', 'relationships-known', 'fans-known',
    'matches-known', 'match-narration', 'match-tactics', 'match-speed', 'season-known',
    'missions-known', 'achievements-known', 'stats-known', 'tournaments-known',
    'events-known', 'market-known', 'weather-known', 'clubs-known', 'community-known', 'social-known', 'encyclopedia-known',
    'finances-known', 'history-known', 'hall-of-fame-known', 'legacy-known', 'admin-known', 'database-known',
  ]) {
    gate(`Etapa obsoleta/hub legado removida da lista obrigatória: ${removedId}`, !stepIds.has(removedId));
  }

  // ── Nenhuma escolha removida foi reintroduzida (item 4 do hotfix) ───────
  // Checa a AUSÊNCIA de uma etapa/ação real de distribuição (id/actionLabel
  // dedicado), não uma busca textual ingênua — o texto de style-selected
  // explica precisamente que NÃO há distribuição manual, o que faria uma
  // busca por "distribuição"+"manual"+"atributo" disparar em falso positivo.
  gate('Nenhuma etapa tem id/ação dedicados a distribuir atributos manualmente', !TUTORIAL_STEPS.some((step) => /distribut|allocate-attr|atributo-manual|alocar-atributo/i.test(step.id) || /distribuir pontos|alocar atributos/i.test(step.actionLabel || '')));
  gate('Nenhuma etapa referencia o Assistente de carreira removido', !TUTORIAL_STEPS.some((step) => /assistente/i.test(step.title) || /assistente de carreira/i.test(step.explanation || '')));

  // ── Nova sequência principal bate com a ordem pedida (Fases A-F) ────────
  // Fase 3, item 3C.3: Competições (tournament-registered, first-match)
  // VOLTA pra logo após o calendário — posição de antes do v13. O motivo
  // do v13 mover pro fim (1º torneio real só abria ~5 dias e só ocorria
  // ~35 dias após o início da carreira) não existe mais: um evento de
  // Exibição/Pré-Temporada (circuitCatalog.js:buildPreSeasonExhibition)
  // tem inscrição livre desde o dia 1, chave de 8, sem pontos de ranking.
  // "tournament-registered" volta a ser cumprível cedo de verdade.
  // "first-match" continua exigindo um evento do CIRCUITO MUNDIAL
  // especificamente (tutorialState.js: world_tour_event !== false) — a
  // Exibição sozinha não conclui mais essa etapa. Nenhum id/objectiveType/
  // mecanismo mudou, só a posição.
  gate('Sequência: criar atleta → formar dupla → treinador → treino → calendário → torneio (Exibição cumpre cedo) → resto → autonomia', TUTORIAL_STEPS.map((s) => s.id).join(',') === [
    'career-created', 'athlete-named', 'side-selected', 'difficulty-selected', 'style-selected', 'appearance-known', 'profile-reviewed',
    'offers-reviewed', 'partner-selected',
    'coaches-known',
    'first-training',
    'calendar-known',
    'tournament-registered', 'first-match',
    'staff-known', 'economy-known', 'sponsors-known', 'opportunities-known',
    'shop-known', 'equipment-known', 'athletes-known', 'ranking-known',
    'world-known', 'news-known', 'press-known', 'notifications-known',
    'autonomy',
  ].join(','));

  // ── Cada etapa tem trigger/completion/fallback claros (item 14) ─────────
  for (const step of TUTORIAL_STEPS) {
    gate(`Etapa "${step.id}" tem rota válida (não vazia)`, Boolean(step.route));
    gate(`Etapa "${step.id}" tem tipo de conclusão conhecido`, ['confirm_understanding', 'perform_action', 'domain_event'].includes(step.completionType));
    gate(`Etapa "${step.id}" tem objectiveType (chave de conclusão)`, Boolean(step.objectiveType));
  }
  gate('Catálogo de missões do tutorial tem 1 entrada por etapa, na mesma ordem', TUTORIAL_MISSION_CATALOG.length === TUTORIAL_STEPS.length && TUTORIAL_MISSION_CATALOG.every((m, i) => m.catalog_key === `tutorial-${TUTORIAL_STEPS[i].id}`));

  // ── Pipeline real: nova carreira → sequência completa → onboarding concluído ──
  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-onboarding-v3', name: 'QA Onboarding V3' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-player', sport_name: 'Novo Atleta', career_date: '2026-01-01', energy: 100, fatigue: 0,
  });

  const confirmStep = async (stepId) => {
    const result = await completeTutorialStep({ profile, stepId, triggerSource: 'test-onboarding-v3' });
    profile = result.profile;
    return result.state;
  };

  // Reconciliação real precisa do catálogo/progresso de missões atuais para
  // poder confirmar (e recompensar) retroativamente etapas reconhecidas por
  // fato — sem isso, a próxima etapa sequencial fica bloqueada por
  // tutorialUnlocked() (exige a etapa anterior "claimed"). Mesma busca que
  // Missions.jsx/OnboardingGuide.jsx fazem antes de chamar
  // reconcilePersistedTutorial; nunca arrays vazios.
  const reconcile = async (facts) => {
    const missions = await ensureTutorialMissionCatalog();
    const progressRows = await localGame.entities.MissionProgress.filter({ profile_id: profile.id });
    return reconcilePersistedTutorial(profile, facts, missions, progressRows);
  };

  let state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  gate('Carreira nova começa na Fase A (career-created)', getCurrentTutorialStep(state)?.id === 'career-created');
  state = await confirmStep('career-created');
  gate('Após confirmar career-created, avança para athlete-named', getCurrentTutorialStep(state)?.id === 'athlete-named');

  // Nome/lado/dificuldade/estilo são inferidos do próprio perfil assim que
  // o jogador preenche o formulário real em Missões (sem clique extra) —
  // mesmo mecanismo de "ação antecipada reconhecida" já existente.
  profile = await localGame.entities.PlayerProfile.update(profile.id, {
    sport_name: 'Ale Tester', handedness: 'right', court_side: 'direita',
    career_difficulty: 'normal', play_style: 'agressivo',
  });
  state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  gate('Nome/lado/dificuldade/estilo preenchidos → avança direto para appearance-known (Fase A)', getCurrentTutorialStep(state)?.id === 'appearance-known');

  state = await confirmStep('appearance-known');
  state = await confirmStep('profile-reviewed');
  gate('Fase A concluída → Fase B (formar a dupla)', getCurrentTutorialStep(state)?.id === 'offers-reviewed');

  state = await confirmStep('offers-reviewed');
  profile = await localGame.entities.PlayerProfile.update(profile.id, { partner_id: 'bot-partner-1' });
  state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  gate('Parceiro escolhido (ação de domínio) → avança para Fase C (treinador)', getCurrentTutorialStep(state)?.id === 'coaches-known');

  state = await confirmStep('coaches-known');
  gate('Fase C concluída → Fase D (primeiro treino)', getCurrentTutorialStep(state)?.id === 'first-training');

  const trainings = [{ id: 'training-1', profile_id: profile.id }];
  state = (await reconcile({ registrations: [], matches: [], trainings })).state;
  gate('Treino concluído (evento de domínio) → avança para Fase E (calendário)', getCurrentTutorialStep(state)?.id === 'calendar-known');

  state = await confirmStep('calendar-known');
  // Fase 3, item 3C.3: Competições volta pra logo após o calendário — o
  // evento de Exibição/Pré-Temporada (inscrição livre desde o dia 1)
  // torna "tournament-registered" cumprível cedo de verdade, então não
  // precisa mais ficar atrás da expansão guiada esperando um torneio real
  // do circuito abrir.
  gate('Fase E (calendário) concluída → Fase F (torneio, cumprível cedo via Exibição)', getCurrentTutorialStep(state)?.id === 'tournament-registered');

  // Item 3C.2/3C.3: a inscrição que desbloqueia "tournament-registered"
  // pode ser a da Exibição (sem `world_tour_event`, não é um evento do
  // circuito) — a etapa de REGISTRO não distingue as duas, só a de JOGAR
  // (abaixo) exige especificamente o circuito mundial.
  const registrations = [{ id: 'reg-exhibition', profile_id: profile.id, tournament_id: 'exhibition-1', status: 'confirmed' }];
  state = (await reconcile({ registrations, matches: [], trainings })).state;
  gate('Inscrição na Exibição (evento de domínio) → avança para first-match', getCurrentTutorialStep(state)?.id === 'first-match');

  // Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md, Parte 2):
  // "first-match" exige explicitamente uma partida OFICIAL de torneio —
  // os mesmos campos já gravados desde a finalização real (matchFinalization.js
  // para treino, TournamentModal.jsx para torneio), não matches_played
  // sozinho (contador também incrementado por treino).
  //
  // Fase 3, item 3C.3: e especificamente do CIRCUITO MUNDIAL, não da
  // Exibição — uma partida com `world_tour_event:false` NÃO conclui esta
  // etapa, mesmo sendo oficial/de torneio.
  const exhibitionMatch = { id: 'match-exhibition', profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true, world_tour_event: false };
  state = (await reconcile({ registrations, matches: [exhibitionMatch], trainings })).state;
  gate('Partida da EXIBIÇÃO (world_tour_event:false) NÃO conclui first-match', getCurrentTutorialStep(state)?.id === 'first-match');

  const matches = [exhibitionMatch, { id: 'match-1', profile_id: profile.id, competition_type: 'tournament', is_official: true, is_tournament: true, world_tour_event: true }];
  profile = await localGame.entities.PlayerProfile.update(profile.id, { tournaments_played: 2 });
  state = (await reconcile({ registrations, matches, trainings })).state;
  gate('Partida do CIRCUITO MUNDIAL concluída (evento de domínio) → avança para a expansão guiada', getCurrentTutorialStep(state)?.id === 'staff-known');

  for (const stepId of [
    'staff-known', 'economy-known', 'sponsors-known', 'opportunities-known',
    'shop-known', 'equipment-known', 'athletes-known', 'ranking-known',
    'world-known', 'news-known', 'press-known', 'notifications-known',
  ]) {
    state = await confirmStep(stepId);
  }
  gate('Expansão guiada concluída → autonomy (etapa final)', getCurrentTutorialStep(state)?.id === 'autonomy');

  state = await confirmStep('autonomy');
  gate('Onboarding principal concluído de ponta a ponta (status completed)', state.status === 'completed');
  gate('getTutorialProgress reporta 100% ao concluir', getTutorialProgress(state).percent === 100);

  // ── Fallback seguro: nenhuma etapa trava numa rota inexistente ──────────
  for (const step of TUTORIAL_STEPS) {
    gate(`Rota "${step.route}" (etapa ${step.id}) não referencia hub legado removido do produto`, !/^\/(development|team-hub|competitions|management)(\?|$)/.test(step.route));
  }

  // ── Migração de save antigo: etapas removidas viram entradas inertes ────
  // (item 15/18 do hotfix) — sem tabela de migração explícita: a busca por
  // "primeiro id da lista atual ausente de completedStepIds" já resolve
  // isso sozinha (reconcileTutorialProgress/getCurrentTutorialStep).
  const legacyCompletedMix = [
    'career-created', 'athlete-named', 'side-selected', 'difficulty-selected', 'style-selected',
    'missions-known', 'achievements-known', 'stats-known', // etapas antigas removidas — devem virar inertes
    'profile-reviewed', // completada sob a ordem antiga, ANTES de appearance-known na ordem nova
  ];
  const legacyState = reconcileTutorialProgress(
    { player: { id: 'legacy-player', sport_name: 'Veterano', partner_id: null } },
    { completedStepIds: legacyCompletedMix, status: 'in_progress' },
    {},
  );
  gate('Save antigo não crasha ao reconciliar com a lista nova', Boolean(legacyState));
  gate('Save antigo nunca fica preso num id que não existe mais na lista atual', TUTORIAL_STEPS.some((step) => step.id === legacyState.currentStepId) || legacyState.currentStepId === null);
  gate('Save antigo resume em appearance-known (reordenada antes de profile-reviewed, que ele já tinha)', legacyState.currentStepId === 'appearance-known');
  gate('Save antigo não foi resetado (progresso genuíno de Fase A preservado)', legacyState.completedStepIds.includes('athlete-named') && legacyState.completedStepIds.includes('style-selected'));

  // Save extremo: só etapas 100% removidas.
  const allObsoleteState = reconcileTutorialProgress(
    { player: { id: 'legacy-player-2', sport_name: '' } },
    { completedStepIds: ['development-hub', 'team-hub', 'world-hub-known'], status: 'in_progress' },
    {},
  );
  gate('Save só com etapas 100% removidas não crasha e recomeça do início real (career-created)', allObsoleteState.currentStepId === 'career-created');

  // ── Guia contextual continua funcionando para as etapas mantidas ────────
  gate('isTutorialRouteMatch continua reconhecendo a rota de calendar-known', isTutorialRouteMatch('/game/calendar', '/game/calendar'));

  console.log(`\n${gates} gates executados, todos PASS.`);
} finally {
  await server.close();
}
