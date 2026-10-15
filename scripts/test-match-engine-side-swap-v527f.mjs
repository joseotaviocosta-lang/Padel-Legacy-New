// Playthrough 5.27-F, Bloco B (item 15) — SIDE-SWAP: p(A vence B) + p(B vence A,
// com os times trocados de lado) ≈ 100%, para diferenças de energia e de OVR.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { runEngineMatrix } from './lib/v527fEngineTestKit.mjs';

const { check, finish } = makeSuite('test-match-engine-side-swap-v527f');
const N = Number(process.env.PL527F_TEST_N || 2000);
try {
  const rows = runEngineMatrix({ matrix: 'swap', n: N, ovrs: '35,50,75', tag: 'test-swap' });
  const find = (kind, oa, ob, ea, eb) => rows.find((r) => r.kind === kind && r.ovrA === oa && r.ovrB === ob && r.energyA === ea && r.energyB === eb);
  const pairs = [];
  for (const o of [35, 50, 75]) for (const [ea, eb] of [[100, 80], [100, 60], [100, 40], [80, 60]]) pairs.push([find('swap-energy', o, o, ea, eb), find('swap-energy', o, o, eb, ea)]);
  for (const [oa, ob] of [[45, 50], [70, 75], [30, 40]]) pairs.push([find('swap-ovr', oa, ob, 100, 100), find('swap-ovr', ob, oa, 100, 100)]);
  for (const [x, y] of pairs) {
    await check(`ovr${x.ovrA}/e${x.energyA} × ovr${x.ovrB}/e${x.energyB}: ${x.winPctA}% + troca ${y.winPctA}% ≈ 100% (±6)`, () => {
      // p(A>B) + p(B>A no lado A) = winA(x) + winA(y); deve somar ~100.
      assert.ok(Math.abs(x.winPctA + y.winPctA - 100) <= 6, (x.winPctA + y.winPctA).toFixed(1));
    });
  }
  await check('o lado mais forte vence mais nos dois sentidos (sem inversão por lado)', () => {
    for (const [x, y] of pairs) {
      const xStronger = x.ovrA > x.ovrB || x.energyA > x.energyB;
      assert.ok(xStronger ? x.winPctA > 50 && y.winPctA < 50 : x.winPctA < 50 && y.winPctA > 50, `${x.winPctA}/${y.winPctA}`);
    }
  });
} finally {
  finish();
}
