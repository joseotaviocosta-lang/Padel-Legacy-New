// Playthrough 5.27-C, Bloco B — a matriz Stage 1 compara os 3 presets com as
// MESMAS seeds. Valida o artefato se existir; senão, a infraestrutura.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-preset-full-matrix-v527c');
try {
  await check('o simulador aceita preset por ambiente (mesmas seeds entre presets)', () => {
    const sim = readFileSync('scripts/sim-progression-economy-v526.mjs', 'utf8');
    assert.match(sim, /PL527_PRESET/);
    const runner = readFileSync('scripts/run-progression-economy-v526.mjs', 'utf8');
    assert.match(runner, /--seeds/);
    assert.match(runner, /arg\('root'/);
  });

  await check('baseline de tuning congelado (balance-baseline.json)', () => {
    const b = JSON.parse(readFileSync('reports/rebalance-527c/balance-baseline.json', 'utf8'));
    assert.equal(b.presets.balanced.sponsor.monthlyMultiplier, 0.22);
    assert.equal(b.presets.balanced.prizeMultiplier, 3);
    assert.equal(b.presets.balanced.initialAttributeMultiplier, 1.8);
    assert.equal(b.presets.balanced.startingCoins, 900);
  });

  await check('preset-matrix.json (se presente) cobre os 3 presets', () => {
    const f = 'reports/rebalance-527c/preset-matrix.json';
    if (!existsSync(f)) return;
    const m = JSON.parse(readFileSync(f, 'utf8'));
    assert.deepEqual(Object.keys(m.presets || {}).sort(), ['balanced', 'conservative', 'hardcore']);
  });
} finally {
  finish();
}
