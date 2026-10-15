// Playthrough 5.26-B — carreira real atravessa o primeiro ano SEM o shim do
// harness: na 5.26 toda carreira congelava entre os dias 366 e 452
// ("AthleteProfile já existe com o id: real_…"). Roda o lifecycle completo
// (advanceCareerDays → simulateWorldDay, mercado da IA, world tour, reparo
// de semeadura) até o dia 400.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-career-year2-no-freeze-v526b');
const work = mkdtempSync(join(tmpdir(), 'pl526b-year2-'));
try {
  const env = { ...process.env }; delete env.PL526_SHIM; // contorno DESLIGADO
  const r = spawnSync(process.execPath, ['scripts/sim-progression-economy-v526.mjs', '--profile=normal', '--seeds=2-2', '--days=400', `--out=${work}`, '--force'], { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
  const out = JSON.parse(readFileSync(join(work, 'normal-002.json'), 'utf8'));
  await check('simulação terminou (processo ok)', () => assert.equal(r.status, 0, r.stderr.slice(-400)));
  await check('chegou ao dia 400 (passou dos dias 366–452 da 5.26)', () => assert.equal(out.days, 400));
  await check('nenhuma falha de avanço de dia', () => assert.deepEqual(out.advanceFailures, []));
  await check('nenhum "AthleteProfile já existe" (recriação de atleta)', () => assert.ok(!JSON.stringify(out.errors).includes('já existe'), JSON.stringify(out.errors)));
  await check('contorno não usado (0 disparos do shim)', () => assert.equal(out.softLock.fires, 0));
  await check('o ano novo aconteceu de fato (2027 nos snapshots)', () => assert.ok(out.weekly.at(-1).date >= '2027-02-01', out.weekly.at(-1).date));
} finally {
  rmSync(work, { recursive: true, force: true });
}
finish();
