// Playthrough 5.26-C — checkpoint/resume do harness é determinístico.
// Modo de produção do harness: `--segment` (o processo sai com código 3 após
// cada checkpoint e o runner o reinicia, retomando do arquivo). Compara:
//   contínua  = cadeia de segmentos sem interrupção;
//   kill      = cadeia em que um segmento é morto NO MEIO (--stopAtDay, sem
//               checkpoint, como um kill externo) e retomado do último
//               checkpoint, refazendo os dias perdidos.
// Para a mesma seed, o estado de jogo final tem de ser idêntico.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSuite, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-progression-run-resume-v526c');
const SEED = 41; const DAYS = 120; const EVERY = 40;
const work = mkdtempSync(join(tmpdir(), 'pl526c-resume-'));
const once = (dir, extra = []) => spawnSync(process.execPath, ['scripts/sim-progression-economy-v526.mjs', '--profile=normal', `--seeds=${SEED}-${SEED}`, `--days=${DAYS}`, `--checkpointEvery=${EVERY}`, '--segment', `--out=${dir}`, ...extra], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
/** Mesmo laço do runner: reinicia enquanto o processo sair com 3 (fim de segmento). */
function chain(dir, killExtra = []) {
  // O kill simulado vale para todo segmento até acontecer (código 4); depois
  // a cadeia segue sem ele, retomando do último checkpoint.
  const codes = [];
  let killed = killExtra.length === 0;
  let r = once(dir, ['--force', ...(killed ? [] : killExtra)]);
  codes.push(r.status); if (r.status === 4) killed = true;
  for (let i = 0; i < 20 && (r.status === 3 || r.status === 4); i += 1) { r = once(dir, killed ? [] : killExtra); codes.push(r.status); if (r.status === 4) killed = true; }
  return codes;
}
const read = (dir) => JSON.parse(readFileSync(join(dir, `normal-0${SEED}.json`), 'utf8'));
// Campos de processo: tempo de parede, contagem de retomadas e o careerId
// (crypto.randomUUID, difere entre QUALQUER par de execuções).
const strip = ({ ms, resumes, careerId, ...rest }) => rest;
function firstDiff(a, b, path = '') {
  if (Object.is(a, b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return `${path}: ${JSON.stringify(a)?.slice(0, 100)} ≠ ${JSON.stringify(b)?.slice(0, 100)}`;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d; }
  return null;
}
try {
  const full = join(work, 'full'); const kill60 = join(work, 'kill60'); const kill100 = join(work, 'kill100');
  const c0 = chain(full);
  await check(`contínua: 3 segmentos (40/80/120 dias) → códigos ${c0.join(',')}`, () => { assert.deepEqual(c0, [3, 3, 0]); assert.equal(read(full).days, DAYS); });
  await check('checkpoint removido ao terminar', () => assert.equal(existsSync(join(full, '.checkpoints', `normal-0${SEED}.json`)), false));

  const c1 = chain(kill60, ['--stopAtDay=60']);
  await check(`kill no dia 60 (meio do 2º segmento) → retomada do checkpoint do dia 40 · códigos ${c1.join(',')}`, () => assert.ok(c1.includes(4) && c1.at(-1) === 0));
  await check('contínua = morta no dia 60 e retomada (estado de jogo idêntico)', () => { const d = firstDiff(strip(read(full)), strip(read(kill60))); assert.equal(d, null, d); });

  const c2 = chain(kill100, ['--stopAtDay=100']);
  await check('contínua = morta no dia 100 e retomada do dia 80', () => { assert.ok(c2.includes(4)); const d = firstDiff(strip(read(full)), strip(read(kill100))); assert.equal(d, null, d); });
  await check('a retomada é contabilizada (resumes > 0) sem alterar o estado', () => assert.ok(read(kill60).resumes >= 1));
} finally {
  rmSync(work, { recursive: true, force: true });
}
finish();
