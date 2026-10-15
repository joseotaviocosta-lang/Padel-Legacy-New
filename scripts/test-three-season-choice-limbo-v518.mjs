// Playthrough 5.18-H, Partes D/E/N/U — O LIMBO, ATRIBUÍDO E FECHADO.
//
// A 5.18-G deixou 22 de 466 duplas novas com >=40 semanas sem evento, 14 delas
// sem nunca disputar uma vaga. A admissão já estava provada (0 inversões em
// 1.116 decisões), então a causa tinha de estar ANTES dela.
//
// Causa encontrada (5.18-H): `activityFor` em worldSimulationLifecycle.js era
// cego à energia. ~72% dos dias iam para treino (-5 a -11) contra ~10% de
// descanso (+8 a +16) — deriva de aproximadamente -5,6/dia processado, sem
// nenhum mecanismo de recuperação por energia baixa. A consequência é
// competitiva: `restScore = (80 - energia) * 1,4` passa a vencer toda opção da
// semana (scores medidos entre 19 e 33), e a dupla descansa para sempre.
import assert from 'node:assert/strict';
import { runChoiceLimboRun, classifyLimbo, LIMBO_CAUSES } from './lib/choiceLimboHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const run = await runChoiceLimboRun({ label: 'limbo3', years: 3, cohortSize: 20 });
const pairs = run.perPair;
console.log(`\n=== ${run.weekly.length} semanas | ${pairs.length} duplas observadas | ${run.everQueued.size} chegaram a alguma fila ===\n`);

const mature = pairs.filter((p) => p.weeksAlive >= 40);
const zeroEvents = mature.filter((p) => p.playedWeeks === 0);
const noQueue = mature.filter((p) => !run.everQueued.has(p.pid));
const limbo = mature.filter((p) => p.playedWeeks === 0 && !run.everQueued.has(p.pid));

console.log(`duplas com >=40 semanas de vida: ${mature.length}`);
console.log(`  com 0 eventos:            ${zeroEvents.length}`);
console.log(`  que nunca entraram em fila: ${noQueue.length}`);
console.log(`  limbo (0 eventos E 0 filas): ${limbo.length}\n`);

// --- Parte D/N: tabela individual e classificação -------------------------
if (limbo.length || zeroEvents.length) {
  const show = (limbo.length ? limbo : zeroEvents).slice(0, 20);
  console.log(`${'dupla'.padEnd(40)}${'OVR'.padEnd(5)}${'sem'.padEnd(5)}${'cEvt'.padEnd(6)}${'elig'.padEnd(6)}${'play'.padEnd(6)}${'fila'.padEnd(6)}${'enMin'.padEnd(7)}${'bScore'.padEnd(8)}causa`);
  for (const p of show) {
    console.log(
      `${String(p.name).slice(0, 39).padEnd(40)}${String(p.ovr).padEnd(5)}${String(p.weeksAlive).padEnd(5)}${String(p.weeksWithEvents).padEnd(6)}${String(p.weeksEligible).padEnd(6)}${String(p.weeksChosePlay).padEnd(6)}${String(p.assignedWeeks).padEnd(6)}${String(p.minEnergy ?? '—').padEnd(7)}${String(p.bestScoreSeen ?? '—').padEnd(8)}${classifyLimbo(p, run.everQueued)}`,
    );
  }
  console.log('');
}

const causeHist = {};
for (const p of limbo) {
  const c = classifyLimbo(p, run.everQueued);
  causeHist[c] = (causeHist[c] || 0) + 1;
}
if (Object.keys(causeHist).length) {
  console.log('Causas do limbo:');
  for (const [c, n] of Object.entries(causeHist).sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(22)}${n}`);
  console.log('');
}

// --- Parte C: taxonomia de choose-none ------------------------------------
const agg = {};
for (const p of pairs) for (const [k, v] of Object.entries(p.reasons || {})) agg[k] = (agg[k] || 0) + v;
const total = Object.values(agg).reduce((s, v) => s + v, 0);
console.log('Parte C — taxonomia de decisão (todas as duplas, todas as semanas):');
for (const [k, v] of Object.entries(agg).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(22)}${String(v).padStart(7)}  ${((v / total) * 100).toFixed(1)}%`);
}
console.log('');

// --- Parte K: energia -----------------------------------------------------
const energies = pairs.map((p) => p.minEnergy).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
const pct = (arr, q) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] : null);
console.log(`Parte K — energia mínima observada por dupla: p5=${pct(energies, 0.05)} p50=${pct(energies, 0.5)} p95=${pct(energies, 0.95)}`);
const drained = pairs.filter((p) => Number.isFinite(p.minEnergy) && p.minEnergy < 30).length;
console.log(`  duplas que chegaram abaixo de 30 de energia: ${drained}/${pairs.length}\n`);

check('Parte C: nenhuma decisão sem código de motivo', () => {
  const unknown = agg.OTHER || 0;
  note(`decisões classificadas: ${total} | OTHER: ${unknown}`);
  assert.equal(unknown, 0, `${unknown} decisões sem motivo identificado`);
});

check('Parte N: toda dupla em limbo tem causa atribuída', () => {
  const unclassified = limbo.filter((p) => classifyLimbo(p, run.everQueued) === LIMBO_CAUSES.OTHER);
  note(`limbo=${limbo.length} | sem causa=${unclassified.length}`);
  assert.equal(unclassified.length, 0);
});

check('Parte U (gate duro): nenhuma dupla ativa >=40 semanas com 0 filas e 0 eventos', () => {
  note(`duplas maduras=${mature.length} | limbo=${limbo.length}`);
  for (const p of limbo.slice(0, 8)) note(`  ${p.name} OVR ${p.ovr} ${p.weeksAlive}sem energia mín ${p.minEnergy}`);
  assert.equal(limbo.length, 0, `${limbo.length} duplas em limbo competitivo`);
});

check('Parte K: o descanso não produz inatividade permanente', () => {
  // O piso de recuperação existe para que energia baixa seja transitória.
  const stuck = pairs.filter((p) => p.weeksAlive >= 40 && p.weeksChosePlay === 0);
  note(`duplas com >=40 semanas que NUNCA escolheram jogar: ${stuck.length}`);
  for (const p of stuck.slice(0, 5)) note(`  ${p.name} energia mín ${p.minEnergy} REST_POLICY ${p.reasons?.REST_POLICY || 0}`);
  assert.equal(stuck.length, 0);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
