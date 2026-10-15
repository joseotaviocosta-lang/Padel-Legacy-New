// Playthrough 5.24-D, Partes A/H/Q — TESTE PRINCIPAL.
//
// saldo inicial 100 → trigger tutorial-career-created → memória 150 e BYTES
// persistidos 150 → reload (runtime novo, só os arquivos) → 150, claimed,
// completed → trigger de novo → 150 e 0 escritas adicionais.
import assert from 'node:assert/strict';
import { createFileStore, boot, createCareer, openCareer, visitHome, memoryState, persistedState, check, done, MISSION_ID } from './lib/v524dRewardHarness.mjs';

const store = createFileStore();
let rt = await boot(store);
try {
  const { careerId, profileId } = await createCareer(rt, { coins: 100 });
  await check('saldo inicial conhecido = 100 (memória e disco)', () => {
    assert.equal(persistedState(store, careerId).coins, 100);
  });

  const completed = await visitHome(rt, profileId);
  const mem = await memoryState(rt);
  const disk = persistedState(store, careerId);
  await check('trigger concede tutorial-career-created', () => assert.deepEqual(completed.map((m) => m.id), [MISSION_ID]));
  await check('saldo em memória = 150', () => assert.equal(mem.coins, 150));
  await check('saldo PERSISTIDO (bytes do save) = 150 assim que a concessão resolve', () => {
    assert.equal(disk.coins, 150);
    assert.equal(disk.claimed, true);
    assert.equal(disk.completed, true);
  });
  console.log(`   [registro] ${MISSION_ID}: 100 → mem ${mem.coins} / disco ${disk.coins} · claimed ${disk.claimed} · rev ${disk.revision}`);
  await rt.close();

  // Reload: runtime inteiramente novo, só os bytes sobrevivem.
  rt = await boot(store);
  await openCareer(rt, careerId);
  const reloaded = await memoryState(rt);
  await check('reload: saldo carregado = 150, reward claimed, mission completed', () => {
    assert.equal(reloaded.coins, 150);
    assert.equal(reloaded.claimed, true);
    assert.equal(reloaded.completed, true);
    assert.equal(reloaded.status, 'rewarded');
  });

  const before = store.log.durableWrites.length;
  const again = await visitHome(rt, profileId);
  await check('trigger novamente: saldo 150 e 0 escritas adicionais', async () => {
    assert.deepEqual(again, []);
    assert.equal(store.log.durableWrites.length - before, 0);
  });
  await check('disco continua 150 após o 2º trigger', () => assert.equal(persistedState(store, careerId).coins, 150));
} finally {
  await rt.close();
}
done('test-tutorial-reward-persists-after-reload-v524d');
