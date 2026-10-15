// Playthrough 5.24-D, Parte E — React StrictMode / double effect.
// Em DEV o StrictMode monta o efeito do bridge 2x: dois disparos CONCORRENTES
// (chaves de evento distintas, mesmo tick). Também o double lifecycle tick.
import assert from 'node:assert/strict';
import { createFileStore, boot, createCareer, openCareer, visitHome, memoryState, persistedState, check, done } from './lib/v524dRewardHarness.mjs';

const store = createFileStore();
let rt = await boot(store);
try {
  const { careerId, profileId } = await createCareer(rt, { coins: 100 });
  const results = await Promise.all([
    visitHome(rt, profileId, 'strict-a'),
    visitHome(rt, profileId, 'strict-b'),
    visitHome(rt, profileId, 'strict-a'),
    rt.padel.incrementMissionProgress(profileId, 'visit_career', 1, '2026-01-01', {}),
  ]);
  // `completedNow` lista a missão para CADA chamador que a viu completar; o
  // lock por missão (missionRewardLocks) faz os concorrentes compartilharem a
  // MESMA concessão. A prova de "concedida 1x" é o delta real do saldo.
  const reported = results.flat().filter((m) => m.id === 'tutorial-career-created').length;
  const grants = ((await memoryState(rt)).coins - 100) / 50;
  console.log(`   [registro] chamadores que viram a conclusão: ${reported} · concessões reais (delta/50): ${grants}`);
  await check(`4 disparos concorrentes → exatamente 1 concessão real (medido: ${grants})`, () => assert.equal(grants, 1));
  await check('memória e disco: +50 exatamente uma vez', async () => {
    assert.equal((await memoryState(rt)).coins, 150);
    assert.equal(persistedState(store, careerId).coins, 150);
  });
  await rt.close();
  rt = await boot(store);
  await openCareer(rt, careerId);
  await check('após reload: 150', async () => assert.equal((await memoryState(rt)).coins, 150));
} finally {
  await rt.close();
}
done('test-tutorial-reward-strictmode-double-trigger-v524d');
