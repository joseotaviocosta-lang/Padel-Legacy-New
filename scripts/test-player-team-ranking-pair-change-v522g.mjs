// Playthrough 5.22-G, Parte O — troca de parceiro:
//   A+B = 39 + 978 = 1017
//   A+C = 39 + 250 = 289
// A nova parceria materializa 289 imediatamente; a antiga sai do ranking
// ativo e o histórico permanece em PartnershipLegacy.
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const partnershipSystem = await vite.ssrLoadModule('/src/lib/partnershipSystem.js');
  const store = installEntityStore(localGame, {
    PlayerProfile: [{ id: 'player-zezao', name: 'zezao', rank_points: 39 }],
    AthleteProfile: [
      { id: 'athlete-tomas', name: 'Tomás Benítez', world_ranking_points: 978 },
      { id: 'athlete-carlos', name: 'Carlos', world_ranking_points: 250 },
    ],
    Partnership: [{ id: 'part-1', profile_id: 'player-zezao', status: 'ativa', partner_bot_id: 'athlete-tomas' }],
    TeamRanking: [],
  });
  const player = store.state.PlayerProfile[0];

  await teamRanking.ensurePlayerTeamRanking(player);
  const abKey = teamRanking.teamKey('player-zezao', 'athlete-tomas');
  const abRow = store.state.TeamRanking.find((r) => r.team_key === abKey);
  // Histórico real da primeira parceria.
  await localGame.entities.TeamRanking.update(abRow.id, { matches_played: 9, wins: 6, losses: 3, titles: ['Aberto'] });

  // Troca: encerra A+B (remove do ranking ativo) e ativa A+C.
  await partnershipSystem.deleteTeamRankingForPair('player-zezao', 'athlete-tomas');
  store.state.Partnership[0] = { ...store.state.Partnership[0], partner_bot_id: 'athlete-carlos', athlete_b_id: 'athlete-carlos' };
  await teamRanking.ensurePlayerTeamRanking(player);
  const acKey = teamRanking.teamKey('player-zezao', 'athlete-carlos');
  const acRow = store.state.TeamRanking.find((r) => r.team_key === acKey);

  check('A+B materializou 1017', () => {
    assert.equal(Number(abRow.ranking_points), 1017);
  });

  check('A+C materializa 289 imediatamente', () => {
    assert.equal(Number(acRow.ranking_points), 289);
  });

  check('a dupla antiga sai do ranking ativo', () => {
    assert.equal(store.state.TeamRanking.filter((r) => r.team_key === abKey).length, 0);
  });

  check('a nova dupla não herda V/D/títulos da antiga', () => {
    assert.equal(acRow.matches_played, 0);
    assert.equal(acRow.wins, 0);
    assert.equal(acRow.losses, 0);
    assert.deepEqual(acRow.titles, []);
  });

  check('histórico da antiga permanece no legado (PartnershipLegacy)', () => {
    const legacy = partnershipSystem.buildPartnershipLegacyRow({
      id: 'part-1', profile_id: 'player-zezao', athlete_a_id: 'player-zezao', athlete_b_id: 'athlete-tomas',
      shared_matches: 9, shared_wins: 6, shared_losses: 3, shared_titles: 1, status: 'encerrada_jogador',
    }, { profileId: 'player-zezao' });
    assert.equal(legacy.shared_wins, 6);
    assert.equal(legacy.shared_losses, 3);
    assert.equal(legacy.shared_titles, 1);
  });

  console.log('   [registro] A+B 1017 -> removida; A+C 289 materializada');
} finally {
  await vite.close();
}
finish('test-player-team-ranking-pair-change-v522g');
