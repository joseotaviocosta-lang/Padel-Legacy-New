// Playthrough 5.3, TESTE 3 — gate central da fase. Deve falhar no
// baseline 5.2 (e, honestamente, continua falhando depois da correção
// desta fase também — ver relatório: a causa raiz real, uma vez isolada
// com getAiQualifyingLimit, mostrou que Gold precisa de volume tão
// grande que dilui mesmo dentro da própria faixa de rank correta, um
// problema de PROFUNDIDADE DE TALENTO, não de largura de elegibilidade —
// fora do escopo autorizado desta fase, que protege explicitamente a
// acumulação de pontos do Circuito). Mantido falhando honestamente, como
// pedido.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, computeTierFieldMetrics } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_V4_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'gold-silver-v4', trackWeeklyDraws: false });
const { tierStats } = computeTierFieldMetrics(sim, { tiers: ['Gold', 'Silver'] });

console.log(`Gold: avgOVR=${tierStats.Gold.avgOVR?.toFixed(1)} medianOVR=${tierStats.Gold.medianOVR} avgRank=${tierStats.Gold.avgRank?.toFixed(0)} medianRank=${tierStats.Gold.medianRank}`);
console.log(`Silver: avgOVR=${tierStats.Silver.avgOVR?.toFixed(1)} medianOVR=${tierStats.Silver.medianOVR} avgRank=${tierStats.Silver.avgRank?.toFixed(0)} medianRank=${tierStats.Silver.medianRank}`);

check('amostra real de ambos os tiers', () => {
  assert.ok(tierStats.Gold.tournaments > 0 && tierStats.Silver.tournaments > 0);
});
check('Gold avgOVR > Silver avgOVR', () => {
  assert.ok(tierStats.Gold.avgOVR > tierStats.Silver.avgOVR, `Gold=${tierStats.Gold.avgOVR} Silver=${tierStats.Silver.avgOVR}`);
});
check('Gold medianOVR > Silver medianOVR', () => {
  assert.ok(tierStats.Gold.medianOVR > tierStats.Silver.medianOVR, `Gold=${tierStats.Gold.medianOVR} Silver=${tierStats.Silver.medianOVR}`);
});
check('Gold avgRank < Silver avgRank', () => {
  assert.ok(tierStats.Gold.avgRank < tierStats.Silver.avgRank, `Gold=${tierStats.Gold.avgRank} Silver=${tierStats.Silver.avgRank}`);
});
check('Gold medianRank < Silver medianRank', () => {
  assert.ok(tierStats.Gold.medianRank < tierStats.Silver.medianRank, `Gold=${tierStats.Gold.medianRank} Silver=${tierStats.Silver.medianRank}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) console.log('test-gold-silver-hierarchy-v4: FAIL (pendência honesta — ver relatório da Playthrough 5.3: causa raiz remanescente é profundidade de talento dentro da própria faixa CORE de Gold, ligada à acumulação de pontos do Circuito, fora do escopo autorizado desta fase)');
else console.log('test-gold-silver-hierarchy-v4: PASS');
process.exitCode = failed > 0 ? 1 : 0;
