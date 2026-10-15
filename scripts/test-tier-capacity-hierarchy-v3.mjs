// Playthrough 5.2 — gate principal (substitui/estende
// test-tier-strength-distribution-v2.mjs da 5.1, agregando N seeds com
// margem mínima empírica em vez de fixa). Exige, no agregado:
// Masters avgOVR > Gold avgOVR > Silver avgOVR > Bronze avgOVR, e a
// mesma ordem em avgRank (numérico menor = mais forte).
//
// Margem mínima (Parte P): derivada do desvio padrão ENTRE seeds
// observado nesta própria execução — nunca um número fixo tipo "2 OVR"
// escolhido a dedo. Se o desvio padrão entre seeds for, digamos, 0.8,
// uma margem de 0.3 seria ruído; a margem mínima usada aqui é
// max(0.5, 1.5×stdev médio das duas populações comparadas) — ainda
// pequena o bastante pra não mascarar um elo genuinamente próximo, mas
// grande o bastante pra não confundir 76.11 vs 76.10 com um resultado.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, computeTierFieldMetrics, TIER_ORDER } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function mean(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }
function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

const seedCount = Number(process.env.PADEL_SEEDS || 3);
const years = Number(process.env.PADEL_SEED_YEARS || 1);
const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];

console.log(`\n=== test-tier-capacity-hierarchy-v3 — ${seedCount} seed(s) × ${years} temporada(s) ===\n`);
const perSeedStats = [];
for (let i = 0; i < seedCount; i += 1) {
  const sim = await runHeadlessWorldSimulation({ years, label: `v3calib${i}`, trackWeeklyDraws: false });
  const { tierStats } = computeTierFieldMetrics(sim, { tiers });
  perSeedStats.push(tierStats);
  console.log(`seed v3calib${i}: ` + tiers.map((t) => `${t}=${tierStats[t]?.avgOVR?.toFixed(1) ?? 'n/a'}`).join(' '));
}

const aggregate = {};
for (const tier of tiers) {
  aggregate[tier] = {
    avgRankMean: mean(perSeedStats.map((s) => s[tier]?.avgRank).filter((v) => v != null)),
    avgOVRMean: mean(perSeedStats.map((s) => s[tier]?.avgOVR).filter((v) => v != null)),
    avgOVRStdev: stdev(perSeedStats.map((s) => s[tier]?.avgOVR).filter((v) => v != null)),
  };
}
console.log('\n=== agregado ===');
for (const tier of tiers) console.log(`${tier}: avgRank=${aggregate[tier].avgRankMean?.toFixed(0)} avgOVR=${aggregate[tier].avgOVRMean?.toFixed(1)}±${aggregate[tier].avgOVRStdev?.toFixed(2)}`);

function minMargin(tierA, tierB) {
  const s = ((aggregate[tierA].avgOVRStdev || 0) + (aggregate[tierB].avgOVRStdev || 0)) / 2;
  return Math.max(0.5, 1.5 * s);
}

check('amostra real em todos os 7 tiers', () => {
  for (const tier of tiers) assert.ok(aggregate[tier].avgOVRMean != null, `${tier} sem amostra`);
});

const chain = [['Bronze', 'Silver'], ['Silver', 'Gold'], ['Gold', 'Masters']];
for (const [weaker, stronger] of chain) {
  const margin = minMargin(weaker, stronger);
  check(`${stronger} avgOVR > ${weaker} avgOVR (margem mínima empírica ${margin.toFixed(2)})`, () => {
    assert.ok(aggregate[stronger].avgOVRMean > aggregate[weaker].avgOVRMean + margin, `${stronger}=${aggregate[stronger].avgOVRMean.toFixed(2)} ${weaker}=${aggregate[weaker].avgOVRMean.toFixed(2)}`);
  });
  check(`${stronger} avgRank < ${weaker} avgRank`, () => {
    assert.ok(aggregate[stronger].avgRankMean < aggregate[weaker].avgRankMean, `${stronger}=${aggregate[stronger].avgRankMean} ${weaker}=${aggregate[weaker].avgRankMean}`);
  });
}

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-tier-capacity-hierarchy-v3: PASS');
