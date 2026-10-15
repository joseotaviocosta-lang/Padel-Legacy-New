// Playthrough 5.27-G, Bloco E — SIDE-SWAP tático: p(X vence Y) + p(Y vence X,
// com os lados trocados) ≈ 100% em toda a matriz depois da calibração.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { TACTICS, cell, readMatrix } from './lib/v527gTacticKit.mjs';

const { check, finish } = makeSuite('test-tactic-side-swap-v527g');
try {
  const rows = readMatrix('reports/rebalance-527g/tactic-matrix-after.csv');
  for (const o of [35, 50, 65, 80]) {
    await check(`OVR ${o}: |p(X>Y) + p(Y>X) − 100| <= 3 para todos os pares`, () => {
      let worst = 0;
      for (let i = 0; i < TACTICS.length; i += 1) for (let j = i + 1; j < TACTICS.length; j += 1) {
        const s = cell(rows, o, TACTICS[i], TACTICS[j]).winPctA + cell(rows, o, TACTICS[j], TACTICS[i]).winPctA;
        worst = Math.max(worst, Math.abs(s - 100));
      }
      assert.ok(worst <= 3, worst.toFixed(1));
    });
  }
} finally {
  finish();
}
