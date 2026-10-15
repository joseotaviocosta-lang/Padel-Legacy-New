// Playthrough 5.27-G, Bloco H — a tática não tem o mesmo efeito em todo perfil:
// Potência rende mais para quem tem smash forte; Defensivo para quem tem defesa;
// sem resultados absurdos (30–70%). Matriz: cada tática × Equilibrado, os dois
// lados com o mesmo arquétipo e o mesmo OVR-base.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { readMatrix } from './lib/v527gTacticKit.mjs';

const { check, finish } = makeSuite('test-tactic-archetype-interaction-v527g');
try {
  const rows = readMatrix('reports/rebalance-527g/tactic-archetypes.csv');
  const wr = (ovr, arch, t) => rows.find((r) => r.ovrA === ovr && r.archetype === arch && r.tacticA === t).winPctA;
  for (const o of [50, 75]) {
    await check(`OVR ${o}: Potência rende mais no arquétipo de potência que no de defesa (${wr(o, 'power', 'potencia')} × ${wr(o, 'defense', 'potencia')})`, () => {
      assert.ok(wr(o, 'power', 'potencia') > wr(o, 'defense', 'potencia'));
    });
    await check(`OVR ${o}: Defensivo rende mais no arquétipo de defesa que no de potência (${wr(o, 'defense', 'defensivo')} × ${wr(o, 'power', 'defensivo')})`, () => {
      assert.ok(wr(o, 'defense', 'defensivo') > wr(o, 'power', 'defensivo'));
    });
    await check(`OVR ${o}: nenhum arquétipo×tática fora de 30–70%`, () => {
      for (const r of rows.filter((x) => x.ovrA === o)) assert.ok(r.winPctA >= 30 && r.winPctA <= 70, `${r.archetype}/${r.tacticA}: ${r.winPctA}`);
    });
  }
} finally {
  finish();
}
