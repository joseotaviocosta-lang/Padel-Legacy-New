// Playthrough 5.11, Parte P/D — o cenário-problema: 18 pontos + 25.000.
//
// Playthrough 5.22-F — a autoridade vigente é a SOMA. Pela regra aprovada, o
// parceiro de elite CARREGA a dupla (18 + 25.000 = 25.018): a "proibição de
// Top10" da 5.11 deixou de existir. O objetivo original — provar que a
// fórmula é determinística, monotônica, suave e não multiplica o membro
// fraco — é preservado, agora medido contra a soma.
//
// Usa a população determinística de `buildSyntheticPopulation` em vez de um
// ano de simulação headless.
import assert from 'node:assert/strict';
import {
  computeCanonicalTeamRankingPoints as canonical, positionOf, gapRatio, buildSyntheticPopulation,
} from './lib/teamFormulaModels.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const { pairs, athletes } = buildSyntheticPopulation({ pairCount: 500, worldSize: 1000 });
const teamPointsDesc = pairs.map((p) => canonical(p.a, p.b)).sort((a, b) => b - a);
const ELITE = athletes[0].points;
const total = teamPointsDesc.length;

console.log(`parceiro de elite (Top1 da curva): ${ELITE} pts | ${total} duplas na tabela\n`);

const STEPS = [0, 18, 500, 2000, 5000, 10000, 15000, 20000, ELITE];
console.log('=== Parte D: progressão do jogador ao lado do MESMO parceiro de elite ===');
console.log('  jogador     dupla     rank    percentil    gap');
const rows = [];
for (const p of STEPS) {
  const pts = canonical(p, ELITE);
  const rank = positionOf(pts, teamPointsDesc);
  const pct = (1 - (rank - 1) / total) * 100;
  rows.push({ player: p, pts, rank, pct, ratio: gapRatio(p, ELITE) });
  console.log(`  ${String(p).padStart(7)} ${String(pts).padStart(9)} ${String('#' + rank).padStart(8)} ${pct.toFixed(1).padStart(9)}% ${rows.at(-1).ratio.toFixed(1).padStart(8)}`);
}

check('Parte N: a dupla vale exatamente A + B (18 + elite = elite + 18)', () => {
  const first = rows.find((r) => r.player === 18);
  assert.equal(first.pts, ELITE + 18, `esperado ${ELITE + 18}, veio ${first.pts}`);
});

check('Parte P: o membro fraco contribui EXATAMENTE os seus pontos (sem multiplicação)', () => {
  const zero = canonical(0, ELITE);
  const weak = canonical(18, ELITE);
  assert.equal(weak - zero, 18, 'o membro fraco não entrou linearmente');
});

check('Parte G: o membro forte carrega a dupla ao topo da tabela (regra aprovada)', () => {
  const first = rows.find((r) => r.player === 18);
  console.log(`   [registro] 18 pts + elite -> ${first.pts} pts, #${first.rank} de ${total}`);
  // Com a soma, um único membro de elite (13.000) equivale a uma boa dupla
  // equilibrada; não supera uma dupla de DOIS elite. Top 10% é o critério.
  assert.ok(first.rank <= total * 0.1, `elite deveria carregar a dupla ao topo; veio #${first.rank}`);
});

check('Parte D: a progressão é MONOTÔNICA (melhorar nunca piora)', () => {
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i].rank <= rows[i - 1].rank, `piorou de #${rows[i - 1].rank} para #${rows[i].rank}`);
  }
});

check('Parte D: a progressão é SUAVE (sem salto de mais de 60% da tabela entre passos)', () => {
  for (let i = 1; i < rows.length; i += 1) {
    const jump = Math.abs(rows[i].rank - rows[i - 1].rank) / total;
    assert.ok(jump < 0.6, `salto de ${(jump * 100).toFixed(1)}% da tabela entre ${rows[i - 1].player} e ${rows[i].player} pts`);
  }
});

check('Parte Q: quando o jogador chega perto do parceiro, a dupla vira elite', () => {
  const moderate = rows.find((r) => r.player === 15000);
  console.log(`   [registro] 15.000 + elite -> ${moderate.pts} pts, #${moderate.rank}`);
  assert.ok(moderate.rank <= 3, `gap normal foi punido demais: #${moderate.rank}`);
});

check('Parte A: dupla perfeitamente equilibrada de elite vale 2x e fica em #1', () => {
  const equal = rows.at(-1);
  assert.equal(equal.pts, 2 * ELITE, 'equilibrada deveria valer A + B');
  assert.equal(equal.rank, 1, `ficou em #${equal.rank}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-team-ranking-extreme-gap-v511: PASS');
