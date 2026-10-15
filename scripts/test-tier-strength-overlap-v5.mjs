// Playthrough 5.5, Parte E — confirma que existe SOBREPOSIÇÃO NATURAL
// entre tiers vizinhos (Bronze/Silver, Silver/Gold, Gold/Platinum,
// Platinum/Masters) — não quero tiers perfeitamente separados. Mede, pra
// cada par de tiers vizinhos, a fração de OVR onde as distribuições se
// sobrepõem (P75 do tier mais fraco vs P25 do tier mais forte), e confirma
// que NENHUM par está completamente segregado (overlap zero).
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, canonicalPairAthleteIds } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function percentile(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null; }

const years = Number(process.env.PADEL_OVERLAP_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'strength-overlap', trackWeeklyDraws: false });
const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));
const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters'];
const ovrByTier = {};
for (const tier of TIERS) {
  const resolved = sim.tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);
  const ovrs = [];
  for (const tournament of resolved) {
    for (const pairId of tournament.draw_pair_ids) {
      const members = canonicalPairAthleteIds(pairId, partnershipById).map((id) => athleteById.get(id)).filter(Boolean);
      for (const m of members) { const ovr = Number(m.overall_rating); if (ovr > 0) ovrs.push(ovr); }
    }
  }
  ovrs.sort((a, b) => a - b);
  ovrByTier[tier] = ovrs;
}

console.log(`=== Parte E: sobreposição entre tiers vizinhos (${years} temporada(s)) ===\n`);
const NEIGHBORS = [['Bronze', 'Silver'], ['Silver', 'Gold'], ['Gold', 'Platinum'], ['Platinum', 'Masters']];
for (const [weaker, stronger] of NEIGHBORS) {
  const weakP75 = percentile(ovrByTier[weaker], 0.75);
  const strongP25 = percentile(ovrByTier[stronger], 0.25);
  const overlaps = weakP75 != null && strongP25 != null && weakP75 >= strongP25;
  console.log(`${weaker} P75=${weakP75} vs ${stronger} P25=${strongP25} — ${overlaps ? 'SOBREPÕEM' : 'sem sobreposição direta neste corte'}`);

  check(`${weaker}/${stronger}: existe ao menos 1 atleta de ${weaker} com OVR >= P25 de ${stronger} (zebra/ascensão possível)`, () => {
    const strongP25v = percentile(ovrByTier[stronger], 0.25);
    const hasOverlap = ovrByTier[weaker].some((v) => v >= strongP25v);
    assert.ok(hasOverlap, `nenhum atleta de ${weaker} alcança o P25 de ${stronger} (${strongP25v})`);
  });
  check(`${weaker}/${stronger}: NÃO são idênticos (segregação real ainda existe — não virou uma mistura sem hierarquia)`, () => {
    const weakMedian = percentile(ovrByTier[weaker], 0.5);
    const strongMedian = percentile(ovrByTier[stronger], 0.5);
    assert.ok(strongMedian > weakMedian, `mediana de ${stronger}=${strongMedian} deveria ser > mediana de ${weaker}=${weakMedian}`);
  });
}

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-tier-strength-overlap-v5: PASS');
