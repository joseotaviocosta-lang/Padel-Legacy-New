import { ReplayRecorder } from '../ReplayRecorder.js';
import { COURT, REPLAY_VERSION } from '../ReplaySchema.js';

const players = [
  { id: 'player-a1', name: 'José Costa', court_side: 'right', initial_position: { x: 3, y: 16 } },
  { id: 'player-a2', name: 'Carlos Silva', court_side: 'left', initial_position: { x: 7, y: 16 } },
  { id: 'player-b1', name: 'Ana Lima', court_side: 'right', initial_position: { x: 3, y: 4 } },
  { id: 'player-b2', name: 'Bia Alves', court_side: 'left', initial_position: { x: 7, y: 4 } },
];

const replay = { replay_version: REPLAY_VERSION, replay_id: 'replay-sample-v1', match_id: 'match-sample-v1', seed: 20260803, created_at: '2026-08-03T18:00:00.000Z', court: { width: COURT.width, length: COURT.length, orientation: COURT.orientation }, teams: [{ id: 'team-a', side: 'bottom', players: players.slice(0, 2) }, { id: 'team-b', side: 'top', players: players.slice(2) }], initial_score: { sets: [0, 0], games: [2, 1], points: ['30', '30'], serving_team: 'team-a' }, events: [] };
const recorder = new ReplayRecorder(replay);
const event = (type, actor_id, data, duration) => recorder.record({ type, actor_id, point_id: 'point-001', rally_id: 'rally-001', data, duration });
event('match_start'); event('set_start', null, { set: 1 }); event('game_start', null, { game: 4 }); event('point_start');
event('serve', 'player-a1', { origin: { x: 3, y: 16 }, target: { x: 7, y: 4 } }, 650);
event('shot', 'player-b2', { shot_type: 'drive', origin: { x: 7, y: 4 }, target: { x: 3, y: 15 }, outcome: 'in_play' });
event('ball_move', null, { from: { x: 7, y: 4, z: 1 }, to: { x: 3, y: 15, z: 0 }, trajectory: 'arc', speed_kmh: 75 }, 550);
event('bounce', null, { position: { x: 3, y: 15, z: 0 } });
event('shot', 'player-a1', { shot_type: 'lob', origin: { x: 3, y: 15 }, target: { x: 7, y: 1.5 }, outcome: 'in_play' });
event('ball_move', null, { from: { x: 3, y: 15, z: 1 }, to: { x: 7, y: 1.5, z: 0 }, trajectory: 'lob', speed_kmh: 48 }, 800);
event('wall_contact', null, { position: { x: 7, y: 0.5, z: 1 } });
event('player_move', 'player-b2', { from: { x: 7, y: 4 }, to: { x: 7, y: 1.5 }, movement: 'run' }, 500);
event('shot', 'player-b2', { shot_type: 'bandeja', origin: { x: 7, y: 1.5 }, target: { x: 3, y: 13 }, outcome: 'in_play' });
event('ball_move', null, { from: { x: 7, y: 1.5, z: 2.2 }, to: { x: 3, y: 13, z: 0 }, trajectory: 'arc', speed_kmh: 82 }, 500);
event('bounce', null, { position: { x: 3, y: 13, z: 0 } });
event('shot', 'player-a2', { shot_type: 'volley', origin: { x: 7, y: 12 }, target: { x: 3, y: 5 }, outcome: 'in_play' });
event('ball_move', null, { from: { x: 7, y: 12, z: 1 }, to: { x: 3, y: 5, z: 0 }, trajectory: 'arc', speed_kmh: 90 }, 420);
event('net_contact', null, { position: { x: 5, y: 10, z: 0.8 } });
event('shot', 'player-b1', { shot_type: 'smash', origin: { x: 3, y: 5 }, target: { x: 7, y: 19 }, outcome: 'winner' });
event('ball_move', null, { from: { x: 3, y: 5, z: 2 }, to: { x: 7, y: 19, z: 0 }, trajectory: 'smash', speed_kmh: 118 }, 380);
event('winner', 'player-b1', { winning_team: 'B', shot_type: 'smash' }); event('point_end', null, { winner: 'B' });
event('score_update', null, { sets: [0, 0], games: [2, 1], points: ['30', '40'], serving_team: 'team-a' });
event('celebration', 'player-b1', { team: 'B' }); event('match_end', null, { winner: 'B', score: { sets: [2, 0], games: [6, 4], points: ['0', '0'], serving_team: 'team-a' } });
replay.duration = recorder.time;
export const sampleReplay = replay;
