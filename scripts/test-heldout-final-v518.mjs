// Playthrough 5.18-G, Partes M/N/O/P/W — 3 CALIBRAÇÃO + 3 HELD-OUT.
//
// Mesmas condições nas seis seeds, nenhum parâmetro alterado entre
// calibração e held-out. O mundo não é seedável (resultados de partida usam
// Math.random), então "seed" identifica a run, não a reproduz — por isso a
// Parte P exige equivalência QUALITATIVA, não identidade.
//
// Toda métrica temporal usa o snapshot da própria data (regra da Parte A).
import assert from 'node:assert/strict';
import { runFinalHarness, structuralIntegrity } from './lib/drawAdmissionHarness.mjs';
import { activeWindowGaps } from './lib/temporalIntegrity.mjs';

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
  const { weekly, admissions, tournaments, athletes, partnerships, teams } = run;
  const integrity = structuralIntegrity({ athletes, partnerships, teams });

  const drawnEvents = tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length).length;
  const cancelled = tournaments.filter((t) => t.world_tour_cancelled).length;
  const completed = tournaments.filter((t) => t.world_tour_resolved && !t.world_tour_cancelled).length;
  const pendingSettlement = tournaments.filter((t) => (
    Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && !t.world_tour_resolved
    && t.end_date && t.end_date < run.finalDate
  )).length;

  // --- atividade do cohort, por janela ativa -------------------------------
  const byKey = new Map();
  for (const snap of weekly) for (const r of snap.rows) {
    if (!byKey.has(r.key)) byKey.set(r.key, []);
    byKey.get(r.key).push(r);
  }
  let top10Events = 0; let top10Weeks = 0; let top20Events = 0; let top20Weeks = 0;
  let maxTop10Gap = 0; let maxTop20Gap = 0;
  const chooseNone = { top10: [0, 0], top20: [0, 0], top50: [0, 0], base: [0, 0] };
  for (const rows of byKey.values()) {
    for (const r of rows) {
      if (r.team_rank && r.team_rank <= 10) { top10Weeks += 1; if (r.played) top10Events += 1; }
      if (r.team_rank && r.team_rank <= 20) { top20Weeks += 1; if (r.played) top20Events += 1; }
      if (r.played || !r.mutual || !r.events_this_week) continue;
      const bucket = !r.team_rank ? chooseNone.base
        : r.team_rank <= 10 ? chooseNone.top10
          : r.team_rank <= 20 ? chooseNone.top20
            : r.team_rank <= 50 ? chooseNone.top50 : chooseNone.base;
      bucket[1] += 1;
      if (r.choose_decision !== 'play') bucket[0] += 1;
    }
    for (const g of activeWindowGaps(rows)) {
      const anyTop10 = g.weeks.some((w) => w.team_rank && w.team_rank <= 10);
      const anyTop20 = g.weeks.some((w) => w.team_rank && w.team_rank <= 20);
      if (anyTop10 && g.length > maxTop10Gap) maxTop10Gap = g.length;
      if (anyTop20 && g.length > maxTop20Gap) maxTop20Gap = g.length;
    }
  }

  // --- abertura vs segunda metade ------------------------------------------
  const activityIn = (pred) => {
    let alive = 0; let played = 0;
    for (const snap of weekly) {
      if (!pred(snap)) continue;
      for (const r of snap.rows) { if (!r.mutual) continue; alive += 1; if (r.played) played += 1; }
    }
    return alive ? played / alive : 0;
  };
  const weeksTotal = weekly.length;
  const openingActivity = activityIn((s) => weekly.indexOf(s) < Math.min(35, weeksTotal));
  const secondHalfActivity = activityIn((s) => weekly.indexOf(s) >= Math.floor(weeksTotal / 2));

  // --- duplas novas ---------------------------------------------------------
  const seen = new Map();
  weekly.forEach((snap, idx) => {
    for (const c of (snap.census || [])) {
      let rec = seen.get(c.pid);
      if (!rec) { rec = { firstIdx: idx, firstPlayed: null, weeksAlive: 0, points: c.team_points, matches: c.team_matches, origin: c.team_origin, memberPoints: c.member_points, name: c.name }; seen.set(c.pid, rec); }
      rec.weeksAlive += 1;
      if (c.played && rec.firstPlayed === null) rec.firstPlayed = idx;
    }
  });
  const newPairs = [...seen.values()].filter((p) => p.firstIdx > 0);
  const lat = newPairs.filter((p) => p.firstPlayed !== null).map((p) => p.firstPlayed - p.firstIdx).sort((a, b) => a - b);
  const pct = (arr, q) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] : null);
  const limbo = newPairs.filter((p) => p.weeksAlive >= 40 && p.firstPlayed === null).length;
  const artificialPoints = newPairs.filter((p) => (
    p.points > 0 && p.matches === 0 && !String(p.origin || '').startsWith('seed') && p.memberPoints === 0
  )).length;

  // --- admissão --------------------------------------------------------------
  let inversions = 0; let rescueCount = 0; let rescueAdded = 0;
  for (const d of admissions) {
    const normal = d.candidates.filter((c) => !c.viaRescue);
    const adm = normal.filter((c) => c.admitted);
    const exc = normal.filter((c) => !c.admitted);
    if (adm.length && exc.length) {
      const worst = Math.min(...adm.map((c) => c.blendedCutScore));
      inversions += exc.filter((c) => c.blendedCutScore > worst).length;
    }
    if (d.rescue.triggered) { rescueCount += 1; rescueAdded += d.rescue.added; }
  }
  const masters = admissions.filter((d) => d.tier === 'Masters');
  const mTop10 = masters.reduce((s, d) => s + d.candidates.filter((c) => c.teamRank && c.teamRank <= 10 && c.admitted).length, 0);
  const mTop20 = masters.reduce((s, d) => s + d.candidates.filter((c) => c.teamRank && c.teamRank <= 20 && c.admitted).length, 0);

  const last = weekly[weekly.length - 1] || {};
  const cn = (b) => (b[1] ? b[0] / b[1] : 0);
  return {
    label: run.label,
    plannedEvents: tournaments.length, drawnEvents, completed, cancelled, pendingSettlement,
    population: last.population || 0, freeAgents: last.freeAgents || 0,
    partnerships: last.activePartnerships || 0, canonicalPairs: last.canonicalPairs || 0,
    ...integrity,
    top10PerPair: top10Weeks ? top10Events / top10Weeks : 0,
    top20PerPair: top20Weeks ? top20Events / top20Weeks : 0,
    openingActivity, secondHalfActivity,
    chooseNoneTop10: cn(chooseNone.top10), chooseNoneTop20: cn(chooseNone.top20),
    chooseNoneTop50: cn(chooseNone.top50), chooseNoneBase: cn(chooseNone.base),
    mastersTop10: masters.length ? mTop10 / masters.length : 0,
    mastersTop20: masters.length ? mTop20 / masters.length : 0,
    admissionDecisions: admissions.length, inversions, rescueCount, rescueAdded,
    newPairs: newPairs.length, latencyMedian: pct(lat, 0.5), latencyP90: pct(lat, 0.9),
    limbo, artificialPoints,
    maxTop10Gap, maxTop20Gap,
  };
}

const results = [];
for (const label of [...CAL, ...HELD]) {
  const run = await runFinalHarness({ label, years: 1, cohortSize: 20 });
  const m = metricsOf(run);
  results.push(m);
  console.log(`\n--- ${label}: ${m.admissionDecisions} admissões | ${m.drawnEvents} sorteios | inversões=${m.inversions} | limbo=${m.limbo}`);
}

const cal = results.filter((r) => CAL.includes(r.label));
const held = results.filter((r) => HELD.includes(r.label));
const avg = (rows, k) => (rows.length ? rows.reduce((s, r) => s + Number(r[k] || 0), 0) / rows.length : 0);
const f = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : String(v));

console.log('\n=== Parte O — métricas por seed ===\n');
const COLS = ['plannedEvents', 'drawnEvents', 'completed', 'cancelled', 'pendingSettlement', 'freeAgents', 'partnerships', 'duplicates', 'unilateral', 'ghosts', 'admissionDecisions', 'inversions', 'rescueCount', 'limbo', 'latencyMedian', 'latencyP90', 'maxTop10Gap', 'maxTop20Gap'];
console.log(`${'métrica'.padEnd(20)}${results.map((r) => r.label.padStart(9)).join('')}`);
for (const c of COLS) {
  console.log(`${c.padEnd(20)}${results.map((r) => String(r[c] ?? '—').padStart(9)).join('')}`);
}

console.log('\n=== Parte P — calibração vs held-out ===\n');
const COMPARE = [
  ['freeAgents', 0], ['partnerships', 0], ['top10PerPair', 3], ['top20PerPair', 3],
  ['chooseNoneTop10', 3], ['chooseNoneTop20', 3], ['chooseNoneBase', 3],
  ['mastersTop20', 2], ['openingActivity', 3], ['latencyMedian', 1],
  ['inversions', 0], ['cancelled', 0],
];
console.log(`${'métrica'.padEnd(20)}${'calibração'.padStart(12)}${'held-out'.padStart(12)}${'diferença'.padStart(12)}`);
for (const [k, d] of COMPARE) {
  const a = avg(cal, k); const b = avg(held, k);
  console.log(`${k.padEnd(20)}${f(a, d).padStart(12)}${f(b, d).padStart(12)}${f(b - a, d).padStart(12)}`);
}
console.log('');

// ------------------------------------------------------------- Parte W
check('Parte W: duplicates = 0 em todas as seeds', () => {
  const bad = results.filter((r) => r.duplicates > 0);
  note(`duplicates por seed: ${results.map((r) => `${r.label}=${r.duplicates}`).join(' ')}`);
  assert.equal(bad.length, 0);
});
check('Parte W: unilateral = 0 em todas as seeds', () => {
  const bad = results.filter((r) => r.unilateral > 0);
  note(`unilateral por seed: ${results.map((r) => `${r.label}=${r.unilateral}`).join(' ')}`);
  assert.equal(bad.length, 0);
});
check('Parte W: ghosts = 0 em todas as seeds', () => {
  const bad = results.filter((r) => r.ghosts > 0);
  note(`ghosts por seed: ${results.map((r) => `${r.label}=${r.ghosts}`).join(' ')}`);
  assert.equal(bad.length, 0);
});
check('Parte W: NaN ranking = 0 em todas as seeds', () => {
  const bad = results.filter((r) => r.nanRanking > 0);
  assert.equal(bad.length, 0);
});
check('Parte W: pending settlement = 0 em todas as seeds', () => {
  note(`pending por seed: ${results.map((r) => `${r.label}=${r.pendingSettlement}`).join(' ')}`);
  assert.equal(results.filter((r) => r.pendingSettlement > 0).length, 0);
});
check('Parte W: nenhuma dupla nova com >=40 semanas ativas e 0 eventos', () => {
  note(`limbo por seed: ${results.map((r) => `${r.label}=${r.limbo}`).join(' ')}`);
  assert.equal(results.filter((r) => r.limbo > 0).length, 0);
});
check('Parte W: capacity inversion = 0 em todas as seeds', () => {
  note(`inversões por seed: ${results.map((r) => `${r.label}=${r.inversions}`).join(' ')}`);
  note(`decisões de admissão totais: ${results.reduce((s, r) => s + r.admissionDecisions, 0)}`);
  assert.equal(results.filter((r) => r.inversions > 0).length, 0);
});
check('Parte L: nenhum ponto artificial em nenhuma seed', () => {
  note(`pontos artificiais por seed: ${results.map((r) => `${r.label}=${r.artificialPoints}`).join(' ')}`);
  assert.equal(results.filter((r) => r.artificialPoints > 0).length, 0);
});

// ------------------------------------------------------------- Parte P
check('Parte P: held-out reproduz qualitativamente a calibração', () => {
  // Equivalência qualitativa: a média held-out fica dentro de uma banda
  // derivada da DISPERSÃO da própria calibração, não de um alvo escolhido.
  // Banda = média ± max(2 × amplitude da calibração, 25% da média).
  const problems = [];
  for (const [k] of COMPARE) {
    const cv = cal.map((r) => Number(r[k] || 0));
    const a = avg(cal, k); const b = avg(held, k);
    const spread = Math.max(...cv) - Math.min(...cv);
    const band = Math.max(2 * spread, Math.abs(a) * 0.25, 0.5);
    if (Math.abs(b - a) > band) problems.push(`${k}: cal=${f(a, 3)} held=${f(b, 3)} banda=±${f(band, 3)}`);
  }
  note(`métricas comparadas: ${COMPARE.length} | fora da banda: ${problems.length}`);
  for (const p of problems) note(`  ${p}`);
  assert.equal(problems.length, 0, problems.join(' | '));
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
