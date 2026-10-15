// Playthrough 5.24-E, Parte N — unlock N vezes → recompensa uma vez.
// Chamada duplicada, sync repetido, StrictMode (concorrente), restart.
// Chave: id estável pa-<achievement_id>-<profile_id> (registro da conquista).
import assert from 'node:assert/strict';
import { createFileStore, bootWithAchievements, createAchievementCareer, openCareer, syncAchievements, persistedAchievementState } from './lib/v524eAchievementHarness.mjs';
import { check, done } from './lib/v524dRewardHarness.mjs';

const store = createFileStore();
let rt = await bootWithAchievements(store);
try {
  const { careerId } = await createAchievementCareer(rt, { coins: 100, stats: { tournaments_played: 1 } });
  // StrictMode: dois syncs concorrentes + um terceiro.
  const results = await Promise.all([syncAchievements(rt), syncAchievements(rt), syncAchievements(rt)]);
  const unlockedOnce = results.flatMap((r) => r.unlocked);
  const ids = new Set(unlockedOnce.map((a) => a.id));
  const paid = [...ids].map((id) => unlockedOnce.find((a) => a.id === id)).reduce((s, a) => s + Number(a.coins_reward || 0), 0);
  await check(`3 syncs concorrentes: cada conquista reportada por um único sync (${unlockedOnce.length} relatos, ${ids.size} conquistas)`, () => {
    assert.equal(unlockedOnce.length, ids.size);
  });
  await check(`saldo +${paid} exatamente uma vez`, () => assert.equal(persistedAchievementState(store, careerId).coins, 100 + paid));
  const rows = persistedAchievementState(store, careerId).rows;
  await check('um registro por conquista (sem duplicatas)', () => assert.equal(rows.length, new Set(rows.map((r) => r.achievement_id)).size));

  const w = store.log.durableWrites.length;
  for (let i = 0; i < 5; i += 1) await syncAchievements(rt);
  await check('5 syncs repetidos sem novos unlocks: 0 escritas, saldo igual', () => {
    assert.equal(store.log.durableWrites.length - w, 0);
    assert.equal(persistedAchievementState(store, careerId).coins, 100 + paid);
  });
  await rt.close();
  rt = await bootWithAchievements(store);
  await openCareer(rt, careerId);
  await syncAchievements(rt);
  await check('restart + sync: saldo igual', () => assert.equal(persistedAchievementState(store, careerId).coins, 100 + paid));
} finally {
  await rt.close();
}
done('test-achievement-reward-idempotency-v524e');
