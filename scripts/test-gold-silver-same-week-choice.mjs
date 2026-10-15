// Playthrough 5.2, Parte L — semanas em que Gold e Silver coincidem
// (mesmo draw_date). Mede Top50/Top100/Top250 enviados a cada um. Gold
// deveria vencer Silver em qualidade média SEM monopolizar todos os
// melhores — mas dado o achado desta fase (Gold ainda perde pra Silver
// em força média mesmo nessas semanas diretas), este teste é OUTRA
// lente sobre o mesmo bug conhecido, não uma nova pendência.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_SAMEWEEK_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'gold-silver-same-week', trackWeeklyDraws: true });

const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));
const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));
function ranksOfPair(pairId) {
  const partnership = partnershipById.get(pairId);
  if (!partnership) return [];
  return [partnership.athlete_a_id, partnership.athlete_b_id].filter(Boolean)
    .map((id) => Number(athleteById.get(id)?.ranking_position) || 0).filter((r) => r > 0);
}

let sameWeekCount = 0;
const bucket = { Gold: { top50: 0, top100: 0, top250: 0, total: 0 }, Silver: { top50: 0, top100: 0, top250: 0, total: 0 } };
for (const snapshot of sim.weeklyDrawSnapshots) {
  const gold = snapshot.tournaments.find((t) => t.tier === 'Gold');
  const silver = snapshot.tournaments.find((t) => t.tier === 'Silver');
  if (!gold || !silver) continue;
  sameWeekCount += 1;
  for (const [tier, tournament] of [['Gold', gold], ['Silver', silver]]) {
    for (const pairId of tournament.draw_pair_ids) {
      for (const rank of ranksOfPair(pairId)) {
        bucket[tier].total += 1;
        if (rank <= 50) bucket[tier].top50 += 1;
        if (rank <= 100) bucket[tier].top100 += 1;
        if (rank <= 250) bucket[tier].top250 += 1;
      }
    }
  }
}

console.log(`=== semanas com Gold+Silver simultâneos: ${sameWeekCount} ===`);
for (const tier of ['Gold', 'Silver']) {
  const b = bucket[tier];
  console.log(`${tier}: total_atletas=${b.total} Top50=${b.top50}(${b.total ? (b.top50 / b.total * 100).toFixed(1) : 'n/a'}%) Top100=${b.top100}(${b.total ? (b.top100 / b.total * 100).toFixed(1) : 'n/a'}%) Top250=${b.top250}(${b.total ? (b.top250 / b.total * 100).toFixed(1) : 'n/a'}%)`);
}

check('há semanas reais com Gold e Silver simultâneos (amostra não vazia)', () => {
  assert.ok(sameWeekCount > 0, 'nenhuma semana com os dois tiers simultâneos');
});

check('Gold recebe uma fração de Top100 pelo menos igual à de Silver nessas semanas diretas', () => {
  const goldPct = bucket.Gold.total ? bucket.Gold.top100 / bucket.Gold.total : 0;
  const silverPct = bucket.Silver.total ? bucket.Silver.top100 / bucket.Silver.total : 0;
  assert.ok(goldPct >= silverPct, `Gold Top100%=${(goldPct * 100).toFixed(1)} Silver Top100%=${(silverPct * 100).toFixed(1)} — mesmo achado da Parte 5.2 (Gold ainda perde pra Silver em força média)`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) console.log('test-gold-silver-same-week-choice: FAIL (esperado — mesma pendência de test-gold-silver-field-order.mjs)');
else console.log('test-gold-silver-same-week-choice: PASS');
process.exitCode = failed > 0 ? 1 : 0;
