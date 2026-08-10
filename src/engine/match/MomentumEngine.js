export class MomentumEngine {
  update(teams, winner, loser, context = {}) {
    teams[winner].forEach((player) => {
      player.confidence = Math.min(88, player.confidence + (context.breakPoint ? 0.7 : 0.18));
    });
    teams[loser].forEach((player) => {
      player.confidence = Math.max(32, player.confidence - (context.breakPoint ? 0.55 : 0.15));
    });
  }
}
