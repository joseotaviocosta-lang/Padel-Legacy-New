// Playthrough 5.5, Parte K/L — gate central: Gold vs Silver em 6
// temporadas independentes (não 2, não 1) — evita calibrar por cima de
// ruído de seed único, exigência explícita desta fase depois de a 5.4 ter
// reconhecido que a maioria dos testes novos usou só 1 seed. As 3
// primeiras seeds contam como "calibração" (mesmas usadas pra ajustar
// OPEN_TIER_CEILING/curva/tilt nesta fase), as 3 últimas são HELD-OUT
// (nunca vistas durante o ajuste dos parâmetros) — reporta média e
// dispersão de cada grupo separadamente.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, computeTierFieldMetrics } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function mean(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }
function stdev(arr) { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1)); }

const calibSeeds = Number(process.env.PADEL_V5_CALIB_SEEDS || 3);
const heldoutSeeds = Number(process.env.PADEL_V5_HELDOUT_SEEDS || 3);
const years = Number(process.env.PADEL_V5_SEED_YEARS || 1);
const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters'];

console.log(`\n=== test-tier-strength-heldout-v5 — ${calibSeeds} calibração + ${heldoutSeeds} held-out × ${years} temporada(s) ===\n`);

async function runGroup(prefix, count) {
  const perSeed = [];
  for (let i = 0; i < count; i += 1) {
    const sim = await runHeadlessWorldSimulation({ years, label: `${prefix}${i}`, trackWeeklyDraws: false });
    const { tierStats } = computeTierFieldMetrics(sim, { tiers });
    perSeed.push(tierStats);
    console.log(`seed ${prefix}${i}: ` + tiers.map((t) => `${t}=${tierStats[t]?.avgOVR?.toFixed(1) ?? 'n/a'}`).join(' '));
  }
  return perSeed;
}

const calibration = await runGroup('v5calib', calibSeeds);
const heldout = await runGroup('v5heldout', heldoutSeeds);

function aggregate(group) {
  const result = {};
  for (const tier of tiers) {
    const values = group.map((s) => s[tier]?.avgOVR).filter((v) => v != null);
    result[tier] = { mean: mean(values), stdev: stdev(values), n: values.length };
  }
  return result;
}

const calibAgg = aggregate(calibration);
const heldoutAgg = aggregate(heldout);

console.log('\n=== agregado calibração (3 seeds usadas pra ajustar os parâmetros) ===');
for (const tier of tiers) console.log(`${tier}: mean=${calibAgg[tier].mean?.toFixed(1)} stdev=${calibAgg[tier].stdev?.toFixed(2)} n=${calibAgg[tier].n}`);
console.log('\n=== agregado held-out (3 seeds NUNCA vistas durante o ajuste) ===');
for (const tier of tiers) console.log(`${tier}: mean=${heldoutAgg[tier].mean?.toFixed(1)} stdev=${heldoutAgg[tier].stdev?.toFixed(2)} n=${heldoutAgg[tier].n}`);

const allSix = [...calibration, ...heldout];
const combinedGoldMean = mean(allSix.map((s) => s.Gold?.avgOVR).filter((v) => v != null));
const combinedSilverMean = mean(allSix.map((s) => s.Silver?.avgOVR).filter((v) => v != null));
console.log(`\n=== combinado (6 temporadas independentes) === Gold=${combinedGoldMean.toFixed(2)} Silver=${combinedSilverMean.toFixed(2)} gap=${(combinedGoldMean - combinedSilverMean).toFixed(2)}`);

check('amostra real em todas as 6 seeds (calibração + held-out)', () => {
  assert.equal(calibration.length + heldout.length, calibSeeds + heldoutSeeds);
});
check('Gold > Silver na CALIBRAÇÃO (3 seeds)', () => {
  assert.ok(calibAgg.Gold.mean > calibAgg.Silver.mean, `Gold=${calibAgg.Gold.mean.toFixed(2)} Silver=${calibAgg.Silver.mean.toFixed(2)}`);
});
check('Gold > Silver no HELD-OUT (3 seeds nunca vistas durante o ajuste) — a prova real de que não é overfitting de seed', () => {
  assert.ok(heldoutAgg.Gold.mean > heldoutAgg.Silver.mean, `Gold=${heldoutAgg.Gold.mean.toFixed(2)} Silver=${heldoutAgg.Silver.mean.toFixed(2)}`);
});
check('Gold > Silver combinado (6 temporadas)', () => {
  assert.ok(combinedGoldMean > combinedSilverMean, `Gold=${combinedGoldMean.toFixed(2)} Silver=${combinedSilverMean.toFixed(2)}`);
});
check('Platinum > Gold segue correto (não regrediu ao mexer no platô do Gold)', () => {
  const platGold = allSix.map((s) => (s.Platinum?.avgOVR ?? 0) - (s.Gold?.avgOVR ?? 0));
  const avgDelta = mean(platGold);
  assert.ok(avgDelta > 0, `Platinum-Gold médio=${avgDelta.toFixed(2)}, deveria ser positivo`);
});
check('Masters > Platinum segue correto', () => {
  const mastersPlat = allSix.map((s) => (s.Masters?.avgOVR ?? 0) - (s.Platinum?.avgOVR ?? 0));
  const avgDelta = mean(mastersPlat);
  assert.ok(avgDelta > 0, `Masters-Platinum médio=${avgDelta.toFixed(2)}, deveria ser positivo`);
});
check('Silver > Bronze segue correto (Bronze continua o mais fraco)', () => {
  const silverBronze = allSix.map((s) => (s.Silver?.avgOVR ?? 0) - (s.Bronze?.avgOVR ?? 0));
  const avgDelta = mean(silverBronze);
  assert.ok(avgDelta > 0, `Silver-Bronze médio=${avgDelta.toFixed(2)}, deveria ser positivo`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-tier-strength-heldout-v5: PASS');
