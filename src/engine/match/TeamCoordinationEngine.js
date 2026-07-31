const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const average = (...values) => values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length);

function communicationScore(player, partner) {
  return clamp(average(
    player?.behavior?.axes?.teamwork ?? player?.personality?.teamwork ?? 50,
    partner?.behavior?.axes?.teamwork ?? partner?.personality?.teamwork ?? 50,
    player?.behavior?.axes?.tactical_intelligence ?? player?.personality?.tacticalIntelligence ?? 50,
    partner?.behavior?.axes?.tactical_intelligence ?? partner?.personality?.tacticalIntelligence ?? 50,
  ));
}

function chemistryScore(player, partner) {
  const explicit = average(
    player?.chemistry ?? player?.teamworkChemistry ?? 50,
    partner?.chemistry ?? partner?.teamworkChemistry ?? 50,
  );
  return clamp(average(explicit, communicationScore(player, partner)));
}

function findPartner(team, player) {
  return team.find((candidate) => candidate.id !== player.id) || null;
}

export class TeamCoordinationEngine {
  coordinate({ teams, activeTeam, player, shot, rallyLength = 1 }) {
    const team = teams[activeTeam] || [];
    const partner = findPartner(team, player);
    if (!partner) return [];

    const events = [];
    const communication = communicationScore(player, partner);
    const chemistry = chemistryScore(player, partner);
    const coordinated = communication + chemistry >= 105;
    const attackingShot = ['volley', 'bandeja', 'smash', 'chiquita'].includes(shot);
    const transitionShot = ['lob', 'chiquita', 'bandeja'].includes(shot);

    if (player.energy < 36 && partner.energy > player.energy + 8) {
      partner.position.lane = 'center';
      events.push(this.event('fatigue_cover', activeTeam, player, partner, communication, chemistry,
        `${partner.name} cobre o centro enquanto ${player.name} recupera energia.`));
    }

    if (transitionShot && player.energy > 25 && partner.energy > 25 && coordinated) {
      player.position.zone = 'net';
      partner.position.zone = 'net';
      partner.position.lane = partner.side;
      events.push(this.event('coordinated_advance', activeTeam, player, partner, communication, chemistry,
        `${player.name} e ${partner.name} avançam em bloco para recuperar a rede.`));
    } else if (attackingShot && player.position.zone === 'net' && partner.position.zone === 'back' && coordinated) {
      partner.position.zone = 'net';
      events.push(this.event('net_recovery', activeTeam, player, partner, communication, chemistry,
        `${partner.name} acompanha o ataque e fecha a rede com ${player.name}.`));
    }

    if (player.position.zone === partner.position.zone && player.position.lane === partner.position.lane) {
      if (coordinated) {
        partner.position.lane = player.side === 'left' ? 'right' : 'left';
        events.push(this.event('spacing_correction', activeTeam, player, partner, communication, chemistry,
          `${partner.name} ajusta a posição e evita conflito de espaço com ${player.name}.`));
      } else if (rallyLength > 2) {
        events.push(this.event('coordination_error', activeTeam, player, partner, communication, chemistry,
          `A falta de comunicação deixa ${player.name} e ${partner.name} na mesma zona.`));
      }
    }

    if (!events.length && attackingShot && coordinated) {
      partner.position.lane = 'center';
      events.push(this.event('center_cover', activeTeam, player, partner, communication, chemistry,
        `${partner.name} protege o centro enquanto ${player.name} assume o ataque.`));
    }

    return events;
  }

  resetPoint(teams) {
    Object.values(teams).flat().forEach((player) => {
      player.position.lane = player.side;
      if (!['net', 'back'].includes(player.position.zone)) player.position.zone = 'back';
    });
  }

  event(type, team, actor, partner, communication, chemistry, message) {
    const positive = type !== 'coordination_error';
    return {
      type,
      team,
      actorId: actor.id,
      partnerId: partner.id,
      communication: Math.round(communication * 10) / 10,
      chemistry: Math.round(chemistry * 10) / 10,
      quality: Math.round(clamp(average(communication, chemistry)) * 10) / 10,
      positive,
      message,
    };
  }
}

export { communicationScore, chemistryScore };
