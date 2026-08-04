import { validateReplay } from './ReplayValidator.js';

const memory = new Map();
export const ReplayStorage = {
  save(replay) { const result = validateReplay(replay); if (!result.valid) throw new Error('Replay inválido.'); memory.set(replay.replay_id, structuredClone(replay)); return replay.replay_id; },
  load(replayId) { const replay = memory.get(replayId); return replay ? structuredClone(replay) : null; },
  export(replay) { return JSON.stringify(replay, null, 2); },
  import(json) { const replay = typeof json === 'string' ? JSON.parse(json) : structuredClone(json); const result = validateReplay(replay); if (!result.valid) throw new Error(result.errors.map((e) => e.message).join(' ')); return replay; },
};
