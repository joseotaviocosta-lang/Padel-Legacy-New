// Playthrough 5.24-E, Partes K/M/AA — TESTE PRINCIPAL DE CONQUISTA.
// saldo 100, conquista bloqueada → trigger → desbloqueada + recompensa
// entregue + saldo somado, em 1 escrita → restart → igual, 0 escritas.
// Também inspeciona CADA versão gravada: nunca conquista sem recompensa.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFileStore, bootWithAchievements, createAchievementCareer, openCareer, syncAchievements, persistedAchievementState } from './lib/v524eAchievementHarness.mjs';
import { check, done } from './lib/v524dRewardHarness.mjs';

const source = readFileSync(new URL('../src/lib/achievementEngine.js', import.meta.url), 'utf8');
const sync = source.match(/export async function syncPlayerAchievements[\s\S]*?\n\}/)[0];
await check('domínio: registros + recompensa numa única localGame.batch', () => {
  assert.match(sync, /localGame\.batch\(operations/);
  assert.doesNotMatch(sync, /PlayerAchievement\.create\(/, 'sem create isolado');
  assert.doesNotMatch(sync, /PlayerProfile\.update\(/, 'sem update isolado de moedas');
});

const store = createFileStore();
const versions = [];
const realRename = store.api.rename;
store.api.rename = async (from, to) => {
  const out = await realRename(from, to);
  if (/^careers\/[^/]+\.json$/.test(to)) {
    const c = JSON.parse(store.files.get(to));
    versions.push({ coins: c.player?.coins, xp: c.player?.xp, rows: (c.entities?.PlayerAchievement || []).filter((r) => r.reward_delivered) });
  }
  return out;
};

let rt = await bootWithAchievements(store);
try {
  const { careerId } = await createAchievementCareer(rt, { coins: 100, stats: { tournaments_played: 1 } });
  const base = persistedAchievementState(store, careerId);
  versions.length = 0;
  const w = store.log.durableWrites.length;
  const result = await syncAchievements(rt);
  const writes = store.log.durableWrites.length - w;
  const expectedCoins = result.unlocked.reduce((s, a) => s + Number(a.coins_reward || 0), 0);
  const expectedXp = result.unlocked.reduce((s, a) => s + Number(a.xp_reward || 0), 0);
  const disk = persistedAchievementState(store, careerId);
  console.log(`   [registro] desbloqueadas: ${result.unlocked.map((a) => `${a.name} +${a.coins_reward}`).join(', ')} · ${base.coins} → ${disk.coins} · escritas ${writes}`);
  await check('"Estreia em Torneios" (+200) desbloqueada', () => assert.ok(result.unlocked.some((a) => a.name === 'Estreia em Torneios')));
  await check(`saldo ${base.coins} + ${expectedCoins} = ${base.coins + expectedCoins} no DISCO, XP +${expectedXp}`, () => {
    assert.equal(disk.coins, base.coins + expectedCoins);
    assert.equal(disk.xp, base.xp + expectedXp);
  });
  await check('registro marca reward_delivered com os valores pagos', () => {
    for (const a of result.unlocked) {
      const row = disk.rows.find((r) => r.achievement_id === a.id);
      assert.equal(row?.reward_delivered, true, a.name);
      assert.equal(row.reward_coins, Number(a.coins_reward || 0));
    }
  });
  await check(`1 escrita para o sync inteiro (medido: ${writes})`, () => assert.equal(writes, 1));
  await check('nenhuma versão gravada tem conquista paga sem o saldo correspondente', () => {
    for (const v of versions) {
      const paid = v.rows.reduce((s, r) => s + Number(r.reward_coins || 0), 0);
      assert.equal(v.coins, base.coins + paid, JSON.stringify({ coins: v.coins, paid }));
    }
  });
  await rt.close();
  rt = await bootWithAchievements(store);
  await openCareer(rt, careerId);
  const w2 = store.log.durableWrites.length;
  const again = await syncAchievements(rt);
  await check('restart + sync: mesmas conquistas, mesmo saldo, 0 escritas', () => {
    assert.equal(again.unlocked.length, 0);
    assert.equal(persistedAchievementState(store, careerId).coins, base.coins + expectedCoins);
    assert.equal(store.log.durableWrites.length - w2, 0);
  });
} finally {
  await rt.close();
}
done('test-achievement-reward-atomicity-v524e');
