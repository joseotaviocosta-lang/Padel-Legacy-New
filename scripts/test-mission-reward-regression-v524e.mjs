// Playthrough 5.24-E, Parte V — as missões da 5.24-D não podem regredir.
// Roda as 8 suítes da 5.24-D (processos isolados) e, na mesma carreira, a
// missão do tutorial (+50) e conquistas: cada uma paga uma vez, coerentes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createFileStore, bootWithAchievements, createAchievementCareer, openCareer, syncAchievements, persistedAchievementState } from './lib/v524eAchievementHarness.mjs';
import { visitHome, check, done } from './lib/v524dRewardHarness.mjs';

const suites = readdirSync(new URL('.', import.meta.url)).filter((f) => /^test-tutorial-reward-.*-v524d\.mjs$/.test(f));
await check(`existem as 8 suítes da 5.24-D (${suites.length})`, () => assert.equal(suites.length, 8));
for (const suite of suites) {
  const r = spawnSync(process.execPath, [new URL(suite, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')], { encoding: 'utf8', timeout: 300000 });
  await check(`5.24-D: ${suite}`, () => assert.equal(r.status, 0, (r.stdout + r.stderr).split('\n').filter((l) => /FAIL|Error/.test(l)).slice(0, 3).join(' | ')));
}

const store = createFileStore();
let rt = await bootWithAchievements(store);
try {
  const { careerId, profileId } = await createAchievementCareer(rt, { coins: 100, stats: { tournaments_played: 1 } });
  await visitHome(rt, profileId);
  const ach = await syncAchievements(rt);
  await visitHome(rt, profileId);
  await syncAchievements(rt);
  const paid = ach.unlocked.reduce((s, a) => s + Number(a.coins_reward || 0), 0);
  await rt.close();
  rt = await bootWithAchievements(store);
  await openCareer(rt, careerId);
  await visitHome(rt, profileId);
  await syncAchievements(rt);
  await check(`missão +50 e conquistas +${paid}, cada uma exatamente uma vez, após restart`, () => {
    assert.equal(persistedAchievementState(store, careerId).coins, 100 + 50 + paid);
  });
} finally {
  await rt.close();
}
done('test-mission-reward-regression-v524e');
