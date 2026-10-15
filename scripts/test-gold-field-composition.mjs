// Playthrough 5.3, TESTE 2/Parte E/F — mede CORE/NEAR/STRETCH/EMERGENCY
// pra Gold (e Silver, pra comparação) numa temporada inteira. Metas
// estatísticas (Parte F), calibradas a partir do que é observável, não
// hardcoded por nome de dupla — mas honestamente: o achado desta fase é
// que mesmo com a rede de elegibilidade da IA estreitada
// (getAiQualifyingLimit), a maioria do campo de Gold ainda vem de CORE
// (rank 320-450, elegibilidade DIRETA) com OVR mais baixo que o
// necessário — o problema não é STRETCH/EMERGENCY inflados, é que o
// próprio CORE de Gold tem menos profundidade de talento que o de
// Silver. As metas de %  ainda são exigidas (CORE+NEAR>=80%,
// EMERGENCY<=5%) porque são sobre COMPOSIÇÃO DE ELEGIBILIDADE, não
// sobre OVR — e essas, a estreita de qualifying já cumpre.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, classifyFieldLayers } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_GFC_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'gold-field-composition', trackWeeklyDraws: false });
const layers = await classifyFieldLayers(sim, { tiers: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters'] });

console.log('=== composição em camadas (CORE/NEAR/STRETCH/EMERGENCY) ===');
for (const tier of ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters']) {
  const l = layers[tier];
  console.log(`${tier}: total=${l.total} CORE=${l.CORE}(${l.pctCORE?.toFixed(1)}%) NEAR=${l.NEAR}(${l.pctNEAR?.toFixed(1)}%) STRETCH=${l.STRETCH}(${l.pctSTRETCH?.toFixed(1)}%) EMERGENCY=${l.EMERGENCY}(${l.pctEMERGENCY?.toFixed(1)}%)`);
}

check('Gold: amostra real coletada', () => {
  assert.ok(layers.Gold.total > 0, 'Gold sem amostra');
});
check('Gold: CORE+NEAR >= 80% (a rede de qualifying estreitada cumpre a meta de composição)', () => {
  const sum = (layers.Gold.pctCORE || 0) + (layers.Gold.pctNEAR || 0);
  assert.ok(sum >= 80, `Gold CORE+NEAR=${sum.toFixed(1)}%`);
});
check('Gold: EMERGENCY <= 5% (resgate continua exceção, não regra — Parte N)', () => {
  assert.ok((layers.Gold.pctEMERGENCY || 0) <= 5, `Gold EMERGENCY=${layers.Gold.pctEMERGENCY?.toFixed(1)}%`);
});
check('Gold: STRETCH <= 20%', () => {
  assert.ok((layers.Gold.pctSTRETCH || 0) <= 20, `Gold STRETCH=${layers.Gold.pctSTRETCH?.toFixed(1)}%`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
console.log('Nota: estas metas são sobre elegibilidade/adequação de RANK (CORE/NEAR/STRETCH/EMERGENCY), não sobre OVR — o achado da 5.3 é que cumprir estas metas não basta pra Gold superar Silver em OVR médio, porque o próprio CORE de Gold (rank 320-450) tem talento mais raso que o de Silver. Ver test-gold-silver-hierarchy-v4.mjs e o relatório da fase.');
if (failed > 0) process.exitCode = 1;
else console.log('test-gold-field-composition: PASS');
