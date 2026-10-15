// Playthrough 5.27-D, Bloco B/S — DETERMINISMO DO JOB.
// 0. carregar módulo pelo Vite não consome o RNG do jogo (bug achado na 5.27-D:
//    o nanoid do module runner usava o Math.random determinístico, e um processo
//    retomado carregava módulos em outros momentos → carreira divergia após o
//    checkpoint do dia 90);
// Mesma carreira por caminhos diferentes ⇒ o MESMO outcomeHash:
//  1. contínuo (um processo, sem checkpoint) × pipeline 5.27-D (segmentos de
//     90 dias + fastclone), 200 dias = 2 fronteiras de checkpoint;
//  2. pipeline com kill no meio de um segmento (dia 135) e retomada;
//  3. job mais longo semeado pelo checkpoint arquivado do job curto × do zero;
//  4. o mesmo job de novo numa raiz limpa (duplicata) + import consistente.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as J from './lib/v527dJobs.mjs';

const { check, finish } = makeSuite('test-job-determinism-v527d');
const work = mkdtempSync(join(tmpdir(), 'pl527d-det-'));
const DAYS = 200; const CK = 90;
const baseEnv = { ...process.env, PL527D_TEST_DAYS: `2:${DAYS},5:${DAYS + 40}`, PL527D_ARCHIVE_DAYS: `${CK},${CK * 2}` };
delete baseEnv.PL526_SHIM;
const simEnv = (preset, extra = {}) => ({ ...baseEnv, PL527_PRESET: preset, PL527D_FASTCLONE: '1', PL527D_ISOLATE_VITE_RNG: '1', ...extra });
const orch = (root, args, extraEnv = {}) => spawnSync(process.execPath, ['scripts/run-balance-validation-v527d.mjs', ...args], { env: { ...baseEnv, PL527D_ROOT: root, ...extraEnv }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const ID = 'hardcore-optimizer-seed002-2y';
const envelope = (root, id = ID) => J.readJson(join(root, 'runs', `${id}.json`));
let continuousHash = null;
try {
  await check('0. carregar módulos pelo Vite não consome o RNG do jogo (isolado); sem isolar, consumia', () => {
    const code = (load) => `
      import { installDeterminism, bootRuntime, MemoryStorage } from './scripts/lib/v526CareerSim.mjs';
      installDeterminism('rng-isolation');
      const rt = await bootRuntime(new MemoryStorage());
      const a = Math.random();
      ${load ? "await rt.load('/src/lib/legacy.js'); await rt.load('/src/lib/achievements.js').catch(() => null);" : ''}
      const b = Math.random();
      await rt.close();
      console.log(JSON.stringify([a, b]));`;
    const run = (load, iso) => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', code(load)], { env: { ...baseEnv, PL527D_ISOLATE_VITE_RNG: iso ? '1' : '0' }, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr.slice(-300));
      return JSON.parse(r.stdout.trim().split('\n').at(-1));
    };
    assert.deepEqual(run(true, true), run(false, true), 'com isolamento, o carregamento de módulo deslocou o RNG do jogo');
    assert.notDeepEqual(run(true, false), run(false, false), 'sem isolamento o carregamento deveria consumir o RNG (o bug documentado)');
  });

  await check(`1a. contínuo (${DAYS} dias, um processo, sem checkpoint) conclui`, () => {
    const out = join(work, 'continuous');
    const r = spawnSync(process.execPath, ['scripts/sim-progression-economy-v526.mjs', '--profile=optimizer', '--seeds=2-2', `--days=${DAYS}`, `--out=${out}`], { env: simEnv('hardcore', { PL527D_FASTCLONE: '0' }), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    assert.equal(r.status, 0, r.stderr.slice(-400));
    const result = JSON.parse(readFileSync(join(out, 'optimizer-002.json'), 'utf8'));
    assert.equal(result.days, DAYS);
    continuousHash = J.outcomeHash(result);
  });

  await check('1b. pipeline (segmentos de 90 dias + fastclone) == contínuo', () => {
    const root = join(work, 'pipeline');
    assert.equal(orch(root, ['--init']).status, 0);
    const r = orch(root, ['--job', ID, `--checkpoint-every=${CK}`, '--no-load-check']);
    assert.equal(r.status, 0, (r.stdout + r.stderr).slice(-600));
    const env = envelope(root);
    assert.equal(env.segments, 2);
    assert.equal(env.isolateViteRng, true);
    assert.equal(env.outcomeHash, continuousHash, 'segmentado divergiu do contínuo');
  });

  await check('2. kill no dia 135 (entre os checkpoints 90 e 180) → retoma → mesmo desfecho', () => {
    const root = join(work, 'killed');
    assert.equal(orch(root, ['--init']).status, 0);
    const job = J.loadManifest(root).jobs.find((j) => j.id === ID);
    const wd = J.workDirFor(ID, J.paths(root).work);
    const segArgs = ['scripts/sim-progression-economy-v526.mjs', '--profile=optimizer', '--seeds=2-2', `--days=${job.targetDays}`, `--out=${wd}`, `--checkpointEvery=${CK}`, '--segment'];
    assert.equal(spawnSync(process.execPath, segArgs, { env: simEnv('hardcore'), encoding: 'utf8' }).status, 3);
    const killed = spawnSync(process.execPath, [...segArgs, '--stopAtDay=135'], { env: simEnv('hardcore'), encoding: 'utf8' });
    assert.equal(killed.status, 4, 'o kill simulado deveria sair com 4');
    J.updateManifest((m) => { const j = m.jobs.find((x) => x.id === ID); j.status = 'RUNNING'; j.owner = { pid: 999999, host: J.hostname(), at: '2020-01-01T00:00:00.000Z' }; }, root);
    const r = orch(root, ['--job', ID, `--checkpoint-every=${CK}`, '--no-load-check']);
    assert.equal(r.status, 0, (r.stdout + r.stderr).slice(-600));
    assert.match(r.stdout, /recuperados 1 jobs RUNNING obsoletos/);
    assert.equal(envelope(root).outcomeHash, continuousHash, 'retomado divergiu do contínuo');
  });

  await check('3. job mais longo semeado pelo checkpoint do job curto == job longo do zero', () => {
    const root = join(work, 'pipeline');
    const bal2 = 'balanced-casual-seed004-2y'; const bal5 = 'balanced-casual-seed004-5y';
    let r = orch(root, ['--job', bal2, `--checkpoint-every=${CK}`, '--no-load-check']);
    assert.equal(r.status, 0, (r.stdout + r.stderr).slice(-600));
    assert.ok(existsSync(join(root, 'seed-checkpoints', `balanced-casual-seed004-d${CK}.ckpt`)), 'semente do dia 90 não arquivada');
    r = orch(root, ['--job', bal5, `--checkpoint-every=${CK}`, '--no-load-check']);
    assert.equal(r.status, 0, (r.stdout + r.stderr).slice(-600));
    assert.match(r.stdout, new RegExp(`semeado do checkpoint do dia ${CK * 2}|semeado do checkpoint do dia ${CK}`));
    const seeded = envelope(root, bal5);
    assert.ok(seeded.seededFrom?.day >= CK);
    const fresh = join(work, 'fresh5y');
    assert.equal(orch(fresh, ['--init']).status, 0);
    r = orch(fresh, ['--job', bal5, `--checkpoint-every=${CK}`, '--no-load-check']);
    assert.equal(r.status, 0, (r.stdout + r.stderr).slice(-600));
    assert.equal(envelope(fresh, bal5).seededFrom, null);
    assert.equal(seeded.outcomeHash, envelope(fresh, bal5).outcomeHash, 'semeado divergiu do job do zero');
  });

  await check('4. duplicata do mesmo job (raiz limpa) → mesmo outcomeHash; import confirma consistência', () => {
    const root = join(work, 'dup');
    assert.equal(orch(root, ['--init']).status, 0);
    const r = orch(root, ['--job', ID, `--checkpoint-every=${CK}`, '--no-load-check']);
    assert.equal(r.status, 0, (r.stdout + r.stderr).slice(-600));
    assert.equal(envelope(root).outcomeHash, envelope(join(work, 'pipeline')).outcomeHash);
    const imp = orch(join(work, 'pipeline'), [`--import=${join(root, 'runs', `${ID}.json`)}`]);
    assert.equal(imp.status, 0, imp.stdout.slice(-400));
    assert.match(imp.stdout, /duplicado consistente/);
    assert.equal(J.loadManifest(join(work, 'pipeline')).determinismFailures.length, 0);
  });
} finally {
  rmSync(work, { recursive: true, force: true });
  finish();
}
