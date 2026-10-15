// Playthrough 5.27-F, Bloco L/T — MICRO-GATE pós-motor (preset principal
// balanced-e, Normal, seeds 1–3, política v2): Easy >= 40% e R1 >= 35% no 1º ano;
// Medium >= 28% medido onde existe amostra (o Normal joga 0–1 partida de Gold
// no 1º ano, então o Medium vem da extensão de 2 anos); sem inversão estrutural
// Silver × Gold; sem falha de paridade do motor.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { existsSync, readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-micro-gate-post-engine-v527f');
// Candidato final: medições após o ajuste de pontos de derrota (after/).
const ONE = 'reports/rebalance-527f/after/micro-normal-365d.json';
const TWO = 'reports/rebalance-527f/after/micro-normal-730d.json';
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
try {
  await check('micro de 1 ano e de 2 anos (balanced-e) disponíveis', () => {
    assert.ok(existsSync(ONE), ONE); assert.ok(existsSync(TWO), TWO);
  });
  const y1 = read(ONE).summary['balanced-e'];
  const y2 = read(TWO).summary['balanced-e'];

  await check(`Easy 1º ano >= 40% (${y1.easyWR}%)`, () => assert.ok(y1.easyWR >= 40));
  await check(`R1 1º ano >= 35% (${y1.r1WR}%)`, () => assert.ok(y1.r1WR >= 35));
  await check(`Medium >= 28% com amostra real (2 anos: ${y2.mediumWR}% em ${y2.tierWR.Gold.n + y2.tierWR.Platinum.n} partidas)`, () => {
    assert.ok(y2.tierWR.Gold.n + y2.tierWR.Platinum.n >= 20, 'amostra Medium pequena demais');
    assert.ok(y2.mediumWR >= 28);
  });
  await check(`Silver não materialmente abaixo de Gold na chave (2 anos: Silver ${y2.tierWR.Silver.main}% × Gold ${y2.tierWR.Gold.main}%)`, () => {
    assert.ok(y2.tierWR.Gold.main == null || y2.tierWR.Silver.main >= y2.tierWR.Gold.main - 5);
  });
  await check('Bronze mais fácil que Silver (1º ano)', () => assert.ok(y1.tierWR.Bronze.main > y1.tierWR.Silver.main));
  await check('energia na partida preservada pela política v2 (mediana >= 90)', () => assert.ok(y1.energyAtMatchMedian >= 90));
  await check('motor em paridade (CSV da matriz de aceitação: times idênticos 45–55%)', () => {
    const lines = readFileSync('reports/rebalance-527f/engine-identical-teams.csv', 'utf8').trim().split('\n').slice(1);
    for (const l of lines) { const wr = Number(l.split(',')[7]); assert.ok(wr >= 45 && wr <= 55, l); }
  });
} finally {
  finish();
}
