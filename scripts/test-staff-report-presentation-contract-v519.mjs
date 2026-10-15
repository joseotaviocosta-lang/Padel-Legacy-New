// Playthrough 5.19, Partes A/B/C — CONTRATO DE APRESENTAÇÃO DA COMISSÃO.
//
// O playtest mostrou na tela:
//   "Plano proposto: [object Object]"
//   '{"priority":"medium","title":"Monte uma sinergia","body":"..."}'
//
// Duas causas somadas:
//   PRODUTOR  staffLifecycle.js gravava `proposed_plan: meeting.plan.plan`, o
//             MAPA DE DIAS, quando o rótulo legível é `meeting.plan.label`.
//   CONSUMIDOR StaffReportHighlight.jsx renderizava `String(plan)` e caía num
//             `JSON.stringify(item)` porque procurava `label`/`message` num
//             shape que é `{ priority, title, body }`.
//
// Gate: nenhum caminho pode produzir "[object Object]" nem JSON literal.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

installShims('/staff-presentation');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const fmt = await vite.ssrLoadModule('/src/lib/staffReportPresentation.js');
const { formatStaffPlan, formatStaffRecommendation, formatStaffRecommendations, formatRecommendationPriority } = fmt;
const strategic = await vite.ssrLoadModule('/src/lib/strategicCareerAI.js');

const OBJECT_LEAK = '[object Object]';
const looksLikeJson = (text) => typeof text === 'string' && /^\s*[[{]/.test(text) && /["}\]]/.test(text);
const assertClean = (text, label) => {
  if (text == null) return;
  assert.ok(!String(text).includes(OBJECT_LEAK), `${label}: vazou ${OBJECT_LEAK}`);
  assert.ok(!looksLikeJson(text), `${label}: vazou JSON literal -> ${String(text).slice(0, 60)}`);
};

// --------------------------------------------------------------- Parte A
console.log('\n=== Parte A: shape real do produtor ===\n');
const realPlan = strategic.buildStrategicWeeklyPlan(
  { play_style: 'defensivo', energy: 90, fatigue: 10, career_date: '2026-03-02' },
  {},
);
console.log(`  buildStrategicWeeklyPlan -> chaves: ${Object.keys(realPlan).join(', ')}`);
console.log(`  label: "${realPlan.label}"`);
console.log(`  plan (mapa de dias): ${Object.keys(realPlan.plan || {}).join(', ')}`);
console.log('');

check('Parte A: o plano canônico tem label textual e mapa de dias separados', () => {
  note(`label="${realPlan.label}" | dias=${Object.keys(realPlan.plan || {}).length}`);
  assert.equal(typeof realPlan.label, 'string');
  assert.ok(realPlan.label.length > 0);
  assert.equal(typeof realPlan.plan, 'object');
});

check('Parte A: o mapa de dias NUNCA e texto renderizavel', () => {
  // É exatamente este valor que era gravado em `proposed_plan` antes da
  // correção — a prova de que String() produzia o vazamento.
  note(`String(mapa de dias) = "${String(realPlan.plan)}"`);
  assert.equal(String(realPlan.plan), OBJECT_LEAK);
});

// --------------------------------------------------------------- Parte B
console.log('=== Parte B: formatter canônico ===\n');

check('Parte B: plano como objeto canônico -> titulo legivel', () => {
  const out = formatStaffPlan(realPlan);
  note(`-> titulo="${out.title}" detalhe="${out.detail}"`);
  assertClean(out.title, 'titulo do plano');
  assertClean(out.detail, 'detalhe do plano');
  assert.equal(out.title, realPlan.label);
});

check('Parte B: recomendacao {priority,title,body} -> texto humano', () => {
  const item = { priority: 'medium', title: 'Monte uma sinergia', body: 'Sua comissão já tem tamanho para combinar especialidades.' };
  const out = formatStaffRecommendation(item);
  note(`-> "${out.title}" — "${out.body}" (${out.priority})`);
  assertClean(out.title, 'titulo da recomendacao');
  assertClean(out.body, 'corpo da recomendacao');
  assert.equal(out.title, 'Monte uma sinergia');
  assert.equal(out.priority, 'medium');
});

check('Parte B: lista ordena por prioridade', () => {
  const list = formatStaffRecommendations([
    { priority: 'low', title: 'C' },
    { priority: 'high', title: 'A' },
    { priority: 'medium', title: 'B' },
  ]);
  note(`ordem: ${list.map((x) => x.title).join(' > ')}`);
  assert.deepEqual(list.map((x) => x.title), ['A', 'B', 'C']);
});

check('Parte B: rotulo de prioridade e humano', () => {
  const labels = ['high', 'medium', 'low', 'alta', null].map((p) => formatRecommendationPriority(p));
  note(`rotulos: ${labels.map((l) => l ?? 'null').join(', ')}`);
  assert.equal(formatRecommendationPriority('high'), 'Prioritário');
  assert.equal(formatRecommendationPriority(null), null);
});

// --------------------------------------------------------------- Parte C
console.log('\n=== Parte C: saves legados e campos degenerados ===\n');
const CASES = [
  ['plano string (legado/rotulo)', 'Controle e consistência', 'plan'],
  ['plano objeto canonico', realPlan, 'plan'],
  ['plano MAPA DE DIAS (save legado)', realPlan.plan, 'plan'],
  ['plano null', null, 'plan'],
  ['plano undefined', undefined, 'plan'],
  ['plano objeto desconhecido', { foo: 1, bar: [2, 3] }, 'plan'],
  ['plano string vazia', '   ', 'plan'],
  ['plano numero', 42, 'plan'],
];
for (const [label, value] of CASES) {
  const out = formatStaffPlan(value);
  const rendered = out ? (out.detail ? `${out.title} (${out.detail})` : out.title) : '(omitido)';
  console.log(`  ${label.padEnd(36)} -> ${rendered}`);
  check(`Parte C: ${label} nao vaza`, () => {
    assertClean(out?.title, label);
    assertClean(out?.detail, label);
  });
}

const REC_CASES = [
  ['recomendacao string', 'Reduza a carga física'],
  ['recomendacao objeto canonico', { priority: 'high', title: 'Recupere energia', body: 'Evite sessões intensas.' }],
  ['recomendacao shape antigo label/message', { label: 'Antigo', message: 'corpo antigo' }],
  ['recomendacao so body', { body: 'apenas corpo' }],
  ['recomendacao vazia', {}],
  ['recomendacao null', null],
  ['recomendacao numero', 7],
];
console.log('');
for (const [label, value] of REC_CASES) {
  const out = formatStaffRecommendation(value);
  console.log(`  ${label.padEnd(36)} -> ${out ? `${out.title}${out.body ? ` — ${out.body}` : ''}` : '(omitido)'}`);
  check(`Parte C: ${label} nao vaza`, () => {
    assertClean(out?.title, label);
    assertClean(out?.body, label);
  });
}

check('Parte C: lista com entradas irrecuperaveis nao gera item vazio', () => {
  const list = formatStaffRecommendations([null, {}, 7, 'ok', { title: 'valido' }]);
  note(`entradas de entrada=5 | renderizaveis=${list.length}: ${list.map((x) => x.title).join(', ')}`);
  assert.equal(list.length, 2);
  for (const item of list) assertClean(item.title, 'item de lista');
});

check('Parte C: campo ausente devolve lista vazia, nunca item degenerado', () => {
  assert.deepEqual(formatStaffRecommendations(undefined), []);
  assert.deepEqual(formatStaffRecommendations(null), []);
  note('metadata sem recomendacoes -> bloco omitido');
});

// --------------------------------------------------------------- Gate
console.log('\n=== Gate: varredura de todos os casos ===\n');
check('Gate: [object Object] = 0 em todos os caminhos', () => {
  const all = [
    ...CASES.map(([, v]) => formatStaffPlan(v)),
    ...REC_CASES.map(([, v]) => formatStaffRecommendation(v)),
  ].filter(Boolean);
  const leaks = all.filter((o) => String(o.title).includes(OBJECT_LEAK) || String(o.detail || o.body || '').includes(OBJECT_LEAK));
  note(`saidas renderizaveis=${all.length} | vazamentos=${leaks.length}`);
  assert.equal(leaks.length, 0);
});

check('Gate: JSON literal = 0 em todos os caminhos', () => {
  const all = [
    ...CASES.map(([, v]) => formatStaffPlan(v)),
    ...REC_CASES.map(([, v]) => formatStaffRecommendation(v)),
  ].filter(Boolean);
  const leaks = all.filter((o) => looksLikeJson(o.title) || looksLikeJson(o.detail) || looksLikeJson(o.body));
  note(`vazamentos de JSON=${leaks.length}`);
  assert.equal(leaks.length, 0);
});

check('Gate: o formatter nunca usa JSON.stringify como fallback', () => {
  // Um objeto com campos completamente desconhecidos tem de ser OMITIDO, e
  // nao serializado. Era esse fallback que vazava na tela.
  const out = formatStaffRecommendation({ zzz: 1, qqq: { deep: true } });
  note(`objeto desconhecido -> ${out === null ? 'null (omitido)' : JSON.stringify(out)}`);
  assert.equal(out, null);
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
