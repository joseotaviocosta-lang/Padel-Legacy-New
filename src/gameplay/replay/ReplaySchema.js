export const REPLAY_VERSION = 1;

export const REPLAY_EVENT_TYPES = Object.freeze([
  'match_start', 'set_start', 'game_start', 'point_start', 'serve', 'player_move',
  'ball_move', 'shot', 'bounce', 'net_contact', 'wall_contact', 'side_wall_contact',
  'back_wall_contact', 'double_wall_contact', 'error', 'winner',
  'point_end', 'score_update', 'game_end', 'set_end', 'match_end', 'celebration',
  'tactic_changed', 'coach_observation', 'coach_suggestion', 'player_tactical_decision',
  'partner_feedback', 'tactical_adjustment_applied', 'opponent_adjustment_detected',
]);

export const COURT = Object.freeze({ width: 10, length: 20, maxHeight: 8, orientation: 'top_down' });

export const DEFAULT_DURATIONS = Object.freeze({
  match_start: 300, set_start: 250, game_start: 200, point_start: 200, serve: 550,
  player_move: 450, ball_move: 500, shot: 220, bounce: 120, net_contact: 100,
  wall_contact: 70, side_wall_contact: 70, back_wall_contact: 70, double_wall_contact: 100,
  error: 350, winner: 350, point_end: 900, score_update: 400,
  game_end: 350, set_end: 500, match_end: 700, celebration: 600,
  tactic_changed: 120, coach_observation:80, coach_suggestion:120, player_tactical_decision:100,
  partner_feedback:100, tactical_adjustment_applied:120, opponent_adjustment_detected:80,
});

export const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
export const normalizePosition = (position = {}) => ({
  x: clamp(position.x, 0, COURT.width) / COURT.width,
  y: clamp(position.y, 0, COURT.length) / COURT.length,
  ...(position.z == null ? {} : { z: clamp(position.z, 0, COURT.maxHeight) / COURT.maxHeight }),
});

export function scoreSnapshot(state) {
  const display = state.inTiebreak
    ? [String(state.pointsA), String(state.pointsB)]
    : [0, 1, 2, 3].map((i) => ['0', '15', '30', '40'][i]);
  const point = (value) => display[Math.min(value, 3)] || '40';
  return {
    sets: [state.setsA, state.setsB], games: [state.gamesA, state.gamesB],
    points: state.inTiebreak ? [String(state.pointsA), String(state.pointsB)] : [point(state.pointsA), point(state.pointsB)],
    serving_team: `team-${state.servingTeam.toLowerCase()}`,
  };
}
