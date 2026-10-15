// Playthrough 5.2, Parte N — gate de não-regressão: Silver > Bronze,
// corrigido na 5.1 e preservado aqui. Se a investigação de Gold/Silver
// desta fase puxar Silver pra baixo a ponto de quebrar essa relação:
// rejeitar a tentativa.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, computeTierFieldMetrics } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_SB_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'silver-bronze-regression', trackWeeklyDraws: false });
const { tierStats } = computeTierFieldMetrics(sim, { tiers: ['Bronze', 'Silver'] });

console.log(`Bronze: avgOVR=${tierStats.Bronze.avgOVR?.toFixed(1)} avgRank=${tierStats.Bronze.avgRank?.toFixed(0)}`);
console.log(`Silver: avgOVR=${tierStats.Silver.avgOVR?.toFixed(1)} avgRank=${tierStats.Silver.avgRank?.toFixed(0)}`);

check('amostra real de ambos os tiers', () => {
  assert.ok(tierStats.Bronze.tournaments > 0 && tierStats.Silver.tournaments > 0);
});
check('Silver avgOVR > Bronze avgOVR (NÃO REGREDIU)', () => {
  assert.ok(tierStats.Silver.avgOVR > tierStats.Bronze.avgOVR, `Silver=${tierStats.Silver.avgOVR} Bronze=${tierStats.Bronze.avgOVR}`);
});
check('Silver avgRank < Bronze avgRank (NÃO REGREDIU)', () => {
  assert.ok(tierStats.Silver.avgRank < tierStats.Bronze.avgRank, `Silver=${tierStats.Silver.avgRank} Bronze=${tierStats.Bronze.avgRank}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-silver-bronze-order-regression: PASS');
