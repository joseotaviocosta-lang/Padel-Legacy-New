// Playthrough 5.18-F, Partes O/P/T — ABERTURA DE MUNDO OU DEFEITO PERMANENTE?
//
// RETIFICAÇÃO (5.18-G): a premissa original deste teste foi retirada. A
// 5.18-E observou "6 lacunas extremas de 30-34 semanas, todas começando em
// 2026-01-08" e chamou isso de fenômeno de abertura de mundo. As lacunas não
// existiam: eram artefato de traduzir ids de sorteio de 2026 pelas linhas de
// Partnership do estado final de 2028 (ver a regra da Parte A em
// scripts/lib/temporalIntegrity.mjs). Com medição temporal correta, a maior
// lacuna de janela ativa é ~19 semanas.
//
// O que sobrevive, e é o que este teste mede hoje: a abertura de mundo TEM
// atividade mais baixa que a temporada seguinte (~32-37% contra ~40%), o que
// é um transiente real e moderado — nunca um circuito parado. A comparação
// entre a MESMA janela de duas temporadas continua sendo a forma certa de
// medir isso:
//
//   janela A: semanas 1-35 de 2026 (a abertura do mundo)
//   janela B: semanas 1-35 de 2027 (o mesmo trecho, mundo já rodado)
//
// Se a atividade da janela B for normal e a da janela A for nula, o fenômeno
// é transiente. Parte P: transiente não basta como resposta — a etapa do
// pipeline que causa a lacuna precisa ser esportivamente plausível nos dois
// casos, e é isso que o histograma de etapas mostra.
import assert from 'node:assert/strict';
import { runPipelineInstrumentedRun, findGaps, stageHistogram } from './lib/selectionPipelineHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const run = await runPipelineInstrumentedRun({ label: 'opening-season', years: 2, cohortSize: 20 });

const byKey = new Map();
for (const snap of run.weekly) {
  for (const row of snap.rows) {
    if (!byKey.has(row.key)) byKey.set(row.key, []);
    byKey.get(row.key).push(row);
  }
}
const nameOf = (k) => run.cohort.find((c) => c.key === k)?.name || k;

const inYear = (rows, year) => rows.filter((r) => r.date.startsWith(String(year)));
const windowOf = (rows, year) => inYear(rows, year).slice(0, 35);

console.log(`\n=== ${run.weekly.length} semanas | ${byKey.size} duplas observadas ===\n`);

// --- Parte O: mesma janela, duas temporadas -------------------------------
const rowsA = [];
const rowsB = [];
for (const [, rows] of byKey) {
  rowsA.push(...windowOf(rows, 2026));
  rowsB.push(...windowOf(rows, 2027));
}
const summarize = (rows, label) => {
  const alive = rows.filter((r) => r.exists && r.mutual);
  const played = alive.filter((r) => r.played).length;
  const hist = stageHistogram(alive.filter((r) => !r.played));
  console.log(`${label}: semanas com dupla viva=${alive.length} | jogaram=${played} (${alive.length ? Math.round((played / alive.length) * 100) : 0}%)`);
  console.log(`   etapas ociosas: ${Object.entries(hist).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}=${n}`).join(' ') || '(nenhuma)'}`);
  return { alive: alive.length, played, hist };
};
const A = summarize(rowsA, 'Janela A (2026, semanas 1-35)');
const B = summarize(rowsB, 'Janela B (2027, semanas 1-35)');
console.log('');

check('Parte O: as duas janelas comparáveis foram observadas', () => {
  note(`janela A: ${A.alive} semanas-dupla | janela B: ${B.alive} semanas-dupla`);
  assert.ok(A.alive > 0 && B.alive > 0, 'uma das janelas ficou vazia — comparação impossível');
});

check('Parte O/P: a taxa de atividade da abertura não é nula', () => {
  const rateA = A.alive ? A.played / A.alive : 0;
  const rateB = B.alive ? B.played / B.alive : 0;
  note(`taxa de atividade: A=${Math.round(rateA * 100)}% B=${Math.round(rateB * 100)}%`);
  // O gate é o SIGNIFICADO: "abertura de mundo" não pode significar um
  // circuito parado. A referência é a própria janela B do MESMO mundo, não
  // um número escolhido: a abertura pode ser mais lenta, nunca inerte.
  assert.ok(rateA > 0, 'nenhuma dupla do cohort competiu na janela de abertura');
  assert.ok(rateA >= rateB * 0.5, `abertura (${Math.round(rateA * 100)}%) menos da metade da temporada 2 (${Math.round(rateB * 100)}%)`);
});

// --- Parte T: gate da temporada de abertura -------------------------------
const gapsOpening = [];
for (const [key, rows] of byKey) {
  const w = windowOf(rows, 2026);
  for (const g of findGaps(w)) {
    if (g.length >= 20) gapsOpening.push({ key, gap: g });
  }
}
gapsOpening.sort((a, b) => b.gap.length - a.gap.length);

console.log(`=== Parte T — lacunas >=20 semanas na temporada de abertura: ${gapsOpening.length} ===\n`);
for (const { key, gap } of gapsOpening) {
  const hist = stageHistogram(gap.weeks);
  const dominant = Object.entries(hist).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
  const ranks = gap.weeks.map((w) => w.team_rank).filter(Boolean);
  const top10 = gap.weeks.filter((w) => w.team_rank && w.team_rank <= 10).length;
  console.log(`  ${nameOf(key)}: ${gap.length} sem (${gap.start} -> ${gap.end}) | TeamRank ${ranks.length ? `${Math.min(...ranks)}-${Math.max(...ranks)}` : '—'} | Top10 em ${top10} | etapa dominante ${dominant[0]} (${dominant[1]})`);
}
console.log('');

check('Parte T: nenhuma dupla Top10 ativa/saudável com lacuna >=20 semanas na abertura', () => {
  const top10 = gapsOpening.filter(({ gap }) => gap.weeks.some((w) => w.team_rank && w.team_rank <= 10));
  const offenders = top10.map(({ key, gap }) => {
    const hist = stageHistogram(gap.weeks);
    const dom = Object.entries(hist).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    return `${nameOf(key)} (${gap.length}sem, ${dom[0]})`;
  });
  note(`lacunas >=20 semanas na abertura: ${gapsOpening.length} | destas, com passagem pelo Top10: ${top10.length}`);
  assert.equal(offenders.length, 0, offenders.join(' | '));
});

check('Parte P: toda lacuna >=20 semanas da abertura tem etapa esportivamente plausível', () => {
  // NOT_IN_CANDIDATE_POOL e INELIGIBLE não são causas plausíveis para uma
  // dupla ativa e saudável do Top20: a primeira é defeito de filtro, a
  // segunda é o ciclo de ranking fechado. CHOOSE_NONE e CUT_BY_CAPACITY são
  // decisão e concorrência — plausíveis.
  const implausible = [];
  for (const { key, gap } of gapsOpening) {
    const hist = stageHistogram(gap.weeks);
    const bad = (hist.NOT_IN_CANDIDATE_POOL || 0) + (hist.INELIGIBLE || 0);
    if (bad > gap.length * 0.5) implausible.push(`${nameOf(key)}: ${bad}/${gap.length} semanas em pool/elegibilidade`);
  }
  note(`lacunas com causa implausível dominante: ${implausible.length}`);
  assert.equal(implausible.length, 0, implausible.join(' | '));
});

// --- Parte U: métricas de long run ----------------------------------------
console.log('=== Parte U — long run (2 temporadas instrumentadas) ===');
const allGaps = [];
for (const [key, rows] of byKey) for (const g of findGaps(rows)) allGaps.push({ key, gap: g });
const count = (n) => allGaps.filter((x) => x.gap.length >= n).length;
note(`gaps >=12: ${count(12)} | >=20: ${count(20)} | >=26: ${count(26)}`);
const maxTop10 = Math.max(0, ...allGaps.filter(({ gap }) => gap.weeks.some((w) => w.team_rank && w.team_rank <= 10)).map((x) => x.gap.length));
const maxTop20 = Math.max(0, ...allGaps.filter(({ gap }) => gap.weeks.some((w) => w.team_rank && w.team_rank <= 20)).map((x) => x.gap.length));
note(`maior lacuna com passagem pelo Top10: ${maxTop10} semanas | Top20: ${maxTop20} semanas`);

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
