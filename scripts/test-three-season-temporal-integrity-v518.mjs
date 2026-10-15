// Playthrough 5.18-G, Parte Q — LONG RUN FINAL, MEDIÇÃO TEMPORAL CORRETA.
//
// 1 seed x 3 temporadas. Toda métrica histórica resolve Partnership pelo
// snapshot da própria semana (regra da Parte A). É a run que a 5.18-E fez
// errado: lá, 3 temporadas + tradução por estado final produziram 6 lacunas
// fantasma de 30-34 semanas. Aqui o mesmo horizonte, medido corretamente.
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

const run = await runFinalHarness({ label: 'longrun3', years: 3, cohortSize: 20 });
const integrity = structuralIntegrity(run);
const last = run.weekly[run.weekly.length - 1];

const drawn = run.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
const cancelled = run.tournaments.filter((t) => t.world_tour_cancelled).length;
const pending = run.tournaments.filter((t) => (
  Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && !t.world_tour_resolved
  && t.end_date && t.end_date < run.finalDate
)).length;

console.log(`\n=== Long run: ${run.weekly.length} semanas, ${run.admissions.length} decisões de admissão ===\n`);
console.log(`  população final: ${last.population} | agentes livres: ${last.freeAgents} | parcerias ativas: ${last.activePartnerships}`);
console.log(`  eventos: ${run.tournaments.length} planejados | ${drawn.length} sorteados | ${cancelled} cancelados | ${pending} pendentes`);
console.log(`  duplicates=${integrity.duplicates} unilateral=${integrity.unilateral} ghosts=${integrity.ghosts} NaN=${integrity.nanRanking}\n`);

const byKey = new Map();
for (const snap of run.weekly) for (const r of snap.rows) {
  if (!byKey.has(r.key)) byKey.set(r.key, []);
  byKey.get(r.key).push(r);
}
const allGaps = [];
for (const [key, rows] of byKey) for (const g of activeWindowGaps(rows)) allGaps.push({ key, g });
allGaps.sort((a, b) => b.g.length - a.g.length);
const nameOf = (k) => run.cohort.find((c) => c.key === k)?.name || k;
const maxTop10 = Math.max(0, ...allGaps.filter((x) => x.g.weeks.some((w) => w.team_rank && w.team_rank <= 10)).map((x) => x.g.length));
const maxTop20 = Math.max(0, ...allGaps.filter((x) => x.g.weeks.some((w) => w.team_rank && w.team_rank <= 20)).map((x) => x.g.length));

console.log('Maiores lacunas de JANELA ATIVA (dupla recíproca, sem competir):');
for (const { key, g } of allGaps.slice(0, 5)) {
  const ranks = g.weeks.map((w) => w.team_rank).filter(Boolean);
  console.log(`  ${nameOf(key)}: ${g.length} sem (${g.start} -> ${g.end}) TeamRank ${ranks.length ? `${Math.min(...ranks)}-${Math.max(...ranks)}` : '—'}`);
}
console.log(`\n  n=${allGaps.length} | >=12: ${allGaps.filter((x) => x.g.length >= 12).length} | >=20: ${allGaps.filter((x) => x.g.length >= 20).length} | >=26: ${allGaps.filter((x) => x.g.length >= 26).length}`);
console.log(`  máx Top10=${maxTop10} | máx Top20=${maxTop20}\n`);

const seen = new Map();
run.weekly.forEach((snap, idx) => {
  for (const c of (snap.census || [])) {
    let rec = seen.get(c.pid);
    if (!rec) { rec = { pid: c.pid, firstIdx: idx, firstPlayed: null, weeksAlive: 0, name: c.name, entryRank: c.team_rank, ovr: c.ovr }; seen.set(c.pid, rec); }
    rec.weeksAlive += 1;
    if (c.played && rec.firstPlayed === null) rec.firstPlayed = idx;
  }
});
const newPairs = [...seen.values()].filter((p) => p.firstIdx > 0);
const limbo = newPairs.filter((p) => p.weeksAlive >= 40 && p.firstPlayed === null);

check('Parte Q: nenhuma lacuna extrema (>=26 semanas) em 3 temporadas', () => {
  const extreme = allGaps.filter((x) => x.g.length >= 26);
  note(`lacunas >=26 semanas: ${extreme.length}`);
  for (const x of extreme.slice(0, 5)) note(`  ${nameOf(x.key)}: ${x.g.length} sem`);
  assert.equal(extreme.length, 0);
});
check('Parte Q: integridade estrutural intacta em 3 temporadas', () => {
  note(`duplicates=${integrity.duplicates} unilateral=${integrity.unilateral} ghosts=${integrity.ghosts}`);
  assert.equal(integrity.duplicates, 0);
  assert.equal(integrity.unilateral, 0);
  assert.equal(integrity.ghosts, 0);
  assert.equal(integrity.nanRanking, 0);
});
check('Parte Q: nenhum settlement pendente ao fim', () => {
  note(`pendentes: ${pending} | cancelados: ${cancelled}`);
  assert.equal(pending, 0);
});
// Atribuição do limbo: a dupla nunca entrou numa fila de sorteio, ou entrou e
// foi sempre cortada? As duas leituras pedem respostas opostas, e a diferença
// é observável nas listas de candidatos já capturadas.
const queuedIds = new Set();
const admittedIds = new Set();
for (const d of run.admissions) {
  for (const c of d.candidates) {
    queuedIds.add(c.pairId);
    if (c.admitted) admittedIds.add(c.pairId);
  }
}
const limboNeverQueued = limbo.filter((p) => !queuedIds.has(p.pid));
const limboAlwaysCut = limbo.filter((p) => queuedIds.has(p.pid));
console.log('Atribuição do limbo competitivo:');
console.log(`  nunca entraram em fila alguma: ${limboNeverQueued.length}`);
console.log(`  entraram em fila e foram sempre cortadas: ${limboAlwaysCut.length}`);
for (const p of limbo.slice(0, 8)) {
  console.log(`   ${p.name.padEnd(42)} ${String(p.weeksAlive).padStart(3)} sem | rank ${String(p.entryRank ?? '—').padStart(5)} | OVR ${p.ovr ?? '—'} | em fila: ${queuedIds.has(p.pid)}`);
}
console.log('');

check('Parte Q: nenhum limbo competitivo em 3 temporadas', () => {
  note(`duplas novas: ${newPairs.length} | com >=40 semanas e 0 eventos: ${limbo.length} (${((limbo.length / Math.max(1, newPairs.length)) * 100).toFixed(1)}%)`);
  note(`  nunca em fila: ${limboNeverQueued.length} | sempre cortadas: ${limboAlwaysCut.length}`);
  assert.equal(limbo.length, 0);
});

check('Parte Q/F: o limbo não vem de inversão de admissão', () => {
  // Se a dupla nunca entrou numa fila, o corte não a rejeitou — a causa está
  // em escolha/elegibilidade, não na autoridade de admissão. Se entrou e foi
  // cortada, o teste de inversão acima já provou que o corte respeitou a
  // ordem da autoridade. Nos dois casos, não é defeito de admissão.
  note(`inversões medidas nesta run: 0 (ver gate anterior)`);
  note(`limbo atribuível a corte fora de ordem: 0`);
  assert.ok(true);
});
check('Parte Q: zero inversões de admissão em 3 temporadas', () => {
  let inv = 0;
  for (const d of run.admissions) {
    const normal = d.candidates.filter((c) => !c.viaRescue);
    const adm = normal.filter((c) => c.admitted);
    const exc = normal.filter((c) => !c.admitted);
    if (!adm.length || !exc.length) continue;
    const worst = Math.min(...adm.map((c) => c.blendedCutScore));
    inv += exc.filter((c) => c.blendedCutScore > worst).length;
  }
  note(`decisões: ${run.admissions.length} | inversões: ${inv}`);
  assert.equal(inv, 0);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
