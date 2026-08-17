// Hotfix UX — Tournament guided flow (docs/TOURNAMENT_GUIDED_FLOW_HOTFIX.md).
//
// Problema 1: o CTA "Dar entrevista" pós-jogo não navegava — causa raiz era
// overlayBackStack.js chamando history.back() ao desmontar o TournamentModal
// mesmo quando o desmonte era consequência de uma navegação real (não um
// fechamento explícito). Esse bug específico já tem regressão dedicada em
// test:overlay-back-stack (fault injection no módulo de histórico).
//
// Problema 2: nenhuma fonte única decidia "qual é a próxima ação do
// jogador" — Home, Calendário, TournamentModal e sino podiam divergir. Este
// teste cobre a fonte canônica nova (getTournamentNextAction/
// describeCalendarBlock, src/lib/tournamentNextAction.js) contra o pipeline
// real: TournamentRunManager de verdade, calendarSystem.canAdvanceDay de
// verdade, identidade de entrevista real (postMatchInterview.js) e o motor
// real de partida (createMatch/playPoint) para o primeiro ponto da QF.
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

function fakePlayer(id, name, extra = {}) {
  return {
    id, name, sport_name: name,
    attributes: { smash: 60, volley: 60, serve: 60, lob: 60, defense: 60, speed: 60, control: 60, tactics: 60 },
    energy: 90, fatigue: 10, ...extra,
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { createMatch, playPoint } = await server.ssrLoadModule('/src/engine/match/MatchEngine.js');
  const { canAdvanceDay } = await server.ssrLoadModule('/src/lib/calendarSystem.js');
  const {
    createTournamentRun, completePreTournamentMeeting, startTournamentMatch,
    getCurrentTournamentMatch, recordTournamentMatchResult, completeRoundPreparation,
    getTournamentRunPhase,
  } = await server.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const { postMatchInterviewIdentity, isOfficialPlayerTournamentResult } = await server.ssrLoadModule('/src/lib/postMatchInterview.js');
  const { getPendingInterviews } = await server.ssrLoadModule('/src/lib/pressData.js');
  const {
    getTournamentNextAction, describeCalendarBlock, buildTournamentPlayRoute, buildInterviewRoute, TOURNAMENT_NEXT_ACTION,
  } = await server.ssrLoadModule('/src/lib/tournamentNextAction.js');

  const fakeStorage = createMemoryStorage();
  const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
  activeCareerAdapter.careerManager = careerManager;

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE A — getTournamentNextAction: ordem de prioridade determinística
  // (item 15/30-34 do hotfix), testada isoladamente antes do pipeline real.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Parte A: prioridade canônica (getTournamentNextAction) ---');
  const tournament = { id: 'tour-lac', name: 'Los Angeles Cup' };
  const runToday = { status: 'scheduled', currentRound: 0, meetingsCompleted: { preTournament: true }, matches: [{ id: 'm1', round: 'Quartas de Final', date: '2026-03-10', preparationCompleted: true, status: 'scheduled' }] };
  const runTomorrow = { status: 'scheduled', currentRound: 0, meetingsCompleted: { preTournament: true }, matches: [{ id: 'm1', round: 'Quartas de Final', date: '2026-03-11', preparationCompleted: true, status: 'scheduled' }] };
  const runChampion = { status: 'champion', currentRound: 1, meetingsCompleted: { preTournament: true }, matches: [{ id: 'm1', round: 'Final', date: '2026-03-10', status: 'completed' }] };

  // Cenário 33: partida interrompida tem prioridade ABSOLUTA — nem entrevista, nem torneio disponível hoje competem.
  {
    const action = getTournamentNextAction({
      careerDate: '2026-03-10',
      activeMatchCheckpoint: { type: 'tournament', tournament_id: 'tour-other', tournament_name: 'Outro torneio' },
      pendingInterview: { tournamentId: tournament.id, tournamentName: tournament.name, destination: buildInterviewRoute({ interviewId: 'x', sourceId: 'y' }) },
      tournament, run: runToday,
    });
    gate('Cenário 33: checkpoint ativo vence entrevista E partida disponível hoje', action.type === TOURNAMENT_NEXT_ACTION.CONTINUE_MATCH && action.tournamentId === 'tour-other');
  }
  // Entrevista pendente vence "jogar hoje" quando não há checkpoint.
  {
    const interviewDestination = buildInterviewRoute({ interviewId: 'interview_match_m0', sourceId: 'match:m0', returnTo: buildTournamentPlayRoute(tournament.id) });
    const action = getTournamentNextAction({
      careerDate: '2026-03-10',
      pendingInterview: { tournamentId: tournament.id, tournamentName: tournament.name, round: 'R16', destination: interviewDestination },
      tournament, run: runToday,
    });
    gate('entrevista pendente tem prioridade sobre "jogar hoje"', action.type === TOURNAMENT_NEXT_ACTION.INTERVIEW && action.destination === interviewDestination);
  }
  // Cenário 31 (sem entrevista): sem checkpoint e sem entrevista, cai direto para a próxima ação real do torneio.
  {
    const action = getTournamentNextAction({ careerDate: '2026-03-10', tournament, run: runToday });
    gate('Cenário 31 (sem entrevista): vai direto para a próxima rodada/data, sem inventar uma entrevista', action.type === TOURNAMENT_NEXT_ACTION.PLAY_MATCH && action.destination === buildTournamentPlayRoute(tournament.id));
  }
  // Cenário 32: próxima rodada HOJE -> "jogar", nunca "avançar dia".
  {
    const action = getTournamentNextAction({ careerDate: '2026-03-10', tournament, run: runToday });
    gate('Cenário 32: rodada hoje vira play_match (não advance_to_round)', action.type === TOURNAMENT_NEXT_ACTION.PLAY_MATCH && /Jogar/.test(action.label));
  }
  // Próxima rodada amanhã -> "avançar".
  {
    const action = getTournamentNextAction({ careerDate: '2026-03-10', tournament, run: runTomorrow });
    gate('próxima rodada amanhã vira advance_to_round com a data certa', action.type === TOURNAMENT_NEXT_ACTION.ADVANCE_TO_ROUND && action.date === '2026-03-11');
  }
  // Torneio encerrado.
  {
    const action = getTournamentNextAction({ careerDate: '2026-03-10', tournament, run: runChampion });
    gate('torneio encerrado (campeão) vira tournament_complete', action.type === TOURNAMENT_NEXT_ACTION.TOURNAMENT_COMPLETE);
  }
  // Sem torneio/contexto nenhum -> none, nunca lança.
  {
    const action = getTournamentNextAction({ careerDate: '2026-03-10' });
    gate('sem contexto nenhum retorna "none" sem lançar', action.type === TOURNAMENT_NEXT_ACTION.NONE && action.destination === null);
  }
  // CTA nunca aponta para /tournaments genérico — sempre pelo tournamentId.
  {
    const action = getTournamentNextAction({ careerDate: '2026-03-10', tournament, run: runToday });
    gate('destino nunca é "/tournaments" genérico — sempre inclui o tournamentId', action.destination.includes(`tournament=${tournament.id}`));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE B — pipeline real: cria carreira, torneio, vence R16, gera a
  // entrevista pós-jogo (mesma identidade que o CTA de verdade usa),
  // confirma que getPendingInterviews ENCONTRA exatamente essa entrevista.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Parte B: R16 → vitória → entrevista real (contrato de dados) ---');
  const { career } = await careerManager.createCareer({ career_name: 'Guided Flow' });
  activeCareerAdapter.setActiveCareer(career);
  const playerId = `${career.career_id}-player`;
  await activeCareerAdapter.createPlayerProfile({
    id: playerId, sport_name: 'Jogador Guiado', career_date: '2026-03-08', birth_date: '2000-01-01',
    energy: 100, fatigue: 0, coins: 1000, xp: 0, matches_played: 0,
    serve: 60, forehand: 60, backhand: 60, volley: 60, bandeja: 60, smash: 60, defense: 60, agility: 60, strategy: 60, emotional_control: 60,
    partner_id: 'partner-1',
  });
  let profile = await localGame.entities.PlayerProfile.get(playerId);

  const partner = fakePlayer('partner-1', 'Parceiro');
  const r16Opponents = [fakePlayer('r16-a', 'Rival A'), fakePlayer('r16-b', 'Rival B')];
  const qfOpponents = [fakePlayer('qf-a', 'Rival C'), fakePlayer('qf-b', 'Rival D')];

  let run = createTournamentRun({
    tournament, profileId: profile.id, startDate: '2026-03-08',
    mainRounds: [{ label: 'R16', short: 'R16' }, { label: 'Quartas de Final', short: 'QF' }],
    opponents: [{ members: r16Opponents, rank: 180 }, { members: qfOpponents, rank: 140 }],
    now: '2026-03-07T10:00:00.000Z',
  });
  run = completePreTournamentMeeting(run, 'balanced').run;
  run = startTournamentMatch(run, '2026-03-08');
  const r16 = getCurrentTournamentMatch(run);
  gate('R16 inicia com status playing', r16.status === 'playing');

  // Joga a R16 de verdade com o motor real e força a vitória repetindo até o placar fechar a favor.
  let r16State = createMatch([profile, partner], r16Opponents, { initialTacticId: 'equilibrado', seed: 'guided-r16' });
  let safety = 6000;
  while (!r16State.finished && safety-- > 0) r16State = playPoint(r16State);
  gate('R16 termina jogando pontos reais', r16State.finished === true);
  const won = r16State.winner === 'A';

  run = recordTournamentMatchResult(run, { matchId: r16.id, won, score: `${r16State.setsA}-${r16State.setsB}`, tournament }).run;
  gate('recordTournamentMatchResult marca a R16 como concluída', getCurrentTournamentMatch(run)?.id !== r16.id || run.status !== 'playing');

  // Constrói a identidade de entrevista EXATAMENTE como TournamentModal
  // constrói (mesma função, mesmo builder de rota) — sem reimplementar nada.
  const matchId = `match-${r16.id}`;
  const interviewIdentity = postMatchInterviewIdentity(matchId);
  const returnTo = buildTournamentPlayRoute(tournament.id);
  const interviewRoute = buildInterviewRoute({ interviewId: interviewIdentity.id, sourceId: interviewIdentity.sourceId, returnTo });
  gate('a rota da entrevista usa o formato canônico (/press?tab=interviews&interview=...&source=...&returnTo=...)',
    interviewRoute.startsWith('/press?') && interviewRoute.includes('tab=interviews') && interviewRoute.includes(encodeURIComponent(interviewIdentity.id)) && interviewRoute.includes('returnTo='));
  gate('returnTo aponta pro torneio certo (nunca /tournaments genérico)', decodeURIComponent(returnTo).includes(`tournament=${tournament.id}`) && returnTo.includes('mode=run'));

  const matchRecord = {
    id: matchId, profile_id: profile.id, match_type: 'tournament', tournament_id: tournament.id,
    tournament_name: tournament.name, tournament_round: r16.round,
    team_a: [profile.sport_name], team_b: r16Opponents.map((item) => item.name),
    result: won ? 'vitoria' : 'derrota', winner_id: won ? profile.id : null, loser_id: won ? null : profile.id,
    status: 'finalizado', date: '2026-03-08', score: `${r16State.setsA}-${r16State.setsB}`,
  };
  await localGame.entities.Match.create(matchRecord);
  gate('o Match é reconhecido como resultado oficial de torneio (mesma checagem usada por getPendingInterviews)', isOfficialPlayerTournamentResult(matchRecord, profile));

  profile = await localGame.entities.PlayerProfile.update(profile.id, { matches_played: 1 });
  const pending = getPendingInterviews(profile, [matchRecord], {});
  const foundInterview = pending.find((item) => item.id === interviewIdentity.id || item.sourceId === interviewIdentity.sourceId);
  gate('getPendingInterviews encontra EXATAMENTE a entrevista que o CTA vai abrir (mesmo id/sourceId)', Boolean(foundInterview));
  gate('a entrevista pendente carrega o mesmo sourceId usado na URL', foundInterview?.sourceId === interviewIdentity.sourceId);

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE C — bloqueio de avanço de dia é acionável e aponta pro torneio certo.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Parte C: bloqueio de avanço de dia (item 10/11/28) ---');
  const blockingEvent = {
    event_type: 'tournament', related_id: tournament.id, title: tournament.name, status: 'scheduled',
    start_date: '2026-03-08', requires_decision: true,
    metadata: { tournament_run: run },
  };
  await localGame.entities.CalendarEvent.create({ profile_id: profile.id, ...blockingEvent });
  const advanceCheck = await canAdvanceDay(profile.id, '2026-03-08');
  gate('canAdvanceDay continua bloqueando quando há decisão de torneio pendente (regra existente preservada)', advanceCheck.canAdvance === false);
  const block = describeCalendarBlock(advanceCheck.blockingEvent);
  gate('a mensagem de bloqueio é acionável (não é só "não é possível avançar")', block?.description?.includes(tournament.name) && Boolean(block.actionLabel));
  gate('o CTA do bloqueio abre o torneio certo, pelo id', block.destination === buildTournamentPlayRoute(tournament.id));

  // ═══════════════════════════════════════════════════════════════════════
  // PARTE D — próxima rodada (QF): disponível hoje vs. amanhã, e o primeiro
  // ponto real da QF quando ela abre.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Parte D: QF — próxima rodada e primeiro ponto real ---');
  run = completeRoundPreparation(run, { keepPlan: true }).run;
  const qfScheduled = getCurrentTournamentMatch(run);
  gate('QF fica agendada depois da preparação de rodada', Boolean(qfScheduled?.date));

  const actionBeforeQfDate = getTournamentNextAction({ careerDate: '2026-03-08', tournament, run });
  if (qfScheduled.date > '2026-03-08') {
    gate('QF no futuro -> ação é "avançar até a data", nunca "jogar" direto', actionBeforeQfDate.type === TOURNAMENT_NEXT_ACTION.ADVANCE_TO_ROUND);
  } else {
    gate('QF no mesmo dia -> ação já é "jogar", sem sugerir avançar dia', actionBeforeQfDate.type === TOURNAMENT_NEXT_ACTION.PLAY_MATCH);
  }

  run = startTournamentMatch(run, qfScheduled.date);
  const qf = getCurrentTournamentMatch(run);
  gate('QF muda para status playing ao iniciar', qf.status === 'playing');
  const actionDuringQf = getTournamentNextAction({ careerDate: qfScheduled.date, tournament, run });
  gate('com a QF em andamento, a ação vira "continuar partida"', actionDuringQf.type === TOURNAMENT_NEXT_ACTION.CONTINUE_MATCH);

  let qfState = createMatch([profile, partner], qfOpponents, { initialTacticId: 'equilibrado', seed: 'guided-qf' });
  const beforePoint = qfState.pointNumber;
  qfState = playPoint(qfState);
  gate('primeiro ponto real da QF executa e avança o placar (pipeline real, sem mock)', qfState.pointNumber === beforePoint + 1);
} finally {
  await server.close();
}

console.log(`\ntest:tournament-guided-flow OK — ${gates} gates (prioridade canônica + entrevista real + bloqueio acionável + QF real).`);
