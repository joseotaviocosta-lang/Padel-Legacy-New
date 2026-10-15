// Playthrough 5.27-F, Blocos C/F — curva de energia com times iguais (lado A com
// menos energia contra 100): monotônica, gradual (sem penhasco), energia ainda
// importante. Antes da 5.27-F: E90 24% · E80 7% · E60 0,2% (OVR 50).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { runEngineMatrix } from './lib/v527fEngineTestKit.mjs';

const { check, finish } = makeSuite('test-energy-sensitivity-v527f');
const N = Number(process.env.PL527F_TEST_N || 2000);
try {
  const rows = runEngineMatrix({ matrix: 'energy', n: N, ovrs: '35,50,75', tag: 'test-energy' });
  for (const ovr of [35, 50, 75]) {
    const curve = [100, 90, 80, 70, 60, 50, 40].map((e) => (e === 100 ? 50 : rows.find((r) => r.ovrA === ovr && r.energyA === e).winPctA));
    await check(`OVR ${ovr}: monotônica (tolerância ±4 de Monte Carlo) — ${curve.join(' / ')}`, () => {
      for (let i = 1; i < curve.length; i += 1) assert.ok(curve[i] <= curve[i - 1] + 4, `E${100 - i * 10}`);
    });
    await check(`OVR ${ovr}: sem penhasco (−10 de energia custa <= 12 pp; E90 >= 38%)`, () => {
      for (let i = 1; i < curve.length; i += 1) assert.ok(curve[i - 1] - curve[i] <= 12, `degrau E${110 - i * 10}→E${100 - i * 10}: ${(curve[i - 1] - curve[i]).toFixed(1)}`);
      assert.ok(curve[1] >= 38, `E90 ${curve[1]}`);
    });
    await check(`OVR ${ovr}: energia continua importante (E40 <= 35%)`, () => assert.ok(curve.at(-1) <= 35, `E40 ${curve.at(-1)}`));
  }
} finally {
  finish();
}
