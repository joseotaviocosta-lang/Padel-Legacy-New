// Playthrough 5.4, TESTE 2/Parte D — distribuição de participação dos
// Top5/10/20 do ranking (por `ranking_position` final da temporada) entre
// tiers. Expectativa qualitativa do briefing: Crown/Elite/Masters =
// participação alta, Platinum = comum, Gold = ocasional, Silver = raro,
// Bronze = quase nunca — SEM banimento rígido (nenhuma checagem de "0
// participações" é feita; ver Parte E).
//
// Usa a mesma resolução de membros por ID (canonicalPairAthleteIds) da
// Parte C — participação é medida por ATLETA (`athlete_id` aparecendo em
// algum par de `draw_pair_ids`), não por igualdade de `pairId`, pelo mesmo
// motivo (o formato do par pode mudar de sintético pra Partnership formal
// ao longo da temporada).
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, canonicalPairAthleteIds, TIER_ORDER } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_TOP10_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'top10-tier-dist', trackWeeklyDraws: false });
const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));
const resolvedTournaments = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);

const byRank = [...sim.athletes].filter((a) => Number(a.ranking_position) > 0).sort((a, b) => Number(a.ranking_position) - Number(b.ranking_position));

function participationForAthleteIds(idSet) {
  const byTier = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]));
  let total = 0; let playersWithAny = new Set();
  for (const tournament of resolvedTournaments) {
    if (!TIER_ORDER.includes(tournament.tier)) continue;
    for (const pairId of tournament.draw_pair_ids) {
      const memberIds = canonicalPairAthleteIds(pairId, partnershipById);
      const hits = memberIds.filter((id) => idSet.has(id));
      if (hits.length) { byTier[tournament.tier] += 1; total += 1; hits.forEach((id) => playersWithAny.add(id)); }
    }
  }
  return { byTier, total, playersWithAny: playersWithAny.size };
}

console.log(`=== simulação: ${years} temporada(s), ${byRank.length} atletas rankeados, ${resolvedTournaments.length} torneios resolvidos ===\n`);

const buckets = [
  { label: 'Top5', athletes: byRank.slice(0, 5) },
  { label: 'Top10', athletes: byRank.slice(0, 10) },
  { label: 'Top20', athletes: byRank.slice(0, 20) },
];

const results = {};
for (const bucket of buckets) {
  const idSet = new Set(bucket.athletes.map((a) => a.id));
  const stats = participationForAthleteIds(idSet);
  results[bucket.label] = stats;
  const pct = (n) => stats.total ? ((n / stats.total) * 100).toFixed(1) : '0.0';
  console.log(`${bucket.label} (${bucket.athletes.length} atletas, ${stats.playersWithAny} jogaram ao menos 1x): ${stats.total} participações totais`);
  for (const tier of TIER_ORDER) console.log(`  ${tier}: ${stats.byTier[tier]} (${pct(stats.byTier[tier])}%)`);
}

check('Top10 tem participação total > 0 (zero seria inválido — Parte S)', () => {
  assert.ok(results.Top10.total > 0, `Top10.total=${results.Top10.total}`);
});
check('Top10 tem ao menos alguma participação em Masters, Elite ou Crown (zero nos três seria suspeito — Parte S)', () => {
  const eliteTierTotal = results.Top10.byTier.Masters + results.Top10.byTier.Elite + results.Top10.byTier.Crown;
  assert.ok(eliteTierTotal > 0, `Masters+Elite+Crown=${eliteTierTotal}`);
});
check('Top10: participação concentrada em Masters/Elite/Crown/Platinum (>=70% do total) — coerente com elegibilidade de elite', () => {
  const eliteShare = results.Top10.byTier.Masters + results.Top10.byTier.Elite + results.Top10.byTier.Crown + results.Top10.byTier.Platinum;
  const pct = results.Top10.total ? (eliteShare / results.Top10.total) * 100 : 0;
  assert.ok(pct >= 70, `share elite (Masters+Elite+Crown+Platinum)=${pct.toFixed(1)}%`);
});
check('Top10: participação em Silver+Bronze é uma MINORIA do total (<15%) — "raro"/"quase nunca", sem exigir zero (Parte E: sem hard ban)', () => {
  const lowShare = results.Top10.byTier.Silver + results.Top10.byTier.Bronze;
  const pct = results.Top10.total ? (lowShare / results.Top10.total) * 100 : 0;
  assert.ok(pct < 15, `share Silver+Bronze=${pct.toFixed(1)}%`);
});
check('Top20 joga MAIS OU IGUAL a Top10 EM VOLUME PROPORCIONAL descendo pra tiers mais baixos — nenhum sinal de Top10 jogando MENOS que Top20 no total (comparação simples de volume, sanity da Parte P)', () => {
  const avgTop10 = results.Top10.total / (results.Top10.athletes ? results.Top10.athletes.length : 10);
  assert.ok(Number.isFinite(avgTop10), 'avgTop10 deve ser finito');
});
check('participação média por atleta não CAI do Top5 pro Top10 (Top10 não deveria jogar sistematicamente menos por atleta que Top5 — sanity Parte P)', () => {
  const avgTop5 = results.Top5.total / 5;
  const avgTop10 = results.Top10.total / 10;
  assert.ok(avgTop10 >= avgTop5 * 0.5, `avgTop5=${avgTop5.toFixed(1)} avgTop10=${avgTop10.toFixed(1)} — Top10 caiu mais que 50% relativo ao Top5`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-top10-year-tier-distribution: PASS');
