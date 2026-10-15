// Playthrough 5.27-F, Blocos A/F — times IDÊNTICOS (mesmo OVR, atributos,
// energia, tática; personalidades aleatórias) convergem para ~50% em todos os
// níveis de OVR e energia, já com o pipeline do jogo (lado A recebe os campos
// do modal). Hard gate: 45–55%.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { runEngineMatrix } from './lib/v527fEngineTestKit.mjs';

const { check, finish } = makeSuite('test-match-engine-identical-teams-v527f');
const N = Number(process.env.PL527F_TEST_N || 2000);
try {
  const rows = runEngineMatrix({ matrix: 'identical', n: N, ovrs: '20,35,50,75,85', tag: 'test-identical' });
  for (const r of rows) {
    await check(`OVR ${r.ovrA} energia ${r.energyA}×${r.energyB}: lado A ${r.winPctA}% (±${r.ci95}) dentro de 45–55%`, () => {
      assert.ok(r.winPctA >= 45 && r.winPctA <= 55, `${r.winPctA}%`);
    });
  }
  await check('média de todas as células em 48–52%', () => {
    const mean = rows.reduce((s, r) => s + r.winPctA, 0) / rows.length;
    assert.ok(mean >= 48 && mean <= 52, mean.toFixed(1));
  });
} finally {
  finish();
}
