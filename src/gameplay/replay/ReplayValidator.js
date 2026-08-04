import { COURT, REPLAY_EVENT_TYPES, REPLAY_VERSION } from './ReplaySchema.js';

const error = (code, message, event) => ({ code, ...(event?.id ? { event_id: event.id } : {}), message });
const positions = (data = {}) => [data.from, data.to, data.origin, data.target, data.position].filter(Boolean);

export function validateReplay(replay) {
  const errors = [];
  const warnings = [];
  if (!replay || replay.replay_version !== REPLAY_VERSION) errors.push(error('INVALID_VERSION', 'Versão de replay inválida.'));
  const playerIds = new Set((replay?.teams || []).flatMap((team) => team.players || []).map((player) => player.id));
  const initialPlayers = (replay?.teams || []).flatMap((team) => team.players || []);
  initialPlayers.forEach((player, index) => initialPlayers.slice(index + 1).forEach((other) => {
    const a = player.initial_position; const b = other.initial_position;
    if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < 0.4) errors.push(error('PLAYERS_TOO_CLOSE', `${player.id} e ${other.id} iniciam próximos demais.`));
  }));
  const ids = new Set();
  let previousTime = -1;
  for (const event of replay?.events || []) {
    if (!event.type || !REPLAY_EVENT_TYPES.includes(event.type)) errors.push(error('INVALID_TYPE', 'Evento sem tipo válido.', event));
    if (ids.has(event.id)) errors.push(error('DUPLICATE_ID', `ID duplicado: ${event.id}.`, event));
    ids.add(event.id);
    if (!Number.isFinite(event.t) || event.t < 0) errors.push(error('INVALID_TIME', 'Tempo do evento deve ser não negativo.', event));
    if (!Number.isFinite(event.duration) || event.duration < 0) errors.push(error('INVALID_DURATION', 'Duração do evento inválida.', event));
    if (event.t < previousTime) errors.push(error('EVENT_OUT_OF_ORDER', 'Evento fora de ordem temporal.', event));
    previousTime = Math.max(previousTime, event.t ?? -1);
    if (event.actor_id && !playerIds.has(event.actor_id)) errors.push(error('INVALID_ACTOR', `Ator ${event.actor_id} não existe no replay.`, event));
    for (const position of positions(event.data)) {
      if (position.x < 0 || position.x > COURT.width || position.y < 0 || position.y > COURT.length || (position.z != null && (position.z < 0 || position.z > COURT.maxHeight))) {
        errors.push(error('INVALID_COORDINATES', 'Coordenadas fora da quadra.', event));
      }
    }
    if (event.type === 'score_update') {
      const score = event.data;
      if (!Array.isArray(score?.sets) || score.sets.length !== 2 || !Array.isArray(score?.games) || score.games.length !== 2 || !Array.isArray(score?.points) || score.points.length !== 2) errors.push(error('INVALID_SCORE', 'Placar inválido.', event));
    }
  }
  const types = (replay?.events || []).map((event) => event.type);
  if (!types.includes('match_start')) errors.push(error('MISSING_MATCH_START', 'Replay sem match_start.'));
  if (!types.includes('match_end')) errors.push(error('MISSING_MATCH_END', 'Replay sem match_end.'));
  for (const event of replay?.events || []) {
    if (event.type === 'shot' && event.actor_id && event.data?.origin) {
      const player = initialPlayers.find((item) => item.id === event.actor_id); const initial = player?.initial_position;
      if (initial && Math.hypot(initial.x - event.data.origin.x, initial.y - event.data.origin.y) > 8) warnings.push(error('DISTANT_SHOT_CONTACT', 'Ator distante do contato; o renderer aplicará aproximação visual limitada.', event));
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}
