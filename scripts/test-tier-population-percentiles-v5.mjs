// Playthrough 5.5, Parte A — população REAL por faixa de rank, ao fim de
// uma temporada simulada (não só a curva de nascimento): quantidade,
// OVR médio/mediana/P10/P25/P50/P75/P90, potencial médio, idade média,
// duplas canônicas, atletas sem dupla, resultados oficiais, pontos médios,
// torneios médios/temporada — por faixa: 1-10, 11-25, 26-50, 51-100,
// 101-150, 151-200, 201-300, 301-450, 451-600, 601-800, 801-1000+.
import { createServer } from 'vite';
import { runHeadlessWorldSimulation, canonicalPairAthleteIds } from './lib/tierRebalanceHarness.mjs';

const years = Number(process.env.PADEL_POP_YEARS || 1);
const label = process.env.PADEL_POP_LABEL || 'pop-percentiles';
const sim = await runHeadlessWorldSimulation({ years, label, trackWeeklyDraws: false, includeRankingResults: true });

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { groupResultsByAthlete } = await vite.ssrLoadModule('/src/game-core/rankingWindow.js');
  const { buildCanonicalPairs } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const resultsByAthlete = groupResultsByAthlete(sim.rankingResultRows);
  const pairs = buildCanonicalPairs(sim.partnerships, sim.athletes);
  const pairedAthleteIds = new Set(pairs.flatMap((p) => p.athletes.map((a) => a.id)));

  const BANDS = [
    { label: '1-10', lo: 1, hi: 10 }, { label: '11-25', lo: 11, hi: 25 }, { label: '26-50', lo: 26, hi: 50 },
    { label: '51-100', lo: 51, hi: 100 }, { label: '101-150', lo: 101, hi: 150 }, { label: '151-200', lo: 151, hi: 200 },
    { label: '201-300', lo: 201, hi: 300 }, { label: '301-450', lo: 301, hi: 450 }, { label: '451-600', lo: 451, hi: 600 },
    { label: '601-800', lo: 601, hi: 800 }, { label: '801-1000+', lo: 801, hi: 999999 },
  ];

  function percentile(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null; }
  function median(sorted) { if (!sorted.length) return null; const n = sorted.length; return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2; }
  function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null; }

  console.log(`=== Parte A: população por faixa de rank (${years} temporada(s), label=${label}, ${sim.athletes.length} atletas) ===\n`);
  const report = [];
  for (const band of BANDS) {
    const members = sim.athletes.filter((a) => Number(a.ranking_position) >= band.lo && Number(a.ranking_position) <= band.hi);
    // Perfis sem OVR (ex.: slots legados/incompletos que ainda conservam
    // ranking_position) não são atletas de OVR 0. Mantê-los como zero
    // derrubava artificialmente P10/média de buckets pequenos e invalidava
    // justamente a auditoria populacional que este harness pretende fazer.
    const ovrs = members.map((a) => Number(a.overall_rating)).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    const pots = members.map((a) => Number(a.potential) || 0).filter((v) => v > 0);
    const ages = members.map((a) => Number(a.age) || 0).filter((v) => v > 0);
    const resultsCounts = members.map((a) => (resultsByAthlete.get(a.id) || []).length);
    const points = members.map((a) => Number(a.world_ranking_points) || 0);
    const paired = members.filter((a) => pairedAthleteIds.has(a.id)).length;
    const distinctPairIds = new Set();
    for (const a of members) { if (pairedAthleteIds.has(a.id)) { const p = pairs.find((pp) => pp.athletes.some((m) => m.id === a.id)); if (p) distinctPairIds.add(p.id); } }
    const row = {
      band: band.label, n: members.length, ovrSampleN: ovrs.length, missingOVR: members.length - ovrs.length,
      avgOVR: avg(ovrs), medianOVR: median(ovrs),
      p10OVR: percentile(ovrs, 0.10), p25OVR: percentile(ovrs, 0.25), p50OVR: percentile(ovrs, 0.50), p75OVR: percentile(ovrs, 0.75), p90OVR: percentile(ovrs, 0.90),
      avgPotential: avg(pots), avgAge: avg(ages),
      canonicalPairs: distinctPairIds.size, unpaired: members.length - paired,
      avgResultsCount: avg(resultsCounts), avgPoints: avg(points),
      avgTournamentsPerYear: avg(resultsCounts.map((c) => c / years)),
    };
    report.push(row);
    console.log(`${band.label.padEnd(10)} n=${row.n.toString().padEnd(5)} ovrN=${String(row.ovrSampleN).padEnd(5)} semOVR=${String(row.missingOVR).padEnd(3)} avgOVR=${row.avgOVR?.toFixed(1).padEnd(6)} medOVR=${String(row.medianOVR).padEnd(5)} P10=${row.p10OVR} P25=${row.p25OVR} P50=${row.p50OVR} P75=${row.p75OVR} P90=${row.p90OVR} pot=${row.avgPotential?.toFixed(1)} idade=${row.avgAge?.toFixed(1)} duplas=${row.canonicalPairs} semDupla=${row.unpaired} resultados/ano=${row.avgTournamentsPerYear?.toFixed(1)} pts=${row.avgPoints?.toFixed(0)}`);
  }

  console.log(`\n=== gap Silver(151-300) vs Gold(301-450) ===`);
  const silverBand = { ...report.find((r) => r.band === '151-200') };
  const band201_300 = report.find((r) => r.band === '201-300');
  const goldBand = report.find((r) => r.band === '301-450');
  const silverAvgOVR = ((silverBand.avgOVR * silverBand.ovrSampleN) + (band201_300.avgOVR * band201_300.ovrSampleN)) / (silverBand.ovrSampleN + band201_300.ovrSampleN);
  console.log(`Silver-like (151-300) avgOVR≈${silverAvgOVR.toFixed(1)} | Gold-like (301-450) avgOVR=${goldBand.avgOVR.toFixed(1)} | gap=${(silverAvgOVR - goldBand.avgOVR).toFixed(1)}`);

  console.log('\ntest-tier-population-percentiles-v5: dados coletados (observacional, Parte A — sem asserts, ver relatório da fase)');
} finally {
  await vite.close();
}
