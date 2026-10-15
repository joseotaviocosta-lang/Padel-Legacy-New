// Playthrough 5.27-D, item 6 — RUNNING sem processo vivo NUNCA bloqueia a
// fila: vira CHECKPOINTED (checkpoint válido / resultado órfão) ou PENDING.
// Job com dono vivo (orquestrador ou simulador órfão com heartbeat) fica.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as J from './lib/v527dJobs.mjs';
import { tempRoot, cleanup, initRoot, orch, syntheticResult, writeSyntheticCheckpoint } from './lib/v527dTestKit.mjs';

const { check, finish } = makeSuite('test-stale-running-recovery-v527d');
const root = tempRoot('stale');
const TEST_DAYS = { PL527D_TEST_DAYS: '2:10' };
const DEAD = 999999;
const old = '2020-01-01T00:00:00.000Z';
let sleeper = null;
try {
  initRoot(root, TEST_DAYS);
  const P = J.paths(root);
  const ids = J.loadManifest(root).jobs.filter((j) => j.stage === '1').slice(0, 8).map((j) => j.id);
  const jobOf = (id) => J.loadManifest(root).jobs.find((j) => j.id === id);
  const setRunning = (id, owner = { pid: DEAD, host: J.hostname(), at: old }) => J.updateManifest((m) => { const j = m.jobs.find((x) => x.id === id); j.status = 'RUNNING'; j.owner = owner; }, root);
  const ckptPayload = (job, day) => ({ version: 2, harness: '5.27-D', preset: job.preset, profile: job.profile, seed: job.seed, day, out: {} });
  sleeper = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 600000)'], { stdio: 'ignore' });
  const now = new Date().toISOString();

  // a) sem nada · b) checkpoint válido · c) só .prev válido · d) resultado órfão
  // e) dono vivo (owner.json fresco) · f) owner.json fresco com pid morto · g) simulador órfão vivo
  const [a, b, c, d, e, f, g] = ids;
  for (const id of ids.slice(0, 7)) setRunning(id);
  writeSyntheticCheckpoint(J.checkpointFileFor(jobOf(b), P.work), ckptPayload(jobOf(b), 90));
  writeSyntheticCheckpoint(`${J.checkpointFileFor(jobOf(c), P.work)}.prev`, ckptPayload(jobOf(c), 180));
  writeFileSync(J.checkpointFileFor(jobOf(c), P.work), 'corrompido');
  J.mkdirSync(J.workDirFor(d, P.work), { recursive: true });
  writeFileSync(J.simResultFileFor(jobOf(d), P.work), JSON.stringify(syntheticResult({ profile: jobOf(d).profile, seed: jobOf(d).seed, days: jobOf(d).targetDays })));
  setRunning(e, { pid: sleeper.pid, host: J.hostname(), at: old });
  J.mkdirSync(J.workDirFor(e, P.work), { recursive: true });
  writeFileSync(join(J.workDirFor(e, P.work), 'owner.json'), JSON.stringify({ pid: sleeper.pid, at: now }));
  J.mkdirSync(J.workDirFor(f, P.work), { recursive: true });
  writeFileSync(join(J.workDirFor(f, P.work), 'owner.json'), JSON.stringify({ pid: DEAD, at: now }));
  J.mkdirSync(J.workDirFor(g, P.work), { recursive: true });
  writeFileSync(join(J.workDirFor(g, P.work), 'heartbeat.json'), JSON.stringify({ pid: sleeper.pid, at: now, day: 100 }));

  const r = orch(root, ['--recover'], TEST_DAYS);
  await check('--recover roda sem erro e registra os recuperados', () => {
    assert.equal(r.status, 0, r.stderr.slice(-400));
    assert.match(r.stdout, /recuperados 5 jobs RUNNING obsoletos/);
  });
  await check('a) dono morto sem checkpoint → PENDING', () => assert.equal(jobOf(a).status, 'PENDING'));
  await check('b) dono morto com checkpoint válido → CHECKPOINTED (dia 90)', () => { assert.equal(jobOf(b).status, 'CHECKPOINTED'); assert.equal(jobOf(b).lastCheckpointDay, 90); });
  await check('c) checkpoint corrompido mas .prev válido → CHECKPOINTED (dia 180)', () => { assert.equal(jobOf(c).status, 'CHECKPOINTED'); assert.equal(jobOf(c).lastCheckpointDay, 180); });
  await check('d) resultado do simulador órfão → CHECKPOINTED + pendingFinalize', () => { assert.equal(jobOf(d).status, 'CHECKPOINTED'); assert.equal(jobOf(d).pendingFinalize, true); });
  await check('e) orquestrador dono vivo (owner.json fresco) → continua RUNNING', () => assert.equal(jobOf(e).status, 'RUNNING'));
  await check('f) owner.json fresco mas pid morto → recuperado', () => assert.equal(jobOf(f).status, 'PENDING'));
  await check('g) simulador órfão vivo com heartbeat fresco → continua RUNNING (não roda em dobro)', () => assert.equal(jobOf(g).status, 'RUNNING'));
  await check('eventos stale-running-recovered no manifest', () => assert.equal(J.loadManifest(root).events.filter((x) => x.kind === 'stale-running-recovered').length, 5));

  await check('d) o resultado órfão é finalizado (DONE) sem rerodar', () => {
    const run = orch(root, ['--job', d, '--no-load-check'], TEST_DAYS);
    assert.equal(run.status, 0, (run.stdout + run.stderr).slice(-400));
    assert.match(run.stdout, /resultado do simulador já existia — finalizado/);
    assert.equal(jobOf(d).status, 'DONE');
  });

  await check('RUNNING obsoleto não bloqueia: --job direto reivindica e conclui', () => {
    setRunning(a);
    const run = orch(root, ['--job', a, '--checkpoint-every=5', '--no-load-check'], TEST_DAYS);
    assert.equal(run.status, 0, (run.stdout + run.stderr).slice(-600));
    assert.equal(jobOf(a).status, 'DONE');
  });
} catch (error) {
  console.log(`✗ setup: ${error.stack}`);
  process.exitCode = 1;
} finally {
  if (sleeper) sleeper.kill();
  cleanup(root);
  finish();
}
