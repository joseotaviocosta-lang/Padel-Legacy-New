import { DecisionEngine } from './DecisionEngine.js';
import { PositionEngine } from './PositionEngine.js';
import { FatigueEngine } from './FatigueEngine.js';
import { RallyMemory } from './RallyMemory.js';
import { createDecisionContext } from './DecisionContext.js';
import { recordShot, recordPoint, recordCoordination } from './StatisticsEngine.js';
import { TeamCoordinationEngine } from './TeamCoordinationEngine.js';

export class RallyEngine {
  constructor({ decision = new DecisionEngine(), position = new PositionEngine(), fatigue = new FatigueEngine(), coordination = new TeamCoordinationEngine() } = {}) {
    this.decision = decision;
    this.position = position;
    this.fatigue = fatigue;
    this.coordination = coordination;
  }

  play({ teams, servingTeam, serverPlayerId, tactics, tactic, random, stats, match = {} }) {
    let activeTeam = servingTeam;
    let playerIndex = Math.max(0, teams[activeTeam].findIndex(player => player.id === serverPlayerId));
    let pressure = 20;
    let shot = 'serve';
    let lastPlayer = teams[activeTeam][playerIndex];
    const memory = new RallyMemory();
    const decisionTrace = [];
    const coordinationEvents = [];
    this.coordination.resetPoint(teams);

    for (let rallyLength = 1; rallyLength <= 60; rallyLength += 1) {
      const player = teams[activeTeam][playerIndex % teams[activeTeam].length];
      lastPlayer = player;
      let reasons = ['início do ponto'];
      if (rallyLength > 1) {
        const context = createDecisionContext({ player, teams, activeTeam, pressure, match, memory });
        const activeTactic = tactics?.[activeTeam] || (activeTeam === 'A' ? tactic : null);
        const decision = this.decision.chooseDetailed({
          player,
          pressure,
          tactic: activeTactic,
          random,
          context,
        });
        shot = decision.shot;
        reasons = decision.reasons;
        decisionTrace.push({
          rallyLength,
          team: activeTeam,
          playerId: player.id,
          shot,
          reasons: reasons.slice(0, 4),
          context: {
            importantPoint: context.importantPoint,
            partnerTired: context.partnerTired,
            opponentAtNet: context.opponentAtNet,
            tiredOpponentEnergy: context.tiredOpponentEnergy,
          },
        });
      }

      const pointCoordination = this.coordination.coordinate({ teams, activeTeam, player, shot, rallyLength });
      pointCoordination.forEach((event) => {
        coordinationEvents.push({ rallyLength, ...event });
        recordCoordination(stats, event);
      });

      const finishingZone = player.position.zone;
      recordShot(stats, player, shot);
      const activeTactic = tactics?.[activeTeam] || (activeTeam === 'A' ? tactic : null);
      this.fatigue.consume(player, shot, rallyLength, activeTactic);

      const rawSkill = this.skill(player, shot);
      // Match outcomes compound point-level differences through games and sets;
      // use a calibrated rating slope so a small OVR gap is meaningful without
      // becoming near-certain over a full best-of-three match.
      const skill = 50 + (rawSkill - 50) * 0.2;
      const confidence = (player.confidence - 50) * 0.14;
      const energyPenalty = (100 - player.energy) * 0.12;
      const risk = this.risk(shot, activeTactic, true, player, match);
      const execution = skill + confidence - energyPenalty - risk + (random.next() - 0.5) * 28;
      const difficulty = 38 + pressure * 0.28 + rallyLength * 0.18;
      if (![rawSkill, skill, confidence, energyPenalty, risk, execution, difficulty].every(Number.isFinite)) {
        throw new Error(`Probabilidade de rally inválida no golpe ${shot} do jogador ${player.id}.`);
      }

      const receivingTeam = activeTeam === 'A' ? 'B' : 'A';
      const targetPlayer = teams[receivingTeam][(playerIndex + 1) % teams[receivingTeam].length];
      memory.record({ team: activeTeam, playerId: player.id, targetPlayerId: targetPlayer?.id || null, shot, pressure, execution, difficulty, zone: player.position.zone });

      if (execution < difficulty) {
        // No padel, duplas faltas são extremamente raras. Um atributo de saque
        // baixo deve produzir um saque pouco agressivo, não games inteiros
        // entregues por erros diretos. A primeira execução fraca é tratada como
        // segundo saque seguro e o rally continua.
        if (shot === 'serve' && rallyLength === 1) {
          const fatigueFactor = Math.max(0, (100 - Number(player.energy || 100)) / 100);
          const doubleFaultChance = Math.min(0.001, 0.0001 + fatigueFactor * 0.0004);
          if (random.next() >= doubleFaultChance) {
            const movement = this.position.afterShot(player, 'serve');
            const otherTeam = activeTeam === 'A' ? 'B' : 'A';
            this.position.applyOpponentZone(teams[otherTeam], movement.opponentZone);
            activeTeam = otherTeam;
            playerIndex += 1;
            pressure = 16;
            continue;
          }
        }

        const winner = activeTeam === 'A' ? 'B' : 'A';
        const forcedError = this.isForcedError({ pressure, execution, difficulty, rallyLength, memory });
        recordPoint(stats, winner, player, 'error', rallyLength, teams, {
          shot,
          zone: finishingZone,
          servingTeam,
          match,
          forcedError,
          pressure,
          execution,
          difficulty,
        });
        return {
          winner, winnerTeamId: winner, loserTeamId: activeTeam,
          finisher: player,
          shot,
          result: 'error',
          forcedError,
          rallyLength,
          pressure,
          execution,
          difficulty,
          match,
          decisionTrace,
          rallyMemory: memory.events,
          coordinationEvents,
        };
      }

      const winnerChance = Math.max(0.025, Math.min(0.42, (execution - difficulty) / 85 + this.winnerBonus(shot)));
      if (random.next() < winnerChance) {
        recordPoint(stats, activeTeam, player, 'winner', rallyLength, teams, {
          shot,
          zone: finishingZone,
          servingTeam,
          match,
          forcedError: false,
          pressure,
          execution,
          difficulty,
        });
        return {
          winner: activeTeam, winnerTeamId: activeTeam, loserTeamId: activeTeam === 'A' ? 'B' : 'A',
          finisher: player,
          shot,
          result: 'winner',
          forcedError: false,
          rallyLength,
          pressure,
          execution,
          difficulty,
          match,
          decisionTrace,
          rallyMemory: memory.events,
          coordinationEvents,
        };
      }

      const movement = this.position.afterShot(player, shot);
      const otherTeam = activeTeam === 'A' ? 'B' : 'A';
      this.position.applyOpponentZone(teams[otherTeam], movement.opponentZone);
      activeTeam = otherTeam;
      playerIndex += 1;
      pressure = Math.min(100, pressure + (['smash', 'volley', 'chiquita'].includes(shot) ? 10 : 4));
    }

    const winner = activeTeam === 'A' ? 'B' : 'A';
    recordPoint(stats, winner, lastPlayer, 'error', 60, teams, {
      shot,
      zone: lastPlayer.position.zone,
      servingTeam,
      match,
      forcedError: true,
      pressure: 100,
    });
    return {
      winner, winnerTeamId: winner, loserTeamId: activeTeam,
      finisher: lastPlayer,
      shot,
      result: 'error',
      forcedError: true,
      rallyLength: 60,
      pressure: 100,
      match,
      decisionTrace,
      rallyMemory: memory.events,
      coordinationEvents,
    };
  }

  isForcedError({ pressure, execution, difficulty, rallyLength, memory }) {
    const previous = memory.events[memory.events.length - 2];
    const previousAttack = previous && ['smash', 'volley', 'chiquita'].includes(previous.shot);
    const narrowFailure = difficulty - execution <= 8;
    return pressure >= 62 || rallyLength >= 12 || previousAttack || narrowFailure;
  }

  skill(player, shot) {
    const map = {
      serve: player.attributes.serve,
      drive: player.attributes.forehand,
      backhand: player.attributes.backhand,
      lob: (player.attributes.defense + player.attributes.strategy) / 2,
      volley: player.attributes.volley,
      bandeja: player.attributes.bandeja,
      smash: player.attributes.smash,
      chiquita: (player.attributes.forehand + player.attributes.strategy) / 2,
    };
    return map[shot] ?? player.overall;
  }

  risk(shot, tactic, isTeamA, player, match = {}) {
    let risk = { serve: 4, drive: 8, backhand: 7, lob: 6, volley: 8, bandeja: 7, smash: 16, chiquita: 12 }[shot] || 8;
    if (isTeamA) risk *= Number(tactic?.riskModifier || 1);
    if (match.importantPoint && ['smash', 'chiquita'].includes(shot)) {
      const composure = Number(player.behavior?.tendencies?.pressure_resistance ?? 50);
      risk += (50 - composure) / 12;
    }
    return risk;
  }

  winnerBonus(shot) {
    return { smash: 0.14, volley: 0.08, drive: 0.05, chiquita: 0.04, bandeja: 0.03, serve: 0.035, lob: 0.015, backhand: 0.03 }[shot] || 0.03;
  }
}
