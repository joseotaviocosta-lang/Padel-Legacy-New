// Playthrough 5.27-D, Bloco O — long runs: Balanced × 3 perfis × 10 anos;
// obrigatório 1 seed (3 jobs), preferencial 3 seeds (9). Só abrem com Stage 2
// 45/45; checkpoint a cada 90 dias; métricas de late game e tamanho do save.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { join } from 'node:path';
import * as J from './lib/v527dJobs.mjs';
import { tempRoot, cleanup, initRoot, markDone, analyze, orch } from './lib/v527dTestKit.mjs';

const { check, finish } = makeSuite('test-longrun-completeness-v527d');
const root = tempRoot('long');
try {
  const m = initRoot(root);
  const long = m.jobs.filter((j) => j.stage === 'long');

  await check('9 long jobs Balanced 10 anos (3653 dias): seed 1 obrigatória × 3 perfis, seeds 2–3 preferenciais', () => {
    assert.equal(long.length, 9);
    assert.ok(long.every((j) => j.preset === 'balanced' && j.targetYears === 10 && j.targetDays === 3653));
    assert.deepEqual(long.filter((j) => j.required).map((j) => j.id).sort(), ['balanced-casual-seed001-10y', 'balanced-normal-seed001-10y', 'balanced-optimizer-seed001-10y']);
  });

  await check('checkpoint a cada 90 dias também no long run', () => assert.equal(m.checkpointEvery, 90));

  await check('gate: long bloqueado até o Stage 2 ter 45/45', () => {
    const r = orch(root, ['--stage=long', '--max-jobs=0', '--no-load-check']);
    assert.equal(r.status, 2);
    assert.match(r.stdout, /Stage 2 incompleto/);
  });

  for (const j of m.jobs.filter((x) => x.stage === '2')) markDone(root, j.id);
  await check('gate aberto: fila = 3 obrigatórios; com --preferred = 9', () => {
    let r = orch(root, ['--stage=long', '--max-jobs=0', '--no-load-check']);
    assert.equal(r.status, 0, r.stdout.slice(-300));
    assert.match(r.stdout, /fila: 3 jobs/);
    r = orch(root, ['--stage=long', '--preferred', '--max-jobs=0', '--no-load-check']);
    assert.match(r.stdout, /fila: 9 jobs/);
  });

  await check('long COMPLETE com 3/3 obrigatórios; métricas de late game e save Y1/Y3/Y5/Y10', () => {
    for (const j of long.filter((x) => x.required)) markDone(root, j.id, { rankAt: (d) => (d > 2500 && d < 2800 ? 1 : Math.max(2, 1000 - Math.round(d / 3))) });
    assert.equal(analyze(root).status, 0);
    const l = J.readJson(join(root, 'analysis', 'long.json'));
    assert.equal(l.status.label, 'COMPLETE'); assert.equal(l.status.done, 3);
    assert.equal(l.careers.length, 3);
    for (const c of l.careers) {
      for (const k of ['peakRank', 'ageAtPeak', 'titles', 'numberOneDays', 'economySaturation', 'staffSaturation', 'gearSaturation', 'sponsorShareByYear', 'investmentShareByYear', 'saveMB']) assert.ok(k in c, `sem ${k}`);
      assert.deepEqual(Object.keys(c.saveMB), ['Y1', 'Y3', 'Y5', 'Y10']);
      assert.ok(c.saveMB.Y10 != null);
      assert.equal(c.peakRank, 1);
      assert.ok(c.numberOneDays > 0);
    }
  });
} finally {
  cleanup(root);
  finish();
}
