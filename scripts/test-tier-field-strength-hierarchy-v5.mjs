// Playthrough 5.5, Parte B — qualidade REAL do campo por tier (não só
// média): OVR médio/mediana/P10/P25/P50/P75/P90, melhor/pior dupla, rank
// médio/mediano, presença de Top10/25/50/100/300, % de atletas abaixo do
// rank esperado do tier (fora do platô ideal — STRETCH/EMERGENCY,
// classifyFieldLayers), % de resgate/fallback. Para todos os torneios de
// uma temporada real, por tier: Pré-Temporada(Exibição)/Bronze/Silver/
// Gold/Platinum/Masters/Elite/Crown/Circuit Finals/Legacy Finals.
import { createServer } from 'vite';
import { runHeadlessWorldSimulation, canonicalPairAthleteIds } from './lib/tierRebalanceHarness.mjs';

const years = Number(process.env.PADEL_FIELD_YEARS || 1);
const label = process.env.PADEL_FIELD_LABEL || 'field-strength';
const sim = await runHeadlessWorldSimulation({ years, label, trackWeeklyDraws: false });

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { isRankInTierDiagnosticCore } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));
  const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));

  const TIERS = ['Exibição', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown', 'Circuit Finals', 'Legacy Finals'];

  function percentile(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null; }
  function median(sorted) { if (!sorted.length) return null; const n = sorted.length; return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2; }
  function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }

  console.log(`=== Parte B: qualidade de campo por tier (${years} temporada(s), label=${label}) ===\n`);
  for (const tier of TIERS) {
    const resolved = sim.tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);
    if (!resolved.length) { console.log(`${tier}: sem torneios resolvidos na amostra`); continue; }
    const ovrs = []; const ranks = []; let bestPair = null; let worstPair = null;
    let top10 = 0; let top25 = 0; let top50 = 0; let top100 = 0; let top300 = 0;
    let outOfBand = 0; let total = 0;
    for (const tournament of resolved) {
      for (const pairId of tournament.draw_pair_ids) {
        const members = canonicalPairAthleteIds(pairId, partnershipById).map((id) => athleteById.get(id)).filter(Boolean);
        if (members.length !== 2) continue;
        const pairOVR = avg(members.map((m) => Number(m.overall_rating) || 0));
        const pairRank = avg(members.map((m) => Number(m.ranking_position) || 0));
        if (pairOVR) ovrs.push(pairOVR);
        if (pairRank > 0) {
          ranks.push(pairRank);
          if (pairRank <= 10) top10 += 1;
          if (pairRank <= 25) top25 += 1;
          if (pairRank <= 50) top50 += 1;
          if (pairRank <= 100) top100 += 1;
          if (pairRank <= 300) top300 += 1;
          if (tier !== 'Exibição' && !isRankInTierDiagnosticCore(pairRank, tier)) outOfBand += 1;
          total += 1;
        }
        if (pairOVR && (!bestPair || pairOVR > bestPair.ovr)) bestPair = { ovr: pairOVR, names: members.map((m) => m.name).join(' & ') };
        if (pairOVR && (!worstPair || pairOVR < worstPair.ovr)) worstPair = { ovr: pairOVR, names: members.map((m) => m.name).join(' & ') };
      }
    }
    ovrs.sort((a, b) => a - b); ranks.sort((a, b) => a - b);
    console.log(`${tier} (${resolved.length} torneios, ${total} entradas):`);
    console.log(`  OVR: avg=${avg(ovrs)?.toFixed(1)} med=${median(ovrs)} P10=${percentile(ovrs, 0.1)} P25=${percentile(ovrs, 0.25)} P50=${percentile(ovrs, 0.5)} P75=${percentile(ovrs, 0.75)} P90=${percentile(ovrs, 0.9)}`);
    console.log(`  rank: avg=${avg(ranks)?.toFixed(0)} med=${median(ranks)} melhor=${ranks[0]} pior=${ranks[ranks.length - 1]}`);
    console.log(`  presença: Top10=${top10} Top25=${top25} Top50=${top50} Top100=${top100} Top300=${top300} (de ${total})`);
    console.log(`  fora do platô ideal (STRETCH/EMERGENCY): ${total ? (outOfBand / total * 100).toFixed(1) : 'n/a'}%`);
    console.log(`  melhor dupla: ${bestPair?.names} (OVR ${bestPair?.ovr.toFixed(1)}) | pior: ${worstPair?.names} (OVR ${worstPair?.ovr.toFixed(1)})`);
  }

  console.log('\ntest-tier-field-strength-hierarchy-v5: dados coletados (observacional, Parte B — sem asserts, ver relatório da fase)');
} finally {
  await vite.close();
}
