// Fase 5.32-A — helpers da escada competitiva (rankingDisplay.js), por
// COMPORTAMENTO: entrada → o que a tela pode exibir. Nenhum deles calcula
// pontos ou posição; só decide o que é exibível a partir da autoridade.
// Uso: node scripts/test-ranking-ladder-v532.mjs
import assert from 'node:assert/strict';
import {
  describeRankingPeriod, resolveStandingRank, pointsGapToAbove, sliceLadderNeighbors, hasMeaningfulPodium,
  ladderMovement, teamLedgerRecord, filterLadderRows, normalizeSearchText, RANKING_WINDOW_WEEKS, buildClimbContext,
} from '../src/lib/rankingDisplay.js';
import { RANKING_WINDOW_DAYS, RANKING_BEST_N } from '../src/game-core/rankingWindow.js';

let passed = 0;
const ok = (label, fn) => { fn(); passed += 1; console.log(`PASS — ${label}`); };

// ── Período (Mundial × Race) ──
ok('Race: o ano vem da carreira, não de uma constante', () => {
  for (const year of [2026, 2027, 2031, 2040]) {
    const text = describeRankingPeriod('race', year);
    assert.match(text, new RegExp(`Race ${year}`));
    for (const other of [2026, 2027, 2031, 2040].filter((y) => y !== year)) assert.doesNotMatch(text, new RegExp(String(other)));
  }
});
ok('Race sem data de carreira: texto sem ano (nunca um ano inventado)', () => {
  for (const missing of [null, undefined, 0, 'x']) assert.doesNotMatch(describeRankingPeriod('race', missing), /\d{4}/);
});
ok('Race explica o reset anual; Mundial explica a janela da autoridade', () => {
  assert.match(describeRankingPeriod('race', 2031), /virada do ano/);
  const world = describeRankingPeriod('world', 2031);
  assert.equal(RANKING_WINDOW_WEEKS, Math.round(RANKING_WINDOW_DAYS / 7));
  assert.match(world, new RegExp(`${RANKING_BEST_N} melhores resultados das últimas ${RANKING_WINDOW_WEEKS} semanas`));
  assert.doesNotMatch(world, /2031/, 'o Mundial é rolling: não pertence a um ano');
});

// ── Posição exibível ──
ok('sem ranking não tem posição: flag, posição 0 ou 0 pontos → null', () => {
  assert.equal(resolveStandingRank({ rank: 1001, unranked: true }), null, 'o fim da fila (#1001) não é posição');
  assert.equal(resolveStandingRank({ rank: 0 }), null);
  assert.equal(resolveStandingRank({ rank: 57, points: 0 }), null, 'Race com 0 pontos não tem #57');
  assert.equal(resolveStandingRank({ rank: undefined }), null);
});
ok('com ranking real a posição é a da autoridade (sem arredondar para faixa)', () => {
  assert.equal(resolveStandingRank({ rank: 303, points: 82 }), 303);
  assert.equal(resolveStandingRank({ rank: 1001, points: 1 }), 1001, 'ranqueado em #1001 é #1001, não "#1000+"');
  assert.equal(resolveStandingRank({ rank: 1 }), 1);
});

// ── Distância para cima ──
ok('distância para quem está acima: diferença dos pontos entregues; empate = 0; sem vizinho = null', () => {
  assert.equal(pointsGapToAbove(82, 85), 3);
  assert.equal(pointsGapToAbove(85, 85), 0);
  assert.equal(pointsGapToAbove(90, 85), 0, 'nunca negativa');
  assert.equal(pointsGapToAbove(82, null), null);
  assert.equal(pointsGapToAbove(82, undefined), null);
});

// ── Vizinhos ──
ok('vizinhos: até 2 acima e 2 abaixo, na ordem da autoridade, marcando o próprio', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}` }));
  const mid = sliceLadderNeighbors(rows, 5, 2);
  assert.deepEqual(mid.map((n) => n.item.id), ['a3', 'a4', 'a5', 'a6', 'a7']);
  assert.deepEqual(mid.map((n) => n.isSelf), [false, false, true, false, false]);
  assert.deepEqual(sliceLadderNeighbors(rows, 0, 2).map((n) => n.item.id), ['a0', 'a1', 'a2'], 'no topo não inventa acima');
  assert.deepEqual(sliceLadderNeighbors(rows, 9, 2).map((n) => n.item.id), ['a7', 'a8', 'a9'], 'no fim não inventa abaixo');
  assert.deepEqual(sliceLadderNeighbors(rows, -1, 2), [], 'fora da escada → nada');
  assert.deepEqual(sliceLadderNeighbors(rows, 99, 2), []);
});

// ── Pódio ──
ok('pódio só com pontos reais nos 3 primeiros (Race zerada não mostra "0 pts")', () => {
  const pts = (row) => row.p;
  assert.equal(hasMeaningfulPodium([{ p: 500 }, { p: 500 }, { p: 300 }], pts), true);
  assert.equal(hasMeaningfulPodium([{ p: 0 }, { p: 0 }, { p: 0 }], pts), false);
  assert.equal(hasMeaningfulPodium([{ p: 500 }, { p: 300 }, { p: 0 }], pts), false);
  assert.equal(hasMeaningfulPodium([{ p: 500 }, { p: 300 }], pts), false, 'menos de 3 → sem pódio');
});

// ── Variação ──
ok('variação só com a posição anterior gravada pelo circuito (sem ela: null, não "estável")', () => {
  assert.equal(ladderMovement(10, 7), 3);
  assert.equal(ladderMovement(7, 10), -3);
  assert.equal(ladderMovement(7, 7), 0);
  assert.equal(ladderMovement(null, 7), null);
  assert.equal(ladderMovement(undefined, 7), null);
  assert.equal(ladderMovement(5, null), null, 'linha sem posição não tem variação');
});

// ── V/D/títulos da dupla ──
ok('V/D/títulos de dupla vêm do ledger (LOCAL-7H); títulos = ledger_titles, não titles[]', () => {
  const ledger = { stats_source: 'ledger', wins: 495, losses: 30, ledger_titles: 12, titles: [] };
  assert.deepEqual(teamLedgerRecord(ledger), { wins: 495, losses: 30, titles: 12 });
  assert.equal(teamLedgerRecord({ wins: 3, losses: 1, titles: ['x'] }), null, 'sem ledger → histórico indisponível');
  assert.equal(teamLedgerRecord(null), null);
});

// ── Busca e filtros ──
ok('busca ignora acento/caixa e casa com qualquer membro da dupla; a posição da linha não muda', () => {
  const rows = [
    { name: 'Agustín Tapia', country: 'Argentina', ladder_position: 1 },
    { name: 'Arturo Coello', country: 'Espanha', ladder_position: 2 },
    { name: 'Atleta 7C', country: 'Brasil', ladder_position: 303 },
  ];
  assert.deepEqual(filterLadderRows(rows, { query: 'agustin' }).map((r) => r.ladder_position), [1]);
  assert.deepEqual(filterLadderRows(rows, { query: 'TAPIA' }).map((r) => r.ladder_position), [1]);
  assert.deepEqual(filterLadderRows(rows, { country: 'brasil' }).map((r) => r.ladder_position), [303]);
  assert.deepEqual(filterLadderRows(rows, { maxPosition: 100 }).map((r) => r.ladder_position), [1, 2]);
  assert.equal(filterLadderRows(rows, {}).length, 3);
  const teams = [{ player1_name: 'Arturo Coello', player2_name: 'Agustín Tapia', ladder_position: 1 }];
  const namesOf = (t) => [t.player1_name, t.player2_name];
  assert.equal(filterLadderRows(teams, { query: 'tapia', namesOf }).length, 1);
  assert.equal(filterLadderRows(teams, { query: 'coello', namesOf }).length, 1);
  assert.equal(normalizeSearchText('  Galán '), 'galan');
});
ok('linha sem posição (sem pontos) não entra no filtro Top N', () => {
  assert.equal(filterLadderRows([{ name: 'Sem pontos', ladder_position: null }], { maxPosition: 100 }).length, 0);
});

// ── 5.32-A.1 — contexto para subir ──
const ladder = (pts, positions) => pts.map((p, i) => ({ name: `L${i}`, points: p, ladder_position: positions ? positions[i] : i + 1 }));
ok('subir: alvo é a linha mais próxima com MAIS pontos (pula empatados acima)', () => {
  const rows = ladder([40, 30, 30, 30, 20], [1, 2, 3, 4, 5]); // individual: posições distintas
  const c = buildClimbContext(rows, 3);
  assert.deepEqual([c.target.rank, c.target.gap], [1, 10]);
  assert.deepEqual([c.tieAbove.rank, c.tieAbove.sharesPosition], [3, false], 'mesmos pontos, posição distinta');
  assert.deepEqual([c.below.rank, c.below.gap], [5, 10]);
  assert.equal(c.isLeader, false);
});
ok('duplas: empate em pontos divide a posição → sharesPosition', () => {
  const rows = ladder([40, 30, 30, 20], [1, 2, 2, 4]);
  const c = buildClimbContext(rows, 2);
  assert.equal(c.tieAbove.sharesPosition, true);
  assert.equal(c.position, 2);
  assert.equal(c.target.rank, 1);
});
ok('líder: sem alvo; líder empatado (posição 1 dividida) não é "lidera sozinho" com alvo', () => {
  assert.equal(buildClimbContext(ladder([40, 30]), 0).isLeader, true);
  assert.equal(buildClimbContext(ladder([40, 30]), 0).target, null);
  const tied = buildClimbContext(ladder([40, 40], [1, 1]), 1);
  assert.equal(tied.target, null);
  assert.equal(tied.tieAbove.sharesPosition, true);
});
ok('fim da escada: sem "abaixo"; fora da escada: null (nada é dito)', () => {
  assert.equal(buildClimbContext(ladder([40, 30, 20]), 2).below, null);
  assert.equal(buildClimbContext(ladder([40, 30]), -1), null);
  assert.equal(buildClimbContext([], 0), null);
});
ok('empate abaixo: vantagem 0 (a tela diz "com os mesmos pontos")', () => {
  assert.equal(buildClimbContext(ladder([40, 30, 30]), 1).below.gap, 0);
});
ok('pontos lidos pelo campo do período (pointsOf): Race não usa o Mundial', () => {
  const rows = [{ name: 'A', race_points: 50, ranking_points: 10, ladder_position: 1 }, { name: 'B', race_points: 20, ranking_points: 900, ladder_position: 2 }];
  const c = buildClimbContext(rows, 1, { pointsOf: (r) => r.race_points });
  assert.equal(c.target.gap, 30);
});

console.log(`\ntest-ranking-ladder-v532: ${passed} PASS`);
