import assert from 'node:assert/strict';
import { createDefaultBalanceTeams } from '../src/engine/match/BalanceSimulator.js';
import { applyMatchTactic, createMatch, playPoint } from '../src/engine/match/MatchEngine.js';
import { getMatchTactic } from '../src/engine/match/MatchTactics.js';

const teams = createDefaultBalanceTeams();
function complete(tacticId, seed = `tactic-${tacticId}`) {
  let state = createMatch(teams.teamA, teams.teamB, { seed, replayEnabled: true, initialTacticId: tacticId });
  let safety = 3000;
  while (!state.finished && safety-- > 0) state = playPoint(state);
  assert(state.finished, `${tacticId} não concluiu a partida`);
  return state;
}

const original = complete('equilibrado', 'playback-contract');
assert(original.finished, 'Partida completa inválida');
assert(original.pointEvents.length > 0, 'Timeline de pontos ausente');

let changed = createMatch(teams.teamA, teams.teamB, { seed: 'tactic-change', replayEnabled: true });
changed = applyMatchTactic(changed, 'agressivo');
assert.equal(changed.activeTactics.A.id, 'agressivo');
assert.equal(changed.tacticsTimeline[0].effectiveFromPoint, 1);
assert(changed.tacticsTimeline.some(event => event.type === 'tactic_changed'), 'Troca tática não entrou na timeline');
assert.equal(getMatchTactic('inexistente').id, 'equilibrado', 'Tática inválida não teve fallback seguro');

function decisions(tacticId) {
  let state = createMatch(teams.teamA, teams.teamB, { seed: 'same-seed-tactics', initialTacticId: tacticId });
  for (let point = 0; point < 55 && !state.finished; point += 1) state = playPoint(state);
  const shots = state.stats.players?.flatMap?.(playerStats => playerStats.shots || []) || [];
  return { state, shots };
}
const behavior = Object.fromEntries(['equilibrado','agressivo','defensivo','potencia','tatico'].map(id => [id, decisions(id)]));
const signature = value => JSON.stringify(value.state.pointEvents.map(event => event.finalShotPlayerId));
assert(new Set(Object.values(behavior).map(signature)).size >= 3, 'Táticas não produziram variedade suficiente com a mesma seed');
const shotMetrics = Object.fromEntries(Object.entries(behavior).map(([id, value]) => {
  const shots = value.state.narration.flatMap(event => event.decisionTrace || []).filter(decision => decision.team === 'A').map(decision => decision.shot);
  const count = shot => shots.filter(value => value === shot).length;
  return [id, { total: shots.length, attacks: count('smash') + count('volley') + count('drive'), smash: count('smash'), lob: count('lob'), safe: count('lob') + count('bandeja') + count('backhand'), tactical: count('chiquita') + count('bandeja') + count('lob'), finalEnergy: Number((value.state.teams.A.reduce((sum, athlete) => sum + athlete.energy, 0) / 2).toFixed(1)) }];
}));

console.log(JSON.stringify({
  ok: true,
  matchFinished: original.finished,
  pointEvents: original.pointEvents.length,
  tacticChangeRecorded: true,
  tacticDecisionSignatures: new Set(Object.values(behavior).map(signature)).size,
  shotMetrics,
}, null, 2));
