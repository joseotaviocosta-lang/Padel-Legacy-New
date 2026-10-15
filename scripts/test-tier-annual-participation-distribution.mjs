// Playthrough 5.2, Parte E — quantos torneios por ano uma dupla realmente
// disputa, por faixa de ranking (Top10/25/50/100/250/250+), e em qual
// tier essas participações caem. Usado como referência empírica (Parte
// D usa Elite+Crown como "repetição de referência" — este teste existe
// pra deixar o dado completo visível, não só o resumo de dois tiers).
// Checagem: nenhuma faixa deveria exigir uma frequência absurda (ex.:
// >20 torneios/ano só pra manter calendário — Parte E, "evitar que uma
// dupla Top 100 tenha que jogar 25 Gold por ano").
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_PART_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'participation-dist', trackWeeklyDraws: false });
const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];

const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));
const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));

function canonicalPairRank(partnership) {
  const ranks = [partnership.athlete_a_id, partnership.athlete_b_id].filter(Boolean)
    .map((id) => Number(athleteById.get(id)?.ranking_position) || 0).filter((r) => r > 0);
  return ranks.length ? ranks.reduce((s, v) => s + v, 0) / ranks.length : 0;
}

const participationsByPair = new Map(); // pairId -> { count, byTier: {tier: count} }
for (const tier of tiers) {
  const resolved = sim.tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);
  for (const tournament of resolved) {
    for (const pairId of tournament.draw_pair_ids) {
      if (!participationsByPair.has(pairId)) participationsByPair.set(pairId, { count: 0, byTier: {} });
      const entry = participationsByPair.get(pairId);
      entry.count += 1;
      entry.byTier[tier] = (entry.byTier[tier] || 0) + 1;
    }
  }
}

const RANK_BANDS = [
  { label: 'Top10', max: 10 }, { label: 'Top25', max: 25 }, { label: 'Top50', max: 50 },
  { label: 'Top100', max: 100 }, { label: 'Top250', max: 250 }, { label: '250+', max: Infinity },
];
function bandFor(rank) {
  for (const band of RANK_BANDS) if (rank <= band.max) return band.label;
  return '250+';
}

const byBand = Object.fromEntries(RANK_BANDS.map((b) => [b.label, { pairs: 0, totalParticipations: 0, byTier: Object.fromEntries(tiers.map((t) => [t, 0])) }]));
for (const [pairId, entry] of participationsByPair) {
  const partnership = partnershipById.get(pairId);
  if (!partnership) continue;
  const rank = canonicalPairRank(partnership);
  if (rank <= 0) continue;
  const band = bandFor(rank);
  byBand[band].pairs += 1;
  byBand[band].totalParticipations += entry.count;
  for (const tier of tiers) byBand[band].byTier[tier] += entry.byTier[tier] || 0;
}

console.log('=== participações anuais por faixa de rank (Parte E) ===');
for (const band of RANK_BANDS) {
  const b = byBand[band.label];
  const avgPerPair = b.pairs ? b.totalParticipations / b.pairs : null;
  console.log(`${band.label}: duplas=${b.pairs} participações_totais=${b.totalParticipations} média/dupla=${avgPerPair?.toFixed(1)} | por tier: ` + tiers.map((t) => `${t}=${b.byTier[t]}`).join(' '));
}

check('nenhuma faixa de rank exige uma frequência média absurda (<=20 torneios/ano/dupla)', () => {
  for (const band of RANK_BANDS) {
    const b = byBand[band.label];
    if (!b.pairs) continue;
    const avgPerPair = b.totalParticipations / b.pairs;
    if (avgPerPair > 20) throw new Error(`${band.label}: média de ${avgPerPair.toFixed(1)} torneios/ano/dupla — acima do razoável`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-tier-annual-participation-distribution: PASS');
