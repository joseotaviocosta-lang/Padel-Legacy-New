// Playthrough 5.24-E — harness das recompensas de conquista. Reaproveita o
// pipeline real e o "restart de verdade" (novo servidor Vite sobre os mesmos
// bytes) do harness da 5.24-D.
import { createFileStore, boot, createCareer, openCareer } from './v524dRewardHarness.mjs';

export { createFileStore, openCareer };

/**
 * Boot REAL do app: runtime novo sobre os mesmos bytes + o MESMO carregamento
 * que o CareerProvider faz (careerManager.loadCareer). Devolve as métricas de
 * I/O do boot (escritas, bytes, leituras, tempo) e o checksum do save.
 */
export async function bootCareer(store, careerId) {
  const before = { writes: store.log.allWrites.length, reads: store.log.reads, text: store.files.get(`careers/${careerId}.json`) };
  const rt = await bootWithAchievements(store);
  const t0 = performance.now();
  const career = await rt.careerManager.loadCareer(careerId);
  const loadMs = performance.now() - t0;
  rt.activeCareerAdapter.setActiveCareer(career);
  const writes = store.log.allWrites.slice(before.writes);
  const after = store.files.get(`careers/${careerId}.json`);
  rt.bootMetrics = {
    writes: writes.length,
    careerWrites: writes.filter((w) => w.to.startsWith('careers/')).length,
    indexWrites: writes.filter((w) => w.to === 'careers-index.json').length,
    bytes: writes.reduce((s, w) => s + w.bytes, 0),
    reads: store.log.reads - before.reads,
    loadMs: Math.round(loadMs),
    checksumBefore: checksum(before.text),
    checksumAfter: checksum(after),
    revisionBefore: before.text ? JSON.parse(before.text).save_version ?? null : null,
    revisionAfter: after ? JSON.parse(after).save_version ?? null : null,
  };
  return rt;
}

export function checksum(text) {
  let h = 2166136261;
  for (let i = 0; i < (text || '').length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

export async function bootWithAchievements(store) {
  const rt = await boot(store);
  rt.achievements = await rt.server.ssrLoadModule('/src/lib/achievementEngine.js');
  return rt;
}

/** Carreira com saldo conhecido; `stats` define o que a conquista avalia. */
export async function createAchievementCareer(rt, { coins = 100, stats = {} } = {}) {
  const ids = await createCareer(rt, { coins });
  const profile = (await rt.localGame.entities.PlayerProfile.list(null, 1))[0];
  // Zera tudo que poderia desbloquear conquistas por acaso e aplica `stats`.
  await rt.localGame.batch([{ type: 'playerUpdate', id: profile.id, data: { tournaments_played: 0, tournaments_won: 0, matches_played: 0, wins: 0, ...stats } }]);
  return ids;
}

export async function syncAchievements(rt, options = {}) {
  const profile = (await rt.localGame.entities.PlayerProfile.list(null, 1))[0];
  return rt.achievements.syncPlayerAchievements(profile, {}, { localGame: rt.localGame, ...options });
}

/** Estado nos BYTES persistidos. */
export function persistedAchievementState(store, careerId) {
  const raw = store.files.get(`careers/${careerId}.json`);
  if (!raw) return null;
  const career = JSON.parse(raw);
  const rows = career.entities?.PlayerAchievement || [];
  return {
    coins: career.player?.coins,
    xp: career.player?.xp,
    achievements: rows.map((r) => r.achievement_id).sort(),
    rows,
  };
}

/** O próximo rename para o arquivo da carreira "não acontece" (processo morto). */
export function killOnDurableWrite(store, nth = 1) {
  const real = store.api.rename;
  let seen = 0;
  store.api.rename = async (from, to) => {
    if (/^careers\/[^/]+\.json$/.test(to)) {
      seen += 1;
      if (seen === nth) { store.api.rename = real; throw Object.assign(new Error('processo encerrado'), { code: 'KILLED' }); }
    }
    return real(from, to);
  };
}
