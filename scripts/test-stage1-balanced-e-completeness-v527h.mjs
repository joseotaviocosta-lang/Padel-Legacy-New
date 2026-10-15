// Playthrough 5.27-H, Bloco B — Stage 1 oficial completo: 5 seeds × 3 perfis ×
// 3 presets-E × 2 anos = 45 carreiras, todas DONE com resultado atômico e hash,
// mesmas seeds entre presets (pareado), 0 FAILED, 0 divergência de determinismo.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import * as J from './lib/v527dJobs.mjs';
import { analyze, manifest, report, runs } from './lib/v527hTestKit.mjs';

const { check, finish } = makeSuite('test-stage1-balanced-e-completeness-v527h');
const PRESETS = ['conservative-e', 'balanced-e', 'hardcore-e'];
const PROFILES = ['casual', 'normal', 'optimizer'];
try {
  const m = manifest();
  await check('manifest tem exatamente as 45 carreiras do Stage 1 (presets -E, 730 dias)', () => {
    assert.ok(m, 'manifest ausente — rode run-stage1-v527h.mjs --init');
    assert.equal(m.jobs.length, 45);
    const want = new Set(PRESETS.flatMap((p) => PROFILES.flatMap((pr) => [1, 2, 3, 4, 5].map((s) => J.jobId(p, pr, s, 2)))));
    assert.deepEqual(new Set(m.jobs.map((j) => j.id)), want);
    for (const j of m.jobs) { assert.equal(j.stage, '1'); assert.equal(j.targetDays, 730, j.id); }
  });
  await check('45/45 DONE, 0 FAILED, 0 determinism failure', () => {
    const c = J.countStatuses(m)['1'];
    assert.equal(c.DONE, 45, JSON.stringify(c));
    assert.equal(m.jobs.filter((j) => j.status === 'FAILED').length, 0);
    assert.equal(m.determinismFailures.length, 0);
  });
  await check('cada DONE tem resultado atômico próprio com resultHash/outcomeHash válidos e 730 dias', () => {
    const rs = runs();
    assert.equal(rs.length, 45);
    for (const { file, env } of rs) {
      assert.equal(J.envelopeHash(env), env.resultHash, file);
      assert.equal(J.outcomeHash(env.result), env.outcomeHash, file);
      assert.equal(env.result.days, 730, file);
      assert.equal(m.jobs.find((j) => j.id === env.jobId).outcomeHash, env.outcomeHash, file);
    }
  });
  await check('mesmas seeds entre presets (comparação pareada) e policy v3 em todas', () => {
    const rs = runs();
    for (const p of PRESETS) for (const pr of PROFILES) assert.deepEqual(rs.filter((r) => r.env.preset === p && r.env.profile === pr).map((r) => r.env.seed).sort(), [1, 2, 3, 4, 5], `${p}/${pr}`);
    for (const { file, env } of rs) assert.equal(env.policy, 'v3', file);
  });
  await check('checkpoint a cada 90 dias: todo job passou por segmentos (resume real)', () => {
    for (const j of m.jobs) assert.ok(j.segments >= 8, `${j.id}: ${j.segments} segmentos`);
    assert.equal(m.checkpointEvery, 90);
  });
  await check('analisador confirma 45/45 e grava stage1.json/preset-comparison.json', () => {
    const r = analyze();
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.equal(report('stage1.json').complete, true);
    assert.equal(report('stage1.json').operational.careersLoaded, 45);
    assert.equal(report('preset-comparison.json').complete, true);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
