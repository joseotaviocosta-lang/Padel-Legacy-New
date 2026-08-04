import { DEFAULT_DURATIONS, COURT, REPLAY_VERSION, normalizePosition, scoreSnapshot } from './ReplaySchema.js';
import { validateReplay } from './ReplayValidator.js';
import { hashSeed } from '../../engine/match/random.js';

const pad = (number, width = 4) => String(number).padStart(width, '0');
const initialPositions = { A: [{ x: .3, y: .8 }, { x: .7, y: .8 }], B: [{ x: .3, y: .2 }, { x: .7, y: .2 }] };

export class ReplayRecorder {
  constructor(replay) { this.replay = replay; this.time = replay.events.reduce((end, event) => Math.max(end, event.t + event.duration), 0); }
  record(input) {
    const flight = input.type === 'ball_move' ? ({ lob: 900, smash: 240, volley: 280, serve: 550 }[input.data?.trajectory] ?? null) : null;
    const duration = input.duration ?? flight ?? DEFAULT_DURATIONS[input.type] ?? 250;
    const event = { id: `evt-${pad(this.replay.events.length + 1)}`, type: input.type, rally_id: input.rally_id ?? null, point_id: input.point_id ?? null, t: this.time, duration, actor_id: input.actor_id ?? null, data: input.data || {} };
    this.replay.events.push(event); this.time += duration; return event;
  }
  finish() { this.replay.duration = this.time; const result = validateReplay(this.replay); if (!result.valid) throw new Error(`Replay inválido: ${result.errors.map((item) => item.code).join(', ')}`); return this.replay; }
}

export function createReplay(state) {
  const token = hashSeed(state.seed);
  const teams = ['A', 'B'].map((key) => ({ id: `team-${key.toLowerCase()}`, side: key === 'A' ? 'bottom' : 'top', players: state.teams[key].map((player, index) => ({ id: player.id, name: player.name, court_side: index ? 'left' : 'right', initial_position: initialPositions[key][index] })) }));
  const replay = { replay_version: REPLAY_VERSION, engine_version: state.engineVersion, replay_id: `replay-${token}`, match_id: `match-${token}`, seed: state.seed, created_at: new Date(token * 1000).toISOString(), coordinate_space: 'normalized', court: { width: COURT.width, length: COURT.length, orientation: COURT.orientation }, teams, initial_score: scoreSnapshot(state), initial_tactics: { A: state.activeTactics?.A?.id || 'equilibrado', B: state.activeTactics?.B?.id || 'equilibrado' }, tactics_timeline: [], events: [] };
  const recorder = new ReplayRecorder(replay);
  recorder.record({ type: 'match_start' }); recorder.record({ type: 'set_start', data: { set: 1 } }); recorder.record({ type: 'game_start', data: { game: 1 } });
  return replay;
}

export function appendTacticChangeToReplay(replay, change) {
  const recorder = new ReplayRecorder(replay);
  const event = recorder.record({ type: 'tactic_changed', data: { team_id: change.teamId, tactic_id: change.tacticId, effective_from_point: change.effectiveFromPoint } });
  replay.tactics_timeline = [...(replay.tactics_timeline || []), { event_id: event.id, ...event.data }];
  replay.duration = recorder.time;
  return replay;
}

export function appendLiveCoachEventToReplay(replay, event) {
  if (!replay || !event?.type) return null;
  const recorder = new ReplayRecorder(replay);
  const recorded = recorder.record({ type:event.type,point_id:event.pointId||event.appliedAtPointId||null,data:{...event} });
  replay.live_coach_timeline = [...(replay.live_coach_timeline||[]), recorded.id];
  replay.duration = recorder.time;
  return recorded;
}

const shotTarget = (team, index, shot) => normalizePosition({ x: index % 2 ? 3.2 : 6.8, y: team === 'A' ? (shot === 'lob' ? 1.5 : 4) : (shot === 'lob' ? 18.5 : 16), z: 0 });
const playerPosition = (team, playerIndex, shot) => normalizePosition({ x: playerIndex ? 7 : 3, y: team === 'A' ? (['volley', 'smash', 'bandeja'].includes(shot) ? 12 : 16) : (['volley', 'smash', 'bandeja'].includes(shot) ? 8 : 4) });

export function appendPointToReplay(replay, before, after, result) {
  const recorder = new ReplayRecorder(replay);
  const pointId = `point-${pad(after.pointNumber, 3)}`; const rallyId = `rally-${pad(after.pointNumber, 3)}`;
  recorder.record({ type: 'point_start', point_id: pointId, rally_id: rallyId });
  const shots = result.rallyMemory || [];
  shots.forEach((entry, index) => {
    const team = entry.team; const roster = after.teams[team]; const actor = roster.find((p) => p.id === entry.playerId) || roster[index % roster.length];
    const position = playerPosition(team, roster.findIndex((p) => p.id === actor.id), entry.shot);
    const previous = index ? shotTarget(shots[index - 1].team, index - 1, shots[index - 1].shot) : normalizePosition({ ...position, z: 1 });
    const target = shotTarget(team, index, entry.shot);
    recorder.record({ type: index === 0 ? 'serve' : 'player_move', actor_id: actor.id, point_id: pointId, rally_id: rallyId, data: index === 0 ? { origin: position, target } : { from: actor.position?.replay || position, to: position, movement: 'run' } });
    recorder.record({ type: 'shot', actor_id: actor.id, point_id: pointId, rally_id: rallyId, data: { shot_type: entry.shot, hand: entry.shot === 'backhand' ? 'backhand' : 'forehand', origin: position, target, ball_speed_kmh: entry.shot === 'smash' ? 118 : 72, spin: entry.shot === 'lob' ? 'lob' : 'flat', outcome: index === shots.length - 1 ? result.result : 'in_play' } });
    recorder.record({ type: 'ball_move', point_id: pointId, rally_id: rallyId, data: { from: previous, to: { ...target, z: 0 }, trajectory: entry.shot === 'lob' ? 'lob' : entry.shot === 'smash' ? 'smash' : 'arc', speed_kmh: entry.shot === 'smash' ? 118 : 72 } });
    if (index < shots.length - 1) recorder.record({ type: 'bounce', point_id: pointId, rally_id: rallyId, data: { position: target } });
  });
  recorder.record({ type: result.result === 'winner' ? 'winner' : 'error', actor_id: result.finisher?.id, point_id: pointId, rally_id: rallyId, data: { winning_team: result.winnerTeamId, serving_team: result.servingTeamId, server_player_id: result.serverPlayerId, shot_type: result.shot, forced: Boolean(result.forcedError) } });
  recorder.record({ type: 'point_end', point_id: pointId, rally_id: rallyId, data: { winner: result.winnerTeamId, loser: result.loserTeamId, serving_team: result.servingTeamId, server_player_id: result.serverPlayerId } });
  recorder.record({ type: 'score_update', point_id: pointId, rally_id: rallyId, data: scoreSnapshot(after) });
  const lastNarration = after.narration.at(-1)?.type;
  if (['game', 'tiebreak_end'].includes(lastNarration)) recorder.record({ type: 'game_end', data: { winner: after.narration.at(-1).scorer } });
  if (lastNarration === 'set' || lastNarration === 'match') recorder.record({ type: 'set_end', data: { winner: after.narration.findLast((item) => item.type === 'set')?.scorer } });
  if (after.finished) { recorder.record({ type: 'celebration', data: { team: after.winner } }); recorder.record({ type: 'match_end', data: { winner: after.winner, score: scoreSnapshot(after) } }); recorder.finish(); }
  else if (after.currentSet !== before.currentSet) recorder.record({ type: 'set_start', data: { set: after.currentSet } });
  else if (['game', 'tiebreak_end'].includes(lastNarration)) recorder.record({ type: 'game_start', data: { game: after.gamesA + after.gamesB + 1 } });
  replay.duration = recorder.time;
  return replay;
}
