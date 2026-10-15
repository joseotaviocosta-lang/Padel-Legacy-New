// Playthrough 5.22-F, Parte 7 — encerrar uma parceria REMOVE a linha ativa de
// TeamRanking (intencional), mas o histórico NÃO se perde: PartnershipLegacy
// preserva V/D/torneios/títulos. Gate:
//   - ranking ativo não mostra par encerrado;
//   - PartnershipLegacy preserva o histórico;
//   - nenhuma estatística é perdida.
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const partnershipSystem = await vite.ssrLoadModule('/src/lib/partnershipSystem.js');
  installEntityStore(localGame, { TeamRanking: [], PartnershipLegacy: [] });

  const A = { id: 'player-a', name: 'A', rank_points: 300 };
  const B = { id: 'athlete-b', name: 'B', world_ranking_points: 200 };
  await teamRanking.materializeTeamRankingForPair(A, B);

  const key = teamRanking.teamKey(A.id, B.id);
  const row = localGame.entities.TeamRanking;
  const stored = (await row.filter({ team_key: key }))[0];
  await row.update(stored.id, { matches_played: 7, wins: 5, losses: 2, titles: ['Masters de Teste'] });

  const partnership = {
    id: 'part-1',
    profile_id: A.id,
    athlete_a_id: A.id,
    athlete_b_id: B.id,
    athlete_a_name: 'A',
    athlete_b_name: 'B',
    shared_matches: 7,
    shared_wins: 5,
    shared_losses: 2,
    shared_tournaments: 3,
    shared_titles: 1,
    chemistry: 60,
    status: 'encerrada_jogador',
    end_reason: 'Nova parceria formada',
    started_career_date: '2026-01-01',
    ended_career_date: '2026-06-01',
  };

  const legacy = partnershipSystem.buildPartnershipLegacyRow(partnership, { profileId: A.id });
  await partnershipSystem.deleteTeamRankingForPair(A.id, B.id);

  const board = await teamRanking.getTeamRankings(600);
  const rank = await teamRanking.getTeamRank(A, B);

  check('PartnershipLegacy preserva V/D/torneios/títulos', () => {
    assert.equal(legacy.shared_wins, 5);
    assert.equal(legacy.shared_losses, 2);
    assert.equal(legacy.shared_matches, 7);
    assert.equal(legacy.shared_tournaments, 3);
    assert.equal(legacy.shared_titles, 1);
  });

  check('a linha ativa do par encerrado foi removida', () => {
    assert.equal(board.filter((r) => r.team_key === key).length, 0, 'par encerrado ainda aparece no ranking ativo');
  });

  check('getTeamRank do par encerrado volta a "sem ranking"', () => {
    assert.equal(rank.unranked, true);
    assert.equal(rank.points, 0);
  });

  check('nenhuma estatística é perdida (histórico vive no legado)', () => {
    const totalShared = Number(legacy.shared_wins) + Number(legacy.shared_losses);
    assert.equal(totalShared, Number(legacy.shared_matches));
    assert.ok(Array.isArray(legacy.shared_titles) || typeof legacy.shared_titles === 'number');
  });

  console.log('   [registro] par ativo removido; histórico preservado no legado');
} finally {
  await vite.close();
}
finish('test-team-ranking-old-pair-history-v522f');
