import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, canonicalPairAthleteIds } from './lib/tierRebalanceHarness.mjs';

const calibration = Number(process.env.PADEL_V56_FINALS_CALIB || 3);
const heldout = Number(process.env.PADEL_V56_FINALS_HELDOUT || 3);
const percentile = (values, p) => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * p))] : null;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function finalsMetrics(sim, tier) {
  const partnershipById = new Map(sim.partnerships.map((row) => [row.id, row]));
  const athleteById = new Map(sim.athletes.map((row) => [row.id, row]));
  const ovrs = []; const ranks = [];
  const tournaments = sim.tournaments.filter((row) => row.tier === tier && row.champion && Array.isArray(row.draw_pair_ids));
  for (const tournament of tournaments) {
    for (const pairId of tournament.draw_pair_ids) {
      const members = canonicalPairAthleteIds(pairId, partnershipById).map((id) => athleteById.get(id)).filter(Boolean);
      if (members.length !== 2) continue;
      const pairOVR = mean(members.map((member) => Number(member.overall_rating)).filter(Number.isFinite));
      const pairRank = mean(members.map((member) => Number(member.ranking_position)).filter((rank) => Number.isFinite(rank) && rank > 0));
      if (Number.isFinite(pairOVR)) ovrs.push(pairOVR);
      if (Number.isFinite(pairRank)) ranks.push(pairRank);
    }
  }
  ovrs.sort((a, b) => a - b); ranks.sort((a, b) => a - b);
  return {
    entries: ovrs.length, avgOVR: mean(ovrs), medianOVR: percentile(ovrs, 0.5),
    p25OVR: percentile(ovrs, 0.25), p50OVR: percentile(ovrs, 0.5), p75OVR: percentile(ovrs, 0.75), p90OVR: percentile(ovrs, 0.9),
    avgRank: mean(ranks), medianRank: percentile(ranks, 0.5),
    top10Share: ranks.length ? ranks.filter((rank) => rank <= 10).length / ranks.length * 100 : null,
    top20Share: ranks.length ? ranks.filter((rank) => rank <= 20).length / ranks.length * 100 : null,
  };
}

const results = [];
for (const [group, count] of [['calibration', calibration], ['heldout', heldout]]) {
  for (let i = 0; i < count; i += 1) {
    const sim = await runHeadlessWorldSimulation({ years: 1, label: `v56-finals-${group}-${i}`, trackWeeklyDraws: false });
    results.push({ group, seed: i, circuit: finalsMetrics(sim, 'Circuit Finals'), legacy: finalsMetrics(sim, 'Legacy Finals') });
  }
}
console.log(JSON.stringify(results, null, 2));
assert.equal(results.length, calibration + heldout);
assert.equal(results.every((row) => row.circuit.entries > 0 && row.legacy.entries > 0), true, 'all seasons must contain both Finals');
const aggregate = (tier, key) => mean(results.map((row) => row[tier][key]).filter(Number.isFinite));
const inversions = results.filter((row) => row.circuit.avgOVR > row.legacy.avgOVR).length;
console.log(JSON.stringify({
  seasons: results.length,
  circuit: Object.fromEntries(['avgOVR','medianOVR','p25OVR','p50OVR','p75OVR','p90OVR','avgRank','medianRank','top10Share','top20Share'].map((key) => [key, aggregate('circuit', key)])),
  legacy: Object.fromEntries(['avgOVR','medianOVR','p25OVR','p50OVR','p75OVR','p90OVR','avgRank','medianRank','top10Share','top20Share'].map((key) => [key, aggregate('legacy', key)])),
  circuitAboveLegacySeasons: inversions,
  conclusion: inversions >= 5 ? 'structural-candidate' : 'sample-noise',
}, null, 2));
console.log('test-finals-strength-multiseason-v56: PASS');
