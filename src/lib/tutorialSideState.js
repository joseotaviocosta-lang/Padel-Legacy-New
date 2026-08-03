export const COURT_SIDES = Object.freeze(['direita', 'esquerda', 'versatil']);

export function normalizeCourtSide(value) {
  return COURT_SIDES.includes(value) ? value : null;
}

export function sideMissionRepair(profile = {}, progress = null) {
  const side = normalizeCourtSide(profile.court_side);
  if (!side && (progress?.completed || progress?.claimed)) return 'reopen';
  if (side && !progress?.claimed) return 'complete';
  return 'none';
}

export function applyTutorialSide(profile = {}, side) {
  const courtSide = normalizeCourtSide(side);
  if (!courtSide) throw new Error('Lado de jogo inválido.');
  return { ...profile, court_side: courtSide, play_style: null, onboarding_stage: 'side' };
}

export function canChooseTutorialStyle(profile = {}, sideMissionProgress = null) {
  return Boolean(normalizeCourtSide(profile.court_side) && sideMissionProgress?.claimed);
}

export function shouldDeliverMissionReward(progress = null) {
  return !progress?.claimed && !progress?.reward_delivered;
}
