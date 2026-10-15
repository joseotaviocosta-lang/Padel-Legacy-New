// Playthrough 5.22-G, Partes A/E/I/S — REPRODUÇÃO DO BUG 39 + 978 = 0 e
// prova do reparo/materialização canônica.
//
// Cenário do playtest: parceria ativa, jogador com 39 pts de Circuito e
// parceiro com 978. A linha de TeamRanking estava ausente/0 e o card mostrava
// "0 pts · Sem ranking". `ensurePlayerTeamRanking` resolve a parceria ativa,
// lê os pontos atuais dos dois membros e grava A + B = 1.017.
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const store = installEntityStore(localGame, {
    PlayerProfile: [{ id: 'player-zezao', name: 'zezao', sport_name: 'zezao', rank_points: 39, career_date: '2026-03-01' }],
    AthleteProfile: [{ id: 'athlete-tomas', name: 'Tomás Benítez', sport_name: 'Tomás Benítez', world_ranking_points: 978, ranking_points: 978 }],
    Partnership: [{ id: 'part-1', profile_id: 'player-zezao', status: 'ativa', partner_bot_id: 'athlete-tomas', athlete_b_id: 'athlete-tomas' }],
    TeamRanking: [],
  });

  const player = store.state.PlayerProfile[0];
  const key = teamRanking.teamKey('player-zezao', 'athlete-tomas');

  // Estado ANTES: sem linha materializada, getTeamRank reporta 0/Sem ranking.
  const before = await teamRanking.getTeamRank(player, { id: 'athlete-tomas' });

  const result = await teamRanking.ensurePlayerTeamRanking(player);
  const row = store.state.TeamRanking.find((r) => r.team_key === key);
  const after = await teamRanking.getTeamRank(player, { id: 'athlete-tomas' });

  check('reprodução: sem materialização a dupla aparece com 0 pts / Sem ranking', () => {
    assert.equal(before.points, 0);
    assert.equal(before.unranked, true);
  });

  check('ensurePlayerTeamRanking grava 39 + 978 = 1017', () => {
    assert.ok(result, 'ensure não retornou linha');
    assert.equal(result.points, 1017);
    assert.equal(Number(row?.ranking_points), 1017);
  });

  check('canonical pair key é a mesma identidade ordenada', () => {
    assert.equal(row?.team_key, key);
    assert.equal(row?.player1_id, 'athlete-tomas');
    assert.equal(row?.player2_id, 'player-zezao');
  });

  check('após o reparo: total 1017, com posição real e sem "Sem ranking"', () => {
    assert.equal(after.points, 1017);
    assert.equal(after.unranked, false);
    assert.ok(after.rank > 0, `rank = ${after.rank}`);
    assert.notEqual(after.displayRank, '—');
  });

  check('histórico da parceria não é herdado (V/D/títulos zerados)', () => {
    assert.equal(row.matches_played, 0);
    assert.equal(row.wins, 0);
    assert.equal(row.losses, 0);
    assert.deepEqual(row.titles, []);
  });

  const again = await teamRanking.ensurePlayerTeamRanking(player);
  await localGame.entities.TeamRanking.update(row.id, { ranking_points: 0 });
  const repaired = await teamRanking.ensurePlayerTeamRanking(player);
  const repairedRow = store.state.TeamRanking.find((r) => r.id === row.id);

  check('idempotente: rodar de novo não duplica nem soma', () => {
    assert.equal(again.points, 1017);
    assert.equal(store.state.TeamRanking.filter((r) => r.team_key === key).length, 1);
  });

  check('linha existente em 0 é recalculada para 1017', () => {
    assert.equal(repaired.points, 1017);
    assert.equal(Number(repairedRow.ranking_points), 1017);
  });

  console.log('   [registro] 39 + 978 = 1017 · posição', after.rank);
} finally {
  await vite.close();
}
finish('test-player-team-ranking-materialization-v522g');
