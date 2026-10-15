// Playthrough 5.24-D, Parte K — saves existentes em estados inconsistentes.
// Decisão: NENHUMA migração retroativa de dinheiro. O ledger da missão
// (claimed/reward_delivered) é a única autoridade; onde ele não prova que a
// recompensa faltou, o save é preservado.
//  Caso 1: completed, sem claim, sem +50 → seguro: converge (+50 uma vez) na
//          próxima visita.
//  Caso 2: claimed, mas saldo sem +50 → NÃO soma (o jogador pode ter gastado).
//  Caso 3: incompleta mas claimed → preservada, sem nova concessão.
import assert from 'node:assert/strict';
import { createFileStore, boot, createCareer, openCareer, visitHome, persistedState, check, done, MISSION_ID } from './lib/v524dRewardHarness.mjs';

async function scenario(label, mutateRow) {
  const store = createFileStore();
  let rt = await boot(store);
  const { careerId, profileId } = await createCareer(rt, { coins: 100 });
  await rt.close();
  // Edita os BYTES do save (simula um save antigo já gravado assim).
  const path = `careers/${careerId}.json`;
  const career = JSON.parse(store.files.get(path));
  const rows = career.entities.MissionProgress || (career.entities.MissionProgress = []);
  rows.push({ id: `legacy-${MISSION_ID}`, mission_id: MISSION_ID, profile_id: profileId, period_key: 'tutorial:career', progress: 1, ...mutateRow });
  store.files.set(path, JSON.stringify(career));
  rt = await boot(store);
  await openCareer(rt, careerId);
  const w = store.log.durableWrites.length;
  await visitHome(rt, profileId);
  await visitHome(rt, profileId);
  const result = { ...persistedState(store, careerId), writes: store.log.durableWrites.length - w };
  await rt.close();
  console.log(`   [${label}] → ${JSON.stringify(result)}`);
  return result;
}

const c1 = await scenario('caso 1', { status: 'completed', completed: true, claimed: false, reward_delivered: false });
await check('caso 1 (completed, sem claim): converge para +50 exatamente uma vez', () => {
  assert.equal(c1.coins, 150);
  assert.equal(c1.claimed, true);
  assert.equal(c1.rows, 1, 'sem linha duplicada');
});

const c2 = await scenario('caso 2', { status: 'rewarded', completed: true, claimed: true, reward_delivered: true });
await check('caso 2 (claimed, saldo sem +50): NÃO soma retroativamente e não grava', () => {
  assert.equal(c2.coins, 100);
  assert.equal(c2.writes, 0);
});

const c3 = await scenario('caso 3', { status: 'in_progress', progress: 0, completed: false, claimed: true, reward_delivered: false });
await check('caso 3 (incompleta mas claimed): preservada, sem nova concessão', () => {
  assert.equal(c3.coins, 100);
  assert.equal(c3.claimed, true);
});

for (const [name, c] of [['1', c1], ['2', c2], ['3', c3]]) {
  await check(`caso ${name}: moedas numéricas e não negativas`, () => {
    assert.equal(typeof c.coins, 'number');
    assert.ok(Number.isFinite(c.coins) && c.coins >= 0);
  });
}
done('test-tutorial-reward-existing-save-compat-v524d');
