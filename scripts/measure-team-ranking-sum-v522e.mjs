// Playthrough 5.22-E, Parte AM — comparação ANTES/DEPOIS da população de
// TeamRanking no MESMO mundo semeado: fórmula anterior (média geométrica,
// sqrt(a*b)) contra a nova (soma, a+b).
//
// Mede Top10/Top20/Top50, rank da dupla do jogador, mediana e máximo de
// pontos, e o deslocamento de posição. É um instrumento de diagnóstico
// (não altera nada) para decidir se a soma causa inflação extrema.
import { bootstrapLegacyWorld, installShims } from './lib/legacySaveFixture.mjs';

installShims('/ranking');

const geometric = (a, b) => Math.round(Math.sqrt((a > 0 ? a : 0) * (b > 0 ? b : 0)));
const sum = (a, b) => Math.round((a > 0 ? a : 0) + (b > 0 ? b : 0));

const { vite, localGame, profileId } = await bootstrapLegacyWorld('SumMeasureV522E');
try {
  const [teamRows, athletes] = await Promise.all([
    localGame.entities.TeamRanking.list('-ranking_points', 5000),
    localGame.entities.AthleteProfile.list('-world_ranking_points', 5000),
  ]);
  const byId = new Map((athletes || []).map((a) => [a.id, a]));

  const resolve = (id) => {
    if (!id) return null;
    if (id === profileId) return 900;
    const athlete = byId.get(id);
    if (!athlete) return null;
    return Math.max(0, Number(athlete.world_ranking_points ?? athlete.ranking_points) || 0);
  };

  const rows = [];
  for (const row of teamRows || []) {
    const a = resolve(row.player1_id);
    const b = resolve(row.player2_id);
    if (a === null || b === null || row.player1_id === row.player2_id) continue;
    rows.push({ key: row.team_key || `${row.player1_id}_${row.player2_id}`, a, b, geo: geometric(a, b), sum: sum(a, b) });
  }

  const rankBy = (list, valueOf) => {
    const sorted = [...list].sort((x, y) => valueOf(y) - valueOf(x));
    const map = new Map();
    sorted.forEach((row, i) => map.set(row.key, i + 1));
    return { sorted, map };
  };

  const geoRank = rankBy(rows, (r) => r.geo);
  const sumRank = rankBy(rows, (r) => r.sum);

  const top = (sorted, n, valueOf) => new Set(sorted.slice(0, n).map((r) => r.key));
  const jaccard = (a, b) => {
    const inter = [...a].filter((x) => b.has(x)).length;
    return inter / new Set([...a, ...b]).size;
  };

  const median = (values) => {
    const s = [...values].sort((x, y) => x - y);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  };

  const displacements = rows.map((r) => Math.abs(geoRank.map.get(r.key) - sumRank.map.get(r.key)));
  const playerRow = rows.find((r) => r.key.includes(profileId));

  const report = {
    population: rows.length,
    top10: { geometric: median(geoRank.sorted.slice(0, 10).map((r) => r.geo)), sum: median(sumRank.sorted.slice(0, 10).map((r) => r.sum)), jaccard: jaccard(top(geoRank.sorted, 10, (r) => r.geo), top(sumRank.sorted, 10, (r) => r.sum)) },
    top20: { jaccard: jaccard(top(geoRank.sorted, 20, (r) => r.geo), top(sumRank.sorted, 20, (r) => r.sum)) },
    top50: { jaccard: jaccard(top(geoRank.sorted, 50, (r) => r.geo), top(sumRank.sorted, 50, (r) => r.sum)) },
    points: {
      geometric: { median: median(rows.map((r) => r.geo)), max: Math.max(...rows.map((r) => r.geo)) },
      sum: { median: median(rows.map((r) => r.sum)), max: Math.max(...rows.map((r) => r.sum)) },
    },
    displacement: {
      mean: Math.round(displacements.reduce((s, v) => s + v, 0) / Math.max(1, displacements.length)),
      max: Math.max(...displacements),
      changed: displacements.filter((v) => v > 0).length,
    },
    playerPair: playerRow ? {
      members: [playerRow.a, playerRow.b],
      geometricPoints: playerRow.geo,
      sumPoints: playerRow.sum,
      geometricRank: geoRank.map.get(playerRow.key),
      sumRank: sumRank.map.get(playerRow.key),
    } : null,
    top10Ids: sumRank.sorted.slice(0, 10).map((r) => ({ key: r.key, a: r.a, b: r.b, sum: r.sum, geo: r.geo })),
  };

  console.log(JSON.stringify(report, null, 2));
} finally {
  await vite.close();
}
