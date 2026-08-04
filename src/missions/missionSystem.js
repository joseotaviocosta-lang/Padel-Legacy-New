export const MISSION_STATUSES = Object.freeze(['locked', 'available', 'in_progress', 'completed', 'rewarded', 'expired']);
let hydrationStatus = 'idle';
export const missionRuntime = {
  get hydrationStatus() { return hydrationStatus; },
  setHydrationStatus(status) { if (!['idle','loading','ready','error'].includes(status)) throw new Error(`Estado de hidratação inválido: ${status}`); hydrationStatus = status; },
  canProcessEvents() { return hydrationStatus === 'ready'; },
};

export function validateMissionReward(mission) {
  const keys = ['xp_reward', 'coins_reward', 'reputation_reward', 'season_points_reward'];
  const errors = keys.filter(key => mission[key] != null && (!Number.isFinite(Number(mission[key])) || Number(mission[key]) < 0)).map(key => `${mission.title || mission.id}: ${key} inválido`);
  return { valid: errors.length === 0, errors, hasReward: keys.some(key => Number(mission[key]) > 0) || Boolean(mission.medal_reward || mission.item_reward) };
}

export function missionStatus(row, { locked = false, expired = false } = {}) {
  if (expired) return 'expired'; if (locked) return 'locked'; if (row?.reward_delivered || row?.claimed) return 'rewarded'; if (row?.completed) return 'completed'; if (Number(row?.progress || 0) > 0) return 'in_progress'; return 'available';
}

const hash = value => { let result = 2166136261; for (const char of String(value)) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); } return result >>> 0; };
export function deterministicMissionSelection(missions, { careerId, cycleId, category, limit }) {
  return [...missions].sort((a,b) => hash(`${careerId}:${cycleId}:${category}:${a.id || a.title}`) - hash(`${careerId}:${cycleId}:${category}:${b.id || b.title}`)).slice(0, limit);
}

export function getMissionDifficultyTier(profile = {}) {
  const ranking = Number(profile.ranking_position || 9999); const level = Number(profile.level || 1); const matches = Number(profile.matches_played || 0);
  if (ranking <= 50 || level >= 30) return 'elite'; if (ranking <= 250 || level >= 20) return 'profissional'; if (ranking <= 750 || level >= 12) return 'nacional'; if (matches >= 10 || level >= 5) return 'regional'; return 'iniciante';
}

export function requirementsMet(mission, profile = {}, context = {}) {
  return (mission.requirements || []).every(requirement => ({
    'has-partner': Boolean(profile.partner_id || profile.current_partner_id),
    'tournaments-unlocked': context.tournamentsUnlocked !== false,
    'has-replay': Boolean(context.hasReplay),
    'sponsors-unlocked': Boolean(context.sponsorsUnlocked),
  }[requirement] ?? false));
}

export function validateMissionCatalog(catalog, validRoutes = []) {
  const errors = []; const ids = new Set(); const routeSet = new Set(validRoutes);
  for (const mission of catalog) {
    if (!mission.id) errors.push('Missão sem id'); else if (ids.has(mission.id)) errors.push(`ID duplicado: ${mission.id}`); else ids.add(mission.id);
    if (!mission.title?.trim() || !mission.description?.trim()) errors.push(`${mission.id}: texto vazio`);
    if (!['tutorial','diaria','semanal','mensal','sazonal'].includes(mission.mission_type)) errors.push(`${mission.id}: categoria inválida`);
    if (!mission.objective_type || Number(mission.target_count) <= 0) errors.push(`${mission.id}: objetivo inválido`);
    errors.push(...validateMissionReward(mission).errors);
    if (mission.tutorial_route && routeSet.size && !routeSet.has(mission.tutorial_route.split('?')[0])) errors.push(`${mission.id}: rota inexistente ${mission.tutorial_route}`);
    if (mission.mission_type === 'sazonal' && !mission.cycle_scope) errors.push(`${mission.id}: sazonal sem ciclo`);
  }
  return { valid: errors.length === 0, errors };
}
