export function findMissingMissionCatalog(existing, catalog) {
  const existingTitles = new Set(
    (Array.isArray(existing) ? existing : []).filter(Boolean).map(mission => mission.title),
  );
  return (Array.isArray(catalog) ? catalog : [])
    .filter(mission => mission?.title && !existingTitles.has(mission.title));
}
