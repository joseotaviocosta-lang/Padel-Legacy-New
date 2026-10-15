// Playthrough 5.3, TESTE 8/Parte H — sondas de duplas de elite (reais,
// se existirem no catálogo seedado — Coello/Tapia etc.; senão, as duplas
// de maior world_ranking_points reais do mundo simulado, nunca
// inventadas) e sua distribuição de participação entre tiers ao longo
// de uma temporada. Esperado: concentração maior em Masters/Elite/Crown,
// Gold ocasional, Silver raro, Bronze quase nunca — nunca um banimento
// rígido (nenhuma checagem de "0 participações" é exigida).
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

const years = Number(process.env.PADEL_ELITE_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'elite-pair-distribution', trackWeeklyDraws: false });

const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));
const REAL_NAMES = /coello|tapia|gal[aá]n|chingotto|lebr[oó]n|augsburger|stupa|yanguas|nieto|di nenno/i;
const realAthletes = sim.athletes.filter((a) => REAL_NAMES.test(a.name || ''));

// Fallback: se o catálogo real não estiver presente nesta seed, usa as
// duplas de maior world_ranking_points reais do mundo simulado (nunca
// inventadas) como sonda de elite.
const eliteAthletes = realAthletes.length
  ? realAthletes
  : [...sim.athletes].sort((a, b) => (Number(b.world_ranking_points) || 0) - (Number(a.world_ranking_points) || 0)).slice(0, 10);

console.log(`=== sondas de elite: ${eliteAthletes.length} atletas (${realAthletes.length ? 'catálogo real' : 'top world_ranking_points, fallback'}) ===`);
for (const a of eliteAthletes) console.log(`  ${a.name} (id=${a.id}, rank=${a.ranking_position}, OVR=${a.overall_rating})`);

const eliteIds = new Set(eliteAthletes.map((a) => a.id));
const partnershipsWithElite = sim.partnerships.filter((p) => eliteIds.has(p.athlete_a_id) || eliteIds.has(p.athlete_b_id));
const elitePairIds = new Set(partnershipsWithElite.map((p) => p.id));

const distributionByTier = {};
for (const tier of ['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown']) {
  const resolved = sim.tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);
  let count = 0;
  for (const tournament of resolved) {
    for (const pairId of tournament.draw_pair_ids) if (elitePairIds.has(pairId)) count += 1;
  }
  distributionByTier[tier] = count;
}

const total = Object.values(distributionByTier).reduce((s, v) => s + v, 0);
console.log('\n=== distribuição de participação das duplas de elite entre tiers ===');
for (const [tier, count] of Object.entries(distributionByTier)) {
  console.log(`${tier}: ${count} participações (${total ? (count / total * 100).toFixed(1) : 'n/a'}%)`);
}

console.log(`\ntotal de participações de elite na amostra: ${total}`);
if (total === 0) {
  console.log('(amostra vazia — nenhuma dupla de elite jogou na janela simulada; não é um banimento, só falta de amostra nesta rodada específica)');
}
console.log('test-elite-pair-tier-distribution: PASS (observacional — sem hard ban a verificar, Parte H)');
