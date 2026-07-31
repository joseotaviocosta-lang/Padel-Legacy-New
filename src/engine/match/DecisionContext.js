const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function createDecisionContext({ player, teams, activeTeam, pressure = 20, match = {}, memory }) {
  const opponentTeam = activeTeam === 'A' ? 'B' : 'A';
  const teammates = teams[activeTeam] || [];
  const opponents = teams[opponentTeam] || [];
  const partner = teammates.find((candidate) => candidate.id !== player.id) || teammates[0] || player;
  const tiredOpponent = opponents.reduce((current, candidate) => (
    !current || candidate.energy < current.energy ? candidate : current
  ), null);

  const teamPoints = activeTeam === 'A' ? match.pointsA : match.pointsB;
  const opponentPoints = activeTeam === 'A' ? match.pointsB : match.pointsA;
  const importantPoint = Boolean(match.inTiebreak || match.breakPoint || teamPoints >= 3 || opponentPoints >= 3);
  const leadingPoint = teamPoints > opponentPoints;
  const trailingPoint = opponentPoints > teamPoints;
  const confidenceGap = player.confidence - average(opponents.map((candidate) => candidate.confidence));
  const riskFreedom = leadingPoint ? 12 : trailingPoint ? -10 : 0;
  const pressureResistance = Number(player.behavior?.tendencies?.pressure_resistance ?? 50);
  const emotionalModifier = importantPoint ? (pressureResistance - 50) * 0.22 : 0;

  return {
    pressure: clamp(pressure),
    importantPoint,
    leadingPoint,
    trailingPoint,
    riskFreedom,
    emotionalModifier,
    confidenceGap,
    partnerTired: partner.energy < 42,
    partnerEnergy: partner.energy,
    tiredOpponentId: tiredOpponent?.id || null,
    tiredOpponentEnergy: tiredOpponent?.energy ?? 100,
    opponentAtNet: opponents.filter((candidate) => candidate.position.zone === 'net').length,
    teamAtNet: teammates.filter((candidate) => candidate.position.zone === 'net').length,
    memory: memory?.summary(activeTeam) || {},
    score: {
      pointsFor: teamPoints ?? 0,
      pointsAgainst: opponentPoints ?? 0,
      inTiebreak: Boolean(match.inTiebreak),
      breakPoint: Boolean(match.breakPoint),
    },
  };
}
