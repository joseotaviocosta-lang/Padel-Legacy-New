import { DecisionEngine } from './DecisionEngine.js';
import { PositionEngine } from './PositionEngine.js';
import { FatigueEngine } from './FatigueEngine.js';
import { recordShot, recordPoint } from './StatisticsEngine.js';

export class RallyEngine {
  constructor({ decision = new DecisionEngine(), position = new PositionEngine(), fatigue = new FatigueEngine() } = {}) {
    this.decision = decision;
    this.position = position;
    this.fatigue = fatigue;
  }

  play({ teams, servingTeam, tactic, random, stats }) {
    let activeTeam = servingTeam;
    let playerIndex = Math.floor(random.next() * teams[activeTeam].length);
    let pressure = 20;
    let shot = 'serve';
    let lastPlayer = teams[activeTeam][playerIndex];

    for (let rallyLength = 1; rallyLength <= 60; rallyLength += 1) {
      const player = teams[activeTeam][playerIndex % teams[activeTeam].length];
      lastPlayer = player;
      if (rallyLength > 1) shot = this.decision.choose({ player, pressure, tactic: activeTeam === 'A' ? tactic : null, random });
      recordShot(stats, player, shot);
      this.fatigue.consume(player, shot, rallyLength);

      const skill = this.skill(player, shot);
      const confidence = (player.confidence - 50) * 0.14;
      const energyPenalty = (100 - player.energy) * 0.12;
      const risk = this.risk(shot, tactic, activeTeam === 'A');
      const execution = skill + confidence - energyPenalty - risk + (random.next() - 0.5) * 28;
      const difficulty = 38 + pressure * 0.28 + rallyLength * 0.18;

      if (execution < difficulty) {
        const winner = activeTeam === 'A' ? 'B' : 'A';
        recordPoint(stats, winner, player, 'error', rallyLength, teams);
        return { winner, finisher: player, shot, result: 'error', rallyLength };
      }

      const winnerChance = Math.max(0.025, Math.min(0.42, (execution - difficulty) / 85 + this.winnerBonus(shot)));
      if (random.next() < winnerChance) {
        recordPoint(stats, activeTeam, player, 'winner', rallyLength, teams);
        return { winner: activeTeam, finisher: player, shot, result: 'winner', rallyLength };
      }

      const movement = this.position.afterShot(player, shot);
      const otherTeam = activeTeam === 'A' ? 'B' : 'A';
      this.position.applyOpponentZone(teams[otherTeam], movement.opponentZone);
      activeTeam = otherTeam;
      playerIndex += 1;
      pressure = Math.min(100, pressure + (['smash', 'volley', 'chiquita'].includes(shot) ? 10 : 4));
    }

    const winner = activeTeam === 'A' ? 'B' : 'A';
    recordPoint(stats, winner, lastPlayer, 'error', 60, teams);
    return { winner, finisher: lastPlayer, shot, result: 'error', rallyLength: 60 };
  }

  skill(player, shot) {
    const map = {
      serve: player.attributes.serve, drive: player.attributes.forehand, backhand: player.attributes.backhand,
      lob: (player.attributes.defense + player.attributes.strategy) / 2, volley: player.attributes.volley,
      bandeja: player.attributes.bandeja, smash: player.attributes.smash,
      chiquita: (player.attributes.forehand + player.attributes.strategy) / 2,
    };
    return map[shot] ?? player.overall;
  }

  risk(shot, tactic, isTeamA) {
    let risk = { serve: 4, drive: 8, backhand: 7, lob: 6, volley: 8, bandeja: 7, smash: 16, chiquita: 12 }[shot] || 8;
    if (isTeamA && tactic?.id === 'defensivo') risk -= 3;
    if (isTeamA && ['agressivo', 'potencia'].includes(tactic?.id)) risk += 3;
    return risk;
  }

  winnerBonus(shot) {
    return { smash: 0.14, volley: 0.08, drive: 0.05, chiquita: 0.04, bandeja: 0.03, serve: 0.035, lob: 0.015, backhand: 0.03 }[shot] || 0.03;
  }
}
