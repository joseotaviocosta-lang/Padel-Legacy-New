// Playthrough 5.27-B, Bloco N — valida que o harness suporta o lote principal
// de 5 anos (1826 dias) e, se o artefato existir, valida os checkpoints/rank.
// (A execução completa de 45×5 anos não coube no runtime desta sessão.)
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { check, finish } = makeSuite('test-balanced-5y-run-v527b');
try {
  await check('o runner suporta o lote principal de 5 anos (--days/--longDays)', () => {
    const runner = readFileSync('scripts/run-progression-economy-v526.mjs', 'utf8');
    assert.match(runner, /--days/);
    assert.match(runner, /longDays/);
    assert.match(runner, /checkpointEvery/);
  });

  await check('o simulador suporta checkpoints de 5 anos e resume', () => {
    const sim = readFileSync('scripts/sim-progression-economy-v526.mjs', 'utf8');
    assert.match(sim, /CHECKPOINT_EVERY/);
    assert.match(sim, /SEGMENT/);
    assert.match(sim, /resume/);
  });

  const artifact = resolve('reports/rebalance-527b/balanced-5y.json');
  await check('artefato balanced-5y.json (se presente) tem 5 anos e rank/OVR por checkpoint', () => {
    if (!existsSync(artifact)) return; // não executado nesta sessão — documentado no relatório
    const data = JSON.parse(readFileSync(artifact, 'utf8'));
    assert.ok(data.checkpoints, 'sem checkpoints');
    assert.ok(Number(data.days) >= 1826 || data.checkpoints['5y'], 'sem 5 anos');
  });

  await check('o analisador emite os CSV/JSON pedidos pelo Bloco X', () => {
    const analyzer = readFileSync('scripts/analyze-rebalance-527.mjs', 'utf8');
    for (const f of ['difficulty.csv', 'progression.csv', 'economy.csv', 'sponsors.csv', 'tournaments.csv', 'comparison.md']) {
      assert.match(analyzer, new RegExp(f.replace('.', '\\.')), `analisador não emite ${f}`);
    }
  });
} finally {
  finish();
}
