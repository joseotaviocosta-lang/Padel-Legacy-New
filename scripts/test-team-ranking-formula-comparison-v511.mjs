// Playthrough 5.11, Partes E/F/G/H/O/P/Q — harness comparativo dos modelos
// candidatos de pontos de dupla.
//
// Playthrough 5.22-F — a autoridade vigente é a SOMA (A + B). Este harness
// continua comparando TODOS os modelos em tabelas antes/depois, mas agora
// trata a SOMA (MODELS id 'G', CURRENT_MODEL) como o modelo APROVADO e NÃO
// exige/afirma vitória da média geométrica (autoridade da 5.11, superada).
// As restrições do briefing foram reinterpretadas sob a regra aprovada:
// o membro forte carrega a dupla, 0 + x = x e o membro fraco entra de forma
// linear. A tabela de cenários é medida contra o baseline HISTÓRICO
// (geométrica) para documentar o antes/depois.
//
// Medido sobre a população determinística `buildSyntheticPopulation`
// (curva canônica pointsForRank) em vez de um ano de simulação headless.
import assert from 'node:assert/strict';
import {
  MODELS, CURRENT_MODEL, modelGeometric, modelSum, positionOf, jaccard, buildSyntheticPopulation,
} from './lib/teamFormulaModels.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const { pairs, athletes } = buildSyntheticPopulation({ pairCount: 500, worldSize: 1000 });
const sortedAthletes = [...athletes].sort((x, y) => y.points - x.points);
const pointsAtRank = (r) => sortedAthletes[Math.min(r, sortedAthletes.length) - 1]?.points ?? 0;
const REF = {
  Top1: pointsAtRank(1), Top10: pointsAtRank(10), Top20: pointsAtRank(20), Top50: pointsAtRank(50),
  Top100: pointsAtRank(100), Top300: pointsAtRank(300), Top500: pointsAtRank(500), Top1000: pointsAtRank(1000),
};
console.log(`duplas sintéticas analisadas: ${pairs.length}`);

// Para cada modelo: reconstrói a tabela inteira e mede.
function buildBoard(fn) {
  const scored = pairs.map((p) => ({ key: p.key, pts: fn(p.a, p.b) }))
    .sort((x, y) => y.pts - x.pts);
  const order = scored.map((s) => s.key);
  const rankByKey = new Map();
  scored.forEach((s, i) => rankByKey.set(s.key, i + 1));
  return { scored, order, rankByKey, pointsDesc: scored.map((s) => s.pts) };
}

// Baseline HISTÓRICO: a média geométrica (autoridade da 5.11, superada).
const baseline = buildBoard(modelGeometric);

const report = [];
for (const model of MODELS) {
  const board = buildBoard(model.fn);
  // Estabilidade contra o baseline histórico.
  const j10 = jaccard(baseline.order.slice(0, 10), board.order.slice(0, 10));
  const j20 = jaccard(baseline.order.slice(0, 20), board.order.slice(0, 20));
  let sumDisp = 0; let maxDisp = 0; let bigInversions = 0;
  for (const [key, baseRank] of baseline.rankByKey) {
    const newRank = board.rankByKey.get(key);
    const disp = Math.abs(newRank - baseRank);
    sumDisp += disp;
    if (disp > maxDisp) maxDisp = disp;
    if (disp > 100) bigInversions += 1;
  }
  const avgDisp = sumDisp / baseline.rankByKey.size;

  // Cenários-chave, posicionados na tabela DO PRÓPRIO modelo.
  const at = (a, b) => positionOf(model.fn(a, b), board.pointsDesc);
  const scenarios = {
    extreme: at(18, REF.Top1),                 // membro forte carrega
    moderate: at(15000, REF.Top1),             // gap moderado
    t1t100: at(REF.Top1, REF.Top100),
    t100t100: at(REF.Top100, REF.Top100),
    t1t1000: at(REF.Top1, REF.Top1000),
    t1t20: at(REF.Top1, REF.Top20),
    t10t10: at(REF.Top10, REF.Top10),
    unrankedTop10: at(0, REF.Top10),           // 0 + x = x
  };
  report.push({ model, j10, j20, avgDisp, maxDisp, bigInversions, scenarios });
}

console.log('\n=== PARTE F: comparação de modelos (rank nos cenários-chave; baseline = geométrica) ===');
console.log('modelo            J10   J20   dispMéd dispMáx  18+T1  15k+T1  T1+T100 T100+T100  T1+#1000  T1+T20  T10+T10');
for (const r of report) {
  const s = r.scenarios;
  console.log(
    `${r.model.id.padEnd(5)}${r.model.label.padEnd(12)}`
    + `${r.j10.toFixed(2).padStart(5)} ${r.j20.toFixed(2).padStart(5)}`
    + `${r.avgDisp.toFixed(1).padStart(8)} ${String(r.maxDisp).padStart(7)}`
    + `${String('#' + s.extreme).padStart(7)} ${String('#' + s.moderate).padStart(7)}`
    + `${String('#' + s.t1t100).padStart(8)} ${String('#' + s.t100t100).padStart(10)}`
    + `${String('#' + s.t1t1000).padStart(10)} ${String('#' + s.t1t20).padStart(7)} ${String('#' + s.t10t10).padStart(8)}`,
  );
}

// ---------------------------------------------------------------------------
// Antes/depois: valores da média geométrica (5.11) vs a SOMA aprovada (5.22-E).
// ---------------------------------------------------------------------------
console.log('\n=== PARTE F: antes (geométrica) -> depois (soma aprovada) ===');
console.log('cenário                    geométrica    soma    delta');
const BEFORE_AFTER = [
  ['jogador 18 + Top1', 18, REF.Top1],
  ['jogador 15k + Top1', 15000, REF.Top1],
  ['Top1 + Top100', REF.Top1, REF.Top100],
  ['Top1 + #1000', REF.Top1, REF.Top1000],
  ['0 + Top10', 0, REF.Top10],
  ['0 + 0 (sem ranking)', 0, 0],
];
for (const [label, a, b] of BEFORE_AFTER) {
  const before = modelGeometric(a, b);
  const after = modelSum(a, b);
  console.log(`${label.padEnd(22)} ${String(before).padStart(11)} ${String(after).padStart(7)} ${String(after - before).padStart(7)}`);
}

// ---------------------------------------------------------------------------
// Restrições APROVADAS (5.22-E), aplicadas como filtros objetivos.
// ---------------------------------------------------------------------------
const verdicts = [];
for (const r of report) {
  const s = r.scenarios;
  const fn = r.model.fn;
  const reasons = [];
  // 0 + x = x — membro sem ranking não pode zerar a dupla (Parte J).
  if (fn(0, REF.Top10) !== REF.Top10) reasons.push(`0+Top10=${fn(0, REF.Top10)} != ${REF.Top10}`);
  // 0 + 0 = 0 continua sendo "sem ranking".
  if (fn(0, 0) !== 0) reasons.push(`0+0=${fn(0, 0)} != 0`);
  // Membro forte CARREGA a dupla: 18+Top1 precisa ficar no topo (<=10% da tabela).
  if (s.extreme > pairs.length * 0.1) reasons.push(`18+T1 em #${s.extreme} (>10%)`);
  // Membro fraco entra LINEARMENTE: melhorar o fraco de 0->18 soma exatamente 18.
  if (fn(18, REF.Top1) - fn(0, REF.Top1) !== 18) reasons.push('membro fraco não é aditivo');
  // Parte G — não virar ranking pelo pior membro.
  if (Math.abs(s.t1t100 - s.t100t100) <= 5) reasons.push(`T1+T100 (#${s.t1t100}) ~ T100+T100 (#${s.t100t100})`);
  // Parte O — Top20 precisa continuar reconhecível vs a geométrica anterior.
  if (r.j20 < 0.6) reasons.push(`Jaccard Top20 ${r.j20.toFixed(2)} < 0.60`);
  verdicts.push({ ...r, ok: reasons.length === 0, reasons });
}

console.log('\n=== PARTE F: quem sobrevive às restrições aprovadas ===');
for (const v of verdicts) {
  console.log(`  ${v.ok ? '\x1b[32mOK  \x1b[0m' : '\x1b[31mFALHA\x1b[0m'} ${v.model.id.padEnd(5)}${v.model.label.padEnd(16)} ${v.reasons.join(' | ') || '—'}`);
}

const survivors = verdicts.filter((v) => v.ok);
console.log(`\nmodelos aprovados: ${survivors.length ? survivors.map((s) => s.model.id).join(', ') : 'NENHUM'}`);

check('Parte F: a SOMA (modelo vigente) satisfaz TODAS as restrições aprovadas', () => {
  const current = verdicts.find((v) => v.model.id === CURRENT_MODEL.id);
  assert.ok(current, 'modelo vigente ausente do catálogo');
  assert.ok(current.ok, `soma reprovada: ${current.reasons.join(' | ')}`);
});

check('Parte F: existe ao menos um modelo que satisfaz TODAS as restrições aprovadas', () => {
  assert.ok(survivors.length > 0, 'nenhum modelo passou — as restrições podem ser contraditórias');
});

check('Parte F: a média geométrica (autoridade anterior) NÃO é o modelo aprovado', () => {
  const geometric = verdicts.find((v) => v.model.id === 'B');
  assert.ok(geometric && !geometric.ok, 'a geométrica não deveria satisfazer a regra vigente (0 + x = x)');
  assert.notEqual(CURRENT_MODEL.id, 'B');
});

check('Parte G: o modelo aprovado não colapsa para o pior membro', () => {
  const s = verdicts.find((v) => v.model.id === CURRENT_MODEL.id);
  assert.ok(Math.abs(s.scenarios.t1t100 - s.scenarios.t100t100) > 5, `${s.model.id} colapsou`);
});

check('Parte H: o membro fraco contribui EXATAMENTE os seus pontos (regra linear aprovada)', () => {
  const fn = CURRENT_MODEL.fn;
  assert.equal(fn(18, REF.Top1) - fn(0, REF.Top1), 18, 'o membro fraco não entrou linearmente');
  assert.equal(fn(REF.Top1, REF.Top1000), REF.Top1 + REF.Top1000, 'a soma não é exata');
});

check('Parte O: o baseline é idêntico a si mesmo (sanidade da métrica)', () => {
  const self = report.find((r) => r.model.id === 'B');
  assert.equal(self.j10, 1); assert.equal(self.j20, 1); assert.equal(self.avgDisp, 0);
});

check('Parte C: nenhuma dupla de elite equilibrada é destruída pelo modelo aprovado', () => {
  // Um par perfeitamente equilibrado vale 2x na soma (a geométrica devolvia
  // apenas a): a dupla de elite não pode encolher.
  const balancedTop = CURRENT_MODEL.fn(REF.Top1, REF.Top1);
  assert.ok(balancedTop >= REF.Top1 * 0.95,
    `dupla Top1+Top1 caiu para ${balancedTop} (de ${REF.Top1})`);
});

check('antes/depois: a soma aprovada nunca é menor que a geométrica anterior', () => {
  for (const [label, a, b] of BEFORE_AFTER) {
    assert.ok(modelSum(a, b) >= modelGeometric(a, b), `${label}: soma < geométrica`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-team-ranking-formula-comparison-v511: PASS');
