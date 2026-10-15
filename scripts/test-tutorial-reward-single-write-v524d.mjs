// Playthrough 5.24-D, Partes D/F/N — escrita única.
//  - reward ainda não aplicada → exatamente 1 escrita durável (progresso +
//    claimed + moedas + XP numa mutação só; antes eram 3: progresso, moedas,
//    claim);
//  - reward já aplicada → 0 escritas;
//  - abrir o app sem mudança → 0 escritas do catálogo de missões (antes o
//    catálogo era regravado inteiro a cada boot).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFileStore, boot, createCareer, openCareer, visitHome, check, done } from './lib/v524dRewardHarness.mjs';

const source = readFileSync(new URL('../src/lib/padel.js', import.meta.url), 'utf8');
const reward = source.match(/async function rewardMissionAutomaticallyUnlocked[\s\S]*?\n\}/)[0];
await check('domínio: recompensa usa uma única mutação (localGame.batch) com progresso + jogador', () => {
  assert.match(reward, /localGame\.batch\(\[/);
  assert.match(reward, /entityName: 'MissionProgress'/);
  assert.match(reward, /type: 'playerUpdate'/);
  assert.doesNotMatch(reward, /PlayerProfile\.update\(/, 'sem escrita separada de moedas');
});

const store = createFileStore();
let rt = await boot(store);
try {
  const { careerId, profileId } = await createCareer(rt, { coins: 100 });
  let w = store.log.durableWrites.length;
  await visitHome(rt, profileId);
  const firstWrites = store.log.durableWrites.length - w;
  await check(`1ª aplicação: 1 escrita durável (medido: ${firstWrites})`, () => assert.equal(firstWrites, 1));

  w = store.log.durableWrites.length;
  for (let i = 0; i < 4; i += 1) await visitHome(rt, profileId);
  await check('4 reaplicações: 0 escritas', () => assert.equal(store.log.durableWrites.length - w, 0));
  await rt.close();

  rt = await boot(store);
  await openCareer(rt, careerId);
  w = store.log.durableWrites.length;
  await rt.padel.ensureTutorialMissionCatalog();
  await visitHome(rt, profileId);
  const bootWrites = store.log.durableWrites.length - w;
  await check(`novo boot + catálogo + visita com recompensa já aplicada: 0 escritas (medido: ${bootWrites})`, () => assert.equal(bootWrites, 0));
  console.log(`   [registro] escritas: 1ª aplicação=${firstWrites} · reaplicação=0 · boot sem mudança=${bootWrites}`);
} finally {
  await rt.close();
}
done('test-tutorial-reward-single-write-v524d');
