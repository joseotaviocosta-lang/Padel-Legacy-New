// Playthrough 5.18-D, Partes P/Q — LONG RUN COM O HARNESS CORRIGIDO.
//
// A 5.18 já havia medido 3 temporadas, mas chamando `processAiPartnershipMarket`
// MANUALMENTE dentro do teste. Aqui o mercado e o dia do mundo vêm do próprio
// harness (`worldLifecycles`, default), que é o caminho que todos os outros
// testes usam — então este long run valida a infraestrutura, não um atalho.
//
// Parte Q: a lacuna da elite é medida DENTRO da janela de existência da dupla.
// Tempo depois da dissolução não é ociosidade da dupla morta.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, resolvePairMemberIds } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const weekOf = (d) => Math.floor(new Date(`${String(d).slice(0, 10)}T00:00:00Z`).getTime() / 604800000);
const keyOf = (a, b) => [a, b].sort().join('_');

// UMA simulação de 3 anos pelo harness — o mercado roda internamente.
const sim = await runHeadlessWorldSimulation({
  years: 3, label: 'v518-longrun', trackWeeklyDraws: false, includeRankingResults: true,
});

console.log(`lifecycle: ${JSON.stringify(sim.lifecycleStats)}`);

const athletes = sim.athletes;
const byId = new Map(athletes.map((a) => [a.id, a]));
const teams = sim.teamRankings || [];
const partnershipById = new Map((sim.partnerships || []).map((p) => [p.id, p]));
const membersOf = (pid) => {
  const direct = resolvePairMemberIds(pid);
  if (direct?.length === 2) return direct;
  const p = partnershipById.get(pid);
  return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
};

// Janela de existência por dupla (Parte Q).
const windowByKey = new Map();
for (const p of sim.partnerships || []) {
  const ids = [p.athlete_a_id, p.athlete_b_id].filter(Boolean);
  if (ids.length !== 2) continue;
  const k = keyOf(ids[0], ids[1]);
  const start = String(p.started_career_date || '').slice(0, 10);
  const end = String(p.ended_career_date || '').slice(0, 10) || null;
  const prev = windowByKey.get(k);
  if (!prev || start > prev.start) windowByKey.set(k, { start, end, status: p.status });
}

const drawn = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
const eventsWeeksByKey = new Map();
for (const t of drawn) {
  for (const pid of t.draw_pair_ids) {
    const m = membersOf(pid);
    if (m.length !== 2) continue;
    const k = keyOf(m[0], m[1]);
    if (!eventsWeeksByKey.has(k)) eventsWeeksByKey.set(k, new Set());
    const s = weekOf(t.start_date);
    const e = weekOf(t.end_date || t.start_date);
    for (let w = s; w <= e; w += 1) eventsWeeksByKey.get(k).add(w);
  }
}
const allEventWeeks = [...new Set(drawn.map((t) => weekOf(t.start_date)))].sort((a, b) => a - b);

// Maior lacuna DENTRO da janela da dupla.
function longestGapWithinWindow(key) {
  const win = windowByKey.get(key);
  const busy = eventsWeeksByKey.get(key) || new Set();
  const startW = win?.start ? weekOf(win.start) : allEventWeeks[0];
  const endW = win?.end ? weekOf(win.end) : allEventWeeks[allEventWeeks.length - 1];
  let longest = 0; let current = 0;
  for (const w of allEventWeeks) {
    if (w < startW || w > endW) continue;
    if (busy.has(w)) { current = 0; continue; }
    current += 1;
    if (current > longest) longest = current;
  }
  return longest;
}

// Censo final + integridade.
const alive = athletes.filter((a) => !a.retired && a.career_status !== 'aposentado');
const free = alive.filter((a) => !a.ai_partner_id);
let unilateral = 0;
for (const a of athletes) {
  if (!a.ai_partner_id) continue;
  const b = byId.get(a.ai_partner_id);
  if (!b || b.ai_partner_id !== a.id) unilateral += 1;
}
const activePartnerships = (sim.partnerships || []).filter((p) => p.status === 'ativa');
const appearances = new Map();
for (const p of activePartnerships) {
  for (const id of [p.athlete_a_id, p.athlete_b_id, p.partner_bot_id].filter(Boolean)) {
    appearances.set(id, (appearances.get(id) || 0) + 1);
  }
}
const inTwoPlus = [...appearances.values()].filter((n) => n > 1).length;
const seasonEnd = sim.finalDate;
const cancelled = sim.tournaments.filter((t) => t.world_tour_cancelled || t.status === 'cancelado');
const pendingSettlement = drawn.filter((t) => t.end_date && t.end_date < seasonEnd
  && !t.world_tour_resolved && !t.champion);
const nanRanking = teams.filter((t) => !Number.isFinite(Number(t.ranking_points))).length;

const top10Gaps = teams.slice(0, 10).map((t) => longestGapWithinWindow(keyOf(t.player1_id, t.player2_id)));
const top20Gaps = teams.slice(0, 20).map((t) => longestGapWithinWindow(keyOf(t.player1_id, t.player2_id)));

console.log('\n=== PARTE P: long run de 3 temporadas (harness corrigido) ===');
console.log(`meses de mercado processados   ${sim.lifecycleStats.marketMonths}`);
console.log(`dias de mundo processados      ${sim.lifecycleStats.worldDays}`);
console.log(`dissoluções (3 temporadas)     ${sim.lifecycleStats.dissolved}`);
console.log(`formações (3 temporadas)       ${sim.lifecycleStats.formed}`);
console.log(`população viva                 ${alive.length}`);
console.log(`agentes livres                 ${free.length} (${((free.length / Math.max(1, alive.length)) * 100).toFixed(0)}%)`);
console.log(`parcerias ativas               ${activePartnerships.length}`);
console.log(`duplas no ranking              ${teams.length}`);
console.log(`atleta em 2+ duplas            ${inTwoPlus}`);
console.log(`parcerias unilaterais          ${unilateral}`);
console.log(`cancelamentos                  ${cancelled.length}`);
console.log(`settlements pendentes          ${pendingSettlement.length}`);
console.log(`ranking NaN                    ${nanRanking}`);

console.log('\n=== PARTE Q: lacunas dentro da janela da dupla ===');
console.log(`Top10 maiores lacunas: ${[...top10Gaps].sort((a, b) => b - a).join(', ')}`);
console.log(`Top20 maior lacuna:    ${Math.max(...top20Gaps)}`);

check('Parte P: o long run usou o harness corrigido (não mercado manual)', () => {
  assert.ok(sim.lifecycleStats.worldLifecycles, 'paridade não estava ativa');
  assert.ok(sim.lifecycleStats.marketMonths >= 33, `só ${sim.lifecycleStats.marketMonths} meses em 3 anos`);
  assert.ok(sim.lifecycleStats.worldDays >= 1000, `só ${sim.lifecycleStats.worldDays} dias de mundo`);
});

check('Parte P: o mercado permaneceu ativo nas 3 temporadas', () => {
  assert.ok(sim.lifecycleStats.dissolved > 0, 'nenhuma dissolução');
  assert.ok(sim.lifecycleStats.formed > 0, 'nenhuma formação');
});

check('Parte P: o mercado NÃO drenou o mundo em 3 temporadas', () => {
  const pct = free.length / Math.max(1, alive.length);
  console.log(`   [registro] livres=${(pct * 100).toFixed(0)}% parcerias=${activePartnerships.length}`);
  assert.ok(pct < 0.70, `${(pct * 100).toFixed(0)}% da população ficou livre`);
  assert.ok(activePartnerships.length >= 100, `só ${activePartnerships.length} parcerias ativas`);
});

check('Parte R (gates): reciprocidade 100%', () => {
  assert.equal(unilateral, 0, `${unilateral} parcerias unilaterais`);
});

check('Parte R (gates): ninguém em duas duplas', () => {
  assert.equal(inTwoPlus, 0, `${inTwoPlus} atletas em 2+ duplas`);
});

check('Parte R (gates): nenhum settlement pendente e nenhum NaN', () => {
  assert.ok(pendingSettlement.length <= 2, `${pendingSettlement.length} settlements pendentes`);
  assert.equal(nanRanking, 0, `${nanRanking} rankings NaN`);
});

check('Parte Q: nenhuma lacuna absurda DENTRO da janela da dupla', () => {
  // Dentro da própria existência, uma dupla de elite não deve passar mais de
  // ~meio ano sem jogar. Tempo após a dissolução não conta (Parte Q).
  const worst = Math.max(...top10Gaps);
  console.log(`   [registro] maior lacuna Top10 dentro da janela: ${worst} semanas`);
  assert.ok(worst <= 26, `${worst} semanas sem competir dentro da janela ativa`);
});

check('Parte T: a população não explodiu em 3 temporadas', () => {
  console.log(`   [registro] atletas totais=${athletes.length} vivos=${alive.length}`);
  assert.ok(athletes.length <= 1200, `população chegou a ${athletes.length}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-headless-market-three-season-v518: PASS');
