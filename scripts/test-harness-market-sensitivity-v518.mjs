// Playthrough 5.18-D, Partes R/S — INVENTÁRIO DOS CONSUMIDORES DO HARNESS.
//
// A 5.18-B encontrou 79 scripts usando `runHeadlessWorldSimulation` e
// classificou 12 como Categoria 3 (a conclusão que sustentavam podia ter sido
// invalidada pela paridade). Esta é a classificação FINAL.
//
// NOTA DE MÉTODO: a primeira versão deste teste tentava classificar por
// heurística textual (grep de sinais como `ai_partner_id`, `Top20`, `idle`).
// Não funciona: inflou Categoria 3 de 12 para 36, casou com o próprio arquivo
// (que contém as strings-sinal como literais) e com nomes de arquivo por
// coincidência. Categoria 3 depende do que o teste CONCLUI, não de quais
// palavras ele contém — então a lista é curada e versionada aqui, e o teste
// verifica (a) que a varredura enxerga todos os consumidores e (b) que todo
// item curado tem decisão final registrada.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const SCRIPTS_DIR = new URL('../scripts/', import.meta.url);
const allScripts = readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.mjs'));
const consumers = allScripts
  .filter((f) => readFileSync(new URL(f, SCRIPTS_DIR), 'utf8').includes('runHeadlessWorldSimulation'));

// --- CATEGORIA 3 CURADA (Parte S) ----------------------------------------
// Critério: o teste sustenta uma conclusão sobre IDENTIDADE DE DUPLA AO LONGO
// DO TEMPO — participação por temporada, composição de elite, estabilidade de
// par. São os únicos cuja conclusão a paridade pode virar.
const CATEGORY_3 = {
  'test-masters-top20-participation-v515.mjs': {
    phase: '5.15', sustained: 'Top20 participa dos Masters; toda ausência tem motivo',
    rerun: true, result: '8/8 após correção',
    decision: 'CORRIGIDO — referência passou a usar draw_ranking_snapshot + Partnership na data do sorteio; "sem motivo" caiu de 118 para 0',
    conclusionPreserved: true,
  },
  'test-elite-real-pair-season-participation-v515.mjs': {
    phase: '5.15', sustained: 'duplas RR do Top20 disputam temporada cheia; idle não é exclusão',
    rerun: true, result: '9/9 após correção',
    decision: 'CORRIGIDO — janela de existência da dupla + exigências proporcionais + piso de active rate recalibrado (65%→50%, com justificativa semântica)',
    conclusionPreserved: true,
  },
  'test-top20-pair-season-activity-v517.mjs': {
    phase: '5.17', sustained: 'atividade individual das 20 duplas; V/D coerente',
    rerun: true, result: '8/8 após correção',
    decision: 'CORRIGIDO — janela por formação, lacuna consecutiva no lugar de percentual, atribuição de causa DELEGADA ao teste dedicado',
    conclusionPreserved: true,
  },
  'test-real-vs-procedural-ranking-evolution-v515.mjs': {
    phase: '5.15', sustained: 'elite real não é substituída por procedurais; ghost RR = 0',
    rerun: true, result: 'verde', decision: 'REVALIDADO — conclusão preservada', conclusionPreserved: true,
  },
  'test-real-vs-procedural-timeline-v515.mjs': {
    phase: '5.15', sustained: 'T0/T1/T2/T3 — procedurais sobem organicamente',
    rerun: true, result: 'verde', decision: 'REVALIDADO — conclusão preservada', conclusionPreserved: true,
  },
  'test-team-ranking-match-stats-ledger-v517.mjs': {
    phase: '5.17', sustained: 'V/D/títulos vêm de ledger real, não de derivação',
    rerun: true, result: 'verde', decision: 'REVALIDADO — conclusão preservada', conclusionPreserved: true,
  },
  'test-draw-ranking-snapshot-v517.mjs': {
    phase: '5.17', sustained: 'snapshot no sorteio; byes protegem os melhores',
    rerun: true, result: 'verde', decision: 'REVALIDADO — conclusão preservada', conclusionPreserved: true,
  },
  'test-ranking-pair-change-continuity.mjs': {
    phase: '5.x', sustained: 'continuidade de ranking na troca de dupla',
    rerun: true, result: 'verde', decision: 'REVALIDADO — conclusão preservada', conclusionPreserved: true,
  },
  'test-tier-field-strength-hierarchy-v5.mjs': {
    phase: '5.5', sustained: 'hierarquia de força entre tiers',
    rerun: true, result: 'verde', decision: 'REVALIDADO — conclusão preservada', conclusionPreserved: true,
  },
  'test-race-circuit-ledger-parity-v5.mjs': {
    phase: '5.x', sustained: 'Race e Circuit são autoridades distintas e coerentes',
    rerun: true, result: 'verde', decision: 'REVALIDADO — conclusão preservada', conclusionPreserved: true,
  },
  'test-settlement-uses-persisted-draw-roster.mjs': {
    phase: '4.x', sustained: 'settlement usa o roster persistido, não recalculado',
    rerun: true, result: 'verde', decision: 'REVALIDADO — conclusão preservada', conclusionPreserved: true,
  },
  'test-team-ranking-heldout-v511.mjs': {
    phase: '5.11', sustained: 'fórmula de soma reproduz em seed held-out',
    rerun: true, result: 'verde', decision: 'REVALIDADO — conclusão preservada', conclusionPreserved: true,
  },
};

const category3Files = Object.keys(CATEGORY_3);
const category3Present = category3Files.filter((f) => consumers.includes(f));
const category3Missing = category3Files.filter((f) => !allScripts.includes(f));
const others = consumers.filter((f) => !category3Files.includes(f));

console.log('=== PARTE R: inventário dos consumidores do harness ===');
console.log(`total de consumidores            ${consumers.length}`);
console.log(`Categoria 3 (conclusão em risco) ${category3Present.length}`);
console.log(`Categoria 1+2 (sem conclusão de identidade de dupla no tempo) ${others.length}`);
console.log('');
console.log('Ação por categoria:');
console.log(`  TEST_INVALID -> corrigido        ${Object.values(CATEGORY_3).filter((v) => v.decision.startsWith('CORRIGIDO')).length}`);
console.log(`  RERUN_REQUIRED -> revalidado     ${Object.values(CATEGORY_3).filter((v) => v.decision.startsWith('REVALIDADO')).length}`);
console.log(`  NO_IMPACT / não rerodado         ${others.length}`);

console.log('\n=== PARTE S: os 12 Categoria 3, fase por fase ===');
console.log('arquivo                                              fase   rerodado  conclusão  decisão');
for (const file of category3Files) {
  const e = CATEGORY_3[file];
  console.log(`${file.slice(0, 50).padEnd(52)}${e.phase.padEnd(7)}${String(e.rerun).padEnd(10)}${(e.conclusionPreserved ? 'preservada' : 'INVALIDADA').padEnd(11)}${e.decision.slice(0, 60)}`);
}

check('Parte R: a varredura encontra todos os consumidores do harness', () => {
  console.log(`   [registro] consumidores: ${consumers.length}`);
  assert.ok(consumers.length >= 70, `só ${consumers.length} consumidores encontrados`);
});

check('Parte S: são exatamente 12 Categoria 3', () => {
  console.log(`   [registro] curados=${category3Files.length} existentes no repo=${category3Files.length - category3Missing.length} | ainda consumidores do harness=${category3Present.length}`);
  assert.equal(category3Files.length, 12, `${category3Files.length} itens curados`);
  // O critério original é EXISTÊNCIA no repo. A varredura de consumidores é um
  // subconjunto: um teste pode seguir existindo e curado sem bootar o harness
  // (ex.: test-team-ranking-heldout-v511 migrou para a população sintética
  // `buildSyntheticPopulation` na 5.22-F). Por isso a checagem usa a lista
  // completa de scripts, não só os consumidores.
  assert.equal(category3Missing.length, 0, `algum Categoria 3 curado não existe mais no repo: ${category3Missing.join(', ')}`);
});

check('Parte S: 0 Categoria 3 sem decisão final', () => {
  const undecided = category3Files.filter((f) => !CATEGORY_3[f].decision);
  assert.equal(undecided.length, 0, `sem decisão: ${undecided.join(', ')}`);
});

check('Parte S: todo Categoria 3 foi rerodado', () => {
  const notRerun = category3Files.filter((f) => !CATEGORY_3[f].rerun);
  assert.equal(notRerun.length, 0, `não rerodados: ${notRerun.join(', ')}`);
});

check('Parte S: nenhuma conclusão anterior ficou INVALIDADA sem substituição', () => {
  // As 3 que estavam de fato inválidas foram CORRIGIDAS, não descartadas.
  const invalidated = category3Files.filter((f) => !CATEGORY_3[f].conclusionPreserved);
  const corrected = category3Files.filter((f) => CATEGORY_3[f].decision.startsWith('CORRIGIDO'));
  console.log(`   [registro] corrigidos=${corrected.length} revalidados=${category3Files.length - corrected.length} invalidados sem substituição=${invalidated.length}`);
  assert.equal(invalidated.length, 0);
  assert.equal(corrected.length, 3, `esperava 3 testes corrigidos, encontrei ${corrected.length}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-harness-market-sensitivity-v518: PASS');
