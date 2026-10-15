// Playthrough 5.5, Parte L — estabilidade DENTRO de uma temporada: a
// ordem Gold>Silver (e Platinum>Gold, Masters>Platinum, Silver>Bronze)
// precisa se manter razoavelmente estável semana a semana, não só no
// agregado do ano inteiro — usa os snapshots semanais já coletados pelo
// harness (weeklyDrawSnapshots) pra medir a ordem de força em janelas
// trimestrais (Q1-Q4) dentro da MESMA temporada.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, canonicalPairAthleteIds } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }

const years = Number(process.env.PADEL_STABILITY_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'season-stability', trackWeeklyDraws: true });
const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));
const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));

function quarterOf(dateStr) {
  const month = Number(String(dateStr).slice(5, 7));
  return Math.ceil(month / 3);
}

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters'];
const byQuarterTier = { 1: {}, 2: {}, 3: {}, 4: {} };
for (const q of [1, 2, 3, 4]) for (const t of TIERS) byQuarterTier[q][t] = [];

for (const snapshot of sim.weeklyDrawSnapshots) {
  const q = quarterOf(snapshot.date);
  if (!q) continue;
  for (const tournament of snapshot.tournaments) {
    if (!TIERS.includes(tournament.tier)) continue;
    for (const pairId of tournament.draw_pair_ids) {
      const members = canonicalPairAthleteIds(pairId, partnershipById).map((id) => athleteById.get(id)).filter(Boolean);
      for (const m of members) { const ovr = Number(m.overall_rating); if (ovr > 0) byQuarterTier[q][tournament.tier].push(ovr); }
    }
  }
}

console.log(`=== Parte L: estabilidade da hierarquia por trimestre (${years} temporada(s)) ===\n`);
const quarterAvg = {};
for (const q of [1, 2, 3, 4]) {
  quarterAvg[q] = Object.fromEntries(TIERS.map((t) => [t, avg(byQuarterTier[q][t])]));
  console.log(`Q${q}: ` + TIERS.map((t) => `${t}=${quarterAvg[q][t]?.toFixed(1) ?? 'n/a'}`).join(' '));
}

let quartersWithGoldAboveSilver = 0; let quartersWithData = 0;
for (const q of [1, 2, 3, 4]) {
  const gold = quarterAvg[q].Gold; const silver = quarterAvg[q].Silver;
  if (gold == null || silver == null) continue;
  quartersWithData += 1;
  if (gold > silver) quartersWithGoldAboveSilver += 1;
}
console.log(`\nGold > Silver em ${quartersWithGoldAboveSilver}/${quartersWithData} trimestres com dado`);

check('amostra real (ao menos 2 trimestres com dado em ambos os tiers)', () => {
  assert.ok(quartersWithData >= 2, `quartersWithData=${quartersWithData}`);
});
check('Gold > Silver na MAIORIA dos trimestres (estabilidade dentro da temporada, não só um pico isolado no agregado anual)', () => {
  assert.ok(quartersWithGoldAboveSilver >= Math.ceil(quartersWithData / 2), `Gold>Silver em só ${quartersWithGoldAboveSilver}/${quartersWithData} trimestres`);
});
check('Platinum > Gold se mantém na maioria dos trimestres com dado', () => {
  let ok = 0; let withData = 0;
  for (const q of [1, 2, 3, 4]) {
    if (quarterAvg[q].Platinum == null || quarterAvg[q].Gold == null) continue;
    withData += 1;
    if (quarterAvg[q].Platinum > quarterAvg[q].Gold) ok += 1;
  }
  assert.ok(withData === 0 || ok >= Math.ceil(withData / 2), `Platinum>Gold em só ${ok}/${withData} trimestres`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-tier-season-stability-v5: PASS');
