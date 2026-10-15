// Playthrough 5.27-D, Bloco D/I — Stage 1 = 5 seeds × 3 perfis × 3 presets ×
// 2 anos = 45 jobs, mesmas seeds nos 3 presets (comparação pareada). O Stage 1
// só termina com 45/45; antes disso o analisador diz PARTIAL e não classifica.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as J from './lib/v527dJobs.mjs';
import { tempRoot, cleanup, initRoot, markDone, analyze } from './lib/v527dTestKit.mjs';

const { check, finish } = makeSuite('test-stage1-matrix-completeness-v527d');
const root = tempRoot('s1');
try {
  const m = initRoot(root);
  const s1 = m.jobs.filter((j) => j.stage === '1');

  await check('45 jobs = 5 seeds × 3 perfis × 3 presets × 2 anos, cada combinação uma vez', () => {
    assert.equal(s1.length, 45);
    for (const preset of J.PRESETS) for (const profile of J.PROFILES) for (let seed = 1; seed <= 5; seed += 1) {
      assert.equal(s1.filter((j) => j.preset === preset && j.profile === profile && j.seed === seed && j.targetYears === 2).length, 1, `${preset}/${profile}/${seed}`);
    }
    assert.ok(s1.every((j) => j.required && j.targetDays === 730));
  });

  await check('mesmas seeds nos 3 presets (pareamento)', () => {
    const seedsOf = (p) => s1.filter((j) => j.preset === p).map((j) => `${j.profile}-${j.seed}`).sort().join();
    assert.equal(seedsOf('conservative'), seedsOf('balanced'));
    assert.equal(seedsOf('balanced'), seedsOf('hardcore'));
  });

  await check('ordem da fila intercala presets (resultados parciais já pareados)', () => {
    assert.deepEqual(s1.slice(0, 3).map((j) => j.preset), ['conservative', 'balanced', 'hardcore']);
  });

  for (const j of s1.slice(0, 44)) markDone(root, j.id);
  await check('44/45: Stage 1 PARTIAL, sem classificação e sem stage1-decision.json', () => {
    assert.equal(analyze(root).status, 0);
    const st = J.readJson(join(root, 'analysis', 'stage1.json'));
    assert.equal(st.status.label, 'PARTIAL'); assert.equal(st.status.done, 44);
    assert.match(String(st.classification), /PARTIAL/);
    assert.ok(!existsSync(join(root, 'stage1-decision.json')));
  });

  markDone(root, s1[44].id);
  await check('45/45: COMPLETE, os 3 presets classificados, no máximo 1 PREFERRED, decisão gravada', () => {
    assert.equal(analyze(root).status, 0);
    const st = J.readJson(join(root, 'analysis', 'stage1.json'));
    assert.equal(st.status.label, 'COMPLETE');
    for (const p of J.PRESETS) assert.ok(['REJECT', 'VIABLE', 'PREFERRED'].includes(st.classification[p].classification));
    assert.ok(Object.values(st.classification).filter((c) => c.classification === 'PREFERRED').length <= 1);
    const d = J.readJson(join(root, 'stage1-decision.json'));
    assert.equal(d.complete, true);
    // Fixture idêntica nos 3 presets → empate → desempate pelo default (Balanced).
    assert.equal(d.winner, 'balanced'); assert.equal(d.proceedToStage2, true);
  });

  await check('comparação pareada: 15 pares por par de presets, por seed/perfil', () => {
    const st = J.readJson(join(root, 'analysis', 'stage1.json'));
    assert.equal(st.paired['conservative-vs-balanced'].pairs, 15);
    assert.equal(st.paired['balanced-vs-hardcore'].pairs, 15);
  });

  await check('distribuições completas (mean, median, P10, P25, P75, P90, min, max, std)', () => {
    const st = J.readJson(join(root, 'analysis', 'stage1.json'));
    const d = st.presets.balanced.all.rank2y;
    for (const k of ['mean', 'median', 'p10', 'p25', 'p75', 'p90', 'min', 'max', 'std']) assert.ok(k in d, `sem ${k}`);
    assert.equal(d.n, 15);
  });

  await check('manifest oficial (se existir) tem os 45 jobs do Stage 1', () => {
    const official = J.loadManifest(J.rootDir('reports/rebalance-527d'));
    if (!official) return;
    assert.equal(official.jobs.filter((j) => j.stage === '1').length, 45);
  });
} finally {
  cleanup(root);
  finish();
}
