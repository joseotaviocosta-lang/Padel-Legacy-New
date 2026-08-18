export function findMissingMissionCatalog(existing, catalog) {
  const existingTitles = new Set(
    (Array.isArray(existing) ? existing : []).filter(Boolean).map(mission => mission.title),
  );
  return (Array.isArray(catalog) ? catalog : [])
    .filter(mission => mission?.title && !existingTitles.has(mission.title));
}

/** Retorna somente reparos de aliases que realmente mudam dados persistidos. */
export function buildMissionAliasUpdates(existing) {
  return (Array.isArray(existing) ? existing : []).flatMap((mission) => {
    if (!mission?.id) return [];
    const normalized = {
      xp_reward: Number(mission.xp_reward ?? mission.reward_xp ?? 0),
      coins_reward: Number(mission.coins_reward ?? mission.reward_coins ?? 0),
      mission_type: mission.mission_type || 'semanal',
      is_active: mission.is_active !== false,
    };
    const changed = Number(mission.xp_reward) !== normalized.xp_reward
      || Number(mission.coins_reward) !== normalized.coins_reward
      || mission.mission_type !== normalized.mission_type
      || mission.is_active !== normalized.is_active;
    return changed ? [{ id: mission.id, ...normalized }] : [];
  });
}
