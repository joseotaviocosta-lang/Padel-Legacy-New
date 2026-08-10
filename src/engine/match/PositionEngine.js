export class PositionEngine {
  startPoint(teams, servingTeam, serverPlayerId) {
    Object.entries(teams).forEach(([teamId, players]) => {
      players.forEach((player) => {
        player.position.zone = teamId === servingTeam && player.id !== serverPlayerId ? 'net' : 'back';
        player.position.lane = player.side;
      });
    });
  }

  afterShot(player, shot) {
    if (['lob', 'chiquita'].includes(shot) && player.energy > 25) player.position.zone = 'net';
    if (['smash', 'volley', 'bandeja'].includes(shot)) player.position.zone = 'net';
    if (shot === 'lob') return { opponentZone: 'back' };
    if (shot === 'smash') return { opponentZone: 'back' };
    return { opponentZone: null };
  }

  applyOpponentZone(team, zone) {
    if (!zone) return;
    team.forEach((player) => { player.position.zone = zone; });
  }
}
