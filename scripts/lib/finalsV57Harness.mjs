import { runHeadlessWorldSimulation, canonicalPairAthleteIds } from './tierRebalanceHarness.mjs';

export const FINALS_TIERS = ['Circuit Finals', 'Legacy Finals'];
export const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
export const percentile = (values, p) => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * p))] : null;

export function metricsForFinals(sim, tier) {
  const athleteById = new Map(sim.athletes.map((athlete) => [athlete.id, athlete]));
  const partnerships = new Map(sim.partnerships.map((partnership) => [partnership.id, partnership]));
  const entries = [];
  for (const tournament of sim.tournaments.filter((row) => row.tier === tier && row.champion && Array.isArray(row.draw_pair_ids))) {
    for (const pairId of tournament.draw_pair_ids) {
      const members = canonicalPairAthleteIds(pairId, partnerships).map((id) => athleteById.get(id)).filter(Boolean);
      if (members.length !== 2) continue;
      entries.push({
        pairId,
        names: members.map((member) => member.name),
        ovr: mean(members.map((member) => Number(member.overall_rating ?? member.over)).filter(Number.isFinite)),
        rank: mean(members.map((member) => Number(member.ranking_position)).filter((value) => value > 0)),
        race: mean(members.map((member) => Number(member.race_points)).filter(Number.isFinite)),
        rolling: mean(members.map((member) => Number(member.world_ranking_points)).filter(Number.isFinite)),
      });
    }
  }
  const numeric = (field) => entries.map((entry) => entry[field]).filter(Number.isFinite).sort((a, b) => a - b);
  const ovrs = numeric('ovr'); const ranks = numeric('rank');
  return {
    entries, count: entries.length, avgOVR: mean(ovrs), medianOVR: percentile(ovrs, 0.5), p25OVR: percentile(ovrs, 0.25), p75OVR: percentile(ovrs, 0.75), p90OVR: percentile(ovrs, 0.9),
    avgRank: mean(ranks), medianRank: percentile(ranks, 0.5), top10Share: ranks.length ? ranks.filter((value) => value <= 10).length / ranks.length * 100 : null,
  };
}

export async function runFinalsSeason(label, includeRankingResults = false) {
  const sim = await runHeadlessWorldSimulation({ years: 1, label, trackWeeklyDraws: false, includeRankingResults });
  return { sim, circuit: metricsForFinals(sim, 'Circuit Finals'), legacy: metricsForFinals(sim, 'Legacy Finals') };
}
