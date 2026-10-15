// Playthrough 5.11, Parte U — depois da troca para a fórmula canônica
// (autoridade vigente: SOMA A+B, 5.22-E), todas as superfícies precisam continuar mostrando os
// MESMOS pontos e a MESMA posição para a dupla do jogador, e os pontos
// exibidos precisam ser exatamente o que o helper canônico produz.
//
// Herda as garantias de identidade da 5.10 (nenhum par irresolvível,
// nenhuma identidade `ranking-bot` exposta).
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';
import { computeCanonicalTeamRankingPoints as canonical } from './lib/teamFormulaModels.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const BOT_RE = /ranking-bot-\d+/;
const live = {};

await runHeadlessWorldSimulation({
  years: 1, label: 'ui511', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame, profile, vite }) => {
    const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
    const { getTeamRankings, getTeamRank, teamKey } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

    const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 5000);
    // Parceiro de nível médio, para o jogador ter uma posição não-trivial.
    const partner = athletes[Math.floor(athletes.length / 2)] || athletes[0];
    const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
    const tournament = tournaments.find((t) => t.tier === 'Silver') || tournaments[0];
    await finalizeTournamentRun({ profile, tournament, partner, roundsWon: 2, totalRounds: 3 });

    // A aba Duplas EXIBE as primeiras 600 linhas; a autoridade de posição
    // (getTeamRank) enxerga a população inteira. São coisas diferentes:
    // compara-se a posição sobre a mesma base, e o recorte de exibição é
    // verificado à parte.
    const board = await getTeamRankings(600);
    const fullBoard = await getTeamRankings(5000);
    const freshProfile = await localGame.entities.PlayerProfile.get(profile.id);
    const key = teamKey(profile.id, partner.id);
    live.fullBoard = fullBoard;
    live.fullPosition = fullBoard.find((r) => r.team_key === key)?.ranking_display_position ?? null;
    live.fullRow = fullBoard.find((r) => r.team_key === key) || null;
    live.displayedCount = board.length;

    live.board = board;
    live.athleteIds = new Set(athletes.map((a) => a.id));
    live.athletePoints = new Map(athletes.map((a) => [a.id, Math.max(0, Number(a.world_ranking_points) || 0)]));
    live.playerKey = key;
    // A posição que a UI realmente renderiza (Ranking.jsx usa
    // `ranking_display_position`), não o índice cru do array.
    live.boardRowIndex = board.findIndex((r) => r.team_key === key) + 1 || null;
    live.boardPosition = board.find((r) => r.team_key === key)?.ranking_display_position ?? null;
    live.myPairWidget = await getTeamRank(freshProfile, partner);
    live.boardRow = board.find((r) => r.team_key === key) || null;
    live.playerProfileId = profile.id;
  },
});

console.log('=== Parte U: consistência entre superfícies ===');
console.log(`  posição na aba Duplas (getTeamRankings) .. #${live.boardPosition}`);
console.log(`  posição em "Minha Dupla" (getTeamRank) ... #${live.myPairWidget?.rank}`);
console.log(`  pontos na aba Duplas .................... ${live.boardRow?.ranking_points}`);
console.log(`  pontos em "Minha Dupla" ................. ${live.myPairWidget?.points}`);
console.log(`  linhas exibíveis ........................ ${live.board.length}`);

check('Parte V: nenhuma linha da fonte da UI expõe identidade `ranking-bot-NNNN`', () => {
  const offenders = live.board.filter((r) => BOT_RE.test(String(r.player1_id))
    || BOT_RE.test(String(r.player2_id)) || BOT_RE.test(String(r.team_key))
    || BOT_RE.test(String(r.player1_name)) || BOT_RE.test(String(r.player2_name)));
  assert.equal(offenders.length, 0, `${offenders.length} linhas com identidade de bot na UI`);
});

check('Parte V: todo par exibido resolve os DOIS membros (ou é a dupla do jogador)', () => {
  const unresolved = live.board.filter((r) => {
    if (r.team_key === live.playerKey) return false; // membro = PlayerProfile
    return !live.athleteIds.has(r.player1_id) || !live.athleteIds.has(r.player2_id);
  });
  assert.equal(unresolved.length, 0, `${unresolved.length} pares irresolvíveis exibíveis`);
});

check('Parte V: toda linha exibida tem nome para os dois membros', () => {
  const nameless = live.board.filter((r) => !r.player1_name || !r.player2_name);
  assert.equal(nameless.length, 0, `${nameless.length} linhas sem nome de membro`);
});

check('Parte U: a posição da dupla do jogador é a MESMA nas duas autoridades', () => {
  assert.ok(live.fullPosition, 'dupla do jogador não aparece nem na tabela completa');
  assert.equal(live.myPairWidget.rank, live.fullPosition,
    `tabela completa #${live.fullPosition} != Minha Dupla #${live.myPairWidget.rank}`);
});

check('Parte U: os PONTOS batem entre as duas superfícies', () => {
  assert.equal(Number(live.myPairWidget.points), Number(live.fullRow.ranking_points));
});

check('Parte U: quando a dupla ESTÁ dentro do recorte exibido, as posições coincidem', () => {
  if (!live.boardPosition) {
    console.log(`   [registro] dupla em #${live.fullPosition}, fora das ${live.displayedCount} linhas exibidas — recorte de exibição, não "sem ranking"`);
    return;
  }
  assert.equal(live.boardPosition, live.fullPosition,
    `aba Duplas #${live.boardPosition} != tabela completa #${live.fullPosition}`);
});

check('Parte U: a dupla do jogador não é reportada como "sem ranking" depois de um torneio real', () => {
  assert.equal(live.myPairWidget.unranked, false, 'dupla com torneio disputado ainda marcada unranked');
  assert.notEqual(live.myPairWidget.displayRank, '—');
});

check('Parte U: empates dividem a MESMA posição (ranking de competição padrão)', () => {
  for (let i = 1; i < live.board.length; i += 1) {
    const prev = live.board[i - 1];
    const cur = live.board[i];
    if (Number(prev.ranking_points) === Number(cur.ranking_points)) {
      assert.equal(cur.ranking_display_position, prev.ranking_display_position,
        `empate em ${cur.ranking_points} pts com posições diferentes`);
    } else {
      assert.equal(cur.ranking_display_position, i + 1,
        `após empate a posição precisa pular para ${i + 1}`);
    }
  }
});

check('Parte U/V: os pontos exibidos são exatamente os do helper canônico', () => {
  let checked = 0;
  for (const row of live.board) {
    const a = live.athletePoints.get(row.player1_id);
    const b = live.athletePoints.get(row.player2_id);
    if (a === undefined || b === undefined) continue;
    assert.equal(Number(row.ranking_points), canonical(a, b),
      `${row.player1_name} & ${row.player2_name}: exibido ${row.ranking_points}`);
    checked += 1;
  }
  console.log(`   [registro] linhas verificadas contra o helper: ${checked}`);
  assert.ok(checked > 100, `só ${checked} linhas comparáveis`);
});

check('a aba Duplas está ordenada por pontos (o que a UI numera como #1, #2, ...)', () => {
  for (let i = 1; i < live.board.length; i += 1) {
    const prev = Number(live.board[i - 1].ranking_points) || 0;
    const cur = Number(live.board[i].ranking_points) || 0;
    assert.ok(cur <= prev, `fora de ordem em ${i}: ${prev} -> ${cur}`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-team-ranking-ui-consistency-v511: PASS');
