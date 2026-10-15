// Playthrough 5.3, Parte B — distribuição de candidatos Gold por bucket
// de rank (1-100, 101-200, ..., 901+). Pra cada bucket: duplas elegíveis
// (rank médio da dupla dentro do bucket, entre quem jogou Gold no ano),
// participações Gold, % das vagas, avgOVR, avgRank — mostra exatamente
// quanto do campo fraco vem de 451-600/601-750/751-900 (a pergunta
// central desta fase).
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

const years = Number(process.env.PADEL_DIAG_YEARS || 1);
const label = process.env.PADEL_DIAG_LABEL || 'qualifying-buckets';
const tier = process.env.PADEL_BUCKET_TIER || 'Gold';

console.log(`\n=== diag-tier-qualifying-buckets — tier=${tier}, ${years} temporada(s), label=${label} ===\n`);
const sim = await runHeadlessWorldSimulation({ years, label, trackWeeklyDraws: false });

const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));
const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));

const BUCKETS = [
  { label: '1-100', min: 1, max: 100 }, { label: '101-200', min: 101, max: 200 },
  { label: '201-300', min: 201, max: 300 }, { label: '301-450', min: 301, max: 450 },
  { label: '451-600', min: 451, max: 600 }, { label: '601-750', min: 601, max: 750 },
  { label: '751-900', min: 751, max: 900 }, { label: '901+', min: 901, max: Infinity },
];
function bucketFor(rank) {
  for (const b of BUCKETS) if (rank >= b.min && rank <= b.max) return b.label;
  return '901+';
}

const resolved = sim.tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);
const byBucket = Object.fromEntries(BUCKETS.map((b) => [b.label, { pairs: new Set(), participations: 0, ranks: [], ovrs: [] }]));
let totalParticipations = 0;

for (const tournament of resolved) {
  for (const pairId of tournament.draw_pair_ids) {
    const partnership = partnershipById.get(pairId);
    if (!partnership) continue;
    const members = [partnership.athlete_a_id, partnership.athlete_b_id].filter(Boolean).map((id) => athleteById.get(id)).filter(Boolean);
    const ranks = members.map((a) => Number(a.ranking_position) || 0).filter((r) => r > 0);
    if (!ranks.length) continue;
    const avgPairRank = ranks.reduce((s, v) => s + v, 0) / ranks.length;
    const bucket = bucketFor(avgPairRank);
    byBucket[bucket].pairs.add(pairId);
    byBucket[bucket].participations += 1;
    totalParticipations += 1;
    for (const m of members) {
      const r = Number(m.ranking_position) || 0;
      const o = Number(m.overall_rating) || 0;
      if (r > 0) byBucket[bucket].ranks.push(r);
      if (o > 0) byBucket[bucket].ovrs.push(o);
    }
  }
}

function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }

console.log(`=== ${tier} — ${resolved.length} torneios resolvidos, ${totalParticipations} participações totais ===\n`);
console.log('bucket'.padEnd(10) + 'duplas'.padEnd(8) + 'participações'.padEnd(15) + '% vagas'.padEnd(10) + 'avgRank'.padEnd(10) + 'avgOVR');
let weakGroupsTotal = 0;
for (const b of BUCKETS) {
  const d = byBucket[b.label];
  const pct = totalParticipations ? (d.participations / totalParticipations) * 100 : 0;
  if (['451-600', '601-750', '751-900'].includes(b.label)) weakGroupsTotal += d.participations;
  console.log(
    b.label.padEnd(10) + String(d.pairs.size).padEnd(8) + String(d.participations).padEnd(15)
    + `${pct.toFixed(1)}%`.padEnd(10) + `${avg(d.ranks)?.toFixed(0) ?? 'n/a'}`.padEnd(10) + `${avg(d.ovrs)?.toFixed(1) ?? 'n/a'}`
  );
}
const weakPct = totalParticipations ? (weakGroupsTotal / totalParticipations) * 100 : 0;
console.log(`\n% das vagas de ${tier} vindo de 451-600 + 601-750 + 751-900: ${weakGroupsTotal}/${totalParticipations} = ${weakPct.toFixed(1)}%`);
console.log('\n=== fim do diagnóstico ===\n');
