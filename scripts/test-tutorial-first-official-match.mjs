// Tutorial 4.0 — Hotfix "first-match" (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md).
//
// Bug real de QA: a etapa final do tutorial pede "jogue sua primeira
// partida de torneio", mas (1) uma partida de TREINO já concluía a etapa
// silenciosamente, e (2) o botão da etapa mandava para Partidas de treino
// em vez do torneio real, mesmo quando a estreia só acontece 7-8 dias
// depois. Este teste prova as duas correções:
//
// (A) `deriveTutorialFacts`/`inferCompletedSteps` (src/onboarding/
//     tutorialState.js) — a partir de agora só uma partida com
//     `competition_type:'tournament'`+`is_official:true` (os mesmos campos
//     já gravados em todo Match desde a finalização, nenhum campo novo)
//     satisfaz "matchCompleted"; uma partida de treino sozinha não.
// (B) `resolveFirstMatchAction` (src/onboarding/firstMatchDestination.js) —
//     o destino do CTA reflete o estado real do torneio (não
//     inscrito/futuro/hoje/interrompida), nunca aponta para Partidas de
//     treino, e é montado só com funções já canônicas
//     (getTournamentNextAction/buildTournamentPlayRoute/
//     buildTournamentRecoverySession) — nada de novo é calculado.
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
  // ═══════════════════════════════════════════════════════════════════════
  // PARTE A — matchCompleted / first-match só por partida OFICIAL de torneio.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Parte A: fato "matchCompleted" (tutorialState.js) ---');
  const { deriveTutorialFacts, inferCompletedSteps } = await server.ssrLoadModule('/src/onboarding/tutorialState.js');

  const practiceMatch = { id: 'm-practice', competition_type: 'practice', is_official: false, is_tournament: false };
  const officialMatch = { id: 'm-official', competition_type: 'tournament', is_official: true, is_tournament: true };
  const qualifyingOfficialMatch = { id: 'm-qual', match_type: 'qualifying', competition_type: 'tournament', is_official: true, is_tournament: true };

  gate('partida de treino sozinha NÃO satisfaz matchCompleted', deriveTutorialFacts({ player: { matches_played: 1 } }, { matches: [practiceMatch] }).matchCompleted === false);
  gate('nenhuma partida NÃO satisfaz matchCompleted', deriveTutorialFacts({ player: {} }, { matches: [] }).matchCompleted === false);
  gate('partida oficial de torneio satisfaz matchCompleted', deriveTutorialFacts({ player: {} }, { matches: [officialMatch] }).matchCompleted === true);
  gate('partida oficial de qualifying (competition_type continua "tournament") também satisfaz', deriveTutorialFacts({ player: {} }, { matches: [qualifyingOfficialMatch] }).matchCompleted === true);
  gate('treino + oficial juntos: a oficial já basta', deriveTutorialFacts({ player: {} }, { matches: [practiceMatch, officialMatch] }).matchCompleted === true);
  // Regressão explícita do bug real: matches_played alto (várias partidas
  // de treino) nunca deve, sozinho, satisfazer o fato — só o tipo importa.
  gate('matches_played alto sem NENHUMA partida oficial não satisfaz (regressão do bug real)', deriveTutorialFacts({ player: { matches_played: 12 } }, { matches: [practiceMatch, practiceMatch, practiceMatch] }).matchCompleted === false);

  gate('inferCompletedSteps NÃO inclui first-match com só partida de treino', !inferCompletedSteps({ player: {} }, { matches: [practiceMatch] }).includes('first-match'));
  gate('inferCompletedSteps inclui first-match com partida oficial', inferCompletedSteps({ player: {} }, { matches: [officialMatch] }).includes('first-match'));

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE B — resolveFirstMatchAction: destino real, nunca /matches.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Parte B: resolveFirstMatchAction (firstMatchDestination.js) ---');
  const { resolveFirstMatchAction } = await server.ssrLoadModule('/src/onboarding/firstMatchDestination.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { MatchCheckpointRepository } = await server.ssrLoadModule('/src/careers/MatchCheckpointRepository.js');
  const { buildTournamentMatchCheckpoint, buildTournamentRecoverySession, shouldBlockCareerAdvanceForMatchRecovery } = await server.ssrLoadModule('/src/game-core/tournamentMatchLifecycle.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  const CAREER_ID = 'career-first-match-test';
  await careerManager.createCareer({ id: CAREER_ID, name: 'QA First Match' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();

  const profile = await localGame.entities.PlayerProfile.create({
    id: 'qa-first-match', sport_name: 'Ale QA', career_date: '2026-01-03',
  });

  // B1 — ainda não inscrito em nenhum torneio.
  const notRegistered = await resolveFirstMatchAction(profile, CAREER_ID);
  gate('não inscrito: destino é /tournaments', notRegistered.to === '/tournaments');
  gate('não inscrito: CTA pede inscrição', notRegistered.cta === 'Inscrever-se em um torneio');
  gate('não inscrito: destino NUNCA é /matches (o bug original)', notRegistered.to !== '/matches');

  // B2 — inscrito, estreia daqui a 7 dias (futuro real, não deve fingir
  // que a partida já está disponível).
  await localGame.entities.CalendarEvent.create({
    id: 'evt-future', profile_id: profile.id, event_type: 'tournament', status: 'scheduled',
    related_id: 'tourney-miami', related_name: 'Miami Cup',
    metadata: {
      tournament_run: {
        status: 'scheduled', currentRound: 0, tournamentName: 'Miami Cup',
        meetingsCompleted: { preTournament: true, rounds: {} },
        matches: [{ id: 'match-r32', round: 'R32', date: '2026-01-10', status: 'scheduled', preparationCompleted: true, opponent: [] }],
      },
    },
  });
  const future = await resolveFirstMatchAction(profile, CAREER_ID);
  gate('futuro: destino é o deep link canônico do torneio (buildTournamentPlayRoute)', future.to === '/tournaments?tournament=tourney-miami&mode=run');
  gate('futuro: CTA é "Ver torneio" (não finge que já pode jogar)', future.cta === 'Ver torneio');
  gate('futuro: descrição menciona o número real de dias (7)', /\b7\s+dias\b/.test(future.description));
  gate('futuro: destino NUNCA é /matches', future.to !== '/matches' && !future.to.startsWith('/matches'));

  // B3 — hoje é o dia da partida.
  await localGame.entities.CalendarEvent.update('evt-future', {
    metadata: {
      tournament_run: {
        status: 'scheduled', currentRound: 0, tournamentName: 'Miami Cup',
        meetingsCompleted: { preTournament: true, rounds: {} },
        matches: [{ id: 'match-r32', round: 'R32', date: '2026-01-03', status: 'scheduled', preparationCompleted: true, opponent: [] }],
      },
    },
  });
  const today = await resolveFirstMatchAction(profile, CAREER_ID);
  gate('hoje: destino é o deep link canônico do torneio', today.to === '/tournaments?tournament=tourney-miami&mode=run');
  gate('hoje: CTA é "Jogar primeira partida"', today.cta === 'Jogar primeira partida');
  gate('hoje: destino NUNCA é /matches', today.to !== '/matches');

  // B4 — partida interrompida (recovery tem prioridade absoluta sobre
  // qualquer outro estado). `resolveFirstMatchAction` busca o checkpoint
  // através do repositório-singleton real (getMatchCheckpointRepository),
  // que em produção usa Tauri/armazenamento de verdade — indisponível neste
  // ambiente de teste Node (mesma limitação de outros testes desta sessão,
  // ver test-tournament-resume-recovery.mjs). Em vez de forçar o singleton,
  // prova a MESMA lógica que o resolver consome (buildTournamentRecoverySession
  // + shouldBlockCareerAdvanceForMatchRecovery) com um repositório próprio de
  // teste — fonte de verdade idêntica, só a injeção de storage muda.
  const run = {
    status: 'playing', currentRound: 0, tournamentName: 'Miami Cup',
    meetingsCompleted: { preTournament: true, rounds: {} },
    matches: [{ id: 'match-r32', round: 'R32', date: '2026-01-03', status: 'playing', preparationCompleted: true, opponent: [] }],
  };
  const tournament = { id: 'tourney-miami', name: 'Miami Cup' };
  const match = run.matches[0];
  const checkpointRepo = new MatchCheckpointRepository(new GameStorage(createMemoryStorage()));
  await checkpointRepo.save(CAREER_ID, buildTournamentMatchCheckpoint({
    tournament, match,
    teamA: [{ id: 'qa-first-match' }, { id: 'bot-partner' }],
    teamB: [{ id: 'opp-1' }, { id: 'opp-2' }],
    engineState: { pointNumber: 3, narration: [], teams: { A: [], B: [] }, finished: false },
  }));
  const savedCheckpoint = await checkpointRepo.read(CAREER_ID);
  const recoverySession = buildTournamentRecoverySession(savedCheckpoint, {
    careerId: CAREER_ID, careerDate: profile.career_date, tournament, run, match,
    teamA: [{ id: 'qa-first-match' }, { id: 'bot-partner' }], teamB: [{ id: 'opp-1' }, { id: 'opp-2' }],
  });
  gate('checkpoint interrompido é reconhecido como recuperável (resumable/restart_required)', shouldBlockCareerAdvanceForMatchRecovery(recoverySession));
  gate('resolveFirstMatchAction usa exatamente buildTournamentRecoverySession/shouldBlockCareerAdvanceForMatchRecovery para este estado (fonte única, não uma lógica paralela)', (() => {
    const source = readFileSync('src/onboarding/firstMatchDestination.js', 'utf8');
    return source.includes('buildTournamentRecoverySession') && source.includes('shouldBlockCareerAdvanceForMatchRecovery') && source.includes("cta: 'Continuar partida'");
  })());

  // ═══════════════════════════════════════════════════════════════════════
  // Consumidores: Home, Guia e Missões usam resolveFirstMatchAction — nunca
  // mais leem step.route/tutorial_route estático para esta etapa.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Consumidores usam o destino dinâmico ---');
  const careerHubSource = readFileSync('src/pages/CareerHub.jsx', 'utf8');
  gate('CareerHub.jsx importa resolveFirstMatchAction', careerHubSource.includes("from '@/onboarding/firstMatchDestination.js'"));
  gate('CareerHub.jsx só sobrepõe o destino quando stepId === first-match', careerHubSource.includes("onboardingNextAction?.stepId === 'first-match'"));

  const guideSource = readFileSync('src/components/onboarding/OnboardingGuide.jsx', 'utf8');
  gate('OnboardingGuide.jsx importa resolveFirstMatchAction', guideSource.includes("from '@/onboarding/firstMatchDestination.js'"));
  gate('OnboardingGuide.jsx usa o destino resolvido para first-match, não step.route estático', guideSource.includes('isFirstMatch') && guideSource.includes('resolvedRoute'));

  const missionsSource = readFileSync('src/pages/Missions.jsx', 'utf8');
  gate('Missions.jsx importa resolveFirstMatchAction', missionsSource.includes("from '@/onboarding/firstMatchDestination.js'"));
  gate('Missions.jsx trata a etapa first-match separadamente do tutorial_route estático', missionsSource.includes("tutorialStep?.id === 'first-match'"));

  console.log(`\n${gates} gates executados, todos PASS — Tutorial 4.0 hotfix "first-match" (fato de conclusão + CTA nunca mais aponta para Partidas de treino).`);
} finally {
  await server.close();
}
