const round = (value) => Math.round(Number(value || 0) * 100) / 100;

function metrics(points, team = 'A') {
  const own = points.filter((point) => point.winnerTeamId === team);
  const playerIds = new Set(points.flatMap((point) => point.shots || []).filter((shot) => shot.team === team).map((shot) => shot.playerId));
  const errors = points.filter((point) => point.errorPlayerId && playerIds.has(point.errorPlayerId)).length;
  return {
    samplePoints: points.length,
    pointWinRate: round(points.length ? own.length / points.length * 100 : 0),
    errors,
    netPointsWon: own.filter((point) => point.winnerPosition === 'NET').length,
    forcedErrorsDrawn: own.filter((point) => point.outcome === 'FORCED_ERROR').length,
    averageRally: round(points.length ? points.reduce((sum, point) => sum + Number(point.rallyLength || 0), 0) / points.length : 0),
  };
}
function evaluateImpact(adjustment, points) {
  const pivot = Number(adjustment.effectiveFromPoint || 1);
  const before = points.filter((point) => point.pointNumber < pivot).slice(-12);
  const after = points.filter((point) => point.pointNumber >= pivot).slice(0, 12);
  const beforeMetrics = metrics(before);
  const afterMetrics = metrics(after);
  return {
    adjustmentId: adjustment.adjustmentId,
    suggestionId: adjustment.suggestionId,
    patternId: adjustment.patternId,
    effectiveFromPoint: pivot,
    before: beforeMetrics,
    after: afterMetrics,
    delta: {
      pointWinRate: round(afterMetrics.pointWinRate - beforeMetrics.pointWinRate),
      errors: afterMetrics.errors - beforeMetrics.errors,
      netPointsWon: afterMetrics.netPointsWon - beforeMetrics.netPointsWon,
      forcedErrorsDrawn: afterMetrics.forcedErrorsDrawn - beforeMetrics.forcedErrorsDrawn,
    },
    completeWindow: before.length >= 4 && after.length >= 4,
  };
}

export function buildLiveCoachReport(state) {
  const decisions = state.liveCoach?.decisions || [];
  const adjustments = state.liveCoach?.adjustments || [];
  const points = state.liveCoach?.analytics?.points || [];
  return {
    matchId: state.replay?.match_id || null,
    coachId: state.liveCoach?.coach?.id || null,
    suggestionsReceived: (state.liveCoach?.suggestions || []).length,
    suggestionsApplied: decisions.filter((decision) => decision.accepted || ['apply', 'partial', 'auto'].includes(decision.decision)).length,
    suggestionsIgnored: decisions.filter((decision) => !decision.accepted && ['ignore', 'maintain'].includes(decision.decision)).length,
    decisions,
    adjustments,
    impactEvaluations: adjustments.map((adjustment) => evaluateImpact(adjustment, points)),
    observations: state.liveCoach?.observations || [],
    disclaimer: 'As métricas posteriores descrevem associação temporal e não provam causalidade.',
  };
}
