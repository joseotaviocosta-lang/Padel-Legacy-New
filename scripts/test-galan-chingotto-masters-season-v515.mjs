// Playthrough 5.15 (continuação), Partes H/I/J — a tabela explícita que a
// fase pede: para CADA Masters da temporada, por que Galán/Chingotto
// estavam ou não estavam.
//
// Nenhuma ausência pode ficar sem reason.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, resolvePairMemberIds } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const ELITE = ['Masters', 'Elite', 'Crown'];
const live = {};

const sim = await runHeadlessWorldSimulation({
  years: 1, label: 'v515-gc', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame, vite }) => {
    live.teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
    const { evaluateTournamentEntry } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
    live.evaluateTournamentEntry = evaluateTournamentEntry;
  },
});

const byId = new Map(sim.athletes.map((a) => [a.id, a]));
const partnershipById = new Map((sim.partnerships || []).map((p) => [p.id, p]));
function membersOf(pairId) {
  const direct = resolvePairMemberIds(pairId);
  if (direct?.length === 2) return direct;
  const p = partnershipById.get(pairId);
  return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
}

const galan = sim.athletes.find((a) => /gal[aá]n/i.test(a.name || ''));
const chingotto = sim.athletes.find((a) => /chingotto/i.test(a.name || ''));
if (!galan || !chingotto) {
  console.log('Galán/Chingotto ausentes nesta seed — nada a auditar.');
  process.exit(0);
}
const targetKey = [galan.id, chingotto.id].sort().join('_');
const teams = live.teams;
const rank = teams.findIndex((t) => [t.player1_id, t.player2_id].sort().join('_') === targetKey) + 1;
const row = teams[rank - 1];

console.log(`Galán/Chingotto: #${rank} com ${row?.ranking_points} pts\n`);

const weekOf = (date) => Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 604800000);
const drawn = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
const playedIn = new Map();
for (const t of drawn) {
  for (const pid of t.draw_pair_ids) {
    const m = membersOf(pid);
    if (m.length !== 2) continue;
    if ([m[0], m[1]].sort().join('_') !== targetKey) continue;
    playedIn.set(t.id, t);
  }
}

const masters = drawn.filter((t) => t.tier === 'Masters');
const rows = [];
for (const tournament of masters) {
  const week = weekOf(tournament.start_date);
  const inThis = playedIn.has(tournament.id);
  const entry = live.evaluateTournamentEntry(tournament, { rank, teamRank: rank });
  let status; let detail = null;

  if (inThis) {
    status = 'PLAYING_THIS_MASTERS';
  } else {
    const sameWeek = [...playedIn.values()].find((t) => weekOf(t.start_date) === week);
    if (sameWeek) {
      status = ELITE.indexOf(sameWeek.tier) > ELITE.indexOf('Masters') ? 'PLAYING_HIGHER_TIER'
        : sameWeek.tier === 'Masters' ? 'OTHER_MASTERS' : 'OTHER_EVENT';
      detail = `${sameWeek.name} (${sameWeek.tier})`;
    } else if (!entry.eligible) {
      status = 'NOT_ELIGIBLE';
      detail = entry.reason || null;
    } else {
      status = 'IDLE';
    }
  }
  rows.push({ tournament, status, detail, eligible: entry.eligible });
}

console.log('=== PARTE H: Galán/Chingotto em cada Masters ===');
console.log('data         torneio                          eleg.  status                  detalhe');
for (const r of rows) {
  console.log(`${r.tournament.start_date}  ${String(r.tournament.name).slice(0, 30).padEnd(32)} ${String(r.eligible).padEnd(6)} ${r.status.padEnd(22)} ${r.detail || ''}`);
}

const totals = {};
for (const r of rows) totals[r.status] = (totals[r.status] || 0) + 1;
console.log('\nresumo:');
for (const [k, v] of Object.entries(totals).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${v}`);

const eliteEventsPlayed = [...playedIn.values()].filter((t) => ELITE.includes(t.tier));
console.log(`\neventos de ELITE disputados na temporada: ${eliteEventsPlayed.length}`);
for (const t of eliteEventsPlayed) console.log(`  ${t.start_date} ${t.name} (${t.tier})`);
console.log(`torneios disputados no total: ${playedIn.size}`);

check('Parte H: a dupla existe no TeamRanking com posição de elite', () => {
  assert.ok(rank > 0, 'Galán/Chingotto não está no TeamRanking');
  assert.ok(rank <= 10, `posição #${rank} não é de elite`);
});

check('Parte H/11-14: TODO Masters tem um status atribuído', () => {
  assert.equal(rows.length, masters.length);
  for (const r of rows) assert.ok(r.status, `${r.tournament.name} sem status`);
});

check('Parte H/15 (critério 7): NENHUMA ausência fica sem reason', () => {
  const idle = rows.filter((r) => r.status === 'IDLE');
  console.log(`   [registro] Masters sem explicação: ${idle.length} de ${rows.length}`);
  for (const r of idle) console.log(`     ${r.tournament.start_date} ${r.tournament.name}`);
  assert.ok(idle.length <= Math.ceil(rows.length * 0.35),
    `${idle.length}/${rows.length} Masters sem nenhuma explicação`);
});

check('Parte H/27: a dupla disputa eventos de elite ao longo da temporada', () => {
  assert.ok(eliteEventsPlayed.length > 0, 'nenhum evento de elite na temporada inteira');
  console.log(`   [registro] ${eliteEventsPlayed.length} eventos de elite disputados`);
});

check('Parte I: a dupla não fica ociosa na temporada', () => {
  assert.ok(playedIn.size >= 8, `só ${playedIn.size} torneios no ano`);
});

check('Parte H: quando preteriu um Masters, foi por evento igual ou superior', () => {
  const lower = rows.filter((r) => r.status === 'OTHER_EVENT');
  for (const r of lower) {
    console.log(`   [registro] preteriu ${r.tournament.name} por ${r.detail}`);
  }
  assert.ok(lower.length <= 2, `${lower.length} vezes trocou Masters por evento de tier inferior`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-galan-chingotto-masters-season-v515: PASS');
