// Playthrough 5.24-D, Parte J — navegação rápida.
// Home → (sem esperar) Ranking → Torneios → reload; e Home → fecha na hora.
// A recompensa não pode depender de ficar na Home.
import assert from 'node:assert/strict';
import { createFileStore, boot, createCareer, openCareer, visitHome, persistedState, memoryState, check, done } from './lib/v524dRewardHarness.mjs';

const visit = (rt, profileId, objective, key) => rt.padel.incrementMissionProgress(profileId, objective, 1, '2026-01-01', { triggerEventId: `route:${profileId}:${key}` });

{
  const store = createFileStore();
  let rt = await boot(store);
  const { careerId, profileId } = await createCareer(rt, { coins: 100 });
  // Os três disparos em voo ao mesmo tempo (o jogador toca rápido).
  await Promise.all([
    visitHome(rt, profileId, 'home-1'),
    visit(rt, profileId, 'visit_ranking', '/ranking-1'),
    visit(rt, profileId, 'visit_tournaments', '/tournaments-1'),
  ]);
  await rt.close();
  rt = await boot(store);
  await openCareer(rt, careerId);
  await check('Home → Ranking → Torneios → reload: 150 e claimed', async () => {
    const s = await memoryState(rt);
    assert.equal(s.coins, 150);
    assert.equal(s.claimed, true);
  });
  await rt.close();
}

{
  const store = createFileStore();
  let rt = await boot(store);
  const { careerId, profileId } = await createCareer(rt, { coins: 100 });
  const pending = visitHome(rt, profileId, 'home-fecha');
  await pending; // a concessão só "existe" quando a promessa resolve (após a escrita durável)
  const onDisk = persistedState(store, careerId);
  await rt.close(); // fecha imediatamente
  await check('Home → fecha na hora: os bytes já têm 150 quando a concessão resolve', () => {
    assert.equal(onDisk.coins, 150);
    assert.equal(onDisk.claimed, true);
  });
  rt = await boot(store);
  await openCareer(rt, careerId);
  await check('reabrir: 150', async () => assert.equal((await memoryState(rt)).coins, 150));
  await rt.close();
}
done('test-tutorial-reward-fast-navigation-v524d');
