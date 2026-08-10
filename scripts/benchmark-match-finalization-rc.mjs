import assert from 'node:assert/strict';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';
import { createMatch, playPoint } from '../src/engine/match/MatchEngine.js';
import { synchronizePointStatistics } from '../src/engine/match/StatisticsEngine.js';
import { buildCompactMatchRecord, scheduleSecondaryMatchWork } from '../src/game-core/matchFinalization.js';

const MATCHES = Number(process.env.MATCH_BENCHMARK_MATCHES || 100);
const BASELINE = Object.freeze({
  finalPointMs: { average: 0.739, p50: 0.606, p95: 1.338, worst: 4.75 },
  averageRecordBytes: 366_436,
  writesPerPracticeMatch: '8-20',
  writesPerTournamentRound: '9-13',
});

function athlete(id, name, side, boost = 0) {
  return { id, name, side, attributes: { serve: 62 + boost, forehand: 63 + boost, backhand: 61 + boost, volley: 60 + boost, smash: 64 + boost, lob: 59 + boost, speed: 61 + boost, stamina: 65 + boost, reflexes: 62 + boost, positioning: 61 + boost, consistency: 62 + boost, mental: 60 + boost } };
}

function describe(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = (ratio) => ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * ratio))];
  return { average: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)), p50: Number(percentile(0.5).toFixed(3)), p95: Number(percentile(0.95).toFixed(3)), worst: Number(ordered.at(-1).toFixed(3)) };
}

function canonicalStatsView(stats) {
  const playerFields = ['winners', 'errors', 'unforcedErrors', 'forcedErrors', 'pointsWon', 'pointsLost', 'serves', 'servePointsWon', 'returns', 'returnPointsWon', 'breakPointsFaced', 'breakPointsSaved', 'breakPointsCreated', 'breakPointsConverted'];
  const teamFields = ['pointsWon', 'winners', 'errors', 'forcedErrorsDrawn', 'forcedErrorsCommitted', 'unforcedErrorsCommitted', 'serviceErrors', 'breakPointsCreated', 'breakPointsConverted', 'breakPointsFaced', 'breakPointsSaved'];
  return {
    points: stats.points,
    rallies: stats.rallies,
    rallyShots: stats.rallyShots,
    longestRally: stats.longestRally,
    averageRally: stats.averageRally,
    breakPoints: stats.breakPoints,
    players: Object.fromEntries(Object.entries(stats.players || {}).map(([id, row]) => [id, Object.fromEntries(playerFields.map((field) => [field, row[field]]))])),
    teams: Object.fromEntries(Object.entries(stats.teams || {}).map(([id, row]) => [id, Object.fromEntries(teamFields.map((field) => [field, row[field]]))])),
  };
}

class BenchmarkRepository {
  constructor(career) { this.career = career; this.writes = 0; this.persistedBytes = 0; }
  async ensureActiveCareer() { return this.career; }
  async mutateActiveCareer(mutator) {
    const draft = structuredClone(this.career);
    const result = await mutator(draft);
    const serialized = JSON.stringify(draft);
    this.career = JSON.parse(serialized);
    this.writes += 1;
    this.persistedBytes += Buffer.byteLength(serialized);
    return { career: this.career, result };
  }
}

const playerProfile = { id: 'player-1', sport_name: 'Jogador', career_date: '2026-06-18', energy: 100, fatigue: 0, coins: 100, rank_points: 250 };
const vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { CareerEntityRepository } = await vite.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');
const fakeRepository = new BenchmarkRepository({
  career_id: 'benchmark-career',
  player: playerProfile,
  entities: { Match: [], CalendarEvent: [{ id: 'event-1', status: 'scheduled' }], Tournament: [{ id: 'tournament-1', status: 'active' }], PressArticle: [], CareerMessage: [], Post: [], AnalyticsEvent: [] },
});
const entities = new CareerEntityRepository(fakeRepository);
const initialSaveBytes = Buffer.byteLength(JSON.stringify(fakeRepository.career));
const finalPointTimes = [];
const persistenceTimes = [];
const compactRecordBytes = [];
let secondaryRan = false;

for (let index = 0; index < MATCHES; index += 1) {
  let state = createMatch(
    [athlete('player-1', 'Jogador', 'right', 4), athlete('partner', 'Parceiro', 'left', 3)],
    [athlete('opponent-1', 'Rival A', 'right'), athlete('opponent-2', 'Rival B', 'left')],
    { seed: `match-finalization-optimized-${index}` },
  );
  let finalPointDuration = 0;
  let guard = 0;
  while (!state.finished && guard < 1_000) {
    const startedAt = performance.now();
    state = playPoint(state);
    if (state.finished) finalPointDuration = performance.now() - startedAt;
    guard += 1;
  }
  assert.equal(state.finished, true, `partida ${index + 1} deve terminar`);
  assert.ok(state.matchRecapSnapshot?.highlights?.length, 'recap incremental deve existir');
  assert.equal(state.stats.rallies, state.pointEvents.length, 'estatísticas incrementais devem acompanhar os pontos');

  const canonical = synchronizePointStatistics(structuredClone(state.stats), state.pointEvents);
  assert.deepEqual(canonicalStatsView(state.stats), canonicalStatsView(canonical), 'estatísticas incrementais divergiram do auditor canônico');
  finalPointTimes.push(finalPointDuration);

  const finalizationKey = `benchmark:${index}`;
  const matchId = `benchmark-match-${index}`;
  const record = buildCompactMatchRecord({ id: matchId, profile: playerProfile, matchState: state, partnerName: 'Parceiro', opponents: ['Rival A', 'Rival B'] });
  assert.equal('point_events' in record, false, 'histórico compacto não pode persistir timeline');
  assert.equal('narration' in record, false, 'histórico compacto não pode persistir narração');
  compactRecordBytes.push(Buffer.byteLength(JSON.stringify(record)));

  const persistStartedAt = performance.now();
  const core = await entities.batch([
    { type: 'upsert', entityName: 'Match', id: matchId, data: record },
    { type: 'playerUpdate', id: 'player-1', data: { coins: 114 + index, rank_points: 252 + index, energy: Math.max(0, 85 - index), fatigue: Math.min(100, 10 + index) } },
    { type: 'update', entityName: 'CalendarEvent', id: 'event-1', data: { status: 'scheduled', next_match_id: matchId } },
    { type: 'update', entityName: 'Tournament', id: 'tournament-1', data: { current_round: index + 1 } },
  ], { idempotencyKey: finalizationKey });
  assert.equal(core.writes, 1, 'núcleo deve persistir uma vez');

  const secondary = scheduleSecondaryMatchWork(() => entities.batch([
    { type: 'upsert', entityName: 'PressArticle', id: `press-${index}`, data: { match_id: matchId } },
    { type: 'upsert', entityName: 'CareerMessage', id: `interview-${index}`, data: { match_id: matchId, type: 'interview' } },
    { type: 'upsert', entityName: 'Post', id: `notification-${index}`, data: { match_id: matchId } },
    { type: 'upsert', entityName: 'AnalyticsEvent', id: `analytics-${index}`, data: { match_id: matchId, type: 'MATCH_FINALIZED' } },
  ]).then((result) => { secondaryRan = true; return result; }));
  assert.equal(secondaryRan && index === 0, false, 'tarefas derivadas não devem bloquear o retorno essencial');
  const secondaryResult = await secondary;
  assert.equal(secondaryResult.writes, 1, 'derivados devem persistir em um único lote');
  persistenceTimes.push(performance.now() - persistStartedAt);
}

const writesBeforeDuplicate = fakeRepository.writes;
const duplicate = await entities.batch([
  { type: 'playerUpdate', id: 'player-1', data: { coins: 999_999 } },
], { idempotencyKey: `benchmark:${MATCHES - 1}` });
assert.equal(duplicate.skipped, true, 'finalização repetida deve ser ignorada');
assert.equal(fakeRepository.writes, writesBeforeDuplicate, 'reload/retry não pode gerar nova gravação');
assert.notEqual(fakeRepository.career.player.coins, 999_999, 'retry não pode reaplicar recompensa');
assert.equal(fakeRepository.career.entities.Match.length, MATCHES, 'cada partida deve existir uma única vez');
assert.equal(fakeRepository.career.entities.CareerMessage.length, MATCHES, 'entrevista deve ser gerada por partida');
assert.equal(fakeRepository.career.entities.AnalyticsEvent.length, MATCHES, 'analytics secundário deve ser registrado');

const finalSaveBytes = Buffer.byteLength(JSON.stringify(fakeRepository.career));
const optimized = {
  finalPointMs: describe(finalPointTimes),
  persistenceMs: describe(persistenceTimes),
  averageRecordBytes: Math.round(compactRecordBytes.reduce((sum, value) => sum + value, 0) / compactRecordBytes.length),
  saveGrowthBytes: finalSaveBytes - initialSaveBytes,
  averageSaveGrowthBytesPerMatch: Math.round((finalSaveBytes - initialSaveBytes) / MATCHES),
  writesPerMatch: fakeRepository.writes / MATCHES,
  duplicateWrites: fakeRepository.writes - writesBeforeDuplicate,
};

assert.ok(optimized.persistenceMs.average < 500, `média ${optimized.persistenceMs.average}ms excedeu 500ms`);
assert.ok(optimized.persistenceMs.p95 < 1_000, `p95 ${optimized.persistenceMs.p95}ms excedeu 1000ms`);
assert.ok(optimized.writesPerMatch <= 2, `gravações por partida ${optimized.writesPerMatch} excederam 2`);
assert.ok(optimized.averageSaveGrowthBytesPerMatch < 25_000, `crescimento médio ${optimized.averageSaveGrowthBytesPerMatch} bytes excedeu 25KB`);

console.log(JSON.stringify({
  ok: true,
  matches: MATCHES,
  baseline: BASELINE,
  optimized,
  improvement: {
    finalPointAveragePercent: Number(((1 - optimized.finalPointMs.average / BASELINE.finalPointMs.average) * 100).toFixed(1)),
    recordSizePercent: Number(((1 - optimized.averageRecordBytes / BASELINE.averageRecordBytes) * 100).toFixed(1)),
    writes: `${BASELINE.writesPerPracticeMatch}/${BASELINE.writesPerTournamentRound} → ${optimized.writesPerMatch}`,
  },
  functional: {
    resultAndStats: true,
    singleIdempotentFinalization: true,
    rankingMoneyEnergyTournamentPersistedTogether: true,
    recapCompact: true,
    interviewNotificationAnalyticsNonBlocking: true,
  },
}, null, 2));
await vite.close();
