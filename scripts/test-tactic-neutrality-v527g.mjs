// Playthrough 5.27-G, Blocos E/G — NEUTRALIDADE TÁTICA (matriz depois da
// calibração): média de cada tática 40–60% contra todas; nenhum confronto
// abaixo de 30% ou acima de 70%; Equilibrado como referência neutra.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { readFileSync } from 'node:fs';
import { TACTICS, cell, meanOf, readMatrix } from './lib/v527gTacticKit.mjs';

const { check, finish } = makeSuite('test-tactic-neutrality-v527g');
try {
  const rows = readMatrix('reports/rebalance-527g/tactic-matrix-after.csv');
  for (const o of [35, 50, 65, 80]) {
    await check(`OVR ${o}: média por tática em 40–60% (${TACTICS.map((t) => `${t.slice(0, 4)} ${meanOf(rows, o, t).toFixed(1)}`).join(' · ')})`, () => {
      for (const t of TACTICS) { const m = meanOf(rows, o, t); assert.ok(m >= 40 && m <= 60, `${t}: ${m.toFixed(1)}`); }
    });
    await check(`OVR ${o}: todo confronto em 30–70%`, () => {
      for (const a of TACTICS) for (const b of TACTICS) { const v = cell(rows, o, a, b).winPctA; assert.ok(v >= 30 && v <= 70, `${a}×${b}: ${v}`); }
    });
    await check(`OVR ${o}: Equilibrado é a referência (média 45–55)`, () => { const m = meanOf(rows, o, 'equilibrado'); assert.ok(m >= 45 && m <= 55, m.toFixed(1)); });
  }
  await check('mudança mínima: riskModifier fora da execução e bônus +12 por id removido; pesos de golpe e energia intactos', () => {
    const rally = readFileSync('src/engine/match/RallyEngine.js', 'utf8');
    const decision = readFileSync('src/engine/match/DecisionEngine.js', 'utf8');
    const tactics = readFileSync('src/engine/match/MatchTactics.js', 'utf8');
    assert.match(rally, /const TACTIC_RISK_SCALE = 0;/);
    assert.match(decision, /tacticScale\('__PL527G_TACTIC_ID_BONUS', 0\)/);
    assert.match(decision, /amp\(tactic\?\.attackWeight\)/);
    assert.match(tactics, /id: 'potencia'[^\n]*powerWeight: 1\.42[^\n]*energyModifier: 1\.18/);
  });
} finally {
  finish();
}
