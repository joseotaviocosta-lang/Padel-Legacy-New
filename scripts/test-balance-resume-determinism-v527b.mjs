// Playthrough 5.27-B, Bloco W — determinismo de checkpoint/resume do harness de
// balanceamento: a MESMA seed em modo contínuo e retomado produz o mesmo
// resultado. Roda um trecho curto real (16 dias) para não depender de long run.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { check, finish } = makeSuite('test-balance-resume-determinism-v527b');
const work = mkdtempSync(join(tmpdir(), 'pl527b-resume-'));
const args = ['scripts/sim-progression-economy-v526.mjs', '--profile=normal', '--seeds=9-9', '--days=16'];
try {
  await check('modo contínuo (16 dias) conclui', () => {
    const run = spawnSync(process.execPath, [...args, `--out=${join(work, 'continuous')}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    assert.equal(run.status, 0, (run.stderr || '').slice(-300));
  });

  await check('modo segmentado (checkpoint a cada 8 dias) conclui e retoma do arquivo', () => {
    const out = join(work, 'segmented');
    let code = 3; let guard = 0;
    while (code === 3 && guard < 6) {
      const run = spawnSync(process.execPath, [...args, `--out=${out}`, '--checkpointEvery=8', '--segment'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      code = run.status; guard += 1;
    }
    assert.equal(code, 0, `segmentado terminou com código ${code}`);
  });

  await check('same seed: contínuo == retomado (fingerprint persistido idêntico)', () => {
    const continuous = JSON.parse(readFileSync(join(work, 'continuous', 'normal-009.json'), 'utf8'));
    const segmented = JSON.parse(readFileSync(join(work, 'segmented', 'normal-009.json'), 'utf8'));
    assert.equal(segmented.days, continuous.days);
    const pick = (c) => JSON.stringify({ rank: c.weekly.at(-1)?.rank, ovr: c.weekly.at(-1)?.ovr, coins: c.finalCoins, matches: c.matches.length, tournaments: c.tournaments.length });
    assert.equal(pick(segmented), pick(continuous));
  });

  await check('o resume preserva shim=false e 0 erros', () => {
    const segmented = JSON.parse(readFileSync(join(work, 'segmented', 'normal-009.json'), 'utf8'));
    assert.ok(segmented.shimEver !== true, `shimEver=${segmented.shimEver}`);
    assert.equal((segmented.errors || []).length, 0);
  });
} finally {
  rmSync(work, { recursive: true, force: true });
  finish();
}
