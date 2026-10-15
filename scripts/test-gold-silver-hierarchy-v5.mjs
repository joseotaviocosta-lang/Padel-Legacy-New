// Playthrough 5.4, TESTE 10 — re-execução do gate Gold vs Silver (mesmo
// gate de test-gold-silver-hierarchy-v4.mjs, Playthrough 5.3) agora com a
// medição CORRIGIDA (computeTierFieldMetrics já resolve pares sintéticos
// `profile-pair:` via canonicalPairAthleteIds — Parte A/B desta fase, ver
// tierRebalanceHarness.mjs). Objetivo: confirmar empiricamente se
// consertar a MEDIÇÃO de participação de elite (o achado central desta
// fase) muda o resultado do gate, ou se — como esperado, já que duplas de
// elite quase não aparecem em Gold/Silver (Teste 1/2 desta fase: quase
// toda participação delas é Masters/Elite/Crown/Platinum) — o gap
// Gold<Silver continua sendo o problema de PROFUNDIDADE DE TALENTO já
// documentado nas fases 5.2/5.3 (fora do escopo desta fase, que protegeu
// explicitamente a acumulação de pontos do Circuito).
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, computeTierFieldMetrics } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_V5_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'gold-silver-v5', trackWeeklyDraws: false });
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
if (failed > 0) console.log('test-gold-silver-hierarchy-v5: FAIL esperado, se ainda não fechado — ver relatório da Playthrough 5.4: a correção de medição desta fase (pares sintéticos) resolveu o achado "0 participações" mas o gap Gold<Silver é uma questão SEPARADA de profundidade de talento dentro do próprio CORE de rank de Gold (301-450), documentada desde a 5.2/5.3 e fora do escopo autorizado desta fase.');
else console.log('test-gold-silver-hierarchy-v5: PASS — a correção de medição desta fase também fechou o gap Gold vs Silver.');
process.exitCode = failed > 0 ? 1 : 0;
