export class MomentumEngine {
  update(teams, winner, loser, context = {}) {
    teams[winner].forEach((player) => {
      player.confidence = Math.min(100, player.confidence + (context.breakPoint ? 2.2 : 0.6));
    });
    teams[loser].forEach((player) => {
      player.confidence = Math.max(0, player.confidence - (context.breakPoint ? 1.8 : 0.45));
    });
  }
}
