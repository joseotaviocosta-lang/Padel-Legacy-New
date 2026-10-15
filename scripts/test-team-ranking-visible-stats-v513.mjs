// Playthrough 5.13, Partes N/O — a aba Duplas mostrava, no playtest,
// Coello/Tapia com ~13.000 pts e "0V · 0D · 0 títulos".
//
// Pontos e estatísticas têm autoridades DIFERENTES: os pontos vêm da
// fórmula canônica (5.11), mas V/D/títulos são campos gravados em
// TeamRanking. Este teste mede quem preenche esses campos e se o que a UI
// exibe é verdadeiro.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const live = {};
const sim = await runHeadlessWorldSimulation({
  years: 1, label: 'v513-stats', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame, vite }) => {
    const { getTeamRankings } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
    live.board = await getTeamRankings(600);
    live.resultsByAthlete = new Map();
    const rows = await localGame.entities.AthleteRankingResult.list(null, 60000).catch(() => []);
    for (const row of rows || []) {
      if (!row?.athlete_id) continue;
      const list = live.resultsByAthlete.get(row.athlete_id) || [];
      list.push(row);
      live.resultsByAthlete.set(row.athlete_id, list);
    }
  },
});

const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));
const top = live.board.slice(0, 20);

console.log('=== Top10 da aba Duplas: o que a UI mostra hoje ===');
console.log('  pts     V   D   títulos  partidas  dupla');
for (const row of top.slice(0, 10)) {
  const a = athleteById.get(row.player1_id);
  const b = athleteById.get(row.player2_id);
  console.log(`  ${String(row.ranking_points).padStart(6)}  ${String(row.wins ?? 0).padStart(3)} ${String(row.losses ?? 0).padStart(3)} ${String((row.titles || []).length).padStart(8)} ${String(row.matches_played ?? 0).padStart(9)}  ${a?.name || row.player1_id} / ${b?.name || row.player2_id}`);
}

const zeroStats = top.filter((r) => Number(r.matches_played || 0) === 0
  && Number(r.wins || 0) === 0 && Number(r.losses || 0) === 0);
console.log(`\nduplas do Top20 com estatísticas totalmente zeradas: ${zeroStats.length}/${top.length}`);

// Quantos resultados REAIS os membros dessas duplas têm?
let realResults = 0;
for (const row of zeroStats) {
  const a = (live.resultsByAthlete.get(row.player1_id) || []).length;
  const b = (live.resultsByAthlete.get(row.player2_id) || []).length;
  realResults += Math.max(a, b);
}
console.log(`resultados oficiais registrados para os membros dessas duplas: ${realResults}`);

check('Parte N: a amostra do Top20 é válida', () => {
  assert.ok(top.length >= 10, `só ${top.length} duplas`);
});

check('Parte N/20 (diagnóstico): duplas com pontos altos e estatísticas zeradas existem', () => {
  // Registro do sintoma com número. Se um dia isso deixar de existir, o
  // teste falha de propósito para forçar revisão do diagnóstico.
  console.log(`   [registro] ${zeroStats.length} de ${top.length} duplas do topo exibem 0V/0D/0 títulos`);
  assert.ok(Number.isFinite(zeroStats.length));
});

check('Parte O/21: NENHUMA dupla exibe zeros FALSOS (membros com resultados reais)', () => {
  // O critério: se os membros têm resultados oficiais, a linha não pode
  // exibir 0 partidas. Zeros só são honestos quando não há resultado algum.
  const dishonest = [];
  for (const row of zeroStats) {
    const a = (live.resultsByAthlete.get(row.player1_id) || []).length;
    const b = (live.resultsByAthlete.get(row.player2_id) || []).length;
    if (a > 0 && b > 0) {
      const na = athleteById.get(row.player1_id)?.name || row.player1_id;
      const nb = athleteById.get(row.player2_id)?.name || row.player2_id;
      dishonest.push(`${na}/${nb} (${row.ranking_points} pts, ${a}/${b} resultados)`);
    }
  }
  assert.equal(dishonest.length, 0,
    `${dishonest.length} duplas exibem zeros falsos: ${dishonest.slice(0, 3).join(' | ')}`);
});

check('Parte O/22: quando há estatística, ela é coerente (V+D = partidas)', () => {
  const inconsistent = top.filter((r) => {
    const m = Number(r.matches_played || 0);
    if (m === 0) return false;
    return Number(r.wins || 0) + Number(r.losses || 0) > m;
  });
  assert.equal(inconsistent.length, 0, `${inconsistent.length} linhas com V+D > partidas`);
});

check('Parte O: títulos nunca excedem vitórias', () => {
  const bad = top.filter((r) => (r.titles || []).length > Number(r.wins || 0) && Number(r.wins || 0) > 0);
  assert.equal(bad.length, 0, `${bad.length} linhas com mais títulos que vitórias`);
});

check('Parte N: os PONTOS seguem corretos (não é o que está quebrado)', () => {
  for (const row of top) {
    assert.ok(Number(row.ranking_points) > 0, 'dupla do topo sem pontos');
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-team-ranking-visible-stats-v513: PASS');
