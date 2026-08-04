const COST = { drive: 0.45, backhand: 0.45, lob: 0.55, volley: 0.35, bandeja: 0.6, smash: 0.9, chiquita: 0.5, serve: 0.55 };

export class FatigueEngine {
  consume(player, shot, rallyLength, tactic) {
    const multiplier = 1 + Math.min(0.7, rallyLength / 30);
    player.energy = Math.max(0, player.energy - (COST[shot] || 0.45) * multiplier * Number(tactic?.energyModifier || 1));
  }

  recoverBetweenGames(teams) {
    Object.values(teams).flat().forEach((player) => {
      player.energy = Math.min(100, player.energy + 1.2);
    });
  }
}
