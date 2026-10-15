// Playthrough 5.22-G, Partes H/K — IDENTIDADE CANÔNICA da dupla ativa.
//
// Quando o template de parceiro é reconciliado com um AthleteProfile que já
// existia no mundo, o id do template difere do id materializado. A chave
// canônica tem de ser SEMPRE a do parceiro persistido (partner_bot_id), a
// mesma usada por materialização, getTeamRank e seeding — nunca o id de
// catálogo gravado em profile.partner_id por engano.
import assert from 'node:assert/strict';
import { loadTeamRankingModules, installEntityStore, check, finish } from './lib/v522eTeamRankingHarness.mjs';

const { vite, teamRanking, localGame } = await loadTeamRankingModules();
try {
  const store = installEntityStore(localGame, {
    PlayerProfile: [{ id: 'player-zezao', name: 'zezao', rank_points: 39, partner_id: 'player-real-tomas' }],
    AthleteProfile: [{ id: 'athlete-tomas-real', name: 'Tomás Benítez', world_ranking_points: 978 }],
    Partnership: [{ id: 'part-1', profile_id: 'player-zezao', status: 'ativa', partner_bot_id: 'athlete-tomas-real', athlete_b_id: 'athlete-tomas-real' }],
    TeamRanking: [],
  });

  const player = store.state.PlayerProfile[0];
  await teamRanking.ensurePlayerTeamRanking(player);
  const canonicalKey = teamRanking.teamKey('player-zezao', 'athlete-tomas-real');
  const templateKey = teamRanking.teamKey('player-zezao', 'player-real-tomas');
  const row = store.state.TeamRanking[0];
  const rankByMaterialized = await teamRanking.getTeamRank(player, { id: 'athlete-tomas-real' });
  const rankByTemplate = await teamRanking.getTeamRank(player, { id: 'player-real-tomas' });

  check('a chave da linha usa o id MATERIALIZADO do parceiro', () => {
    assert.equal(row.team_key, canonicalKey);
    assert.notEqual(row.team_key, templateKey);
  });

  check('getTeamRank pelo parceiro materializado encontra 1017', () => {
    assert.equal(rankByMaterialized.points, 1017);
    assert.equal(rankByMaterialized.unranked, false);
  });

  check('getTeamRank pelo id de template NÃO encontra a linha (chave distinta)', () => {
    assert.equal(rankByTemplate.points, 0);
    assert.equal(rankByTemplate.unranked, true);
  });

  check('não existe par unilateral/duplicado para a mesma parceria', () => {
    const keys = store.state.TeamRanking.map((r) => r.team_key);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(keys.length, 1);
  });

  console.log('   [registro] chave canônica:', canonicalKey);
} finally {
  await vite.close();
}
finish('test-player-team-ranking-active-pair-key-v522g');
