// Playthrough 5.17, Partes L/M — SNAPSHOT DE RANKING NO SORTEIO + BYES.
//
// A 5.16 fechou provando seeding só em fixture controlado, porque auditar
// uma temporada inteira comparava ranking do FIM do ano com chave sorteada
// meses antes — metodologicamente inválido. A dívida ficou registrada.
//
// Agora o sorteio grava `draw_ranking_snapshot` (nome + rank canônico no
// instante do D-3). Com isso dá para provar, em simulação longa:
//   "esta dupla era #4 quando a chave foi sorteada e recebeu a proteção #4".
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const sim = await runHeadlessWorldSimulation({
  years: 1, label: 'v517-snapshot', trackWeeklyDraws: false, includeRankingResults: true,
});

const drawn = sim.tournaments.filter((t) => (
  Array.isArray(t.bracket_history) && t.bracket_history.length
  && Array.isArray(t.draw_ranking_snapshot) && t.draw_ranking_snapshot.length
));

console.log(`torneios com snapshot de sorteio: ${drawn.length} de ${sim.tournaments.length}\n`);

check('Parte M/27: o sorteio grava snapshot de ranking', () => {
  assert.ok(drawn.length > 0, 'nenhum torneio gravou draw_ranking_snapshot');
});

check('Parte M: o snapshot registra QUANDO a chave foi gerada', () => {
  const missing = drawn.filter((t) => !t.draw_generated_at);
  assert.equal(missing.length, 0, `${missing.length} chaves sem draw_generated_at`);
  const sample = drawn[0];
  console.log(`   [registro] ${sample.name}: gerada em ${sample.draw_generated_at} (${sample.field_origin_version})`);
});

check('Parte M: o snapshot é anterior ou igual ao início do torneio', () => {
  const late = drawn.filter((t) => t.draw_generated_at > String(t.start_date).slice(0, 10));
  assert.equal(late.length, 0, `${late.length} chaves com snapshot depois do início`);
});

check('Parte M: o snapshot cobre TODO o campo sorteado', () => {
  const mismatched = drawn.filter((t) => t.draw_ranking_snapshot.length !== t.draw_pair_ids.length);
  assert.equal(mismatched.length, 0, `${mismatched.length} torneios com snapshot incompleto`);
});

check('Parte M: o snapshot NÃO é uma segunda fonte de ranking (só histórico)', () => {
  // Um snapshot é um registro pontual: nada no mundo deve mudar por causa
  // dele. Verificação possível: ele nunca contém pontos/pontuação, só a
  // posição observada e a identidade.
  const leaky = drawn.filter((t) => t.draw_ranking_snapshot.some((row) => (
    row.ranking_points !== undefined || row.points !== undefined
  )));
  assert.equal(leaky.length, 0, 'o snapshot está carregando pontuação — virou fonte de ranking');
});

// --- PARTE L: byes auditados contra o ranking DO SORTEIO -------------------
const nonPow2 = drawn.filter((t) => {
  const n = t.draw_pair_ids.length;
  return n > 2 && (n & (n - 1)) !== 0;
});

console.log(`=== PARTE L: chaves não-potência-de-2 (${nonPow2.length}) ===`);
console.log('torneio                              campo  bracket  byes  pior bye  melhor sem bye');

const byeViolations = [];
for (const t of nonPow2.slice(0, 12)) {
  const rankByName = new Map(t.draw_ranking_snapshot.map((row) => [row.name, Number(row.rank) || 0]));
  const round0 = t.bracket_history?.[0]?.matches || [];
  const played = new Set();
  for (const m of round0) {
    if (m.team_a) played.add(m.team_a);
    if (m.team_b) played.add(m.team_b);
  }
  const ranked = [...rankByName.entries()].filter(([, r]) => r > 0);
  const byes = ranked.filter(([name]) => !played.has(name));
  const nonByes = ranked.filter(([name]) => played.has(name));
  if (!byes.length || !nonByes.length) continue;
  const worstBye = Math.max(...byes.map(([, r]) => r));
  const bestNonBye = Math.min(...nonByes.map(([, r]) => r));
  const size = t.draw_pair_ids.length;
  const bracketSize = 2 ** Math.ceil(Math.log2(size));
  console.log(`${t.name.slice(0, 36).padEnd(38)}${String(size).padStart(5)}${String(bracketSize).padStart(9)}${String(byes.length).padStart(6)}${String(worstBye).padStart(10)}${String(bestNonBye).padStart(16)}`);
  if (worstBye > bestNonBye) {
    byeViolations.push(`${t.name}: bye para #${worstBye} enquanto #${bestNonBye} jogou a preliminar`);
  }
}

check('Parte L: existem chaves não-potência-de-2 para auditar', () => {
  assert.ok(nonPow2.length > 0, 'nenhuma chave com bye na temporada');
});

check('Parte L/26: os byes vão para os melhores seeds DO INSTANTE DO SORTEIO', () => {
  console.log(`   [registro] violações: ${byeViolations.length}`);
  assert.equal(byeViolations.length, 0, byeViolations.slice(0, 3).join(' | '));
});

check('Parte L: a quantidade de byes é exatamente bracketSize - campo', () => {
  const wrong = [];
  for (const t of nonPow2.slice(0, 12)) {
    const size = t.draw_pair_ids.length;
    const bracketSize = 2 ** Math.ceil(Math.log2(size));
    const round0 = t.bracket_history?.[0]?.matches || [];
    const played = new Set();
    for (const m of round0) {
      if (m.team_a) played.add(m.team_a);
      if (m.team_b) played.add(m.team_b);
    }
    const byes = t.draw_ranking_snapshot.filter((row) => !played.has(row.name)).length;
    if (byes !== bracketSize - size) wrong.push(`${t.name}: ${byes} byes, esperado ${bracketSize - size}`);
  }
  console.log(`   [registro] chaves com contagem de bye divergente: ${wrong.length}`);
  assert.equal(wrong.length, 0, wrong.slice(0, 3).join(' | '));
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-draw-ranking-snapshot-v517: PASS');
