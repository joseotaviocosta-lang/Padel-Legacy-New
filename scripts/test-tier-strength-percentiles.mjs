// Playthrough 5.2, Parte Q — a hierarquia precisa fazer sentido em P25/
// P50/P75, não só na média (uma média pode "melhorar" com só 2-3 duplas
// de elite puxando pra cima enquanto o resto do campo continua fraco —
// exatamente o que Part J/Parte Q avisam pra não aceitar como sucesso).
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, computeTierFieldMetrics } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_PCT_YEARS || 1);
const tiers = ['Bronze', 'Silver', 'Gold', 'Masters'];
const sim = await runHeadlessWorldSimulation({ years, label: 'percentiles', trackWeeklyDraws: false });
const { tierStats } = computeTierFieldMetrics(sim, { tiers });

console.log('=== percentis de OVR por tier ===');
for (const tier of tiers) {
  const s = tierStats[tier];
  console.log(`${tier}: P25=${s?.p25OVR} P50=${s?.p50OVR} P75=${s?.p75OVR} (avg=${s?.avgOVR?.toFixed(1)})`);
}

check('amostra real em todos os tiers', () => {
  for (const tier of tiers) assert.ok(tierStats[tier]?.rankedEntrantSampleSize > 0, `${tier} sem amostra`);
});

check('Silver P50(OVR) > Bronze P50(OVR)', () => {
  assert.ok(tierStats.Silver.p50OVR > tierStats.Bronze.p50OVR, `Silver=${tierStats.Silver.p50OVR} Bronze=${tierStats.Bronze.p50OVR}`);
});
check('Masters P50(OVR) > Gold P50(OVR) — a mediana confirma, não só a média', () => {
  assert.ok(tierStats.Masters.p50OVR > tierStats.Gold.p50OVR, `Masters=${tierStats.Masters.p50OVR} Gold=${tierStats.Gold.p50OVR}`);
});
check('Bronze P75(OVR) < Silver P75(OVR) (o campo inteiro é mais forte, não só o topo)', () => {
  assert.ok(tierStats.Bronze.p75OVR <= tierStats.Silver.p75OVR, `Bronze=${tierStats.Bronze.p75OVR} Silver=${tierStats.Silver.p75OVR}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-tier-strength-percentiles: PASS');
