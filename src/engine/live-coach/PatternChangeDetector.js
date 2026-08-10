const confidence = (sample, persistence, threshold) => {
  const score = Math.min(1, (sample / threshold) * 0.45 + (persistence / Math.max(2, threshold / 2)) * 0.55);
  return { score: Math.round(score * 100) / 100, label: score >= 0.78 ? 'high' : score >= 0.52 ? 'medium' : 'low' };
};

export class PatternChangeDetector {
  detect(analytics, { teamId = 'A', coachLevel = 1, initialPlan, currentPoint }) {
    const window = analytics.window('last_2_games');
    if (window.length < Math.max(4, 7 - Math.min(3, coachLevel))) return [];
    const games = analytics.completedGames(3);
    const opponent = teamId === 'A' ? 'B' : 'A';
    const shots = window.flatMap((point) => point.shots);
    const opponentShots = shots.filter((shot) => shot.team === opponent);
    const teamShots = shots.filter((shot) => shot.team === teamId);
    const patterns = [];
    const add = (patternId, category, evidence, sample, persistence, adjustment, priority = 'recommendation') => {
      const calibrated = confidence(sample, persistence, coachLevel >= 3 ? 6 : 8);
      patterns.push({
        patternId, category, evidence, sampleSize: sample, persistence,
        confidence: calibrated.label, confidenceScore: calibrated.score,
        firstDetectedAt: `point-${Math.max(1, currentPoint - window.length + 1)}`,
        lastDetectedAt: `point-${currentPoint}`, adjustment, priority,
      });
    };

    const recentGamesLost = games.slice(-2).filter((game) => game.winnerTeamId === opponent).length;
    if (games.length >= 2 && recentGamesLost === 2) add('games_lost_streak', 'mental', 'A dupla perdeu os dois games mais recentes.', 2, 2, { tacticId: 'tatico', components: { safeWeight: 1.08, tacticalWeight: 1.12 } });
    const breaksSuffered = games.filter((game) => game.servingTeamId === teamId && game.winnerTeamId === opponent).length;
    if (breaksSuffered >= 2) add('breaks_suffered', 'plan', `${breaksSuffered} games de saque perdidos na amostra recente.`, games.length, breaksSuffered, { tacticId: 'defensivo', components: { safeWeight: 1.18, riskModifier: 0.9 } }, 'urgent');

    const targets = {};
    opponentShots.forEach((shot) => { if (shot.targetPlayerId) targets[shot.targetPlayerId] = (targets[shot.targetPlayerId] || 0) + 1; });
    const targeted = Object.entries(targets).sort((a, b) => b[1] - a[1])[0];
    if (targeted && targeted[1] >= 5 && targeted[1] / Math.max(1, opponentShots.length) >= 0.58) add('opponent_targeting_player', 'opponent', `${targeted[1]} de ${opponentShots.length} bolas foram dirigidas ao mesmo jogador.`, opponentShots.length, targeted[1], { tacticId: 'defensivo', components: { safeWeight: 1.15, tacticalWeight: 1.1 } });

    const opponentNetWins = window.filter((point) => point.winnerTeamId === opponent && point.winnerPosition === 'NET').length;
    if (opponentNetWins >= 4 && opponentNetWins / window.length >= 0.35) add('opponent_net_dominance', 'positional', `Os rivais venceram ${opponentNetWins} pontos na rede nos dois games recentes.`, window.length, opponentNetWins, { tacticId: 'tatico', components: { tacticalWeight: 1.2, safeWeight: 1.08 } });
    const opponentLobs = opponentShots.filter((shot) => shot.shot === 'lob').length;
    if (opponentLobs >= 5) add('opponent_more_lobs', 'defensive', `O adversário usou ${opponentLobs} lobs na janela recente.`, opponentShots.length, opponentLobs, { tacticId: 'tatico', components: { tacticalWeight: 1.18 } });

    const volleyErrors = window.filter((point) => point.errorShot === 'volley' && teamShots.some((shot) => shot.playerId === point.errorPlayerId)).length;
    if (volleyErrors >= 2) add('volley_errors', 'technical', `${volleyErrors} erros de voleio nos dois games recentes.`, window.length, volleyErrors, { tacticId: 'defensivo', components: { riskModifier: 0.9, safeWeight: 1.12 } });
    const unforcedErrors = window.filter((point) => point.outcome === 'UNFORCED_ERROR' && teamShots.some((shot) => shot.playerId === point.errorPlayerId)).length;
    if (unforcedErrors >= 3) add('unforced_error_streak', 'technical', `${unforcedErrors} erros não forçados nos dois games recentes.`, window.length, unforcedErrors, { tacticId: 'defensivo', components: { riskModifier: 0.88, safeWeight: 1.15 } });

    const teamLobPoints = window.filter((point) => point.shots.some((shot) => shot.team === teamId && shot.shot === 'lob'));
    const lobLosses = teamLobPoints.filter((point) => point.winnerTeamId !== teamId).length;
    if (teamLobPoints.length >= 4 && lobLosses / teamLobPoints.length >= 0.65) add('ineffective_lobs', 'technical', `A dupla perdeu ${lobLosses} de ${teamLobPoints.length} pontos em que recorreu ao lob.`, teamLobPoints.length, lobLosses, { tacticId: 'equilibrado', components: { tacticalWeight: 1.12, safeWeight: 0.95 } });
    const teamSmashPoints = window.filter((point) => point.shots.some((shot) => shot.team === teamId && shot.shot === 'smash'));
    const smashWins = teamSmashPoints.filter((point) => point.winnerTeamId === teamId).length;
    if (teamSmashPoints.length >= 4 && smashWins / teamSmashPoints.length < 0.4) add('low_smash_efficiency', 'offensive', `Apenas ${smashWins} de ${teamSmashPoints.length} pontos com smash terminaram a favor.`, teamSmashPoints.length, teamSmashPoints.length - smashWins, { tacticId: 'tatico', components: { powerWeight: 0.9, tacticalWeight: 1.14 } });

    const energyValues = Object.values(window.at(-1)?.energies || { none: 100 });
    const energy = Math.min(...energyValues);
    if (energy <= 35) add('critical_energy', 'physical', `Energia mínima da dupla em ${Math.round(energy)}.`, window.length, window.filter((point) => Math.min(...Object.values(point.energies)) <= 40).length, { tacticId: 'defensivo', components: { energyModifier: 0.9, safeWeight: 1.12 } }, 'urgent');
    const planned = initialPlan?.id;
    const aggressiveShots = teamShots.filter((shot) => ['smash', 'volley', 'drive'].includes(shot.shot)).length;
    if (planned === 'agressivo' && teamShots.length >= 10 && aggressiveShots / teamShots.length < 0.3) add('plan_not_executed', 'plan', `Apenas ${Math.round(aggressiveShots / teamShots.length * 100)}% dos golpes seguiram o plano ofensivo.`, teamShots.length, teamShots.length - aggressiveShots, { tacticId: 'tatico', components: { attackWeight: 1.1 } });
    return patterns.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }
}
