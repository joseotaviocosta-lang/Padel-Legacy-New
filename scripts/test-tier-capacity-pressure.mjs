// Playthrough 5.2 — falha se um tier depender SISTEMATICAMENTE de
// candidatos muito fora da banda ideal só pra preencher sua agenda
// anual. "Sistematicamente" = maioria do campo (>50%) fora da faixa
// (nem ideal, nem vizinho) — overlap com o vizinho é saudável (Parte F),
// só "fora da faixa" conta como dependência real de fallback.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, computeCapacityMetrics } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_CP_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'capacity-pressure', trackWeeklyDraws: false });
const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
const { originBreakdown } = await computeCapacityMetrics(sim, { tiers });

console.log('=== % fora da faixa por tier ===');
for (const tier of tiers) {
  const b = originBreakdown[tier];
  const pct = b.total ? (b.farOff / b.total) * 100 : null;
  console.log(`${tier}: total=${b.total} fora_da_faixa=${b.farOff} (${pct?.toFixed(1)}%)`);
}

for (const tier of tiers) {
  const b = originBreakdown[tier];
  if (!b.total) continue;
  const pct = (b.farOff / b.total) * 100;
  check(`${tier}: não depende sistematicamente de candidatos fora da faixa (<50%)`, () => {
    assert.ok(pct < 50, `${tier}: ${pct.toFixed(1)}% fora da faixa`);
  });
}

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-tier-capacity-pressure: PASS');
