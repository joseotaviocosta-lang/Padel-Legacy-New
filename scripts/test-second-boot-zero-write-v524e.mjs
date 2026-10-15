// Playthrough 5.24-E, Partes F/X — depois de qualquer boot que grave por
// motivo real (carreira nova virando "última jogada", troca de carreira,
// sessão com jogo que deixou o resumo do índice defasado), o boot SEGUINTE
// grava 0 vezes.
import assert from 'node:assert/strict';
import { createFileStore, bootWithAchievements, createAchievementCareer, bootCareer, syncAchievements } from './lib/v524eAchievementHarness.mjs';
import { check, done } from './lib/v524dRewardHarness.mjs';

const store = createFileStore();
let rt = await bootWithAchievements(store);
const a = await createAchievementCareer(rt, { coins: 100 });
await rt.close();
rt = await bootWithAchievements(store);
const { career: careerB } = await rt.careerManager.createCareer({ career_name: 'Segunda carreira 524E' });
await rt.close();

// 1. Primeiro load de uma carreira: pode atualizar o índice (vira a última).
let b = await bootCareer(store, a.careerId);
const first = b.bootMetrics;
await b.close();
b = await bootCareer(store, a.careerId);
const second = b.bootMetrics;
await b.close();
await check(`1º load: ${first.writes} escrita(s) (índice ${first.indexWrites}, carreira ${first.careerWrites}) · 2º boot: 0`, () => {
  assert.equal(first.careerWrites, 0, 'o 1º load não regrava a carreira');
  assert.equal(second.writes, 0);
});

// 2. Troca de carreira: o índice muda ("jogada por último"); depois, 0.
b = await bootCareer(store, careerB.career_id);
const switched = b.bootMetrics;
await b.close();
b = await bootCareer(store, careerB.career_id);
const afterSwitch = b.bootMetrics;
await b.close();
await check(`troca de carreira: ${switched.indexWrites} escrita do índice, 0 da carreira · boot seguinte: 0`, () => {
  assert.equal(switched.careerWrites, 0);
  assert.equal(switched.indexWrites, 1);
  assert.equal(afterSwitch.writes, 0);
});

// 3. Sessão com jogo (conquista paga) → próximo boot pode sincronizar o
//    resumo do índice; o seguinte, 0.
b = await bootCareer(store, a.careerId);
await b.localGame.batch([{ type: 'playerUpdate', id: a.profileId, data: { tournaments_played: 1 } }]);
await syncAchievements(b);
await b.close();
const boots = [];
for (let i = 0; i < 4; i += 1) {
  const x = await bootCareer(store, a.careerId);
  boots.push(x.bootMetrics.writes);
  await x.close();
}
await check(`após sessão com jogo: boots ${JSON.stringify(boots)} — no máximo 1 sincronização, depois 0`, () => {
  assert.ok(boots[0] <= 1);
  assert.deepEqual(boots.slice(1), [0, 0, 0]);
});
done('test-second-boot-zero-write-v524e');
