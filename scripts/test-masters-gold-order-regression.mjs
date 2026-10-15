// Playthrough 5.2, Parte M — gate de não-regressão: Masters > Gold é o
// bug ORIGINAL da Playthrough 5.0/5.1 (Coello/Tapia), corrigido na 5.1 e
// preservado aqui. Se qualquer tentativa de corrigir Gold/Silver nesta
// fase fizer Gold voltar a superar Masters, este teste PRECISA falhar —
// rejeitar a tentativa, nunca aceitar uma correção que troca um bug por
// outro pior.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, computeTierFieldMetrics } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_MG_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'masters-gold-regression', trackWeeklyDraws: false });
const { tierStats } = computeTierFieldMetrics(sim, { tiers: ['Gold', 'Masters'] });

console.log(`Gold: avgOVR=${tierStats.Gold.avgOVR?.toFixed(1)} avgRank=${tierStats.Gold.avgRank?.toFixed(0)}`);
console.log(`Masters: avgOVR=${tierStats.Masters.avgOVR?.toFixed(1)} avgRank=${tierStats.Masters.avgRank?.toFixed(0)}`);

check('amostra real de ambos os tiers', () => {
  assert.ok(tierStats.Gold.tournaments > 0 && tierStats.Masters.tournaments > 0);
});
check('Masters avgOVR > Gold avgOVR (NÃO REGREDIU — bug original da 5.0/5.1)', () => {
  assert.ok(tierStats.Masters.avgOVR > tierStats.Gold.avgOVR, `Masters=${tierStats.Masters.avgOVR} Gold=${tierStats.Gold.avgOVR}`);
});
check('Masters avgRank < Gold avgRank (NÃO REGREDIU)', () => {
  assert.ok(tierStats.Masters.avgRank < tierStats.Gold.avgRank, `Masters=${tierStats.Masters.avgRank} Gold=${tierStats.Gold.avgRank}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-masters-gold-order-regression: PASS');
