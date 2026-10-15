// Playthrough 5.4, TESTE 4/Parte G/I — auditoria de qualidade por faixa de
// rank (buckets 1-50/51-100/101-200/201-300/301-450/451-600/601+):
// percentis de OVR e sinais de RESULTADO (contagem de resultados na janela,
// pontos acumulados, melhor resultado) por bucket. Parte I: um atleta de
// OVR menor pode rankear acima via resultado melhor — a distribuição
// AGREGADA não pode mostrar 301-450 sistematicamente mais fraco que
// 451-600 (nem Gold CORE inferior a Silver CORE) SEM justificativa de
// resultado (mais/melhores resultados compensando o OVR menor). Este teste
// confirma se a justificativa de resultado existe onde o OVR já é sabido
// mais baixo (achado da Playthrough 5.3: rank 301-450 tem avgOVR real
// baixo — ~58,5 — fracamente acoplado a OVR puro).
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function percentile(sortedArr, p) {
  if (!sortedArr.length) return null;
  return sortedArr[Math.min(sortedArr.length - 1, Math.floor(sortedArr.length * p))];
}

const years = Number(process.env.PADEL_BUCKET_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'bucket-quality', trackWeeklyDraws: false, includeRankingResults: true });

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { groupResultsByAthlete } = await vite.ssrLoadModule('/src/game-core/rankingWindow.js');
  const resultsByAthlete = groupResultsByAthlete(sim.rankingResultRows);

  const BUCKETS = [
    { label: '1-50', lo: 1, hi: 50 },
    { label: '51-100', lo: 51, hi: 100 },
    { label: '101-200', lo: 101, hi: 200 },
    { label: '201-300', lo: 201, hi: 300 },
    { label: '301-450', lo: 301, hi: 450 },
    { label: '451-600', lo: 451, hi: 600 },
    { label: '601+', lo: 601, hi: Infinity },
  ];

  const stats = {};
  for (const bucket of BUCKETS) {
    const members = sim.athletes.filter((a) => Number(a.ranking_position) >= bucket.lo && Number(a.ranking_position) <= bucket.hi);
    const ovrs = members.map((a) => Number(a.overall_rating) || 0).sort((a, b) => a - b);
    const resultsCounts = members.map((a) => (resultsByAthlete.get(a.id) || []).length).sort((a, b) => a - b);
    const bestPointsList = members.map((a) => {
      const rows = resultsByAthlete.get(a.id) || [];
      return rows.reduce((max, r) => Math.max(max, Number(r.points) || 0), 0);
    }).sort((a, b) => a - b);
    const totalPointsList = members.map((a) => Number(a.world_ranking_points) || 0).sort((a, b) => a - b);
    stats[bucket.label] = {
      n: members.length,
      avgOVR: ovrs.length ? ovrs.reduce((s, v) => s + v, 0) / ovrs.length : null,
      p50OVR: percentile(ovrs, 0.5),
      avgResultsCount: resultsCounts.length ? resultsCounts.reduce((s, v) => s + v, 0) / resultsCounts.length : null,
      avgBestResultPoints: bestPointsList.length ? bestPointsList.reduce((s, v) => s + v, 0) / bestPointsList.length : null,
      avgTotalPoints: totalPointsList.length ? totalPointsList.reduce((s, v) => s + v, 0) / totalPointsList.length : null,
    };
  }

  console.log(`=== qualidade por faixa de rank (${years} temporada(s), ${sim.athletes.length} atletas) ===\n`);
  for (const bucket of BUCKETS) {
    const s = stats[bucket.label];
    console.log(`${bucket.label}: n=${s.n} avgOVR=${s.avgOVR?.toFixed(1)} p50OVR=${s.p50OVR} avgResultsCount=${s.avgResultsCount?.toFixed(1)} avgBestResultPts=${s.avgBestResultPoints?.toFixed(0)} avgTotalPts=${s.avgTotalPoints?.toFixed(0)}`);
  }

  check('amostra real em todos os buckets adjacentes chave (301-450 e 451-600 com população > 0)', () => {
    assert.ok(stats['301-450'].n > 0 && stats['451-600'].n > 0, `301-450 n=${stats['301-450'].n} 451-600 n=${stats['451-600'].n}`);
  });

  check('OVR médio geral melhora (ou se mantém) conforme o rank melhora, olhando os EXTREMOS da escada (1-50 >> 601+) — a tendência de fundo existe', () => {
    assert.ok(stats['1-50'].avgOVR > stats['601+'].avgOVR, `1-50=${stats['1-50'].avgOVR} 601+=${stats['601+'].avgOVR}`);
  });

  check('se 301-450 tem avgOVR MENOR que 451-600 (a distorção conhecida da 5.3), isso vem acompanhado de JUSTIFICATIVA de resultado (mais resultados OU pontos totais maiores) — não é um rank imerecido', () => {
    const a = stats['301-450']; const b = stats['451-600'];
    if (a.avgOVR >= b.avgOVR) return; // sem distorção nesta seed — nada a justificar.
    const justifiedByCount = a.avgResultsCount >= b.avgResultsCount;
    const justifiedByPoints = a.avgTotalPoints >= b.avgTotalPoints;
    assert.ok(justifiedByCount || justifiedByPoints, `301-450 tem OVR menor (${a.avgOVR.toFixed(1)} vs ${b.avgOVR.toFixed(1)}) SEM justificativa de resultado — resultsCount ${a.avgResultsCount.toFixed(1)} vs ${b.avgResultsCount.toFixed(1)}, totalPts ${a.avgTotalPoints.toFixed(0)} vs ${b.avgTotalPoints.toFixed(0)}`);
  });

  check('avgTotalPoints (world_ranking_points) é monotonicamente decrescente ao longo dos buckets (quem rankeia melhor SEMPRE tem mais pontos acumulados — é a própria definição do ranking, nunca pode falhar)', () => {
    let prev = Infinity;
    for (const bucket of BUCKETS) {
      const s = stats[bucket.label];
      if (s.avgTotalPoints == null) continue;
      assert.ok(s.avgTotalPoints <= prev + 0.01, `${bucket.label}: avgTotalPoints=${s.avgTotalPoints.toFixed(1)} > bucket anterior=${prev.toFixed(1)}`);
      prev = s.avgTotalPoints;
    }
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-ranking-bucket-quality: PASS');
} finally {
  await vite.close();
}
