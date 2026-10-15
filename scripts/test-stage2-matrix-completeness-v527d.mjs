// Playthrough 5.27-D, Bloco J — Stage 2 = Balanced × 15 seeds × 3 perfis × 5
// anos = 45 jobs. Só abre com Stage 1 45/45 E decisão Balanced PREFERRED; só
// termina com 45/45.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { join } from 'node:path';
import * as J from './lib/v527dJobs.mjs';
import { tempRoot, cleanup, initRoot, markDone, analyze, orch } from './lib/v527dTestKit.mjs';

const { check, finish } = makeSuite('test-stage2-matrix-completeness-v527d');
const root = tempRoot('s2');
try {
  const m = initRoot(root);
  const s2 = m.jobs.filter((j) => j.stage === '2');

  await check('45 jobs = Balanced × seeds 1–15 × 3 perfis × 5 anos (1826 dias)', () => {
    assert.equal(s2.length, 45);
    assert.ok(s2.every((j) => j.preset === 'balanced' && j.targetYears === 5 && j.targetDays === 1826 && j.required));
    for (const profile of J.PROFILES) assert.deepEqual(s2.filter((j) => j.profile === profile).map((j) => j.seed), Array.from({ length: 15 }, (_, i) => i + 1));
  });

  await check('gate: Stage 2 bloqueado com Stage 1 incompleto', () => {
    const r = orch(root, ['--stage=2', '--max-jobs=0', '--no-load-check']);
    assert.equal(r.status, 2);
    assert.match(r.stdout, /Stage 1 incompleto \(0\/45\)/);
  });

  for (const j of m.jobs.filter((x) => x.stage === '1')) markDone(root, j.id);
  await check('gate: com 45/45 mas sem decisão → bloqueado', () => {
    const r = orch(root, ['--stage=2', '--max-jobs=0', '--no-load-check']);
    assert.equal(r.status, 2);
    assert.match(r.stdout, /stage1-decision\.json ausente/);
  });

  await check('gate: decisão sem Balanced PREFERRED → bloqueado (default não muda sozinho)', () => {
    J.atomicWrite(join(root, 'stage1-decision.json'), JSON.stringify({ proceedToStage2: false, reason: 'hardcore PREFERRED — parar antes do Stage 2' }));
    const r = orch(root, ['--stage=2', '--max-jobs=0', '--no-load-check']);
    assert.equal(r.status, 2);
    assert.match(r.stdout, /não libera o Stage 2/);
  });

  await check('gate: Balanced PREFERRED (analisador) → Stage 2 liberado com 45 jobs na fila', () => {
    assert.equal(analyze(root).status, 0);
    assert.equal(J.readJson(join(root, 'stage1-decision.json')).proceedToStage2, true);
    const r = orch(root, ['--stage=2', '--max-jobs=0', '--no-load-check']);
    assert.equal(r.status, 0, r.stdout.slice(-300));
    assert.match(r.stdout, /fila: 45 jobs/);
  });

  for (const j of s2.slice(0, 44)) markDone(root, j.id, { years: 5 });
  await check('Stage 2 44/45 → PARTIAL; 45/45 → COMPLETE', () => {
    assert.equal(analyze(root).status, 0);
    assert.equal(J.readJson(join(root, 'analysis', 'stage2.json')).status.label, 'PARTIAL');
    markDone(root, s2[44].id);
    assert.equal(analyze(root).status, 0);
    const st = J.readJson(join(root, 'analysis', 'stage2.json'));
    assert.equal(st.status.label, 'COMPLETE');
    assert.equal(st.byProfile.all.careers, 45);
  });

  await check('métricas de 5 anos: dificuldade por ano, tiers, rodadas, marcos, títulos, economia', () => {
    const st = J.readJson(join(root, 'analysis', 'stage2.json')).byProfile.all;
    assert.deepEqual(Object.keys(st.competitionByYear), ['Y1', 'Y2', 'Y3', 'Y4', 'Y5']);
    assert.deepEqual(Object.keys(st.competition.tiers), ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown']);
    for (const r of ['R1', 'R2', 'QF', 'SF', 'F']) assert.ok(r in st.competition.rounds);
    for (const k of ['top500', 'top250', 'top100', 'top50', 'top20', 'top10', 'top5', '#1']) assert.ok(k in st.milestones);
    assert.deepEqual(Object.keys(st.rankCheckpoints), ['d91', 'd182', 'd365', 'd730', 'd1095', 'd1460', 'd1826']);
    assert.deepEqual(Object.keys(st.sponsorShareByYear), ['Y1', 'Y2', 'Y3', 'Y4', 'Y5']);
  });
} finally {
  cleanup(root);
  finish();
}
