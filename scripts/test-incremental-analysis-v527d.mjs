// Playthrough 5.27-D, Bloco G — o analisador roda a QUALQUER momento sobre os
// jobs DONE, nunca declara conclusão parcial como final e cresce com os dados.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as J from './lib/v527dJobs.mjs';
import { tempRoot, cleanup, initRoot, markDone, analyze } from './lib/v527dTestKit.mjs';

const { check, finish } = makeSuite('test-incremental-analysis-v527d');
const root = tempRoot('incr');
const summary = () => J.readJson(join(root, 'analysis', 'summary.json'));
try {
  const m = initRoot(root);
  const s1 = m.jobs.filter((j) => j.stage === '1');

  await check('0 jobs DONE: roda, tudo PARTIAL, nenhuma decisão', () => {
    const r = analyze(root);
    assert.equal(r.status, 0, r.stderr.slice(-300));
    const s = summary();
    assert.equal(s.careersLoaded, 0);
    assert.equal(s.stages['1'].label, 'PARTIAL'); assert.equal(s.stages['2'].label, 'PARTIAL'); assert.equal(s.stages.long.label, 'PARTIAL');
    assert.equal(s.final.status, 'PARTIAL');
    assert.ok(!existsSync(join(root, 'stage1-decision.json')));
  });

  for (const j of s1.slice(0, 7)) markDone(root, j.id);
  await check('7 jobs DONE: métricas parciais com n = 7 (e por preset), ainda PARTIAL', () => {
    assert.equal(analyze(root).status, 0);
    const s = summary();
    assert.equal(s.careersLoaded, 7);
    assert.equal(s.stages['1'].done, 7);
    const st = J.readJson(join(root, 'analysis', 'stage1.json'));
    const n = J.PRESETS.reduce((t, p) => t + st.presets[p].all.careers, 0);
    assert.equal(n, 7);
    assert.match(String(st.classification), /PARTIAL/);
  });

  await check('CSVs e JSONs incrementais existem desde o 1º resultado', () => {
    for (const f of ['stage1.json', 'stage2.json', 'long.json', 'final.json', 'harness.json', 'summary.json', 'stage1-presets.csv', 'cashflow.csv', 'money-solved.csv', 'insolvency.csv', 'save-size.csv', 'harness-perf.csv']) assert.ok(existsSync(join(root, 'analysis', f)), `sem ${f}`);
  });

  for (const j of s1.slice(7)) markDone(root, j.id);
  await check('45 jobs: Stage 1 COMPLETE e decisão gravada; veredito final continua PARTIAL', () => {
    assert.equal(analyze(root).status, 0);
    const s = summary();
    assert.equal(s.careersLoaded, 45);
    assert.equal(s.stages['1'].label, 'COMPLETE');
    assert.ok(existsSync(join(root, 'stage1-decision.json')));
    const f = J.readJson(join(root, 'analysis', 'final.json'));
    assert.equal(f.status, 'PARTIAL');
    assert.equal(f.allPass, undefined);
    assert.match(f.note, /45\/45, 0\/45, 0\/3/);
  });

  await check('o analisador não altera o manifest nem a configuração', () => {
    const before = J.readJson(J.paths(root).manifest);
    assert.equal(analyze(root).status, 0);
    const after = J.readJson(J.paths(root).manifest);
    assert.equal(J.canonical(after.jobs), J.canonical(before.jobs));
  });
} finally {
  cleanup(root);
  finish();
}
