// Playthrough 5.2, Parte X — validação em seeds NÃO usadas na calibração
// de test-tier-capacity-hierarchy-v3.mjs (labels "v3calibN"). Usa labels
// "v3heldoutN", execuções Node independentes e disjuntas. Mesmo gate do
// v3, rodado aqui — prova que o resultado (inclusive a pendência
// conhecida de Gold vs Silver) generaliza, não é artefato de rodadas
// específicas.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, computeTierFieldMetrics } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function mean(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }

const seedCount = Number(process.env.PADEL_HELDOUT_SEEDS || 3);
const years = Number(process.env.PADEL_SEED_YEARS || 1);
const tiers = ['Bronze', 'Silver', 'Gold', 'Masters'];

console.log(`\n=== test-tier-capacity-heldout — ${seedCount} seed(s) held-out × ${years} temporada(s) ===\n`);
const perSeedStats = [];
for (let i = 0; i < seedCount; i += 1) {
  const sim = await runHeadlessWorldSimulation({ years, label: `v3heldout${i}`, trackWeeklyDraws: false });
  const { tierStats } = computeTierFieldMetrics(sim, { tiers });
  perSeedStats.push(tierStats);
  console.log(`seed v3heldout${i}: ` + tiers.map((t) => `${t}=${tierStats[t]?.avgOVR?.toFixed(1) ?? 'n/a'}`).join(' '));
}

const aggregate = {};
for (const tier of tiers) {
  aggregate[tier] = {
    avgRankMean: mean(perSeedStats.map((s) => s[tier]?.avgRank).filter((v) => v != null)),
    avgOVRMean: mean(perSeedStats.map((s) => s[tier]?.avgOVR).filter((v) => v != null)),
  };
}
console.log('\n=== agregado held-out ===');
for (const tier of tiers) console.log(`${tier}: avgRank=${aggregate[tier].avgRankMean?.toFixed(0)} avgOVR=${aggregate[tier].avgOVRMean?.toFixed(1)}`);

check('Silver avgOVR > Bronze avgOVR (held-out)', () => {
  assert.ok(aggregate.Silver.avgOVRMean > aggregate.Bronze.avgOVRMean, `Silver=${aggregate.Silver.avgOVRMean} Bronze=${aggregate.Bronze.avgOVRMean}`);
});
check('Gold avgOVR > Silver avgOVR (held-out) — pendência conhecida, esperado FALHAR', () => {
  assert.ok(aggregate.Gold.avgOVRMean > aggregate.Silver.avgOVRMean, `Gold=${aggregate.Gold.avgOVRMean} Silver=${aggregate.Silver.avgOVRMean}`);
});
check('Masters avgOVR > Gold avgOVR (held-out)', () => {
  assert.ok(aggregate.Masters.avgOVRMean > aggregate.Gold.avgOVRMean, `Masters=${aggregate.Masters.avgOVRMean} Gold=${aggregate.Gold.avgOVRMean}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) console.log('test-tier-capacity-heldout: FAIL parcial esperado (Gold vs Silver) — ver relatório da fase.');
else console.log('test-tier-capacity-heldout: PASS');
process.exitCode = failed > 0 ? 1 : 0;
