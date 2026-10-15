// Playthrough 5.22-E, Partes Y/Z — "sem ranking" só quando a soma é
// realmente 0 (0 + 0). Qualquer soma > 0 tem posição na população, mesmo sem
// partidas jogadas.
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  installEntityStore(localGame, { TeamRanking: [] });
  const zero = { id: 'player-zero', name: 'Zero', rank_points: 0 };
  const zeroPartner = { id: 'athlete-zero', name: 'Zero Parceiro', world_ranking_points: 0 };
  const scorer = { id: 'player-scorer', name: 'Scorer', rank_points: 39 };
  const scorerPartner = { id: 'athlete-cero', name: 'Cero', world_ranking_points: 0 };

  const materializedZero = await teamRanking.materializeTeamRankingForPair(zero, zeroPartner);
  const zeroRank = await teamRanking.getTeamRank(zero, zeroPartner);
  await teamRanking.materializeTeamRankingForPair(scorer, scorerPartner);
  const scoredRank = await teamRanking.getTeamRank(scorer, scorerPartner);
  const board = await teamRanking.getTeamRankings(600);
  const scoredBoardRow = board.find((r) => r.team_key === teamRanking.teamKey(scorer.id, scorerPartner.id));
  const zeroBoardRow = board.find((r) => r.team_key === teamRanking.teamKey(zero.id, zeroPartner.id));

  check('0 + 0 materializa uma linha com 0 pontos', () => {
    assert.equal(materializedZero.points, 0);
  });

  check('0 + 0 aparece como sem ranking (Parte Y)', () => {
    assert.equal(zeroRank.unranked, true);
    assert.equal(zeroRank.rank, 0);
    assert.equal(zeroRank.points, 0);
  });

  check('A + B > 0 tem posição real mesmo com 0 partidas (Parte Y/Z)', () => {
    assert.equal(scoredRank.unranked, false);
    assert.ok(scoredRank.rank > 0, `rank = ${scoredRank.rank}`);
    assert.equal(scoredRank.points, 39);
  });

  check('a posição não é inventada: ordena pela soma no universo completo (Parte Z)', () => {
    assert.ok(scoredBoardRow.ranking_display_position < zeroBoardRow.ranking_display_position);
  });

  console.log('   [registro] 0+0 => Sem ranking; 39+0 => posição real');
} finally {
  await vite.close();
}
finish('test-team-ranking-zero-zero-unranked-v522e');
