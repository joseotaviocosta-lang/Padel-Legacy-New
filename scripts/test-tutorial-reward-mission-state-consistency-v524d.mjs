// Playthrough 5.24-D, Partes D/M/S — coerência missão × recompensa × economia.
// Em TODA escrita durável observada, o save é coerente: ou (sem claim e sem
// +50) ou (rewarded + completed + claimed + delivered + 50 moedas + XP) —
// nunca um estado intermediário. Verificado inspecionando cada versão dos
// bytes gravados, não só o final.
import assert from 'node:assert/strict';
import { createFileStore, boot, createCareer, openCareer, visitHome, persistedState, check, done, MISSION_ID } from './lib/v524dRewardHarness.mjs';

const store = createFileStore();
// Captura cada versão do arquivo da carreira no instante da escrita atômica.
const versions = [];
const realRename = store.api.rename;
store.api.rename = async (from, to) => {
  const out = await realRename(from, to);
  if (/^careers\/[^/]+\.json$/.test(to)) {
    const career = JSON.parse(store.files.get(to));
    const row = (career.entities?.MissionProgress || []).find((r) => r.mission_id === MISSION_ID) || null;
    versions.push({ coins: career.player?.coins, xp: career.player?.xp, status: row?.status || null, completed: Boolean(row?.completed), claimed: Boolean(row?.claimed), delivered: Boolean(row?.reward_delivered) });
  }
  return out;
};

let rt = await boot(store);
try {
  const { careerId, profileId } = await createCareer(rt, { coins: 100 });
  const baseline = persistedState(store, careerId);
  versions.length = 0;
  await visitHome(rt, profileId);
  await rt.close();
  rt = await boot(store);
  await openCareer(rt, careerId);
  await visitHome(rt, profileId);

  await check(`todas as ${versions.length} versões gravadas são coerentes (nenhum estado parcial)`, () => {
    for (const v of versions) {
      const rewarded = v.claimed || v.delivered || v.status === 'rewarded' || v.coins !== baseline.coins;
      if (!rewarded) continue;
      assert.equal(v.status, 'rewarded', JSON.stringify(v));
      assert.equal(v.completed && v.claimed && v.delivered, true, JSON.stringify(v));
      assert.equal(v.coins, baseline.coins + 50, JSON.stringify(v));
      assert.equal(v.xp, baseline.xp + 20, JSON.stringify(v));
    }
  });
  const final = persistedState(store, careerId);
  await check('final: mission completed + reward claimed + saldo +50 coerentes', () => {
    assert.equal(final.status, 'rewarded');
    assert.equal(final.completed && final.claimed && final.delivered, true);
    assert.equal(final.coins, 150);
  });
  await check('invariantes de economia: número finito, não negativo, sem NaN', () => {
    for (const v of versions) assert.ok(Number.isFinite(v.coins) && v.coins >= 0, JSON.stringify(v));
  });
} finally {
  await rt.close();
}
done('test-tutorial-reward-mission-state-consistency-v524d');
