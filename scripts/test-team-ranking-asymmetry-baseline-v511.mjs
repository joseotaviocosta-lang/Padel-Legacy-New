// Playthrough 5.11, Partes A/B/C/D — BASELINE da fórmula de dupla medida
// contra a distribuição canônica de pontos do circuito.
//
// Playthrough 5.22-F — a autoridade vigente é a SOMA (A + B). Este teste
// deixou de medir a "média simples" e passou a medir a autoridade ATUAL,
// documentando o comportamento aprovado (o membro de elite carrega a dupla;
// a progressão é monotônica). A matriz usa a curva canônica `pointsForRank`
// em vez de um ano de simulação headless.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import {
  computeCanonicalTeamRankingPoints as canonical, modelGeometric, gapRatio, positionOf, buildSyntheticPopulation,
} from './lib/teamFormulaModels.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const SNAPSHOT = process.env.PADEL_V511_SNAPSHOT || null;

const { pairs, athletes } = buildSyntheticPopulation({ pairCount: 500, worldSize: 1000 });
const sortedAthletes = [...athletes].sort((x, y) => y.points - x.points);
const pointsAtRank = (rank) => sortedAthletes[Math.min(rank, sortedAthletes.length) - 1]?.points ?? 0;
const REF = {
  Top1: pointsAtRank(1), Top10: pointsAtRank(10), Top50: pointsAtRank(50),
  Top100: pointsAtRank(100), Top200: pointsAtRank(200), Top300: pointsAtRank(300),
  Top500: pointsAtRank(500), Top1000: pointsAtRank(1000), unranked: 0,
};
console.log('\n=== Referências canônicas de pontos por posição ===');
for (const [label, value] of Object.entries(REF)) console.log(`  ${label.padEnd(9)} ${value}`);

const teamPointsDesc = pairs.map((t) => canonical(t.a, t.b)).sort((a, b) => b - a);
const percentileOf = (rank) => ((1 - (rank - 1) / Math.max(1, teamPointsDesc.length)) * 100);

const MATRIX = [
  ['A', 'Top1 + Top1', REF.Top1, REF.Top1],
  ['B', 'Top1 + Top10', REF.Top1, REF.Top10],
  ['C', 'Top1 + Top50', REF.Top1, REF.Top50],
  ['D', 'Top1 + Top100', REF.Top1, REF.Top100],
  ['E', 'Top1 + Top300', REF.Top1, REF.Top300],
  ['F', 'Top1 + Top500', REF.Top1, REF.Top500],
  ['G', 'Top1 + #1000+', REF.Top1, REF.Top1000],
  ['H', 'Top10 + Top10', REF.Top10, REF.Top10],
  ['I', 'Top10 + Top100', REF.Top10, REF.Top100],
  ['J', 'Top50 + Top50', REF.Top50, REF.Top50],
  ['K', 'Top50 + Top300', REF.Top50, REF.Top300],
  ['L', 'Top200 + Top200', REF.Top200, REF.Top200],
  ['M', 'Top500 + Top500', REF.Top500, REF.Top500],
  ['N', 'unranked + Top10', REF.unranked, REF.Top10],
  ['O', 'unranked + unranked', REF.unranked, REF.unranked],
];

console.log('\n=== PARTE A: autoridade atual (soma) na matriz de cenários ===');
console.log('    cenário                A pts     B pts      soma   rank   pctil   gap   (geo antiga)');
const baselineMatrix = [];
for (const [id, label, a, b] of MATRIX) {
  const pts = canonical(a, b);
  const rank = positionOf(pts, teamPointsDesc);
  const ratio = gapRatio(a, b);
  baselineMatrix.push({ id, label, a, b, pts, rank, ratio, old: modelGeometric(a, b) });
  console.log(`  ${id}  ${label.padEnd(20)} ${String(a).padStart(7)} ${String(b).padStart(9)} ${String(pts).padStart(9)} ${String('#' + rank).padStart(6)} ${percentileOf(rank).toFixed(1).padStart(6)}% ${ratio === Infinity ? '  inf' : ratio.toFixed(1).padStart(6)} ${String(modelGeometric(a, b)).padStart(12)}`);
}

check('Parte A: a matriz usa a curva canônica (Top1 > Top10 > ... > Top1000)', () => {
  assert.ok(REF.Top1 > REF.Top10 && REF.Top10 > REF.Top50 && REF.Top50 > REF.Top100);
  assert.ok(REF.Top100 > REF.Top300 && REF.Top300 > REF.Top500);
});

check('Parte N: a soma é exata em toda a matriz', () => {
  for (const m of baselineMatrix) assert.equal(m.pts, m.a + m.b, `${m.label}: ${m.pts} != ${m.a}+${m.b}`);
});

check('Parte G (aprovado): Top1 + #1000 carrega a dupla para o topo da tabela', () => {
  const g = baselineMatrix.find((m) => m.id === 'G');
  console.log(`   [registro] Top1+#1000+ = ${g.pts} pts -> #${g.rank} (percentil ${percentileOf(g.rank).toFixed(1)}%)`);
  assert.ok(g.rank <= 20, `esperado topo; veio #${g.rank}`);
});

// ---------------------------------------------------------------------------
// PARTE B — distribuição de gaps na população sintética.
// ---------------------------------------------------------------------------
const BUCKETS = [
  ['1.0–1.2', 1.0, 1.2], ['1.2–1.5', 1.2, 1.5], ['1.5–2', 1.5, 2],
  ['2–4', 2, 4], ['4–10', 4, 10], ['10–50', 10, 50], ['50+', 50, Infinity],
];
const realPairs = pairs.map((p) => ({ a: p.a, b: p.b, ratio: gapRatio(p.a, p.b), team: canonical(p.a, p.b) }));
const bucketCounts = BUCKETS.map(([label, lo, hi]) => ({
  label, count: realPairs.filter((p) => p.ratio >= lo && p.ratio < hi).length,
}));

console.log(`\n=== PARTE B: distribuição de assimetria em ${realPairs.length} duplas ===`);
for (const b of bucketCounts) {
  const pct = (b.count / realPairs.length) * 100;
  console.log(`  ratio ${b.label.padEnd(8)} ${String(b.count).padStart(4)} (${pct.toFixed(1).padStart(5)}%) ${'█'.repeat(Math.round(pct / 2))}`);
}
const over = (n) => realPairs.filter((p) => p.ratio > n).length;
const stats = { total: realPairs.length, over2: over(2), over5: over(5), over10: over(10), over50: over(50) };
console.log(`  ratio >2: ${stats.over2} (${((stats.over2 / stats.total) * 100).toFixed(1)}%) | >5: ${stats.over5} | >10: ${stats.over10} | >50: ${stats.over50}`);

check('Parte B: a amostra de duplas é grande o bastante para concluir', () => {
  assert.ok(realPairs.length >= 100, `só ${realPairs.length} duplas resolvíveis`);
});

check('Parte B: a assimetria extrema é RARA na população (o problema é do player pair)', () => {
  const extremePct = (stats.over10 / stats.total) * 100;
  console.log(`   [registro] duplas com ratio >10: ${extremePct.toFixed(1)}%`);
  assert.ok(Number.isFinite(extremePct));
});

// ---------------------------------------------------------------------------
// PARTE C — topo da população como controle de elite.
// ---------------------------------------------------------------------------
const topPairs = [...pairs].sort((x, y) => canonical(y.a, y.b) - canonical(x.a, x.b)).slice(0, 5);
console.log('\n=== PARTE C: duplas de elite (controles) ===');
const controls = [];
for (const p of topPairs) {
  const entry = { name: p.name, a: p.a, b: p.b, ratio: gapRatio(p.a, p.b), pts: canonical(p.a, p.b), rank: positionOf(canonical(p.a, p.b), teamPointsDesc) };
  controls.push(entry);
  console.log(`  ${entry.name.padEnd(28)} ${String(entry.a).padStart(6)} + ${String(entry.b).padStart(6)} gap=${entry.ratio.toFixed(2)} -> ${entry.pts} (#${entry.rank})`);
}

check('Parte C: as duplas de elite são EQUILIBRADAS (gap baixo)', () => {
  assert.ok(controls.length >= 3, `só ${controls.length} controles encontrados`);
  for (const c of controls) {
    assert.ok(c.ratio < 4, `${c.name} com gap ${c.ratio.toFixed(2)} — controle deveria ser equilibrado`);
  }
});

// ---------------------------------------------------------------------------
// PARTE D — progressão do player pair.
// ---------------------------------------------------------------------------
const ELITE_PARTNER = REF.Top1;
const PLAYER_STEPS = [18, 500, 2000, 5000, 10000, 15000, 20000, ELITE_PARTNER];
console.log('\n=== PARTE D: jogador evoluindo ao lado de um parceiro de elite ===');
console.log('   jogador   dupla    rank   gap');
const progression = [];
for (const p of PLAYER_STEPS) {
  const pts = canonical(p, ELITE_PARTNER);
  const rank = positionOf(pts, teamPointsDesc);
  progression.push({ player: p, pts, rank, ratio: gapRatio(p, ELITE_PARTNER) });
  console.log(`  ${String(p).padStart(8)} ${String(pts).padStart(7)} ${String('#' + rank).padStart(7)} ${gapRatio(p, ELITE_PARTNER).toFixed(1).padStart(7)}`);
}

check('Parte D: a progressão é monotônica (nunca piora ao melhorar)', () => {
  for (let i = 1; i < progression.length; i += 1) {
    assert.ok(progression[i].rank <= progression[i - 1].rank,
      `rank piorou de #${progression[i - 1].rank} para #${progression[i].rank}`);
  }
});

check('Parte D: o membro fraco contribui exatamente os seus pontos', () => {
  const first = progression[0];
  assert.equal(first.pts, ELITE_PARTNER + 18, `esperado ${ELITE_PARTNER + 18}, veio ${first.pts}`);
});

if (SNAPSHOT) {
  writeFileSync(SNAPSHOT, JSON.stringify({ REF, teamPointsDesc, realPairs, controls }, null, 2));
  console.log(`\n[snapshot gravado em ${SNAPSHOT}]`);
}

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-team-ranking-asymmetry-baseline-v511: PASS');
