// Starter Coach Flow (docs/STARTER_COACH_FLOW.md).
//
// QA real: uma carreira nova de 16 anos, 325 moedas, já chegava à página de
// Treinador Principal com "João Moreira" contratado — "Iniciante · pago
// pelo clube" — antes do jogador nunca ter visitado /coaches. Causa raiz
// (auditada, não suposta): `ensureStarterCoach` era chamado sem pedir nada
// a partir de 3 efeitos de montagem de página/modal (Coaches.jsx,
// TournamentModal.jsx, SimulationModal.jsx), escrevendo um contrato
// completo (12 meses, coach_trust, coach_tactical_understanding) na
// primeira vez que qualquer uma dessas telas abria. Auditoria de todo
// leitor de coach_id/getCoachEffects (treino, partidas, Live Coach, painel
// de comissão, fechamento mensal) confirmou: nenhum já exige um coach
// sempre presente — todos já tratam `coach: null` corretamente — então não
// havia necessidade técnica real de um treinador "de formação" automático.
//
// Este teste prova: (1) uma carreira nova não recebe nenhum contrato de
// treinador; (2) resolveActiveCoach (o substituto) só resolve, nunca cria;
// (3) contratar um treinador de verdade funciona e avança a etapa
// coaches-known do tutorial (agora DECISION, só conclui numa contratação
// real — ver test-onboarding-single-source-of-truth.mjs para as outras 14
// etapas); (4) demitir limpa o treinador sem reatribuir um substituto
// automaticamente; (5) uma partida treino real com coach: null completa
// normalmente, sem bônus e sem sugestão fantasma do Live Coach (o motor
// já é testado a fundo para isto em test-live-coach-practice.mjs — aqui só
// confirma que a remoção do auto-assign não quebra essa garantia).
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
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const coachLifecycle = await server.ssrLoadModule('/src/game-core/coachLifecycle.js');
  const { resolveActiveCoach, hirePrimaryCoach, isCoachActive } = coachLifecycle;
  const { getCurrentTutorialStep } = await server.ssrLoadModule('/src/onboarding/tutorialState.js');
  const { reconcilePersistedTutorial } = await server.ssrLoadModule('/src/onboarding/tutorialReconciliation.js');
  const { completeTutorialStep } = await server.ssrLoadModule('/src/onboarding/tutorialEngine.js');
  const { ensureTutorialMissionCatalog } = await server.ssrLoadModule('/src/lib/padel.js');
  const { createMatch, playPoint } = await server.ssrLoadModule('/src/engine/match/MatchEngine.js');
  const { COACHES_DATA } = await server.ssrLoadModule('/src/lib/coaches.js');

  // ── 0) resolveActiveCoach substitui ensureStarterCoach/replaceWithStarterCoach ──
  gate('ensureStarterCoach não existe mais (removida, não só sem uso)', typeof coachLifecycle.ensureStarterCoach === 'undefined');
  gate('replaceWithStarterCoach não existe mais', typeof coachLifecycle.replaceWithStarterCoach === 'undefined');
  gate('resolveActiveCoach existe', typeof resolveActiveCoach === 'function');

  // ── 1) Carreira nova não recebe contrato de treinador ───────────────────
  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-starter-coach', name: 'QA Starter Coach' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-player-starter-coach', sport_name: 'Ale Teen', career_date: '2026-01-01', energy: 100, fatigue: 0,
    coins: 325, level: 'Iniciante', reputation: 0, ranking_position: 1000, club_level: 0,
    handedness: 'right', court_side: 'direita', career_difficulty: 'normal', play_style: 'agressivo',
  });
  gate('Perfil recém-criado não tem coach_id', !profile.coach_id);
  gate('isCoachActive(profile) é false numa carreira nova', !isCoachActive(profile));

  // ── 2) resolveActiveCoach só resolve, nunca cria ─────────────────────────
  const resolvedEmpty = await resolveActiveCoach(profile);
  gate('resolveActiveCoach devolve coach: null sem contrato ativo', resolvedEmpty.coach === null);
  const afterResolve = (await localGame.entities.PlayerProfile.filter({ id: profile.id }))[0];
  gate('resolveActiveCoach não escreveu nada no storage (coach_id continua ausente)', !afterResolve.coach_id);

  // ── 3) Uma partida treino real com coach: null completa normalmente ─────
  const fakePlayer = (id, name) => ({ id, name, sport_name: name, attributes: { smash: 55, volley: 55, serve: 55, lob: 55, defense: 55, speed: 55, control: 55, tactics: 55 }, energy: 90, fatigue: 10, partner_chemistry: 55, partner_trust: 55, partner_morale: 55, matches_played: 0 });
  let matchState = createMatch(
    [fakePlayer('me', 'Jogador'), fakePlayer('partner', 'Parceiro')],
    [fakePlayer('b1', 'Rival1'), fakePlayer('b2', 'Rival2')],
    { initialTacticId: 'equilibrado', coach: null, seed: 'starter-coach-flow-nocoach' },
  );
  let safety = 6000;
  while (!matchState.finished && safety-- > 0) matchState = playPoint(matchState);
  gate('Partida treino com coach: null termina normalmente (sem crash)', matchState.finished === true);
  gate('Sem treinador, liveCoach.coach permanece null (sem fallback fantasma)', matchState.liveCoach.coach === null);
  gate('Sem treinador, zero sugestões do Live Coach a partida inteira', matchState.liveCoach.suggestions.length === 0);

  // ── 4) Contratar avança coaches-known (DECISION) no tutorial ────────────
  const reconcile = async (facts) => {
    const missions = await ensureTutorialMissionCatalog();
    const progressRows = await localGame.entities.MissionProgress.filter({ profile_id: profile.id });
    return reconcilePersistedTutorial(profile, facts, missions, progressRows);
  };
  const confirmStep = async (stepId) => {
    const result = await completeTutorialStep({ profile, stepId, triggerSource: 'test-starter-coach-flow' });
    profile = result.profile;
    return result.state;
  };
  let state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  state = await confirmStep('career-created');
  profile = await localGame.entities.PlayerProfile.update(profile.id, { sport_name: 'Ale Teen' });
  state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  state = await confirmStep('appearance-known');
  state = await confirmStep('profile-reviewed');
  state = await confirmStep('offers-reviewed');
  profile = await localGame.entities.PlayerProfile.update(profile.id, { partner_id: 'bot-partner-1' });
  state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  gate('Tutorial chega em coaches-known (DECISION) sem exigir visita apenas', getCurrentTutorialStep(state)?.id === 'coaches-known');

  const catalog = await server.ssrLoadModule('/src/game-core/coachLifecycle.js').then((m) => m.ensureCoachCatalog(profile));
  const starterTierCoach = catalog.find((c) => c.tier === 'iniciante');
  profile = await hirePrimaryCoach(profile, starterTierCoach, 12);
  gate('hirePrimaryCoach grava um contrato real (coach_paid_by_club: false)', profile.coach_id === starterTierCoach.id && profile.coach_paid_by_club === false);
  state = (await reconcile({ registrations: [], matches: [], trainings: [] })).state;
  gate('Contratar de verdade avança coaches-known → first-training', getCurrentTutorialStep(state)?.id === 'first-training');

  // ── 5) resolveActiveCoach resolve um contrato real corretamente ─────────
  const resolvedHired = await resolveActiveCoach(profile);
  gate('resolveActiveCoach resolve o treinador contratado', resolvedHired.coach?.id === starterTierCoach.id);

  // ── 6) Demitir limpa sem reatribuir (mesmo campo que Coaches.jsx grava) ──
  profile = await localGame.entities.PlayerProfile.update(profile.id, {
    coach_id: null, coach_name: null, coach_monthly_salary: 0, coach_signing_cost: 0,
    coach_contract_status: 'terminated', coach_paid_by_club: false,
    coach_trust: 45, coach_relationship_months: 0, coach_tactical_understanding: 15,
  });
  gate('Demitir deixa coach_id null (sem substituto automático)', profile.coach_id === null);
  const resolvedAfterFire = await resolveActiveCoach(profile);
  gate('resolveActiveCoach após demissão continua devolvendo null (nada reatribui)', resolvedAfterFire.coach === null);

  console.log(`\n${gates} gates executados, todos PASS — Starter Coach Flow (sem contratação fantasma).`);
} finally {
  await server.close();
}
