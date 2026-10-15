// Playthrough 5.24-E, Parte U — falha de escrita (ex.: disco cheio) durante a
// persistência do unlock: arquivo anterior continua válido e idêntico, sem
// save parcial; a próxima inicialização converge sem duplicar.
// Usa o mecanismo existente de escrita atômica (temp → verify → rename).
import assert from 'node:assert/strict';
import { createFileStore, bootWithAchievements, createAchievementCareer, openCareer, syncAchievements, persistedAchievementState, checksum } from './lib/v524eAchievementHarness.mjs';
import { check, done } from './lib/v524dRewardHarness.mjs';

const store = createFileStore();
let rt = await bootWithAchievements(store);
const { careerId } = await createAchievementCareer(rt, { coins: 100, stats: { tournaments_played: 1 } });
const path = `careers/${careerId}.json`;
const before = store.files.get(path);
// A escrita temporária falha (ENOSPC) na próxima gravação da carreira.
const realWrite = store.api.writeText;
store.api.writeText = async (p, content) => {
  if (/\.tmp\.json$/.test(p) && p.includes(careerId)) {
    store.api.writeText = realWrite;
    throw Object.assign(new Error('Sem espaço no dispositivo'), { code: 'ENOSPC' });
  }
  return realWrite(p, content);
};
const failed = await syncAchievements(rt).then(() => 'ok', (e) => e.code || e.message);
await rt.close();
const after = store.files.get(path);
await check(`falha de escrita propagada (${failed}) e arquivo anterior intacto (checksum ${checksum(before)})`, () => {
  assert.notEqual(failed, 'ok');
  assert.equal(after, before);
  JSON.parse(after); // continua JSON válido
});
await check('nenhum arquivo temporário órfão substituiu o save', () => {
  assert.ok(![...store.files.keys()].some((k) => k === path && store.files.get(k) !== before));
});

rt = await bootWithAchievements(store);
await openCareer(rt, careerId);
const r = await syncAchievements(rt);
await syncAchievements(rt);
await rt.close();
const paid = r.unlocked.reduce((s, a) => s + Number(a.coins_reward || 0), 0);
await check(`próxima inicialização converge: +${paid} uma vez`, () => {
  assert.ok(paid > 0);
  assert.equal(persistedAchievementState(store, careerId).coins, 100 + paid);
});
done('test-achievement-write-failure-recovery-v524e');
