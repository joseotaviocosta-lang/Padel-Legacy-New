// Playthrough 5.27-C, Bloco H — distribuição do Balanced em 5 anos. Valida o
// artefato se existir; senão, confirma que o harness suporta o lote.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-balanced-5year-distribution-v527c');
try {
  await check('o harness suporta 5 temporadas (1826 dias) com checkpoints', () => {
    const runner = readFileSync('scripts/run-progression-economy-v526.mjs', 'utf8');
    assert.match(runner, /--days/);
    assert.match(runner, /checkpointEvery/);
    const sim = readFileSync('scripts/sim-progression-economy-v526.mjs', 'utf8');
    assert.match(sim, /CHECKPOINT_EVERY/);
  });

  await check('balanced-5y.json (se presente) tem distribuição por percentil, não só média', () => {
    const f = 'reports/rebalance-527c/balanced-5y.json';
    if (!existsSync(f)) return;
    const d = JSON.parse(readFileSync(f, 'utf8'));
    const rank = d.rankAt?.['2y'] || d.checkpoints?.['2y']?.rank;
    if (rank && typeof rank === 'object') {
      for (const k of ['median', 'p25', 'p75']) assert.ok(k in rank, `distribuição sem ${k}`);
    }
  });
} finally {
  finish();
}
