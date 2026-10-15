// Playthrough 5.1, Parte O/W — gate focado: Silver precisa ter, em média
// na temporada, avgRank MENOR (melhor) e avgOVR MAIOR que Bronze. Este é
// um dos dois achados reais da Playthrough 5.0 (Silver mais fraco que
// Bronze) — teste dedicado, além do gate agregado de 4+ tiers em
// test-tier-strength-distribution-v2.mjs, pra manter a regressão isolada
// e fácil de apontar se voltar a quebrar.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, computeTierFieldMetrics } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_BS_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'bronze-silver', trackWeeklyDraws: false });
const { tierStats } = computeTierFieldMetrics(sim, { tiers: ['Bronze', 'Silver'] });

console.log(`Bronze: avgRank=${tierStats.Bronze.avgRank?.toFixed(0)} avgOVR=${tierStats.Bronze.avgOVR?.toFixed(1)} (torneios=${tierStats.Bronze.tournaments})`);
console.log(`Silver: avgRank=${tierStats.Silver.avgRank?.toFixed(0)} avgOVR=${tierStats.Silver.avgOVR?.toFixed(1)} (torneios=${tierStats.Silver.tournaments})`);

check('amostra real de ambos os tiers (torneios resolvidos > 0)', () => {
  assert.ok(tierStats.Bronze.tournaments > 0 && tierStats.Silver.tournaments > 0);
});

check('Silver avgRank < Bronze avgRank (Silver é mais forte — rank numérico menor)', () => {
  assert.ok(tierStats.Silver.avgRank < tierStats.Bronze.avgRank, `Silver=${tierStats.Silver.avgRank} deveria ser < Bronze=${tierStats.Bronze.avgRank}`);
});

check('Silver avgOVR > Bronze avgOVR', () => {
  assert.ok(tierStats.Silver.avgOVR > tierStats.Bronze.avgOVR, `Silver=${tierStats.Silver.avgOVR} deveria ser > Bronze=${tierStats.Bronze.avgOVR}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-bronze-silver-strength-order: PASS');
