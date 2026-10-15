// Playthrough 5.1, Parte R/W — validação em seeds NÃO usadas pra calibrar
// a curva (test-tier-strength-distribution-v2.mjs usa labels "calibN";
// este arquivo usa labels "heldoutN", execuções Node independentes e
// disjuntas — nenhum parâmetro do rebalance foi ajustado olhando pra
// estas rodadas especificamente). O mesmo gate do v2, rodado aqui, prova
// que o resultado não é overfitting num punhado específico de rodadas —
// generaliza pra rodadas novas do mesmo pipeline.
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

console.log(`\n=== test-tier-strength-heldout-seeds — ${seedCount} seed(s) held-out × ${years} temporada(s) ===\n`);
const perSeedStats = [];
for (let i = 0; i < seedCount; i += 1) {
  const label = `heldout${i}`;
  const sim = await runHeadlessWorldSimulation({ years, label, trackWeeklyDraws: false });
  const { tierStats } = computeTierFieldMetrics(sim, { tiers });
  perSeedStats.push(tierStats);
  console.log(`seed ${label}: ` + tiers.map((t) => `${t}=${tierStats[t]?.avgOVR?.toFixed(1) ?? 'n/a'}`).join(' '));
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
check('Gold avgOVR > Silver avgOVR (held-out)', () => {
  assert.ok(aggregate.Gold.avgOVRMean > aggregate.Silver.avgOVRMean, `Gold=${aggregate.Gold.avgOVRMean} Silver=${aggregate.Silver.avgOVRMean}`);
});
check('Masters avgOVR > Gold avgOVR (held-out)', () => {
  assert.ok(aggregate.Masters.avgOVRMean > aggregate.Gold.avgOVRMean, `Masters=${aggregate.Masters.avgOVRMean} Gold=${aggregate.Gold.avgOVRMean}`);
});
check('Masters avgRank < Gold avgRank < Silver avgRank < Bronze avgRank (held-out)', () => {
  assert.ok(aggregate.Masters.avgRankMean < aggregate.Gold.avgRankMean);
  assert.ok(aggregate.Gold.avgRankMean < aggregate.Silver.avgRankMean);
  assert.ok(aggregate.Silver.avgRankMean < aggregate.Bronze.avgRankMean);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-tier-strength-heldout-seeds: PASS');
