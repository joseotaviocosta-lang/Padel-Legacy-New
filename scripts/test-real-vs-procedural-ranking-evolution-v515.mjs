// Playthrough 5.15 (continuação), Partes O/R — 3 seeds de calibração + 3
// held-out, uma temporada cada, capturando as invariantes que a fase exige:
//
//   ghost RR = 0
//   atleta real duplicado = 0
//   rescue displacement = 0
//   synthetic displayed rank = 0
//
// Também mede a evolução real × procedural (Parte O): bots podem SUBIR por
// mérito, mas não podem nascer no topo.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, resolvePairMemberIds } from './lib/tierRebalanceHarness.mjs';
import { buildOriginIndex, classifyPair, originMix, ORIGIN } from './lib/originClassifier.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const CALIBRATION = ['c1', 'c2', 'c3'];
const HELDOUT = ['h1', 'h2', 'h3'];

async function runSeed(label) {
  const captured = { label };
  const sim = await runHeadlessWorldSimulation({
    years: 1, label: `v515-${label}`, trackWeeklyDraws: false, includeRankingResults: true,
    onBeforeClose: async ({ localGame, vite }) => {
      captured.teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
      const athletesNow = await localGame.entities.AthleteProfile.list(null, 5000);
      captured.originIndex = await buildOriginIndex(vite, athletesNow);
      captured.athletes = athletesNow;
      const { buildOpponentAnalysis } = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
      const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
      // Parte P — quantos adversários de catálogo exibiriam número?
      const sample = (BOTS_BY_DIFFICULTY.iniciante || []).slice(0, 40);
      let synthetic = 0;
      for (let i = 0; i + 1 < sample.length; i += 2) {
        const analysis = buildOpponentAnalysis([sample[i], sample[i + 1]], { worldRank: null, analysisLevel: 1 });
        if (analysis.ranking !== null) synthetic += 1;
      }
      captured.syntheticDisplayed = synthetic;
      captured.syntheticSampled = Math.floor(sample.length / 2);
    },
  });

  const { originById } = captured.originIndex;
  const teams = captured.teams;
  const byId = new Map(captured.athletes.map((a) => [a.id, a]));

  // Ghost RR + duplicação de atleta real.
  const canonicalPartner = new Map();
  for (const a of captured.athletes) {
    if (originById.get(a.id) === ORIGIN.REAL && a.ai_partner_id) canonicalPartner.set(a.id, a.ai_partner_id);
  }
  const appearances = new Map();
  let ghostRR = 0;
  for (const t of teams) {
    const cls = classifyPair(originById, t.player1_id, t.player2_id);
    if (cls === 'RR') {
      const declared = canonicalPartner.get(t.player1_id) === t.player2_id
        || canonicalPartner.get(t.player2_id) === t.player1_id;
      if (!declared) ghostRR += 1;
    }
    for (const id of [t.player1_id, t.player2_id]) {
      if (originById.get(id) !== ORIGIN.REAL) continue;
      appearances.set(id, (appearances.get(id) || 0) + 1);
    }
  }
  const duplicatedReal = [...appearances.values()].filter((n) => n > 1).length;

  // Rescue displacement: dupla repetida / atleta repetido dentro do field.
  const partnershipById = new Map((sim.partnerships || []).map((p) => [p.id, p]));
  const membersOf = (pairId) => {
    const direct = resolvePairMemberIds(pairId);
    if (direct?.length === 2) return direct;
    const p = partnershipById.get(pairId);
    return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
  };
  let rescueDisplacement = 0;
  for (const t of sim.tournaments) {
    if (!Array.isArray(t.draw_pair_ids) || !t.draw_pair_ids.length) continue;
    const seenMembers = new Set();
    const seenPairs = new Set();
    for (const pid of t.draw_pair_ids) {
      const m = membersOf(pid);
      if (m.length !== 2) continue;
      const key = [m[0], m[1]].sort().join('_');
      if (seenPairs.has(key)) rescueDisplacement += 1;
      seenPairs.add(key);
      for (const id of m) {
        if (seenMembers.has(id)) rescueDisplacement += 1;
        seenMembers.add(id);
      }
    }
    const size = Number(t.main_draw_size) || 0;
    if (size > 0 && t.draw_pair_ids.length > size) rescueDisplacement += 1;
  }

  const top10 = originMix(teams, originById, { limit: 10 });
  const top20 = originMix(teams, originById, { limit: 20 });
  const top50 = originMix(teams, originById, { limit: 50 });

  return {
    label,
    totalAthletes: captured.athletes.length,
    real: captured.athletes.filter((a) => originById.get(a.id) === ORIGIN.REAL).length,
    ghostRR,
    duplicatedReal,
    rescueDisplacement,
    syntheticDisplayed: captured.syntheticDisplayed,
    syntheticSampled: captured.syntheticSampled,
    top10, top20, top50,
    ppTop50: top50.PP,
    byId,
  };
}

const results = [];
for (const label of [...CALIBRATION, ...HELDOUT]) {
  const r = await runSeed(label);
  results.push(r);
  console.log(`[${r.label}] atletas=${r.totalAthletes} reais=${r.real} | ghostRR=${r.ghostRR} dupReal=${r.duplicatedReal} rescueDisp=${r.rescueDisplacement} synthRank=${r.syntheticDisplayed}/${r.syntheticSampled}`);
  console.log(`      Top10 RR=${r.top10.RR} PP=${r.top10.PP} | Top20 RR=${r.top20.RR} PP=${r.top20.PP} | Top50 RR=${r.top50.RR} PP=${r.top50.PP}`);
}

const calib = results.filter((r) => CALIBRATION.includes(r.label));
const held = results.filter((r) => HELDOUT.includes(r.label));

check('Parte R/30-31: 3 seeds de calibração + 3 held-out rodaram', () => {
  assert.equal(calib.length, 3);
  assert.equal(held.length, 3);
});

check('Parte R/32 (critério 1): ghost RR = 0 em 6/6 seeds', () => {
  for (const r of results) assert.equal(r.ghostRR, 0, `${r.label}: ${r.ghostRR} duplas RR fantasma`);
});

check('Parte R/33 (critério 2): atleta real duplicado = 0 em 6/6', () => {
  for (const r of results) assert.equal(r.duplicatedReal, 0, `${r.label}: ${r.duplicatedReal} reais em duas duplas`);
});

check('Parte R/34 (critério 9): rescue displacement = 0 em 6/6', () => {
  for (const r of results) assert.equal(r.rescueDisplacement, 0, `${r.label}: ${r.rescueDisplacement} deslocamentos`);
});

check('Parte R/35 (critério 5): synthetic displayed rank = 0 em 6/6', () => {
  for (const r of results) {
    assert.equal(r.syntheticDisplayed, 0,
      `${r.label}: ${r.syntheticDisplayed}/${r.syntheticSampled} adversários de catálogo exibiriam número`);
  }
});

check('Parte O: a elite do ranking de duplas segue REAL depois de uma temporada', () => {
  for (const r of results) {
    assert.ok(r.top10.RR >= 7, `${r.label}: só ${r.top10.RR} duplas reais no Top10`);
  }
});

check('Parte O: procedurais podem subir, mas não dominam o Top20', () => {
  for (const r of results) {
    assert.ok(r.top20.PP <= 8, `${r.label}: ${r.top20.PP} duplas procedurais no Top20`);
  }
});

check('held-out reproduz a calibração (mesmas invariantes)', () => {
  const invariant = (r) => [r.ghostRR, r.duplicatedReal, r.rescueDisplacement, r.syntheticDisplayed].join(':');
  const calibSet = new Set(calib.map(invariant));
  for (const r of held) {
    assert.ok(calibSet.has(invariant(r)), `${r.label}: invariantes ${invariant(r)} fora do observado`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-real-vs-procedural-ranking-evolution-v515: PASS');
