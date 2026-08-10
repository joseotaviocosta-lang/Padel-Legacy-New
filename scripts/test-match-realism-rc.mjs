import assert from 'node:assert/strict';
import { createDefaultBalanceTeams } from '../src/engine/match/BalanceSimulator.js';
import { applyMatchTactic, createMatch, decideLiveCoachSuggestion, formatPoints, playPoint } from '../src/engine/match/MatchEngine.js';
import { getPointContext, POINT_OUTCOMES } from '../src/engine/match/PointContext.js';
import { buildMatchRecap } from '../src/lib/matchExperience.js';

const normal = (overrides = {}) => ({ pointsA: 0, pointsB: 0, gamesA: 0, gamesB: 0, setsA: 0, setsB: 0, servingTeam: 'A', inTiebreak: false, superTiebreak: false, ...overrides });
assert.equal(getPointContext(normal({ pointsA: 3, pointsB: 3 }), 'A').isBreakPoint, false, 'Deuce não pode ser break point');
assert.equal(getPointContext(normal({ pointsA: 3, pointsB: 4 }), 'A').breakPointTeam, 'B', 'Vantagem do recebedor deve ser break point');
assert.equal(getPointContext(normal({ pointsA: 4, pointsB: 3 }), 'A').isBreakPoint, false, 'Vantagem do sacador não pode ser break point');
assert.equal(getPointContext(normal({ pointsA: 3, pointsB: 0 }), 'A').isBreakPoint, false, '40-0 do sacador não pode ser break point');
assert.equal(getPointContext(normal({ pointsA: 0, pointsB: 3 }), 'A').isBreakPoint, true, '0-40 deve gerar oportunidade de break');
assert.equal(getPointContext(normal({ pointsA: 6, pointsB: 5, inTiebreak: true }), 'A').isBreakPoint, false, 'Tie-break não possui break point');
assert.equal(getPointContext(normal({ pointsA: 6, pointsB: 5, inTiebreak: true, setsA: 1 }), 'A').isMatchPoint, true, '6-5 no tie-break com um set deve ser match point');
assert.deepEqual(formatPoints(normal({ pointsA: 3, pointsB: 3 })), { a: '40', b: '40' });
assert.deepEqual(formatPoints(normal({ pointsA: 4, pointsB: 3 })), { a: 'AD', b: '40' });

const allowedOutcomes = new Set(Object.values(POINT_OUTCOMES));
const allowedPositions = new Set(['NET', 'TRANSITION', 'BASELINE']);
const allowedContexts = new Set(['NET_ATTACK', 'BASELINE_ATTACK', 'DEFENSE', 'COUNTER_ATTACK']);
const exactBreakPoint = (event) => {
  if (event.scoreBefore.inTiebreak) return false;
  const receiving = event.servingTeamId === 'A' ? 'B' : 'A';
  const receiverPoints = receiving === 'A' ? event.scoreBefore.pointsA : event.scoreBefore.pointsB;
  const serverPoints = receiving === 'A' ? event.scoreBefore.pointsB : event.scoreBefore.pointsA;
  return receiverPoints >= 3 && receiverPoints > serverPoints;
};

const teams = createDefaultBalanceTeams();
let state = createMatch(teams.teamA, teams.teamB, {
  seed: 'match-realism-contract',
  coach: { id: 'rc-coach', level: 4, specialty: 'estratega' },
  liveCoachSettings: { suggestionFrequency: 'normal' },
});
const initialPlan = JSON.stringify(state.activeTactics.A);
let acceptedSuggestion = false;
let safety = 5000;
while (!state.finished && safety-- > 0) {
  state = playPoint(state);
  if (state.liveCoach.pendingSuggestion && !acceptedSuggestion) {
    state = decideLiveCoachSuggestion(state, 'apply');
    acceptedSuggestion = true;
  } else if (state.liveCoach.pendingSuggestion) state = decideLiveCoachSuggestion(state, 'ignore');
}
assert(state.finished, 'Partida de contrato não terminou');
assert.equal(state.pointEvents.length, state.stats.rallies, 'Cada ponto deve ser contabilizado uma única vez');
assert(state.pointEvents.every((event) => allowedOutcomes.has(event.outcome)), 'Outcome fora da taxonomia canônica');
assert(state.pointEvents.every((event) => allowedPositions.has(event.winnerPosition)), 'Posição vencedora inválida');
assert(state.pointEvents.every((event) => allowedContexts.has(event.pointEndingContext)), 'Contexto final inválido');
assert(state.pointEvents.every((event) => event.isBreakPoint === exactBreakPoint(event)), 'Break point divergiu do placar pré-ponto');
assert(state.pointEvents.filter((event) => event.isBreakPoint).every((event) => event.breakPointConverted !== event.breakPointSaved), 'Break point deve ser convertido ou salvo, exclusivamente');

for (const team of ['A', 'B']) {
  const eventsWon = state.pointEvents.filter((event) => event.winnerTeamId === team);
  const eventsLost = state.pointEvents.filter((event) => event.loserTeamId === team);
  const row = state.stats.teams[team];
  assert.equal(row.pointsWon, eventsWon.length, `Pontos da equipe ${team} divergiram dos eventos`);
  assert.equal(row.winners, eventsWon.filter((event) => event.outcome === 'WINNER').length);
  assert.equal(row.forcedErrorsDrawn, eventsWon.filter((event) => event.outcome === 'FORCED_ERROR').length);
  assert.equal(row.unforcedErrorsCommitted, eventsLost.filter((event) => !['WINNER', 'FORCED_ERROR'].includes(event.outcome)).length);
  assert.equal(row.breakPointsCreated, state.pointEvents.filter((event) => event.breakPointTeam === team).length);
  assert.equal(row.breakPointsConverted + state.stats.teams[team === 'A' ? 'B' : 'A'].breakPointsSaved, row.breakPointsCreated);
}

const totalShots = Object.values(state.stats.players).reduce((sum, player) => sum + Object.values(player.shots).reduce((shotSum, count) => shotSum + count, 0), 0);
assert.equal(totalShots, state.stats.rallyShots, 'Tentativas por golpe devem fechar com os golpes dos rallies');
assert(acceptedSuggestion, 'Cenário não gerou sugestão de treinador');
assert.notEqual(JSON.stringify(state.activeTactics.A), initialPlan, 'Sugestão aceita não alterou a tática real');
assert(state.liveCoach.decisions.some((decision) => decision.accepted && decision.reason && decision.scoreBefore), 'Decisão aceita sem motivo ou placar');
assert(state.liveCoachReport.impactEvaluations.length > 0, 'Relatório antes/depois do treinador ausente');

const suggestionsByPattern = Object.groupBy(state.liveCoach.suggestions, (suggestion) => suggestion.patternId);
Object.values(suggestionsByPattern).forEach((suggestions) => {
  for (let index = 1; index < suggestions.length; index += 1) {
    assert(suggestions[index].createdAtGame - suggestions[index - 1].createdAtGame >= 2, 'Cooldown de padrão menor que dois games');
  }
});
assert(state.liveCoach.suggestions.every((suggestion) => suggestion.confidenceScore >= 0.5), 'Alerta abaixo do limiar de confiança');

const recap = buildMatchRecap(state);
assert(recap.stats.A.forcedErrorsDrawn >= 0 && recap.stats.A.unforcedErrors >= 0 && recap.stats.A.netPointWinShare >= 0, 'Recap não separou os indicadores');
assert(Array.isArray(recap.shotImpact.A) && recap.shotImpact.A.some((row) => row.attempts > 0), 'Análise por golpe ausente');

let tacticState = createMatch(teams.teamA, teams.teamB, { seed: 'tactic-real-effect' });
tacticState = applyMatchTactic(tacticState, 'agressivo');
assert.equal(tacticState.activeTactics.A.attackWeight, 1.28, 'Ajuste tático não alcançou o motor de decisão');

console.log(JSON.stringify({
  ok: true,
  points: state.pointEvents.length,
  breakPoints: state.pointEvents.filter((event) => event.isBreakPoint).length,
  outcomes: Object.fromEntries([...allowedOutcomes].map((outcome) => [outcome, state.pointEvents.filter((event) => event.outcome === outcome).length])),
  coachSuggestions: state.liveCoach.suggestions.length,
  coachImpactEvaluations: state.liveCoachReport.impactEvaluations.length,
}, null, 2));

