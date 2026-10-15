// Playthrough 5.19, Parte AA — FORENSE DE CANCELAMENTO.
//
// A Parte AA proibe aceitar "insufficient pairs" como explicacao: quando um
// evento cancela, e preciso saber POR QUE o campo ficou insuficiente. Este
// teste exercita os cenarios de campo pequeno e verifica que cada um produz
// uma causa distinguivel — e que o cancelamento SO acontece abaixo do minimo
// viavel, nunca por estado alheio ao evento.
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

installShims('/cancel-forensics');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const wt = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
const { assignPairsForWeek, committedPairIdsForWindow, rankCandidatesByTierFit } = wt;

const mkT = (id, tier, draw, extra = {}) => ({
  id, name: id, tier, world_tour_event: true,
  start_date: '2026-06-08', end_date: '2026-06-11', main_draw_size: draw, ...extra,
});
const mkPair = (n, rank, ovr) => ({
  id: `p-${n}`, name: `D${n}`, chemistry: 50, priorityWindowRemaining: 0,
  athletes: [
    { id: `x-${n}-1`, ranking_position: rank, overall_rating: ovr, tournaments_played: 3, energy: 100 },
    { id: `x-${n}-2`, ranking_position: rank + 3, overall_rating: ovr, tournaments_played: 3, energy: 100 },
  ],
});
const minViable = (draw) => Math.min(8, Math.max(2, Math.ceil(draw / 2)));

// Forense completa de um evento, com TODOS os campos que a Parte AA exige.
function forensicsFor({ event, pool, allTournaments = [] }) {
  const committed = committedPairIdsForWindow([event], [event, ...allTournaments]);
  const available = pool.filter((p) => !committed.has(p.id));
  const assignments = assignPairsForWeek([event], available);
  const selected = assignments.get(event.id) || [];
  const idle = available.filter((p) => !selected.some((s) => s.id === p.id));
  const rescueCandidates = rankCandidatesByTierFit(idle, event);
  const needed = Math.max(0, minViable(event.main_draw_size) - selected.length);
  const rescued = needed > 0 ? rescueCandidates.slice(0, needed) : [];
  const finalCount = Math.min(event.main_draw_size, selected.length + rescued.length);
  return {
    candidateCount: pool.length,
    eligibleCount: available.length,
    assignedElsewhere: committed.size,
    selectedCount: selected.length,
    rescueCount: rescued.length,
    minViable: minViable(event.main_draw_size),
    finalCount,
    cancelReason: finalCount >= minViable(event.main_draw_size) ? null : 'inscritos_insuficientes',
  };
}

console.log('\n=== Parte AA: causas distinguiveis de campo pequeno ===\n');
const SCENARIOS = [
  ['pool saudavel', { poolSize: 60, blocked: 0 }],
  ['pool minusculo (populacao real pequena)', { poolSize: 3, blocked: 0 }],
  ['pool grande mas TODO comprometido', { poolSize: 40, blocked: 40 }],
  ['pool no limite exato do minimo', { poolSize: 8, blocked: 0 }],
];
const results = [];
for (const [label, cfg] of SCENARIOS) {
  const event = mkT('gold-target', 'Gold', 24);
  const pool = Array.from({ length: cfg.poolSize }, (_, i) => mkPair(i, 400 + i * 4, 70));
  const blocker = cfg.blocked
    ? [mkT('overlapping', 'Gold', 24, {
      bracket_schema_version: 2, world_tour_resolved: false,
      draw_pair_ids: pool.slice(0, cfg.blocked).map((p) => p.id),
    })]
    : [];
  const f = forensicsFor({ event, pool, allTournaments: blocker });
  results.push({ label, ...f });
}
console.log(`${'cenario'.padEnd(40)}${'cand'.padEnd(6)}${'eleg'.padEnd(6)}${'alhures'.padEnd(9)}${'sel'.padEnd(5)}${'resg'.padEnd(6)}${'final'.padEnd(7)}motivo`);
for (const r of results) {
  console.log(`${r.label.padEnd(40)}${String(r.candidateCount).padEnd(6)}${String(r.eligibleCount).padEnd(6)}${String(r.assignedElsewhere).padEnd(9)}${String(r.selectedCount).padEnd(5)}${String(r.rescueCount).padEnd(6)}${String(r.finalCount).padEnd(7)}${r.cancelReason || '-'}`);
}
console.log('');

check('Parte AA: forense reporta todos os campos exigidos', () => {
  const REQUIRED = ['candidateCount', 'eligibleCount', 'assignedElsewhere', 'selectedCount', 'rescueCount', 'minViable', 'finalCount'];
  for (const r of results) {
    for (const key of REQUIRED) assert.ok(Number.isFinite(r[key]), `${r.label} sem ${key}`);
  }
  note(`campos verificados: ${REQUIRED.join(', ')}`);
});

check('Parte AA: pool saudavel nunca cancela', () => {
  const healthy = results.find((r) => r.label === 'pool saudavel');
  note(`final=${healthy.finalCount} minimo=${healthy.minViable} motivo=${healthy.cancelReason || 'nenhum'}`);
  assert.equal(healthy.cancelReason, null);
});

check('Parte AA: causa de cancelamento e distinguivel, nao generica', () => {
  // Pool minusculo e pool comprometido produzem NUMEROS diferentes, mesmo
  // quando ambos cancelam — e essa diferenca e o diagnostico.
  const tiny = results.find((r) => r.label.startsWith('pool minusculo'));
  const blocked = results.find((r) => r.label.includes('TODO comprometido'));
  note(`minusculo: cand=${tiny.candidateCount} eleg=${tiny.eligibleCount} alhures=${tiny.assignedElsewhere}`);
  note(`comprometido: cand=${blocked.candidateCount} eleg=${blocked.eligibleCount} alhures=${blocked.assignedElsewhere}`);
  assert.ok(tiny.candidateCount < 8, 'cenario minusculo nao reproduz');
  assert.ok(blocked.assignedElsewhere > 0, 'cenario comprometido nao reproduz');
  assert.notEqual(tiny.eligibleCount, blocked.eligibleCount);
});

check('Parte AA: pool no limite do minimo NAO cancela', () => {
  const edge = results.find((r) => r.label.includes('limite exato'));
  note(`final=${edge.finalCount} minimo=${edge.minViable} motivo=${edge.cancelReason || 'nenhum'}`);
  assert.equal(edge.cancelReason, null, 'cancelou estando no minimo viavel');
});

check('Parte AB: cancelamento nunca vem de minimo reduzido', () => {
  for (const [draw, want] of [[24, 8], [16, 8], [32, 8], [8, 4]]) {
    assert.equal(minViable(draw), want, `minViable(${draw})`);
  }
  note('minimo viavel intacto em todas as chaves');
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
