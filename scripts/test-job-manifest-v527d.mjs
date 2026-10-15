// Playthrough 5.27-D, Bloco A — MANIFEST: cada carreira é um job atômico com
// id <preset>-<perfil>-seed<NNN>-<anos>y e todos os campos obrigatórios; o
// read-modify-write é seguro entre processos (lock).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { spawn } from 'node:child_process';
import * as J from './lib/v527dJobs.mjs';
import { tempRoot, cleanup, initRoot } from './lib/v527dTestKit.mjs';

const { check, finish } = makeSuite('test-job-manifest-v527d');
const root = tempRoot('manifest');
const FIELDS = ['id', 'preset', 'profile', 'seed', 'targetYears', 'status', 'attempts', 'startedAt', 'finishedAt', 'checkpointPath', 'resultPath', 'error', 'runtimeSeconds'];
try {
  const manifest = initRoot(root);

  await check('99 jobs: Stage 1 = 45, Stage 2 = 45, long = 9 (3 obrigatórios)', () => {
    assert.equal(manifest.jobs.length, 99);
    assert.equal(manifest.jobs.filter((j) => j.stage === '1').length, 45);
    assert.equal(manifest.jobs.filter((j) => j.stage === '2').length, 45);
    assert.equal(manifest.jobs.filter((j) => j.stage === 'long').length, 9);
    assert.equal(manifest.jobs.filter((j) => j.stage === 'long' && j.required).length, 3);
  });

  await check('ids únicos no formato <preset>-<perfil>-seed<NNN>-<anos>y e parse ida/volta', () => {
    assert.equal(new Set(manifest.jobs.map((j) => j.id)).size, 99);
    for (const j of manifest.jobs) {
      assert.match(j.id, /^(conservative|balanced|hardcore)-(casual|normal|optimizer)-seed\d{3}-(2|5|10)y$/);
      const p = J.parseJobId(j.id);
      assert.deepEqual(p, { preset: j.preset, profile: j.profile, seed: j.seed, targetYears: j.targetYears });
    }
    assert.equal(J.jobId('balanced', 'normal', 4, 2), 'balanced-normal-seed004-2y');
    assert.equal(J.parseJobId('balanced-normal-seed4-2y'), null);
  });

  await check('todos os campos obrigatórios presentes; status inicial PENDING', () => {
    for (const j of manifest.jobs) {
      for (const f of FIELDS) assert.ok(f in j, `${j.id} sem ${f}`);
      assert.equal(j.status, 'PENDING');
      assert.ok(J.STATUSES.includes(j.status));
      assert.match(j.resultPath, new RegExp(`runs/${j.id}\\.json$`));
      assert.match(j.checkpointPath, new RegExp(`work/${j.id}/\\.checkpoints/${j.profile}-${String(j.seed).padStart(3, '0')}\\.json$`));
    }
  });

  await check('manifest carrega codeHash, balanceHash, harnessVersion e intervalo de checkpoint', () => {
    assert.match(manifest.codeHash, /^[0-9a-f]{64}$/);
    assert.match(manifest.balanceHash, /^[0-9a-f]{64}$/);
    assert.equal(manifest.harnessVersion, J.HARNESS_VERSION);
    assert.equal(manifest.checkpointEvery, 90);
  });

  await check('--init de novo preserva o manifest (não reseta jobs)', () => {
    J.updateManifest((m) => { m.jobs[0].status = 'DONE'; }, root);
    initRoot(root);
    assert.equal(J.loadManifest(root).jobs[0].status, 'DONE');
    J.updateManifest((m) => { m.jobs[0].status = 'PENDING'; }, root);
  });

  await check('lock entre processos: 2×40 incrementos concorrentes = 80 (nenhuma escrita perdida)', async () => {
    J.updateManifest((m) => { m.counter = 0; }, root);
    const code = `import * as J from './scripts/lib/v527dJobs.mjs'; for (let i = 0; i < 40; i += 1) J.updateManifest((m) => { m.counter += 1; }, process.argv[1]);`;
    const run = () => new Promise((res) => { const c = spawn(process.execPath, ['--input-type=module', '-e', code, root], { stdio: 'inherit' }); c.on('close', res); });
    const codes = await Promise.all([run(), run()]);
    assert.deepEqual(codes, [0, 0]);
    assert.equal(J.loadManifest(root).counter, 80);
  });

  await check('countStatuses reflete o manifest', () => {
    const c = J.countStatuses(J.loadManifest(root));
    assert.equal(c['1'].total, 45); assert.equal(c['1'].PENDING, 45);
    assert.equal(c.long.required, 3);
  });
} finally {
  cleanup(root);
  finish();
}
