import { normalizeAthlete, normalizeCourtSide, toLegacyCourtSide } from './athleteSchema.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const nameOf = athlete => athlete?.sport_name || athlete?.name || 'Atleta';
const ratingOf = athlete => {
  const direct = Number(athlete?.overall_rating ?? athlete?.overall);
  if (Number.isFinite(direct) && direct > 0) return clamp(direct, 1, 100);
  const values = ['serve', 'forehand', 'backhand', 'volley', 'lob', 'smash', 'bandeja', 'speed', 'stamina', 'tactics', 'positioning']
    .map(key => Number(athlete?.[key] ?? athlete?.attributes?.[key])).filter(Number.isFinite);
  return values.length ? clamp(values.reduce((sum, value) => sum + value, 0) / values.length, 1, 100) : 50;
};

function assignmentPenalty(raw, assignedSide) {
  const athlete = normalizeAthlete(raw, { sourceType: raw?.source_type || 'career' });
  const preferred = normalizeCourtSide(athlete.preferred_side);
  if (preferred === 'flex' || preferred === assignedSide) return 0;
  const experience = clamp(athlete.side_experience?.[assignedSide], 0, 100) / 100;
  return clamp(Math.round(24 * (1 - athlete.side_flexibility) * (1 - experience * 0.55)), 3, 24);
}

export function resolveTeamCourtSides(playerA, playerB, { preservePlayerA = true } = {}) {
  const options = [
    { a: 'right', b: 'left' },
    { a: 'left', b: 'right' },
  ].map(option => ({ ...option, penaltyA: assignmentPenalty(playerA, option.a), penaltyB: assignmentPenalty(playerB, option.b) }))
    .map(option => ({ ...option, totalPenalty: option.penaltyA + option.penaltyB }));
  options.sort((x, y) => x.totalPenalty - y.totalPenalty || (preservePlayerA && x.a === normalizeCourtSide(playerA?.court_side ?? playerA?.preferred_side) ? -1 : 1));
  const best = options[0];
  const samePreference = normalizeCourtSide(playerA?.court_side ?? playerA?.preferred_side) === normalizeCourtSide(playerB?.preferred_side ?? playerB?.position)
    && normalizeCourtSide(playerA?.court_side ?? playerA?.preferred_side) !== 'flex';
  return {
    assignments: { playerA: best.a, playerB: best.b },
    legacyAssignments: { playerA: toLegacyCourtSide(best.a), playerB: toLegacyCourtSide(best.b) },
    penalties: { playerA: best.penaltyA, playerB: best.penaltyB, total: best.totalPenalty },
    naturalFit: best.totalPenalty === 0,
    samePreference,
    explanation: best.totalPenalty === 0
      ? `${nameOf(playerA)} e ${nameOf(playerB)} ocupam lados naturais complementares.`
      : `${best.penaltyA >= best.penaltyB ? nameOf(playerA) : nameOf(playerB)} fará adaptação de lado; penalidade tática estimada em ${best.totalPenalty} pontos.`,
  };
}

export function evaluatePartnerCompatibility(player, partner) {
  const side = resolveTeamCourtSides(player, partner);
  const playerOverall = ratingOf(player);
  const partnerOverall = ratingOf(partner);
  const level = clamp(100 - Math.abs(playerOverall - partnerOverall) * 2, 25, 100);
  const style = player?.play_style && partner?.play_style && player.play_style !== partner.play_style ? 84 : 70;
  const sideScore = clamp(100 - side.penalties.total * 3, 25, 100);
  const total = Math.round(sideScore * 0.42 + level * 0.33 + style * 0.25);
  return {
    total, sideResolution: side,
    breakdown: { position: sideScore, style, level },
    strengths: [side.naturalFit ? 'Lados naturalmente complementares' : 'Adaptação viável com experiência', style >= 80 ? 'Estilos complementares' : 'Estilo familiar'],
    warnings: side.penalties.total > 0 ? [side.explanation] : [],
  };
}

export function calculatePartnershipInterest(profile, athlete, compatibility = evaluatePartnerCompatibility(profile, athlete)) {
  const careerRank = Math.max(1, Number(profile?.ranking_position) || 1500);
  const athleteRank = Math.max(1, Number(athlete?.world_rank ?? athlete?.ranking_position) || 500);
  const reputation = clamp(profile?.reputation, 0, 100);
  const rankingProgress = clamp((1500 - careerRank) / 15, 0, 100);
  const eliteDemand = clamp((120 - athleteRank) / 1.2, 0, 100);
  const score = Math.round(clamp(compatibility.total * 0.35 + reputation * 0.3 + rankingProgress * 0.35 - eliteDemand * 0.15, 3, 97));
  const level = score >= 75 ? 'alto' : score >= 50 ? 'médio' : score >= 25 ? 'baixo' : 'muito baixo';
  return {
    score, level, available: athlete?.career_status !== 'aposentado',
    reasons: [compatibility.total >= 70 ? 'Encaixe esportivo favorável' : 'Encaixe esportivo exige trabalho', reputation >= 55 ? 'Sua reputação inspira confiança' : 'Sua reputação ainda limita o interesse'],
    requirements: score < 50 ? ['Melhore ranking, reputação ou condições da proposta'] : [],
  };
}

export function applySideAdaptation(athlete, assignedSide, amount = 1) {
  const normalized = normalizeAthlete(athlete, { sourceType: athlete?.source_type || 'career' });
  const side = normalizeCourtSide(assignedSide);
  if (side === 'flex') return normalized;
  return { ...normalized, side_experience: { ...normalized.side_experience, [side]: clamp(normalized.side_experience[side] + amount, 0, 100) } };
}
