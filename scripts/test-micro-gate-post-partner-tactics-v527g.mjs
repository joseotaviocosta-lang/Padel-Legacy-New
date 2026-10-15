// Playthrough 5.27-G, Blocos K/L — MICRO-GATE após parceiro + táticas (Normal,
// política v3, seeds 1–3): Easy >= 40% e R1 >= 35% no 1º ano (sem regressão);
// Medium >= 28% com amostra real (2 anos); motor, táticas e parceiro verdes.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-micro-gate-post-partner-tactics-v527g');
try {
  const m = JSON.parse(readFileSync('reports/rebalance-527g/micro-post-527g.json', 'utf8'));
  const y1 = m.y1['balanced-e-v3']; const y2 = m.y2['balanced-e-v3'];
  await check(`Easy 1º ano >= 40% (${y1.easyWR}%)`, () => assert.ok(y1.easyWR >= 40));
  await check(`R1 1º ano >= 35% (${y1.r1WR}%)`, () => assert.ok(y1.r1WR >= 35));
  await check(`Medium >= 28% com amostra (2 anos: ${y2.mediumWR}%, n=${y2.tierWR.Gold.n + y2.tierWR.Platinum.n})`, () => {
    assert.ok(y2.tierWR.Gold.n + y2.tierWR.Platinum.n >= 20);
    assert.ok(y2.mediumWR >= 28);
  });
  await check('qualidade de parceiro no micro: OVR do parceiro na partida (mediana) >= 55 no 2º ano', () => assert.ok(m.partnerOvrMedianY2 >= 55, String(m.partnerOvrMedianY2)));
  await check('energia na partida preservada (mediana >= 90)', () => assert.ok(y1.energyAtMatchMedian >= 90));
} finally {
  finish();
}
