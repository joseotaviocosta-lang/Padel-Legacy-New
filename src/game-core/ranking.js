import { localGame } from '@/api/localGameClient.js';

export async function updateLocalTeamRanking(profile, partnerName, pointsGain, won) {
  const teamKey = [profile.sport_name || 'jogador', partnerName || 'parceiro']
    .map(v => String(v).toLowerCase().replace(/\s+/g, '-'))
    .sort().join('__');
  const existing = await localGame.entities.TeamRanking.filter({ team_key: teamKey });
  const current = existing?.[0];
  const data = {
    team_key: teamKey,
    player1_name: profile.sport_name || 'Jogador',
    player2_name: partnerName,
    rank_points: (Number(current?.rank_points) || 0) + pointsGain,
    wins: (Number(current?.wins) || 0) + (won ? 1 : 0),
    losses: (Number(current?.losses) || 0) + (won ? 0 : 1),
  };
  return current
    ? localGame.entities.TeamRanking.update(current.id, data)
    : localGame.entities.TeamRanking.create({ ...data, ranking_position: 999 });
}
