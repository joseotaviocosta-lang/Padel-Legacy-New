// Playthrough 5.24-E, Partes A/F/I/Z — TESTE PRINCIPAL DE BOOT.
// save saudável → boot real (loadCareer) → ocioso → fechar:
// 0 escritas, revisão igual, checksum igual. Antes: 2 escritas por boot
// (carreira inteira + índice), só para carimbar last_played_at/updated_at.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bootCareer } from './lib/v524eAchievementHarness.mjs';
import { healthySave } from './lib/v524eBootFixtures.mjs';
import { check, done } from './lib/v524dRewardHarness.mjs';

const source = readFileSync(new URL('../src/careers/CareerManager.js', import.meta.url), 'utf8');
const load = source.match(/async loadCareer\(careerId\)[\s\S]*?\n  \}/)[0];
await check('domínio: loadCareer só grava a carreira quando a migração mudou o save', () => {
  assert.match(load, /if \(migrated\.migrated\) \{[\s\S]*?writeCareer/);
  assert.equal((load.match(/writeCareer\(/g) || []).length, 1, 'uma única chamada de writeCareer, condicional');
  assert.match(load, /if \(switching \|\| summaryChanged \|\| migrated\.migrated\)/, 'índice só quando muda');
});

const { store, careerId } = await healthySave();
for (let i = 1; i <= 3; i += 1) {
  const rt = await bootCareer(store, careerId);
  const m = rt.bootMetrics;
  await rt.close();
  await check(`boot ocioso #${i}: 0 escritas · revisão ${m.revisionBefore}=${m.revisionAfter} · checksum ${m.checksumBefore}=${m.checksumAfter}`, () => {
    assert.equal(m.writes, 0);
    assert.equal(m.revisionAfter, m.revisionBefore);
    assert.equal(m.checksumAfter, m.checksumBefore);
  });
}
done('test-idle-boot-zero-write-v524e');
