import assert from 'node:assert/strict';
import { createDefaultBalanceTeams } from '../src/engine/match/BalanceSimulator.js';
import { applyMatchTactic, createMatch, playPoint } from '../src/engine/match/MatchEngine.js';
import { getMatchTactic } from '../src/engine/match/MatchTactics.js';
import { ReplayPlayer } from '../src/gameplay/replay/ReplayPlayer.js';
import { resolveReplayScene } from '../src/gameplay/replay/ReplayScene.js';
import { validateReplay } from '../src/gameplay/replay/ReplayValidator.js';

const teams = createDefaultBalanceTeams();
function complete(tacticId, seed = `tactic-${tacticId}`) {
  let state = createMatch(teams.teamA, teams.teamB, { seed, replayEnabled: true, initialTacticId: tacticId });
  let safety = 3000;
  while (!state.finished && safety-- > 0) state = playPoint(state);
  assert(state.finished, `${tacticId} não concluiu a partida`);
  return state;
}

const original = complete('equilibrado', 'playback-contract');
assert(validateReplay(original.replay).valid, 'Replay completo inválido');
const initialScene = resolveReplayScene(original.replay, 0);
assert.equal(initialScene.players.length, 4, 'A visualização não contém quatro jogadores');
assert(initialScene.ball && Number.isFinite(initialScene.ball.x), 'Bola ausente');
const finalScene = resolveReplayScene(original.replay, original.replay.duration);
assert.deepEqual(finalScene.score.sets, [original.setsA, original.setsB], 'Placar visual divergiu do motor');

let clock = 0; let scheduled; let cancelled = false;
const player = new ReplayPlayer({ now: () => clock, requestFrame: callback => { scheduled = callback; return 1; }, cancelFrame: () => { cancelled = true; } });
player.load(original.replay);
for (const speed of [1, 2, 5, 10]) { player.setSpeed(speed); assert.equal(player.state.speed, speed); }
player.play(); clock += 100; scheduled(); player.pause(); assert(cancelled, 'Pausa não cancelou o frame');
player.seek(0); player.endGame(); assert(original.replay.events[player.state.currentEventIndex].t <= player.state.currentTime, 'Skip de game inválido');
player.seek(0); player.endSet(); const setTime = player.state.currentTime; assert(setTime > 0 && setTime < player.state.duration, 'Skip de set encerrou ou não avançou');
player.endMatch(); assert.equal(player.state.currentTime, player.state.duration, 'Skip de partida não alcançou o fim');
player.restart(); assert.equal(player.state.currentTime, 0, 'Restart não voltou ao início');
player.destroy();

let changed = createMatch(teams.teamA, teams.teamB, { seed: 'tactic-change', replayEnabled: true });
changed = applyMatchTactic(changed, 'agressivo');
assert.equal(changed.activeTactics.A.id, 'agressivo');
assert.equal(changed.tacticsTimeline[0].effectiveFromPoint, 1);
assert(changed.replay.events.some(event => event.type === 'tactic_changed'), 'Troca tática não entrou no replay');
assert.equal(getMatchTactic('inexistente').id, 'equilibrado', 'Tática inválida não teve fallback seguro');

function decisions(tacticId) {
  let state = createMatch(teams.teamA, teams.teamB, { seed: 'same-seed-tactics', initialTacticId: tacticId });
  for (let point = 0; point < 55 && !state.finished; point += 1) state = playPoint(state);
  const shots = state.stats.players?.flatMap?.(playerStats => playerStats.shots || []) || [];
  return { state, shots };
}
const behavior = Object.fromEntries(['equilibrado','agressivo','defensivo','potencia','tatico'].map(id => [id, decisions(id)]));
const signature = value => JSON.stringify(value.state.pointEvents.map(event => event.finalShotPlayerId));
assert(new Set(Object.values(behavior).map(signature)).size > 1, 'Táticas não alteraram decisões com a mesma seed');
const shotMetrics = Object.fromEntries(Object.entries(behavior).map(([id, value]) => {
  const shots = value.state.narration.flatMap(event => event.decisionTrace || []).filter(decision => decision.team === 'A').map(decision => decision.shot);
  const count = shot => shots.filter(value => value === shot).length;
  return [id, { total: shots.length, attacks: count('smash') + count('volley') + count('drive'), smash: count('smash'), lob: count('lob'), safe: count('lob') + count('bandeja') + count('backhand'), tactical: count('chiquita') + count('bandeja') + count('lob'), finalEnergy: Number((value.state.teams.A.reduce((sum, athlete) => sum + athlete.energy, 0) / 2).toFixed(1)) }];
}));
assert(shotMetrics.agressivo.attacks > shotMetrics.equilibrado.attacks, 'Agressivo não aumentou ataques');
assert(shotMetrics.defensivo.safe > shotMetrics.equilibrado.safe, 'Defensivo não aumentou golpes seguros');
assert(shotMetrics.potencia.smash > shotMetrics.equilibrado.smash, 'Potência não aumentou smashes');
assert(shotMetrics.tatico.tactical > shotMetrics.equilibrado.tactical, 'Tático não aumentou seleção tática');

console.log(JSON.stringify({
  ok: true,
  courtPlayers: initialScene.players.length,
  replayEvents: original.replay.events.length,
  finalScore: finalScene.score.sets,
  speeds: [1,2,5,10],
  skips: ['point','game','set','match'],
  tacticChangeRecorded: true,
  tacticDecisionSignatures: new Set(Object.values(behavior).map(signature)).size,
  shotMetrics,
}, null, 2));
