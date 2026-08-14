import assert from 'node:assert/strict';
import { createServer } from 'vite';

const clone = (value) => JSON.parse(JSON.stringify(value));

class FakeStorage {
  constructor({ writeDelay = 0 } = {}) { this.files = new Map(); this.writeDelay = writeDelay; }
  async initialize() {}
  async ensureDirectory() {}
  async readJsonIfExists(path, fallback = null) { return this.files.has(path) ? clone(this.files.get(path)) : fallback; }
  async writeJson(path, value) {
    if (this.writeDelay) await new Promise((resolve) => setTimeout(resolve, this.writeDelay));
    this.files.set(path, clone(value));
    return clone(value);
  }
  async remove(path) { return this.files.delete(path); }
  async exists(path) { return this.files.has(path); }
}

function athlete(id, name, energy = 100) {
  return {
    id, name, sport_name: name, energy, morale: 72, confidence: 72,
    serve: 68, forehand: 68, backhand: 68, volley: 68, bandeja: 68,
    smash: 68, defense: 68, agility: 68, strategy: 68, emotional_control: 68,
  };
}

function applyOperations(store, operations) {
  for (const operation of operations) {
    if (operation.type === 'playerUpdate') store.profile = { ...store.profile, ...clone(operation.data) };
    else store[operation.entityName].set(operation.id, { ...(store[operation.entityName].get(operation.id) || {}), ...clone(operation.data), id: operation.id });
  }
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });

try {
  const tournamentRunModule = await server.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const checkpointModule = await server.ssrLoadModule('/src/careers/MatchCheckpointRepository.js');
  const lifecycleModule = await server.ssrLoadModule('/src/game-core/tournamentMatchLifecycle.js');
  const matchModule = await server.ssrLoadModule('/src/engine/match/MatchEngine.js');
  const pressModule = await server.ssrLoadModule('/src/lib/pressData.js');
  const interviewModule = await server.ssrLoadModule('/src/lib/postMatchInterview.js');
  const coachModule = await server.ssrLoadModule('/src/engine/live-coach/index.js');
  const dayControllerModule = await server.ssrLoadModule('/src/game-core/dayAdvanceController.js');
  const rollbackModule = await server.ssrLoadModule('/src/game-core/careerAdvanceTransaction.js');

  const {
    completePreTournamentMeeting, completeRoundPreparation, createTournamentRun,
    getCurrentTournamentMatch, getTournamentRunPhase, recordTournamentMatchResult,
    startTournamentMatch, buildTournamentBracketHistory,
  } = tournamentRunModule;
  const { MatchCheckpointRepository } = checkpointModule;
  const {
    buildTournamentMatchCheckpoint, buildTournamentReturnRoute,
    buildTournamentRoundCoreOperations, inspectTournamentMatchCheckpoint,
  } = lifecycleModule;
  const { createMatch, playPoint } = matchModule;
  const { getPendingInterviews } = pressModule;
  const { postMatchInterviewIdentity } = interviewModule;
  const { LiveMatchAnalytics, PatternChangeDetector } = coachModule;
  const { createDayAdvanceController } = dayControllerModule;
  const { restoreCareerSnapshotOnFailure } = rollbackModule;

  const tournament = { id: 'los-angeles-cup', name: 'Los Angeles Cup', tier: 'Silver', start_date: '2026-02-05' };
  const profile = { ...athlete('player-1', 'zeh'), career_date: '2026-02-05', matches_played: 0, wins: 0, losses: 0 };
  const partner = athlete('partner-1', 'Facundo Benítez');
  const r16Opponents = [athlete('r16-a', 'Rival R16 A'), athlete('r16-b', 'Rival R16 B')];
  const qfOpponents = [athlete('qf-a', 'Sergio Lozano'), athlete('qf-b', 'Francesc Pellicer')];
  let run = createTournamentRun({
    tournament,
    profileId: profile.id,
    startDate: tournament.start_date,
    mainRounds: [{ label: 'R16', short: 'R16' }, { label: 'QF', short: 'QF' }],
    opponents: [{ members: r16Opponents, rank: 180 }, { members: qfOpponents, rank: 130 }],
    now: '2026-02-04T10:00:00.000Z',
  });
  run = completePreTournamentMeeting(run, 'balanced').run;
  run = startTournamentMatch(run, profile.career_date);
  const r16 = getCurrentTournamentMatch(run);
  const r16Engine = createMatch([profile, partner], r16Opponents, { seed: 'lifecycle-r16' });
  const storage = new FakeStorage({ writeDelay: 8 });
  const checkpoints = new MatchCheckpointRepository(storage);
  const r16Checkpoint = buildTournamentMatchCheckpoint({ tournament, match: r16, teamA: [profile, partner], teamB: r16Opponents, engineState: r16Engine });
  const pendingSave = checkpoints.save('career-lifecycle', r16Checkpoint);
  const pendingClear = checkpoints.clearIfMatch('career-lifecycle', r16.id);
  await Promise.all([pendingSave, pendingClear]);
  assert.equal(await checkpoints.read('career-lifecycle'), null, 'clear correu antes do save e o checkpoint R16 reapareceu');
  await checkpoints.save('career-lifecycle', r16Checkpoint);

  const transition = recordTournamentMatchResult(run, {
    matchId: r16.id, won: true, score: '6-4, 6-3', stats: { winners: 18, errors: 11 }, tournament,
    now: '2026-02-05T18:00:00.000Z',
  });
  run = transition.run;
  const qf = getCurrentTournamentMatch(run);
  const matchRecord = {
    id: r16.id, profile_id: profile.id, date: profile.career_date, played_date: profile.career_date,
    status: 'completed', match_type: 'tournament', competition_type: 'tournament', is_official: true,
    is_tournament: true, match_occurred: true, tournament_id: tournament.id, tournament_name: tournament.name,
    tournament_round: r16.round, tournament_outcome: 'advanced', result: 'vitória', winner: 'A', score: '6-4, 6-3',
    team_a: [profile.sport_name, partner.name], team_b: r16Opponents.map((player) => player.name), press_importance: 'medium',
  };
  const interview = postMatchInterviewIdentity(r16.id);
  const bracket = buildTournamentBracketHistory(run, `${profile.sport_name} & ${partner.name}`);
  const event = { id: 'event-la', metadata: {}, status: 'scheduled' };
  const mediaOperations = [{ type: 'upsert', entityName: 'CareerMessage', id: `message-${interview.id}`, data: { related_entity_type: 'PressInterview', related_entity_id: interview.id, metadata: { match_id: r16.id } } }];
  const operations = buildTournamentRoundCoreOperations({
    matchRecord,
    profileId: profile.id,
    playerPatch: { matches_played: 1, wins: 1 },
    event,
    eventPatch: { start_date: qf.date, end_date: qf.date, status: 'scheduled', requires_decision: true, metadata: { tournament_run: run, last_completed_match_id: r16.id } },
    tournament,
    tournamentPatch: { bracket_history: bracket, current_phase: run.status },
    mediaOperations,
  });
  const store = { profile: clone(profile), Match: new Map(), CalendarEvent: new Map([[event.id, event]]), Tournament: new Map([[tournament.id, tournament]]), CareerMessage: new Map() };
  applyOperations(store, operations);
  await checkpoints.clearIfMatch('career-lifecycle', r16.id);
  assert.equal(store.Match.get(r16.id).status, 'completed', 'resultado R16 não foi persistido');
  assert.equal(store.CalendarEvent.get(event.id).metadata.tournament_run.currentRound, 1, 'bracket não avançou para QF');
  assert.equal(store.CareerMessage.size, 1, 'entrevista não foi criada junto com o resultado');
  assert.equal(await checkpoints.read('career-lifecycle'), null, 'checkpoint R16 não foi encerrado após persistência');
  assert.equal(buildTournamentReturnRoute(tournament.id), '/tournaments?tournament=los-angeles-cup&mode=run', 'retorno da entrevista não aponta para o torneio');

  const updatedProfile = { ...store.profile, career_date: profile.career_date };
  const pendingInterview = getPendingInterviews(updatedProfile, [matchRecord], { calendarEvents: [], registrations: [], partnership: null });
  assert.equal(pendingInterview.length, 1, 'partida oficial não gerou uma única entrevista');
  const answeredSources = new Set([pendingInterview[0].sourceId]);
  assert.equal(pendingInterview.filter((item) => !answeredSources.has(item.sourceId)).length, 0, 'entrevista respondida reapareceu pendente');

  // Save/load antes e depois da entrevista preservam a mesma QF futura.
  const beforeInterviewReload = JSON.parse(JSON.stringify(run));
  const afterInterviewReload = JSON.parse(JSON.stringify(run));
  assert.equal(getCurrentTournamentMatch(beforeInterviewReload).id, qf.id);
  assert.equal(getCurrentTournamentMatch(afterInterviewReload).id, qf.id);
  run = completeRoundPreparation(afterInterviewReload, { keepPlan: true }).run;
  assert.equal(getTournamentRunPhase(run, profile.career_date), 'waiting', 'QF futura abriu cedo demais');

  const controller = createDayAdvanceController({
    advanceCore: async (current) => ({ ...current, career_date: qf.date }),
    processSecondary: async (current) => current,
  });
  const advancedProfile = await controller.run(updatedProfile);
  assert.equal(advancedProfile.career_date, qf.date, 'avanço de dia não alcançou a QF');
  assert.equal(getTournamentRunPhase(run, advancedProfile.career_date), 'playable', 'QF não foi habilitada na data correta');
  run = startTournamentMatch(run, advancedProfile.career_date);
  const qfPlaying = getCurrentTournamentMatch(run);
  const qfEngine = createMatch([advancedProfile, partner], qfOpponents, { seed: 'lifecycle-qf' });
  const qfCheckpoint = buildTournamentMatchCheckpoint({ tournament, match: qfPlaying, teamA: [advancedProfile, partner], teamB: qfOpponents, engineState: qfEngine });
  await checkpoints.save('career-lifecycle', qfCheckpoint);
  const qfPersisted = await checkpoints.read('career-lifecycle');
  assert.notEqual(qfPersisted.match_id, r16.id, 'QF reutilizou matchId da R16');
  assert.equal(qfPersisted.round, 'QF', 'checkpoint novo ficou com a rodada anterior');
  assert.deepEqual(qfPersisted.participant_ids.B, qfOpponents.map((player) => player.id), 'checkpoint novo reutilizou adversários da R16');
  assert.equal(qfPersisted.engine_state.pointNumber, 0, 'QF não começou com engine_state novo');
  assert.equal(inspectTournamentMatchCheckpoint(qfPersisted, { careerId: 'career-lifecycle', tournament, match: qfPlaying, teamA: [advancedProfile, partner], teamB: qfOpponents }).valid, true, 'checkpoint QF válido foi rejeitado');

  // Falha no avanço restaura todos os domínios do snapshot.
  const atomicStore = { career_id: 'atomic-career', player: { career_date: '2026-02-05', coins: 100 }, entities: { Tournament: [{ id: tournament.id, current_phase: 'between_rounds' }] } };
  const atomicSnapshot = clone(atomicStore);
  atomicStore.player.career_date = '2026-02-06';
  atomicStore.player.coins = 0;
  atomicStore.entities.Tournament[0].current_phase = 'playing';
  const rollback = await restoreCareerSnapshotOnFailure({ snapshot: atomicSnapshot, restore: async (snapshot) => Object.assign(atomicStore, clone(snapshot)) });
  assert.equal(rollback.rollbackApplied, true);
  assert.deepEqual(atomicStore, atomicSnapshot, 'falha de avanço deixou alteração parcial no snapshot');

  // Distribuição de alvos: várias seeds não podem repetir o antigo 100/0 sistemático.
  let targetA = 0;
  let targetB = 0;
  let seedsWithBothTargets = 0;
  for (let seed = 0; seed < 24; seed += 1) {
    let state = createMatch([athlete('a1', 'A1'), athlete('a2', 'A2')], [athlete('b1', 'B1'), athlete('b2', 'B2')], { seed: `target-seed-${seed}` });
    while (!state.finished && state.pointNumber < 24) state = playPoint(state);
    const targets = state.pointEvents.flatMap((point) => point.shots).filter((shot) => shot.team === 'B').map((shot) => shot.targetPlayerId);
    const first = targets.filter((id) => id === 'a1').length;
    const second = targets.filter((id) => id === 'a2').length;
    targetA += first;
    targetB += second;
    if (first > 0 && second > 0) seedsWithBothTargets += 1;
  }
  const targetShare = targetA / (targetA + targetB);
  assert(seedsWithBothTargets >= 22, `alvos não variaram normalmente (${seedsWithBothTargets}/24 seeds)`);
  assert(targetShare > 0.25 && targetShare < 0.75, `distribuição agregada artificial: ${(targetShare * 100).toFixed(1)}%`);

  const teams = { A: [{ id: 'a1', name: 'zeh', energy: 80 }, { id: 'a2', name: 'Facundo', energy: 80 }], B: [{ id: 'b1', name: 'Sergio', energy: 80 }, { id: 'b2', name: 'Francesc', energy: 80 }] };
  const score = (index) => ({ setsA: 0, setsB: 0, gamesA: Math.floor(index / 4), gamesB: 0, pointsA: index % 4, pointsB: 0 });
  const targetResult = (index, targetPlayerId) => ({ winnerTeamId: 'B', result: 'winner', shot: 'drive', rallyLength: 6, pressure: 45, finisher: { id: 'b1' }, rallyMemory: [{ team: 'B', playerId: 'b1', targetPlayerId, shot: 'drive' }] });
  const smallSample = new LiveMatchAnalytics();
  for (let index = 1; index <= 7; index += 1) smallSample.ingest({ pointNumber: index, result: targetResult(index, 'a1'), teams, scoreBefore: score(index - 1), scoreAfter: score(index), setNumber: 1 });
  assert(!new PatternChangeDetector().detect(smallSample, { teamId: 'A', coachLevel: 5, currentPoint: 7 }).some((item) => item.patternId === 'opponent_targeting_player'), 'técnico falou com amostra menor que 8');
  const meaningfulSample = new LiveMatchAnalytics();
  for (let index = 1; index <= 8; index += 1) meaningfulSample.ingest({ pointNumber: index, result: targetResult(index, index <= 6 ? 'a1' : 'a2'), teams, scoreBefore: score(index - 1), scoreAfter: score(index), setNumber: 1 });
  const targetPattern = new PatternChangeDetector().detect(meaningfulSample, { teamId: 'A', coachLevel: 5, currentPoint: 8 }).find((item) => item.patternId === 'opponent_targeting_player');
  assert.equal(targetPattern.sampleSize, 8, 'denominador do técnico não usa apenas ações recentes com alvo');
  assert.match(targetPattern.evidence, /zeh.*6 das últimas 8 ações/, 'orientação não usa nome/texto humano ou não reflete os eventos');

  console.log('TournamentMatchLifecycle: PASS');
  console.log('✓ R16 persistida, checkpoint encerrado e entrevista idempotente');
  console.log('✓ save/load, retorno ao torneio, avanço de dia e QF com checkpoint novo');
  console.log('✓ rollback integral e distribuição realista de alvos em 24 seeds');
} finally {
  await server.close();
}
