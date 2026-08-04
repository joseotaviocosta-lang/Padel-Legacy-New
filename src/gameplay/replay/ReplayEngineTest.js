import { createMatch, playPoint, MATCH_TACTICS } from '../../engine/match/MatchEngine.js';
import { ReplayPlayer } from './ReplayPlayer.js';
import { ReplayStorage } from './ReplayStorage.js';
import { validateReplay } from './ReplayValidator.js';
import { sampleReplay } from './fixtures/sampleReplay.js';

const athlete = (id, name, level) => ({ id, sport_name: name, energy: 100, morale: 70, serve: level, forehand: level, backhand: level, volley: level, bandeja: level, smash: level, defense: level, agility: level, strategy: level, emotional_control: level });
function simulate(seed) {
  let state = createMatch([athlete('a1', 'Ana', 72), athlete('a2', 'Bia', 69)], [athlete('b1', 'Clara', 70), athlete('b2', 'Dora', 68)], { seed, replayEnabled: true });
  let safety = 5000; while (!state.finished && safety-- > 0) state = playPoint(state, MATCH_TACTICS[0]);
  if (!state.finished) throw new Error('Partida de teste excedeu o limite.'); return state;
}

export async function runReplayEngineTest() {
  const schemaValid = validateReplay(sampleReplay).valid;
  const invalid = structuredClone(sampleReplay); invalid.events[5].actor_id = 'player-x';
  const invalidActor = validateReplay(invalid).errors.some((item) => item.code === 'INVALID_ACTOR');
  const first = simulate('replay-foundation-test'); const second = simulate('replay-foundation-test');
  const deterministic = JSON.stringify(first.replay) === JSON.stringify(second.replay);
  let clock = 0; const player = new ReplayPlayer({ now: () => clock, requestFrame: () => 1, cancelFrame: () => {} }); player.load(sampleReplay); player.play(); player.pause(); player.seek(1000); player.setSpeed(2); player.stepForward(); const stepped = player.state.currentTime > 1000; player.restart(); const playerValid = player.state.currentTime === 0 && player.state.speed === 2 && stepped;
  const exported = ReplayStorage.export(sampleReplay); const imported = ReplayStorage.import(exported); const exportImportEqual = JSON.stringify(imported) === JSON.stringify(sampleReplay);
  const renderable = sampleReplay.teams.flatMap((team) => team.players).length === 4 && sampleReplay.events.some((event) => event.type === 'ball_move') && sampleReplay.events.some((event) => event.type === 'score_update') && sampleReplay.events.some((event) => event.type === 'point_end');
  const largeReplay = structuredClone(sampleReplay); largeReplay.events = Array.from({ length: 2000 }, (_, index) => ({ ...sampleReplay.events[index % sampleReplay.events.length], id: `perf-${index}`, t: index * 10 })); largeReplay.events[0].type = 'match_start'; largeReplay.events[1999].type = 'match_end'; const performanceStart = performance.now(); const performanceValid = validateReplay(largeReplay).valid && performance.now() - performanceStart < 250;
  const ok = schemaValid && invalidActor && deterministic && playerValid && exportImportEqual && renderable && performanceValid && first.replay.events.at(-1)?.data?.winner === first.winner;
  return { ok, schemaValid, invalidActor, deterministic, playerValid, renderable, performanceValid, events: sampleReplay.events.length, durationMs: sampleReplay.duration, exportImportEqual };
}
