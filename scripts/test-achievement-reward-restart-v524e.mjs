// Playthrough 5.24-E, Partes L/T/AB — crash antes e depois do commit.
//  antes do commit: save antigo intacto (sem conquista, sem moedas) → restart
//                   → sync paga exatamente uma vez;
//  depois do commit: conquista + recompensa juntas → restart → 0 nova.
import assert from 'node:assert/strict';
import { createFileStore, bootWithAchievements, createAchievementCareer, openCareer, syncAchievements, persistedAchievementState, killOnDurableWrite } from './lib/v524eAchievementHarness.mjs';
import { check, done } from './lib/v524dRewardHarness.mjs';

// Antes do commit.
{
  const store = createFileStore();
  let rt = await bootWithAchievements(store);
  const { careerId } = await createAchievementCareer(rt, { coins: 100, stats: { tournaments_played: 1 } });
  const base = persistedAchievementState(store, careerId);
  killOnDurableWrite(store, 1);
  await syncAchievements(rt).catch(() => null);
  await rt.close();
  const crashed = persistedAchievementState(store, careerId);
  await check('crash ANTES do commit: save antigo intacto (nenhuma conquista nova, saldo igual)', () => {
    assert.deepEqual(crashed.achievements, base.achievements);
    assert.equal(crashed.coins, base.coins);
  });
  rt = await bootWithAchievements(store);
  await openCareer(rt, careerId);
  const r1 = await syncAchievements(rt);
  await syncAchievements(rt);
  await rt.close();
  const paid = r1.unlocked.reduce((s, a) => s + Number(a.coins_reward || 0), 0);
  await check(`restart converge: desbloqueia e paga uma vez (+${paid})`, () => {
    const d = persistedAchievementState(store, careerId);
    assert.ok(paid > 0);
    assert.equal(d.coins, base.coins + paid);
  });
}

// Depois do commit.
{
  const store = createFileStore();
  let rt = await bootWithAchievements(store);
  const { careerId } = await createAchievementCareer(rt, { coins: 100, stats: { tournaments_played: 1 } });
  await syncAchievements(rt);
  await rt.close(); // "morre" logo após o commit
  const committed = persistedAchievementState(store, careerId);
  for (let i = 1; i <= 2; i += 1) {
    rt = await bootWithAchievements(store);
    await openCareer(rt, careerId);
    const w = store.log.durableWrites.length;
    const r = await syncAchievements(rt);
    await check(`crash DEPOIS do commit, restart #${i}: 0 recompensa nova, 0 escritas`, () => {
      assert.equal(r.unlocked.length, 0);
      assert.equal(persistedAchievementState(store, careerId).coins, committed.coins);
      assert.equal(store.log.durableWrites.length - w, 0);
    });
    await rt.close();
  }
}
done('test-achievement-reward-restart-v524e');
