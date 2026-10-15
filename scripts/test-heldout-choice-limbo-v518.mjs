// Playthrough 5.18-H, Partes V/W — 3 CALIBRAÇÃO + 3 HELD-OUT.
//
// Valida as duas correções desta fase sobre seis mundos independentes:
//   1. piso/banda de recuperação em `activityFor` (energia deixou de colapsar);
//   2. rotação da amostra diária em `simulateWorldDay` (cobertura 42% -> 100%).
//
// "Seed" identifica a run, não a reproduz (resultados de partida usam
// Math.random), então a Parte P/V exige equivalência QUALITATIVA. As filas são
// derivadas do observador de admissão — capturadas no instante, nunca
// reconstruídas (regra da Parte A).
import assert from 'node:assert/strict';
import { runFinalHarness, structuralIntegrity } from './lib/drawAdmissionHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const CAL = ['c1', 'c2', 'c3'];
const HELD = ['h1', 'h2', 'h3'];

function metricsOf(run) {
  const integrity = structuralIntegrity(run);
  const everQueued = new Set();
  let inversions = 0;
  for (const d of run.admissions) {
    const normal = d.candidates.filter((c) => !c.viaRescue);
    for (const c of d.candidates) everQueued.add(c.pairId);
    const adm = normal.filter((c) => c.admitted);
    const exc = normal.filter((c) => !c.admitted);
    if (adm.length && exc.length) {
      const worst = Math.min(...adm.map((c) => c.blendedCutScore));
      inversions += exc.filter((c) => c.blendedCutScore > worst).length;
    }
  }

  const seen = new Map();
  run.weekly.forEach((snap, idx) => {
    for (const c of (snap.census || [])) {
      let rec = seen.get(c.pid);
      if (!rec) { rec = { pid: c.pid, name: c.name, firstIdx: idx, firstPlayed: null, weeksAlive: 0, ovr: c.ovr }; seen.set(c.pid, rec); }
      rec.weeksAlive += 1;
      if (c.played && rec.firstPlayed === null) rec.firstPlayed = idx;
    }
  });
  const all = [...seen.values()];
  const newPairs = all.filter((p) => p.firstIdx > 0);
  const lat = newPairs.filter((p) => p.firstPlayed !== null).map((p) => p.firstPlayed - p.firstIdx).sort((a, b) => a - b);
  const pct = (arr, q) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] : null);
  const mature = all.filter((p) => p.weeksAlive >= 40);
  const zeroEvents = mature.filter((p) => p.firstPlayed === null);
  const noQueue = mature.filter((p) => !everQueued.has(p.pid));
  const limbo = mature.filter((p) => p.firstPlayed === null && !everQueued.has(p.pid));

  // Parte W — atividade da abertura (primeiras 35 semanas do cohort).
  let alive = 0; let played = 0;
  run.weekly.slice(0, 35).forEach((s) => {
    for (const r of s.rows) { if (!r.mutual) continue; alive += 1; if (r.played) played += 1; }
  });

  const tournaments = run.tournaments;
  const last = run.weekly[run.weekly.length - 1] || {};
  return {
    label: run.label,
    newPairs: newPairs.length,
    latencyMedian: pct(lat, 0.5), latencyP90: pct(lat, 0.9), latencyMax: lat[lat.length - 1] ?? null,
    mature: mature.length, zeroEvents: zeroEvents.length, noQueue: noQueue.length, limbo: limbo.length,
    queueCuts: zeroEvents.length - limbo.length,
    inversions,
    duplicates: integrity.duplicates, unilateral: integrity.unilateral, ghosts: integrity.ghosts, nanRanking: integrity.nanRanking,
    cancelled: tournaments.filter((t) => t.world_tour_cancelled).length,
    pendingSettlement: tournaments.filter((t) => (
      Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && !t.world_tour_resolved
      && t.end_date && t.end_date < run.finalDate
    )).length,
    drawnEvents: tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length).length,
    openingActivity: alive ? played / alive : 0,
    freeAgents: last.freeAgents || 0,
    admissionDecisions: run.admissions.length,
  };
}

const results = [];
for (const label of [...CAL, ...HELD]) {
  const run = await runFinalHarness({ label, years: 1, cohortSize: 20, census: true });
  const m = metricsOf(run);
  results.push(m);
  console.log(`\n--- ${label}: limbo=${m.limbo} noQueue=${m.noQueue} zeroEvt=${m.zeroEvents} latMed=${m.latencyMedian} inv=${m.inversions}`);
}

const COLS = ['newPairs', 'latencyMedian', 'latencyP90', 'latencyMax', 'mature', 'zeroEvents', 'noQueue', 'limbo', 'queueCuts', 'inversions', 'duplicates', 'unilateral', 'ghosts', 'cancelled', 'pendingSettlement', 'drawnEvents'];
console.log('\n=== Parte V: metricas por seed ===\n');
console.log(`${'metrica'.padEnd(20)}${results.map((r) => r.label.padStart(9)).join('')}`);
for (const c of COLS) {
  console.log(`${c.padEnd(20)}${results.map((r) => String(r[c] ?? '-').padStart(9)).join('')}`);
}

console.log('\n=== Parte W: atividade de abertura (so registro, sem gate) ===\n');
for (const r of results) console.log(`  ${r.label}: ${(r.openingActivity * 100).toFixed(1)}%`);
const oa = results.map((r) => r.openingActivity);
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
console.log(`  media ${(mean(oa) * 100).toFixed(1)}% | amplitude ${((Math.max(...oa) - Math.min(...oa)) * 100).toFixed(1)} p.p.\n`);

const cal = results.filter((r) => CAL.includes(r.label));
const held = results.filter((r) => HELD.includes(r.label));
const avg = (rows, k) => (rows.length ? rows.reduce((s, r) => s + Number(r[k] || 0), 0) / rows.length : 0);

check('Parte V (gate): limbo competitivo = 0 em todas as seis seeds', () => {
  note(`limbo por seed: ${results.map((r) => `${r.label}=${r.limbo}`).join(' ')}`);
  assert.equal(results.filter((r) => r.limbo > 0).length, 0);
});

check('Parte V: nenhuma dupla madura sem NENHUMA entrada em fila', () => {
  note(`noQueue por seed: ${results.map((r) => `${r.label}=${r.noQueue}`).join(' ')}`);
  assert.equal(results.filter((r) => r.noQueue > 0).length, 0);
});

check('Parte V: integridade estrutural intacta em todas as seeds', () => {
  note(`duplicates/unilateral/ghosts: ${results.map((r) => `${r.label}=${r.duplicates}/${r.unilateral}/${r.ghosts}`).join(' ')}`);
  for (const r of results) {
    assert.equal(r.duplicates, 0, `${r.label} duplicates`);
    assert.equal(r.unilateral, 0, `${r.label} unilateral`);
    assert.equal(r.ghosts, 0, `${r.label} ghosts`);
    assert.equal(r.nanRanking, 0, `${r.label} NaN`);
  }
});

check('Parte V: nenhum settlement pendente em nenhuma seed', () => {
  note(`pending: ${results.map((r) => `${r.label}=${r.pendingSettlement}`).join(' ')}`);
  assert.equal(results.filter((r) => r.pendingSettlement > 0).length, 0);
});

check('Parte V: zero inversoes de admissao em todas as seeds', () => {
  const total = results.reduce((s, r) => s + r.admissionDecisions, 0);
  note(`decisoes de admissao: ${total} | inversoes: ${results.reduce((s, r) => s + r.inversions, 0)}`);
  assert.equal(results.filter((r) => r.inversions > 0).length, 0);
});

check('Parte V: latencia de estreia plausivel em todas as seeds', () => {
  note(`mediana: ${results.map((r) => `${r.label}=${r.latencyMedian}`).join(' ')}`);
  note(`p90: ${results.map((r) => `${r.label}=${r.latencyP90}`).join(' ')}`);
  // Gate derivado do significado: a estreia tem de acontecer dentro de uma
  // temporada, nao de um numero escolhido. p90 abaixo de 26 semanas = a grande
  // maioria estreia na primeira metade do ano de vida.
  for (const r of results) {
    assert.ok(r.latencyMedian !== null, `${r.label}: nenhuma dupla nova estreou`);
    assert.ok(r.latencyP90 <= 26, `${r.label}: p90 de ${r.latencyP90} semanas`);
  }
});

check('Parte V/P: held-out reproduz qualitativamente a calibracao', () => {
  const COMPARE = ['latencyMedian', 'latencyP90', 'zeroEvents', 'queueCuts', 'freeAgents', 'openingActivity', 'drawnEvents'];
  const problems = [];
  for (const k of COMPARE) {
    const cv = cal.map((r) => Number(r[k] || 0));
    const a = avg(cal, k); const b = avg(held, k);
    const spread = Math.max(...cv) - Math.min(...cv);
    const band = Math.max(2 * spread, Math.abs(a) * 0.25, 0.5);
    if (Math.abs(b - a) > band) problems.push(`${k}: cal=${a.toFixed(2)} held=${b.toFixed(2)} banda=±${band.toFixed(2)}`);
  }
  note(`metricas comparadas: ${COMPARE.length} | fora da banda: ${problems.length}`);
  for (const p of problems) note(`  ${p}`);
  assert.equal(problems.length, 0, problems.join(' | '));
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
