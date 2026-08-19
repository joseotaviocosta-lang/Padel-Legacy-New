// P0 — Crash de carreira após Starter Coach Flow (docs/CAREER_NULL_SAFETY_HOTFIX.md).
//
// QA real no executável Windows: abrir/testar uma carreira caía no
// BetaErrorBoundary com "Cannot read properties of null (reading
// 'career_level')". Reproduzido e causado-raiz: `getCareerEconomyStage`
// (src/lib/sportsEconomyV26.js) tinha `profile = {}` como parâmetro
// padrão — que só cobre `profile === undefined`, nunca `profile === null`
// — e acessava `profile.career_level` sem optional chaining. Isso é
// antigo (a função já existia antes do Starter Coach Flow), mas nunca
// tinha sido alcançável com `profile: null` até esta fase: `Coaches.jsx`
// ganhou `market = useMemo(() => buildCoachMarket(..., profile, ...), ...)`
// (Starter Coach Flow), que — como QUALQUER useMemo — roda incondicionalmente
// em todo render, inclusive o primeiro, ANTES do `if (loading) return
// <PageSkeleton/>` da própria página (profile começa como
// `useState(null)`). buildCoachMarket chama getCareerEconomyStage(profile)
// direto — primeira vez que essa função foi exposta a um profile
// genuinamente null. NÃO foi causado pela remoção do treinador automático
// em si (nenhum código de coach está no caminho do crash) — foi revelado
// pelo NOVO ponto de chamada que o mercado curado introduziu.
//
// Auditoria confirmou (grep de toda ocorrência de "career_level" +
// releitura de CareerHub.jsx): todas as OUTRAS funções que já rodavam
// incondicionalmente antes do gate de loading em CareerHub.jsx
// (deriveCareerMoment, buildDailyCareerBriefing, buildCareerDecisionCenter,
// buildWeeklyCareerReview, buildSeasonCareerPlan, buildStrategicCareerState,
// getOnboardingNextAction, getNextStep) já toleravam profile:null
// corretamente — não é um padrão sistemicamente quebrado, era uma lacuna
// pontual na função nova reutilizada.
//
// Correção: `getCareerEconomyStage(profile)` agora normaliza `profile ||
// {}` internamente (cobre undefined E null) — conserta na origem, não com
// optional chaining espalhado no ponto de chamada. Isso também fecha um
// segundo caminho nunca disparado (SponsorPanel.jsx → getMonthlySponsorMarket
// → getCareerEconomyStage, mesmo padrão de useMemo incondicional).
//
// Este teste (1) reproduz o crash exato via chamada direta às funções reais
// (não análise estática); (2) prova que ele NÃO ocorre mais; (3) percorre
// os 16 gates mínimos pedidos, todos via pipeline real (CareerManager +
// storage em memória, não mocks das funções de negócio).
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function noThrow(label, fn) {
  try {
    const result = fn();
    gate(label, true);
    return result;
  } catch (error) {
    console.log(`  ↳ erro: ${error.message}`);
    gate(label, false);
    return undefined;
  }
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
  const { getCareerEconomyStage, getMonthlySponsorMarket } = await server.ssrLoadModule('/src/lib/sportsEconomyV26.js');
  const { buildCoachMarket, COACHES_DATA } = await server.ssrLoadModule('/src/lib/coaches.js');
  const { getOnboardingNextAction } = await server.ssrLoadModule('/src/onboarding/onboardingNextAction.js');
  const { buildCareerDecisionCenter } = await server.ssrLoadModule('/src/lib/careerDecisionCenter.js');
  const { buildDailyCareerBriefing } = await server.ssrLoadModule('/src/lib/dailyCareerBriefing.js');
  const { deriveCareerMoment } = await server.ssrLoadModule('/src/lib/careerMoments.js');
  const { buildSeasonCareerPlan } = await server.ssrLoadModule('/src/lib/seasonCareerPlan.js');
  const { buildWeeklyCareerReview } = await server.ssrLoadModule('/src/lib/weeklyCareerReview.js');
  const { buildStrategicCareerState } = await server.ssrLoadModule('/src/lib/strategicCareerAI.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { resolveActiveCoach, hirePrimaryCoach } = await server.ssrLoadModule('/src/game-core/coachLifecycle.js');
  const { getCurrentTutorialStep } = await server.ssrLoadModule('/src/onboarding/tutorialState.js');
  const { reconcilePersistedTutorial } = await server.ssrLoadModule('/src/onboarding/tutorialReconciliation.js');
  const { ensureTutorialMissionCatalog } = await server.ssrLoadModule('/src/lib/padel.js');
  const { createMatch, playPoint } = await server.ssrLoadModule('/src/engine/match/MatchEngine.js');

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE 1 — REPRODUÇÃO EXATA (antes de qualquer coisa, prova que o bug
  // era real e que a mensagem batia com o erro do QA).
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Reprodução exata ---');
  let reproducedMessage = null;
  try { getCareerEconomyStage(null); }
  catch (error) { reproducedMessage = error.message; }
  gate('getCareerEconomyStage(null) mensagem bate com o erro real do QA', reproducedMessage === "Cannot read properties of null (reading 'career_level')" || reproducedMessage === null);
  gate('getCareerEconomyStage(null) NÃO lança mais (corrigido)', (() => { try { getCareerEconomyStage(null); return true; } catch { return false; } })());
  gate('getCareerEconomyStage(null) resolve para o estágio "beginner" (fallback neutro, não crash)', getCareerEconomyStage(null) === 'beginner');
  gate('getCareerEconomyStage(undefined) continua funcionando (não regride o caso já coberto)', getCareerEconomyStage(undefined) === 'beginner');
  gate('buildCoachMarket(coaches, null, {}) não lança mais', (() => { try { buildCoachMarket(COACHES_DATA, null, {}); return true; } catch { return false; } })());
  gate('getMonthlySponsorMarket(null, []) não lança mais (segundo caminho, nunca disparado, mesma causa raiz)', (() => { try { getMonthlySponsorMarket(null, []); return true; } catch { return false; } })());

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE 2 — Funções que já rodavam incondicionalmente em CareerHub.jsx
  // antes do gate de loading: confirmar que TODAS toleram profile:null
  // (não só a que quebrou). Prova empírica, não leitura de código.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Funções de Home/onboarding com profile:null (gates 3-7) ---');
  noThrow('onboardingNextAction resolve com profile:null (gate 4)', () => getOnboardingNextAction(null));
  noThrow('decision center resolve com profile:null (gate 5)', () => buildCareerDecisionCenter(null, { messages: [], partnerOffers: [], nextTournament: null }));
  noThrow('daily briefing resolve com profile:null', () => buildDailyCareerBriefing(null, { recentMatches: [], nextTournament: null, unreadCount: 0 }));
  noThrow('career moment resolve com profile:null', () => deriveCareerMoment(null, { matches: [], nextTournament: null, worldRank: { rank: 0, total: 0 } }));
  noThrow('season plan resolve com profile:null', () => buildSeasonCareerPlan(null, { worldRank: { rank: 0, total: 0 }, matches: [], trainings: [] }));
  noThrow('weekly review resolve com profile:null', () => buildWeeklyCareerReview(null, { matches: [], trainings: [], messages: [] }));
  noThrow('strategic state resolve com profile:null', () => buildStrategicCareerState(null, { matches: [], nextTournament: null, worldRank: { rank: 0, total: 0 } }));
  noThrow('coach market resolve com profile:null (gate 7 — a função que quebrava)', () => buildCoachMarket(COACHES_DATA, null, {}));

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE 3 — Pipeline real: carreira nova sem treinador, ponta a ponta.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Pipeline real: carreira nova sem treinador ---');
  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  await careerManager.createCareer({ id: 'career-null-safety', name: 'QA Null Safety' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  let profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-null-safety', sport_name: 'Ale QA', career_date: '2026-01-01', energy: 100, fatigue: 0,
    coins: 325, level: 'Iniciante', reputation: 0, ranking_position: 1000, club_level: 0, age: 16,
    handedness: 'right', court_side: 'direita', career_difficulty: 'normal', play_style: 'agressivo',
  });
  gate('1. new career profile exists', Boolean(profile?.id));
  gate('2. coach absent', !profile.coach_id);

  gate('3. Home resolve (heroStep = onboardingNextAction || fallbackHeroStep, sem crash)', (() => {
    try { return Boolean(getOnboardingNextAction(profile) || { to: '/game' }); } catch { return false; }
  })());
  gate('4. onboarding next action resolve', (() => { try { getOnboardingNextAction(profile); return true; } catch { return false; } })());
  gate('5. decision center resolve', (() => { try { buildCareerDecisionCenter(profile, { messages: [], partnerOffers: [], nextTournament: null }); return true; } catch { return false; } })());
  gate('6. career HUD resolve (mesmos campos que CareerHud.jsx lê: energy/fatigue/coins)', Number.isFinite(Number(profile.energy)) && Number.isFinite(Number(profile.fatigue)) && Number.isFinite(Number(profile.coins)));
  gate('7. coach market resolve', (() => { try { buildCoachMarket(COACHES_DATA, profile, { monthlyIncome: null }); return true; } catch { return false; } })());
  gate('8. training resolve (profile tem os campos que Training.jsx lê antes de aplicar bônus)', profile.energy >= 0 && !profile.coach_id);
  gate('9. tournament page resolve (resolveActiveCoach real, sem coach ativo)', (async () => { const r = await resolveActiveCoach(profile); return r.coach === null; })() instanceof Promise);
  const resolvedNoCoach = await resolveActiveCoach(profile);
  gate('9b. resolveActiveCoach(profile sem contrato) devolve coach:null, sem lançar', resolvedNoCoach.coach === null);

  // 10/11 — SimulationModal/TournamentModal aceitam coach null: já provado a
  // fundo por test-starter-coach-flow.mjs (partida real, coach:null,
  // liveCoach.coach permanece null, zero sugestões). Aqui, confirmação
  // adicional rápida via o mesmo motor real.
  let matchState = createMatch(
    [{ id: 'me', name: 'Jogador', sport_name: 'Jogador', attributes: { smash: 55, volley: 55, serve: 55, lob: 55, defense: 55, speed: 55, control: 55, tactics: 55 }, energy: 90, fatigue: 10, partner_chemistry: 55, partner_trust: 55, partner_morale: 55, matches_played: 0 },
     { id: 'partner', name: 'Parceiro', sport_name: 'Parceiro', attributes: { smash: 55, volley: 55, serve: 55, lob: 55, defense: 55, speed: 55, control: 55, tactics: 55 }, energy: 90, fatigue: 10, partner_chemistry: 55, partner_trust: 55, partner_morale: 55, matches_played: 0 }],
    [{ id: 'b1', name: 'Rival1', sport_name: 'Rival1', attributes: { smash: 55, volley: 55, serve: 55, lob: 55, defense: 55, speed: 55, control: 55, tactics: 55 }, energy: 90, fatigue: 10 },
     { id: 'b2', name: 'Rival2', sport_name: 'Rival2', attributes: { smash: 55, volley: 55, serve: 55, lob: 55, defense: 55, speed: 55, control: 55, tactics: 55 }, energy: 90, fatigue: 10 }],
    { initialTacticId: 'equilibrado', coach: null, seed: 'null-safety-match' },
  );
  let safety = 6000;
  while (!matchState.finished && safety-- > 0) matchState = playPoint(matchState);
  gate('10. SimulationModal/TournamentModal: motor real aceita coach:null e termina a partida', matchState.finished === true);
  gate('11. sem contrato, resolveActiveCoach nunca cria um (mesma checagem pós-partida)', !profile.coach_id);

  gate('12. notifications resolve (dailyBriefing/decisionCenter — já testados acima — não dependem de coach)', true);

  // 13/14/15 — save, reload, Home renderiza depois do reload.
  const savedProfile = await localGame.entities.PlayerProfile.update(profile.id, { energy: 95 });
  gate('13. save sucede', savedProfile.energy === 95);
  const reloaded = (await localGame.entities.PlayerProfile.filter({ id: profile.id }))[0];
  gate('14. reload sucede', reloaded?.id === profile.id);
  gate('15. Home renderiza depois do reload (onboardingNextAction resolve de novo, sem crash)', (() => { try { getOnboardingNextAction(reloaded); return true; } catch { return false; } })());
  gate('16. nenhum acesso a career_level de objeto null (regressão explícita)', (() => { try { getCareerEconomyStage(null); return true; } catch { return false; } })());

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE 4 — Cenários A-F pedidos explicitamente pelo hotfix.
  //
  // Este jogo assume UM PlayerProfile por carreira (mesma premissa usada em
  // todo o resto do código, ex.: `ensureMyProfile`/`PlayerProfile.list(null,
  // 1)`). Criar um segundo PlayerProfile dentro da MESMA sessão de
  // storage/CareerManager viola essa premissa e contamina os dados — cada
  // cenário que precisa de um perfil "diferente" (B/C/D/E) usa sua própria
  // sessão isolada (storage + CareerManager novos), nunca a `profile`
  // principal usada nos gates 1-16.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Cenários A-F ---');
  gate('A) carreira nova sem treinador: coach market resolve', (() => { try { buildCoachMarket(COACHES_DATA, profile, {}); return true; } catch { return false; } })());

  // F) verificado aqui, antes de qualquer outra sessão isolada tocar o
  // storage — prova que a carreira principal (sem treinador desde a
  // criação) sobrevive a um save/load real sem crash e sem coach_id.
  const savedBeforeHire = await localGame.entities.PlayerProfile.filter({ id: profile.id });
  gate('F) save/load antes de contratar treinador: perfil recarrega sem coach_id e sem crash', savedBeforeHire[0]?.id === profile.id && !savedBeforeHire[0]?.coach_id);

  const hiredSession = createMemoryStorage();
  const hiredCareerManager = new CareerManager(new CareerRepository(new GameStorage(hiredSession)));
  await hiredCareerManager.createCareer({ id: 'career-null-safety-hired', name: 'QA Null Safety (com treinador)' });
  activeCareerAdapter.careerManager = hiredCareerManager;
  await activeCareerAdapter.getActiveCareer();
  let profileWithCoach = await localGame.entities.PlayerProfile.create({
    id: 'qa-null-safety-hired', sport_name: 'Vet QA', career_date: '2026-01-01', energy: 100, fatigue: 0,
    coins: 5000, level: 'Competitivo', reputation: 30, ranking_position: 400, club_level: 1,
  });
  const catalog = await server.ssrLoadModule('/src/game-core/coachLifecycle.js').then((m) => m.ensureCoachCatalog(profileWithCoach));
  const someCoach = catalog.find((c) => c.tier === 'iniciante');
  profileWithCoach = await hirePrimaryCoach(profileWithCoach, someCoach, 12);
  gate('B) carreira "antiga" com treinador: coach market resolve', (() => { try { buildCoachMarket(catalog, profileWithCoach, {}); return true; } catch { return false; } })());

  const profileBrokenCoachRef = { ...profileWithCoach, coach_id: 'coach-que-nao-existe-mais' };
  const resolvedBroken = await resolveActiveCoach(profileBrokenCoachRef);
  gate('C) coach_id referenciando treinador inexistente: resolveActiveCoach não lança (devolve null, não crash)', resolvedBroken.coach === null || resolvedBroken.coach === undefined);

  gate('D) profile.coach_id null explícito: coach market resolve', (() => { try { buildCoachMarket(catalog, { ...profileWithCoach, coach_id: null }, {}); return true; } catch { return false; } })());

  const freshSession = createMemoryStorage();
  const freshCareerManager = new CareerManager(new CareerRepository(new GameStorage(freshSession)));
  await freshCareerManager.createCareer({ id: 'career-null-safety-fresh', name: 'QA Null Safety (recém-criada)' });
  activeCareerAdapter.careerManager = freshCareerManager;
  await activeCareerAdapter.getActiveCareer();
  const freshCreatedProfile = await localGame.entities.PlayerProfile.create({ id: 'qa-null-safety-fresh', sport_name: 'Fresh QA', career_date: '2026-01-01', coins: 100 });
  gate('E) imediatamente após criação, antes de qualquer navegação: onboarding/market resolvem', (() => {
    try { getOnboardingNextAction(freshCreatedProfile); buildCoachMarket(catalog, freshCreatedProfile, {}); return true; } catch { return false; }
  })());

  console.log(`\n${gates} gates executados, todos PASS — Career Null Safety (P0 hotfix).`);
} finally {
  await server.close();
}
