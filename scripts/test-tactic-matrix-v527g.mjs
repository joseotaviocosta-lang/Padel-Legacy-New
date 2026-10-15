// Playthrough 5.27-G, Bloco D — matriz tática completa (5×5 táticas canônicas,
// OVR 35/50/65/80, times idênticos, energia 100, lados estáticos, >= 10.000
// partidas por célula) antes e depois, e as táticas canônicas do código.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootModules } from './lib/v526bTestKit.mjs';
import { TACTICS, cell, meanOf, readMatrix } from './lib/v527gTacticKit.mjs';

const { check, finish } = makeSuite('test-tactic-matrix-v527g');
const { load, close } = await bootModules();
try {
  await check('táticas canônicas do código = as 5 da matriz', async () => {
    const { MATCH_TACTICS } = await load('/src/engine/match/MatchTactics.js');
    assert.deepEqual(MATCH_TACTICS.map((t) => t.id).sort(), [...TACTICS].sort());
  });
  for (const [label, file] of [['antes', 'reports/rebalance-527g/tactic-matrix-before.csv'], ['depois', 'reports/rebalance-527g/tactic-matrix-after.csv']]) {
    const rows = readMatrix(file);
    await check(`${label}: 100 células (4 OVR × 25 pares), cada uma com >= 10.000 partidas`, () => {
      assert.equal(rows.length, 100);
      for (const r of rows) assert.ok(r.n >= 10000, `${r.tacticA}×${r.tacticB} ovr${r.ovrA}: ${r.n}`);
    });
    await check(`${label}: espelho (mesma tática dos dois lados) ~50% (45–55)`, () => {
      for (const o of [35, 50, 65, 80]) for (const t of TACTICS) assert.ok(Math.abs(cell(rows, o, t, t).winPctA - 50) <= 5, `${t} ovr${o}`);
    });
  }
  await check('antes: dominância estrutural reproduzida (Defensivo > 75% e Potência < 25% de média em OVR 50)', () => {
    const rows = readMatrix('reports/rebalance-527g/tactic-matrix-before.csv');
    assert.ok(meanOf(rows, 50, 'defensivo') > 75);
    assert.ok(meanOf(rows, 50, 'potencia') < 25);
  });
} finally {
  await close();
  finish();
}
