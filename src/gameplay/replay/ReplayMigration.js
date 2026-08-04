import { REPLAY_VERSION } from './ReplaySchema.js';

const TYPE_ALIASES = Object.freeze({ game_completed: 'game_end', set_completed: 'set_end', match_completed: 'match_end', point_completed: 'point_end', score: 'score_update', tactic_change: 'tactic_changed' });
const TACTIC_ALIASES = Object.freeze({ balanced: 'equilibrado', aggressive: 'agressivo', defensive: 'defensivo', power: 'potencia', tactical: 'tatico' });
const tacticId = value => TACTIC_ALIASES[value] || value || 'equilibrado';

export function normalizeReplay(raw) {
  if (!raw || !Array.isArray(raw.events) || raw.events.length === 0) return { available: false, reason: 'missing_timeline', replay: null };
  const replay = structuredClone(raw);
  replay.replay_version = Number(replay.replay_version || REPLAY_VERSION);
  replay.initial_tactics = { A: tacticId(replay.initial_tactics?.A), B: tacticId(replay.initial_tactics?.B) };
  replay.tactics_timeline = Array.isArray(replay.tactics_timeline) ? replay.tactics_timeline : [];
  replay.events = replay.events.map((source, index) => {
    const type = TYPE_ALIASES[source.type] || source.type;
    const data = { ...(source.data || {}) };
    if (source.from && !data.from) data.from = source.from;
    if (source.to && !data.to) data.to = source.to;
    if (source.origin && !data.origin) data.origin = source.origin;
    if (source.target && !data.target) data.target = source.target;
    if (source.shotType && !data.shot_type) data.shot_type = source.shotType;
    if (type === 'tactic_changed') { data.team_id = data.team_id || source.teamId || 'A'; data.tactic_id = tacticId(data.tactic_id || source.tacticId); data.effective_from_point ??= source.effectiveFromPoint; }
    return { id: source.id || `migrated-${String(index + 1).padStart(5, '0')}`, type, rally_id: source.rally_id ?? source.rallyId ?? null, point_id: source.point_id ?? source.pointId ?? null, t: Number(source.t ?? source.timestampMs ?? source.time ?? index * 250), duration: Math.max(0, Number(source.duration ?? source.durationMs ?? 0)), actor_id: source.actor_id ?? source.playerId ?? null, data };
  }).sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  replay.duration = replay.events.reduce((end, event) => Math.max(end, event.t + event.duration), 0);
  return { available: true, migrated: JSON.stringify(replay) !== JSON.stringify(raw), replay };
}
