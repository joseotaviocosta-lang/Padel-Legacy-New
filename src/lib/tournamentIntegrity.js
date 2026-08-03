function slug(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function createTournamentEditionId({ year, circuitCode, cityCode, tier, week, slot = 1 }) {
  const code = circuitCode || `${cityCode}-${String(tier || '').slice(0, 3)}-W${String(week).padStart(2, '0')}-${slot}`;
  if (!year || !code) throw new Error('Ano e código do circuito são obrigatórios para gerar o ID do torneio.');
  return `tournament-${year}-${slug(code)}`;
}

export function tournamentLogicalIdentity(tournament) {
  return [
    tournament?.year || String(tournament?.start_date || '').slice(0, 4),
    tournament?.circuit_name || 'world-tour', tournament?.circuit_code,
    tournament?.start_date, tournament?.city || tournament?.location,
    tournament?.tier, tournament?.division || 'open', tournament?.slot || tournament?.calendar_order,
  ].map(value => String(value ?? '')).join('|');
}

export function validateTournamentIntegrity(tournaments = []) {
  const seen = new Set();
  const errors = [];
  for (const tournament of Array.isArray(tournaments) ? tournaments : []) {
    if (!tournament?.id) errors.push({ type: 'missing-id', tournament });
    else if (seen.has(tournament.id)) errors.push({ type: 'duplicate-id', id: tournament.id });
    else seen.add(tournament.id);
    if (!Number.isInteger(Number(tournament?.week)) || Number(tournament.week) < 1 || Number(tournament.week) > 53) errors.push({ type: 'invalid-week', id: tournament?.id });
    if (!tournament?.start_date) errors.push({ type: 'missing-date', id: tournament?.id });
    if (!tournament?.city && !tournament?.location) errors.push({ type: 'missing-city', id: tournament?.id });
    if (!tournament?.tier) errors.push({ type: 'missing-tier', id: tournament?.id });
  }
  return errors;
}

function meaningful(value) {
  return value !== undefined && value !== null && value !== '';
}

function mergeEquivalentTournament(left, right) {
  const merged = { ...left };
  for (const [key, value] of Object.entries(right || {})) {
    if (!meaningful(merged[key]) && meaningful(value)) merged[key] = value;
  }
  for (const key of ['participants', 'results', 'matches']) {
    const values = [...(Array.isArray(left?.[key]) ? left[key] : []), ...(Array.isArray(right?.[key]) ? right[key] : [])];
    if (values.length) {
      const unique = new Map(values.map((item, index) => [item?.id || JSON.stringify(item) || index, item]));
      merged[key] = [...unique.values()];
    }
  }
  const completed = [left, right].find(item => item?.status === 'finalizado' || item?.champion);
  if (completed) {
    for (const key of ['status', 'champion', 'runner_up', 'completed_date', 'current_phase']) {
      if (meaningful(completed[key])) merged[key] = completed[key];
    }
  }
  return merged;
}

export function repairTournamentCollection(tournaments = []) {
  const repaired = [];
  const byId = new Map();
  const remaps = [];
  let mergedCount = 0;

  for (const raw of Array.isArray(tournaments) ? tournaments : []) {
    if (!raw || typeof raw !== 'object') continue;
    const tournament = { ...raw };
    if (!tournament.id) {
      tournament.id = createTournamentEditionId({
        year: tournament.year || String(tournament.start_date || '').slice(0, 4),
        circuitCode: tournament.circuit_code || `${tournament.city || tournament.location}-${tournament.tier}-W${tournament.week || 0}-${tournament.calendar_order || 1}`,
      });
    }
    const existingIndex = byId.get(tournament.id);
    if (existingIndex === undefined) {
      byId.set(tournament.id, repaired.length);
      repaired.push(tournament);
      continue;
    }
    const existing = repaired[existingIndex];
    if (tournamentLogicalIdentity(existing) === tournamentLogicalIdentity(tournament)) {
      repaired[existingIndex] = mergeEquivalentTournament(existing, tournament);
      mergedCount += 1;
      continue;
    }
    const originalId = tournament.id;
    let nextId = `${originalId}-${hash(tournamentLogicalIdentity(tournament))}`;
    let suffix = 2;
    while (byId.has(nextId)) nextId = `${originalId}-${hash(tournamentLogicalIdentity(tournament))}-${suffix++}`;
    tournament.id = nextId;
    byId.set(nextId, repaired.length);
    repaired.push(tournament);
    remaps.push({ oldId: originalId, newId: nextId, tournamentName: tournament.name || '' });
  }
  return { tournaments: repaired, mergedCount, remaps };
}
