// Playthrough 5.27-D, Bloco B — CHECKPOINT/RESUME do simulador.
// Formato com checksum, rotação .prev, sidecar de metadados, conteúdo
// obrigatório (save, RNG, mundo, parceria, ranking, ledger, data, métricas),
// retomada do .prev com o MESMO desfecho e recusa de arquivo inválido.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as J from './lib/v527dJobs.mjs';
import { tempRoot, cleanup, initRoot, orch } from './lib/v527dTestKit.mjs';

const { check, finish } = makeSuite('test-job-checkpoint-resume-v527d');
const work = tempRoot('ckpt');
const DAYS = 30; const CK = 10;
const sim = (out, extra = [], env = {}) => spawnSync(process.execPath, ['scripts/sim-progression-economy-v526.mjs', '--profile=casual', '--seeds=3-3', `--days=${DAYS}`, `--out=${out}`, ...extra], { env: { ...process.env, PL527_PRESET: 'balanced', PL527D_FASTCLONE: '1', ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const seg = (out, env) => sim(out, [`--checkpointEvery=${CK}`, '--segment'], env);
const ckptOf = (out) => join(out, '.checkpoints', 'casual-003.json');
const outcome = (out) => J.outcomeHash(JSON.parse(readFileSync(join(out, 'casual-003.json'), 'utf8')));
let reference = null;
try {
  await check('referência: carreira contínua de 30 dias', () => {
    const out = join(work, 'ref');
    assert.equal(sim(out).status, 0);
    reference = outcome(out);
  });

  const A = join(work, 'a');
  await check('segmento 1: checkpoint do dia 10 com trailer sha256 e sidecar', () => {
    assert.equal(seg(A).status, 3);
    const text = readFileSync(ckptOf(A), 'utf8');
    assert.match(text, /\n#sha256:[0-9a-f]{64}$/);
    const v = J.verifyCheckpoint(ckptOf(A));
    assert.ok(v.ok, v.reason);
    assert.equal(v.day, CK); assert.equal(v.preset, 'balanced'); assert.equal(v.harness, '5.27-D');
    const meta = J.checkpointMeta(ckptOf(A));
    assert.equal(meta.day, CK); assert.equal(meta.sha256, v.sha);
  });

  await check('payload guarda save, RNG (jogo + política), mundo/parceria/ranking, ledger, data e métricas', () => {
    const body = J.readCheckpointText(ckptOf(A)).body;
    const p = JSON.parse(body);
    for (const k of ['files', 'rngState', 'detState', 'localStore', 'ledger', 'out', 'day', 'investedBalance', 'bookedTx', 'seenTx', 'bookedCloses', 'careerId', 'recommended']) assert.ok(k in p, `sem ${k}`);
    assert.ok(Number.isFinite(p.detState.rngState) && Number.isFinite(p.detState.fakeClockMs), 'estado do RNG/relógio do jogo');
    const careerFile = Object.entries(p.files).find(([k]) => k.startsWith('careers/') && k.endsWith('.json'));
    assert.ok(careerFile, 'save da carreira ausente');
    const save = JSON.parse(careerFile[1]);
    for (const section of ['player', 'world', 'calendar', 'ranking', 'tournaments', 'economy']) assert.ok(section in save, `save sem seção ${section}`);
    for (const entity of ['AthleteProfile', 'Partnership', 'TeamRanking', 'AthleteRankingResult', 'Tournament']) assert.ok(entity in (save.entities || {}), `save sem entidade ${entity}`);
    assert.ok(Array.isArray(p.out.weekly) && p.out.weekly.length > 0, 'métricas acumuladas (weekly)');
    assert.ok(Object.keys(p.ledger).length > 0, 'ledger econômico');
    assert.ok(!Object.keys(p.files).some((k) => k.startsWith('backups/')), 'backups podados');
  });

  await check('segmento 2: o anterior vira .prev (dia 10), o atual é o dia 20', () => {
    assert.equal(seg(A).status, 3);
    assert.equal(J.verifyCheckpoint(ckptOf(A)).day, CK * 2);
    assert.equal(J.verifyCheckpoint(`${ckptOf(A)}.prev`).day, CK);
  });

  await check('checkpoint corrompido → retoma do .prev (registrado) → MESMO desfecho', () => {
    const f = ckptOf(A);
    const text = readFileSync(f, 'utf8');
    writeFileSync(f, text.slice(0, 1000) + (text[1000] === 'a' ? 'b' : 'a') + text.slice(1001));
    assert.equal(J.verifyCheckpoint(f).ok, false);
    let r = seg(A);
    assert.match(r.stderr, /inválido \(checksum-mismatch\); retomando do \.prev \(dia 10\)/);
    let guard = 0;
    while (r.status === 3 && guard < 6) { r = seg(A); guard += 1; }
    assert.equal(r.status, 0, r.stderr.slice(-300));
    assert.equal(outcome(A), reference, 'retomar do .prev mudou o desfecho');
  });

  await check('resultado gravado antes de apagar o checkpoint (nada de checkpoint sobrando)', () => {
    assert.ok(existsSync(join(A, 'casual-003.json')));
    for (const s of ['', '.prev', '.meta.json']) assert.ok(!existsSync(`${ckptOf(A)}${s}`), `sobrou ${s || 'checkpoint'}`);
  });

  await check('checkpoint e .prev inválidos → sai com 5 (nunca recomeça em silêncio)', () => {
    const B = join(work, 'b');
    assert.equal(seg(B).status, 3); assert.equal(seg(B).status, 3);
    writeFileSync(ckptOf(B), 'lixo'); writeFileSync(`${ckptOf(B)}.prev`, 'lixo');
    const r = seg(B);
    assert.equal(r.status, 5);
    assert.match(r.stderr, /CHECKPOINT_CORRUPT/);
  });

  await check('preset do ambiente ≠ preset do checkpoint → recusa (5)', () => {
    const C = join(work, 'c');
    assert.equal(seg(C).status, 3);
    const r = seg(C, { PL527_PRESET: 'hardcore' });
    assert.equal(r.status, 5);
    assert.match(r.stderr, /CHECKPOINT_PRESET_MISMATCH/);
  });

  await check('orquestrador: checkpoint corrompido sem .prev válido → job FAILED, work preservado', () => {
    const root = join(work, 'root');
    initRoot(root, { PL527D_TEST_DAYS: `2:${DAYS}` });
    const id = 'balanced-casual-seed003-2y';
    const job = J.loadManifest(root).jobs.find((j) => j.id === id);
    const ck = J.checkpointFileFor(job, J.paths(root).work);
    J.mkdirSync(join(ck, '..'), { recursive: true });
    writeFileSync(ck, '{"day":90}\n#sha256:0000');
    const r = orch(root, ['--job', id, `--checkpoint-every=${CK}`, '--no-load-check'], { PL527D_TEST_DAYS: `2:${DAYS}` });
    assert.notEqual(r.status, 0);
    const j = J.loadManifest(root).jobs.find((x) => x.id === id);
    assert.equal(j.status, 'FAILED');
    assert.match(j.error, /CHECKPOINT_CORRUPT/);
    assert.ok(existsSync(ck), 'o arquivo inválido deve ficar para inspeção');
  });
} finally {
  cleanup(work);
  finish();
}
