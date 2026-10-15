// Playthrough 5.18-F, Partes M/N/S — ORDEM DE ADMISSÃO POR CAPACIDADE.
//
// O erro que este teste evita: declarar "inversão" toda vez que uma dupla com
// rank melhor fica de fora. O design atual NÃO admite por ranking puro — é um
// blend deliberado (WorldTourLifecycle.js:applyEntryPriority):
//
//   janela de prioridade  -> entrada garantida, fora de qualquer disputa
//   ~75% das vagas        -> por pairEntryRank (melhor rank primeiro)
//   ~7,5% das vagas       -> por MENOS torneios jogados na vida
//   ~17,5% das vagas      -> qualifying entre os PIORES ranks, por pairScore
//
// As duas últimas fatias produzem, por construção, admissões de rank pior que
// alguém excluído. Isso é a política, não um defeito — foi o que fechou a
// espiral auto-reforçada da Fase 7. Uma inversão GRAVE é o excesso: mais
// admissões fora da ordem de rank do que o orçamento não-rank comporta.
//
// Os dois lados (quem concorreu, quem entrou) vêm do MESMO instante — nunca
// de ranking de fim de temporada (Parte M).
import assert from 'node:assert/strict';
import { runPipelineInstrumentedRun } from './lib/selectionPipelineHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

// Espelha as constantes da autoridade (WorldTourLifecycle.js:139/163/283).
const ENTRY_RESERVED_SHARE = 0.25;

const run = await runPipelineInstrumentedRun({ label: 'capacity-order', years: 1, cohortSize: 5 });

const contested = [];
for (const snap of run.weekly) {
  for (const t of (snap.capacity || [])) {
    // Só semanas em que TODOS os torneios já têm chave: antes disso,
    // "não foi sorteada em lugar nenhum" é indistinguível de "a chave do
    // outro torneio ainda não saiu" (os sorteios saem em D-3).
    if (!t.all_drawn) continue;
    if (!t.admitted.length) continue;       // torneio ainda não sorteado neste instante
    if (!t.passedOver.length) continue;     // ninguém elegível e disposto ficou de fora
    contested.push({ ...t, date: snap.date });
  }
}

console.log(`\n=== Torneios com disputa real por vaga: ${contested.length} ===\n`);

const analyses = contested.map((t) => {
  const rankOf = (c) => (c.entry_rank || 99999);
  const bestPassedOver = Math.min(...t.passedOver.map(rankOf));
  const windowed = t.admitted.filter((c) => c.window > 0).length;
  // Admissões fora da ordem de rank: entraram apesar de existir alguém
  // elegível, disposto a jogar, e sem vaga em lugar nenhum na semana, com
  // rank melhor. A janela de prioridade é entrada garantida por regra, então
  // não conta como fora de ordem.
  const outOfRankOrder = t.admitted.filter((c) => c.window <= 0 && rankOf(c) > bestPassedOver).length;
  const budget = Math.round(t.draw * ENTRY_RESERVED_SHARE) + windowed;
  return {
    ...t, admittedCount: t.admitted.length, excludedCount: t.passedOver.length,
    bestExcluded: bestPassedOver, windowed, outOfRankOrder, budget,
    excess: Math.max(0, outOfRankOrder - budget),
  };
});

const byTier = new Map();
for (const a of analyses) {
  if (!byTier.has(a.tier)) byTier.set(a.tier, { n: 0, oor: 0, excess: 0, graves: 0 });
  const b = byTier.get(a.tier);
  b.n += 1; b.oor += a.outOfRankOrder; b.excess += a.excess;
  if (a.excess > 0) b.graves += 1;
}
console.log(`${'tier'.padEnd(10)}${'eventos'.padEnd(9)}${'fora-de-ordem'.padEnd(15)}${'excesso'.padEnd(10)}${'graves'}`);
for (const [tier, b] of [...byTier].sort((x, y) => y[1].n - x[1].n)) {
  console.log(`${tier.padEnd(10)}${String(b.n).padEnd(9)}${String(b.oor).padEnd(15)}${String(b.excess).padEnd(10)}${b.graves}`);
}
console.log('');

const graves = analyses.filter((a) => a.excess > 0).sort((a, b) => b.excess - a.excess);
for (const g of graves.slice(0, 10)) {
  console.log(`  [GRAVE] ${g.date} ${g.tier} draw=${g.draw}: admitidos=${g.admittedCount} excluídos=${g.excludedCount} fora-de-ordem=${g.outOfRankOrder} orçamento=${g.budget} excesso=${g.excess} (melhor excluído #${g.bestExcluded})`);
}
if (graves.length) console.log('');

check('Parte M: houve disputa real por vaga para medir', () => {
  note(`torneios com admitidas e preteridas no mesmo instante: ${contested.length}`);
  assert.ok(contested.length >= 10, `só ${contested.length} eventos com disputa — amostra insuficiente`);
});

check('Parte N: a autoridade de admissão é um blend documentado, não rank puro', () => {
  const totalOor = analyses.reduce((s, a) => s + a.outOfRankOrder, 0);
  const totalAdm = analyses.reduce((s, a) => s + a.admittedCount, 0);
  note(`admissões fora da ordem de rank: ${totalOor}/${totalAdm} (${totalAdm ? Math.round((totalOor / totalAdm) * 100) : 0}%)`);
  note(`orçamento não-rank por construção: ${Math.round(ENTRY_RESERVED_SHARE * 100)}% da chave + janelas de prioridade`);
  assert.ok(totalAdm > 0, 'nenhuma admissão observada');
});

// A DERIVA é o que limita a confiança neste teste, e por isso é medida em
// vez de suposta. `draw_pair_ids` é gravado no sorteio (D-3); a fila é
// recomputada neste snapshot. Uma dupla sorteada que não aparece na fila
// recomputada é diferença de instante, não decisão de admissão. Quanto maior
// a deriva, menos o resultado abaixo fala sobre a ordem de admissão.
const totalDrift = analyses.reduce((s, a) => s + a.drift, 0);
const totalAdmitted = analyses.reduce((s, a) => s + a.admittedCount, 0);
const driftRate = totalAdmitted ? totalDrift / totalAdmitted : 0;
console.log(`=== Deriva entre o sorteio (D-3) e a fila recomputada: ${totalDrift}/${totalAdmitted} (${Math.round(driftRate * 100)}%) ===\n`);

check('Parte M: a deriva entre instantes é pequena o bastante para concluir', () => {
  note(`admitidas ausentes da fila recomputada: ${totalDrift}/${totalAdmitted} (${Math.round(driftRate * 100)}%)`);
  // Acima de 1/3 de deriva, "quem disputou a vaga" não é reconstruível de
  // fora e qualquer contagem de inversão é artefato — o resultado abaixo
  // passa a não significar nada sobre admissão.
  assert.ok(driftRate <= 0.34, `deriva de ${Math.round(driftRate * 100)}%: a fila reconstruída não representa a do sorteio`);
});

check('Parte M/S: nenhuma inversão grave de capacidade', () => {
  const total = analyses.reduce((s, a) => s + a.excess, 0);
  note(`eventos com excesso sobre o orçamento: ${graves.length}/${analyses.length} | excesso total=${total}`);
  assert.equal(graves.length, 0, `${graves.length} eventos admitiram fora da ordem além do orçamento (excesso total ${total})`);
});

check('Parte Y: nenhum torneio admitiu mais duplas que o tamanho da chave', () => {
  const over = analyses.filter((a) => a.admittedCount > a.draw);
  for (const o of over.slice(0, 5)) note(`  ${o.tier} ${o.date}: ${o.admittedCount} > ${o.draw}`);
  assert.equal(over.length, 0, `${over.length} torneios com campo acima da chave`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
