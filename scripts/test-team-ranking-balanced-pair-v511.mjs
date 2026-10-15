// Playthrough 5.11, Partes C/Q/O — duplas EQUILIBRADAS não podem ser
// penalizadas pela mudança de fórmula, e as duplas de elite precisam manter
// posição.
//
// Playthrough 5.22-F — a autoridade vigente é a SOMA (A + B), não mais a
// média geométrica. O objetivo original é preservado: provar que a fórmula
// atual não destrói duplas equilibradas e não reordena o topo. A medição
// deixou de exigir um ano de simulação headless (~minutos por execução):
// usa a população determinística de `buildSyntheticPopulation` (curva
// canônica `pointsForRank`), que reproduz a distribuição de elite/cauda.
import assert from 'node:assert/strict';
import {
  computeCanonicalTeamRankingPoints as canonical, modelGeometric, positionOf, jaccard, buildSyntheticPopulation,
} from './lib/teamFormulaModels.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const { pairs } = buildSyntheticPopulation({ pairCount: 500, worldSize: 1000 });

const balanced = pairs.filter((p) => p.ratio < 1.5);
const pctBalanced = (balanced.length / pairs.length) * 100;
console.log(`duplas: ${pairs.length} | equilibradas (ratio < 1.5): ${balanced.length} (${pctBalanced.toFixed(1)}%)\n`);

check('Parte B: a maioria das duplas é equilibrada', () => {
  assert.ok(pctBalanced > 50, `só ${pctBalanced.toFixed(1)}% equilibradas`);
});

check('Parte Q: a fórmula vigente (soma) nunca penaliza uma dupla equilibrada', () => {
  // Contra a média geométrica (fórmula anterior), a soma é sempre >=: para
  // a == b, soma = 2a contra geo = a. Nenhuma dupla equilibrada perde.
  let worstLoss = 0;
  for (const p of balanced) {
    const after = canonical(p.a, p.b);
    const before = modelGeometric(p.a, p.b);
    if (before <= 0) continue;
    worstLoss = Math.max(worstLoss, 1 - after / before);
  }
  console.log(`   [registro] maior "perda" relativa vs geométrica: ${(worstLoss * 100).toFixed(2)}%`);
  assert.ok(worstLoss <= 0, `dupla equilibrada perdeu ${(worstLoss * 100).toFixed(2)}%`);
});

check('dupla perfeitamente equilibrada vale EXATAMENTE A + B (2a)', () => {
  const perfect = pairs.filter((x) => x.a === x.b);
  assert.ok(perfect.length > 0, 'sem duplas perfeitamente equilibradas na amostra');
  for (const p of perfect.slice(0, 50)) {
    assert.equal(canonical(p.a, p.b), p.a + p.b, `${p.name} divergiu`);
    assert.equal(canonical(p.a, p.b), 2 * p.a, `${p.name} não dobrou`);
  }
});

// ---- Parte O: estabilidade do Top20 entre a fórmula anterior e a atual ----
const boardOf = (fn) => pairs.map((p) => ({ key: p.key, pts: fn(p.a, p.b) })).sort((x, y) => y.pts - x.pts);
const before = boardOf(modelGeometric);
const after = boardOf(canonical);
const rankBefore = new Map(before.map((r, i) => [r.key, i + 1]));
const rankAfter = new Map(after.map((r, i) => [r.key, i + 1]));

const j10 = jaccard(before.slice(0, 10).map((r) => r.key), after.slice(0, 10).map((r) => r.key));
const j20 = jaccard(before.slice(0, 20).map((r) => r.key), after.slice(0, 20).map((r) => r.key));
let sum = 0; let max = 0;
for (const [key, r0] of rankBefore) {
  const d = Math.abs(rankAfter.get(key) - r0);
  sum += d; if (d > max) max = d;
}
const avgDisp = sum / rankBefore.size;

console.log(`\n=== Parte O: estabilidade geométrica -> soma ===`);
console.log(`  Jaccard Top10 ......... ${j10.toFixed(3)}`);
console.log(`  Jaccard Top20 ......... ${j20.toFixed(3)}`);
console.log(`  deslocamento médio .... ${avgDisp.toFixed(1)} posições`);
console.log(`  deslocamento máximo ... ${max} posições`);

check('Parte O: Top10 permanece praticamente o mesmo conjunto', () => {
  assert.ok(j10 >= 0.8, `Jaccard Top10 = ${j10.toFixed(3)}`);
});

check('Parte O: Top20 permanece praticamente o mesmo conjunto', () => {
  assert.ok(j20 >= 0.8, `Jaccard Top20 = ${j20.toFixed(3)}`);
});

check('Parte O: o deslocamento médio da tabela é pequeno', () => {
  assert.ok(avgDisp < 25, `deslocamento médio de ${avgDisp.toFixed(1)} posições`);
});

// ---- Parte C: controles de elite (topo da população sintética) ----
const top10Pairs = after.slice(0, 10).map((r) => pairs.find((p) => p.key === r.key));
const afterPoints = after.map((r) => r.pts);
console.log('\n=== Parte C: duplas de elite (controle) ===');
for (const p of top10Pairs.slice(0, 5)) {
  console.log(`  ${p.name.padEnd(28)} gap=${p.ratio.toFixed(2)} -> ${canonical(p.a, p.b)} pts (#${rankAfter.get(p.key)})`);
}

check('Parte C: nenhuma dupla de elite sofre regressão relevante', () => {
  assert.ok(top10Pairs.length >= 3, 'topo da população curto');
  for (const p of top10Pairs) {
    const rBefore = rankBefore.get(p.key);
    const rAfter = rankAfter.get(p.key);
    assert.ok(Math.abs(rAfter - rBefore) <= 3, `${p.name} moveu de #${rBefore} para #${rAfter}`);
  }
});

check('Parte C: as duplas de elite continuam no topo absoluto', () => {
  for (const p of top10Pairs) {
    assert.ok(rankAfter.get(p.key) <= 15, `${p.name} caiu para #${rankAfter.get(p.key)}`);
  }
  assert.ok(positionOf(afterPoints[0], afterPoints) === 1);
});

check('Parte C: o topo é equilibrado (elite de verdade)', () => {
  for (const p of top10Pairs.slice(0, 5)) {
    assert.ok(p.ratio < 2, `${p.name} com gap ${p.ratio.toFixed(2)}`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-team-ranking-balanced-pair-v511: PASS');
