// Playthrough 5.24-E, Partes F/G — migração necessária continua funcionando:
// save legado (schema anterior) → boot → migra → 1 escrita da carreira
// (antes eram 2: migração + carimbo) → restart → 0.
import assert from 'node:assert/strict';
import { bootCareer } from './lib/v524eAchievementHarness.mjs';
import { healthySave, editSave } from './lib/v524eBootFixtures.mjs';
import { check, done } from './lib/v524dRewardHarness.mjs';

const { store, careerId } = await healthySave();
const current = JSON.parse(store.files.get(`careers/${careerId}.json`)).save_schema_version;
editSave(store, careerId, (career) => { career.save_schema_version = current - 1; });

const repair = await bootCareer(store, careerId);
const m = repair.bootMetrics;
await repair.close();
const persisted = JSON.parse(store.files.get(`careers/${careerId}.json`));
await check(`boot com migração ${current - 1}→${current}: exatamente 1 escrita da carreira (medido: ${m.careerWrites}, índice: ${m.indexWrites})`, () => {
  assert.equal(m.careerWrites, 1);
  assert.ok(m.indexWrites <= 1);
});
await check('migração persistida (schema atual no disco)', () => assert.equal(persisted.save_schema_version, current));

const second = await bootCareer(store, careerId);
const m2 = second.bootMetrics;
await second.close();
await check('restart após o reparo: 0 escritas, checksum estável', () => {
  assert.equal(m2.writes, 0);
  assert.equal(m2.checksumAfter, m2.checksumBefore);
});
done('test-legacy-boot-single-repair-write-v524e');
