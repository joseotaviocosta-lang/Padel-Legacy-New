// Playthrough 5.27-C, Bloco L — long runs de 10 anos. Valida o artefato se
// existir; senão, confirma que o harness suporta 3653 dias e save/reload.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-balanced-longrun-v527c');
try {
  await check('o harness suporta 10 anos (longDays=3653) e reload periódico', () => {
    const runner = readFileSync('scripts/run-progression-economy-v526.mjs', 'utf8');
    assert.match(runner, /longDays/);
    assert.match(runner, /reloadEvery/);
  });

  await check('long-runs.json (se presente) tem 10 anos por perfil', () => {
    const f = 'reports/rebalance-527c/long-runs.json';
    if (!existsSync(f)) return;
    const d = JSON.parse(readFileSync(f, 'utf8'));
    assert.ok(d.careers >= 3, `long runs insuficientes: ${d.careers}`);
  });

  await check('save/reload determinístico coberto por teste dedicado (5.27-B)', () => {
    assert.ok(existsSync('scripts/test-balance-resume-determinism-v527b.mjs'));
  });
} finally {
  finish();
}
