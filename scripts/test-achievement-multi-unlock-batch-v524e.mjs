// Playthrough 5.24-E, Partes O/P — várias conquistas distintas no MESMO sync:
// todas desbloqueadas e pagas numa única escrita (antes: 2 por conquista),
// sem flag global — uma 2ª leva distinta depois continua sendo paga.
import assert from 'node:assert/strict';
import { createFileStore, bootWithAchievements, createAchievementCareer, syncAchievements, persistedAchievementState } from './lib/v524eAchievementHarness.mjs';
import { check, done } from './lib/v524dRewardHarness.mjs';

const store = createFileStore();
const rt = await bootWithAchievements(store);
try {
  const { careerId, profileId } = await createAchievementCareer(rt, { coins: 100, stats: { tournaments_played: 1, tournaments_won: 1, matches_played: 1, wins: 1 } });
  let w = store.log.durableWrites.length;
  const first = await syncAchievements(rt);
  const firstWrites = store.log.durableWrites.length - w;
  const firstPaid = first.unlocked.reduce((s, a) => s + Number(a.coins_reward || 0), 0);
  console.log(`   [registro] leva 1: ${first.unlocked.length} conquistas (${first.unlocked.map((a) => `${a.name} +${a.coins_reward}`).join(', ')}) · escritas ${firstWrites}`);
  await check(`leva 1: ${first.unlocked.length} conquistas (≥2) numa única escrita`, () => {
    assert.ok(first.unlocked.length >= 2);
    assert.equal(firstWrites, 1);
  });
  await check(`leva 1: saldo 100 + ${firstPaid}`, () => assert.equal(persistedAchievementState(store, careerId).coins, 100 + firstPaid));

  // Leva 2: novas condições satisfeitas — idempotência por id não bloqueia.
  await rt.localGame.batch([{ type: 'playerUpdate', id: profileId, data: { tournaments_played: 10 } }]);
  w = store.log.durableWrites.length;
  const second = await syncAchievements(rt);
  const secondPaid = second.unlocked.reduce((s, a) => s + Number(a.coins_reward || 0), 0);
  await check(`leva 2: ${second.unlocked.map((a) => a.name).join(', ')} pagas (+${secondPaid}) em 1 escrita, sem repetir a leva 1`, () => {
    assert.ok(second.unlocked.length >= 1);
    assert.ok(second.unlocked.every((a) => !first.unlocked.some((b) => b.id === a.id)));
    assert.equal(store.log.durableWrites.length - w, 1);
    assert.equal(persistedAchievementState(store, careerId).coins, 100 + firstPaid + secondPaid);
  });
} finally {
  await rt.close();
}
done('test-achievement-multi-unlock-batch-v524e');
