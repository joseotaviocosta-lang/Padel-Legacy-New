// Playthrough 5.1, Parte N/W — gate focado: Masters precisa ter, em média
// na temporada, avgRank MENOR (melhor) e avgOVR MAIOR que Gold. Este é o
// achado original da Playthrough 5.0 (o bug relatado por Coello/Tapia
// levou a esta auditoria inteira) — teste dedicado, além do gate agregado
// em test-tier-strength-distribution-v2.mjs.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, computeTierFieldMetrics } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_GM_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'gold-masters', trackWeeklyDraws: false });
const { tierStats } = computeTierFieldMetrics(sim, { tiers: ['Gold', 'Masters'] });

console.log(`Gold: avgRank=${tierStats.Gold.avgRank?.toFixed(0)} avgOVR=${tierStats.Gold.avgOVR?.toFixed(1)} (torneios=${tierStats.Gold.tournaments})`);
console.log(`Masters: avgRank=${tierStats.Masters.avgRank?.toFixed(0)} avgOVR=${tierStats.Masters.avgOVR?.toFixed(1)} (torneios=${tierStats.Masters.tournaments})`);

check('amostra real de ambos os tiers (torneios resolvidos > 0)', () => {
  assert.ok(tierStats.Gold.tournaments > 0 && tierStats.Masters.tournaments > 0);
});

check('Masters avgRank < Gold avgRank (Masters é mais forte — rank numérico menor)', () => {
  assert.ok(tierStats.Masters.avgRank < tierStats.Gold.avgRank, `Masters=${tierStats.Masters.avgRank} deveria ser < Gold=${tierStats.Gold.avgRank}`);
});

check('Masters avgOVR > Gold avgOVR', () => {
  assert.ok(tierStats.Masters.avgOVR > tierStats.Gold.avgOVR, `Masters=${tierStats.Masters.avgOVR} deveria ser > Gold=${tierStats.Gold.avgOVR}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-gold-masters-strength-order: PASS');
