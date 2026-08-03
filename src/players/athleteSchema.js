export const ATHLETE_SCHEMA_VERSION = 1;
export const COURT_SIDES = Object.freeze({ RIGHT: 'right', LEFT: 'left', FLEX: 'flex' });
export const ATHLETE_SOURCES = Object.freeze({ REAL: 'real', FICTIONAL: 'fictional', CAREER: 'career' });
export const HANDEDNESS = Object.freeze({ RIGHT: 'right', LEFT: 'left', AMBIDEXTROUS: 'ambidextrous' });

const SIDE_ALIASES = new Map([
  ['right', 'right'], ['direita', 'right'], ['drive', 'right'], ['derecha', 'right'],
  ['left', 'left'], ['esquerda', 'left'], ['revés', 'left'], ['reves', 'left'], ['izquierda', 'left'],
  ['flex', 'flex'], ['ambos', 'flex'], ['both', 'flex'], ['versátil', 'flex'], ['versatil', 'flex'],
]);

export function normalizeCourtSide(value, fallback = COURT_SIDES.FLEX) {
  const normalized = SIDE_ALIASES.get(String(value || '').trim().toLowerCase());
  return normalized || fallback;
}

export function toLegacyCourtSide(value) {
  const side = normalizeCourtSide(value);
  return side === COURT_SIDES.LEFT ? 'esquerda' : side === COURT_SIDES.RIGHT ? 'direita' : 'flex';
}

export function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function stableAthleteId({ source_type = 'fictional', template_id, id, name, country } = {}) {
  if (String(id || '').startsWith('player-')) return id;
  const key = template_id || `${name || 'unknown'}:${country || 'unknown'}`;
  return `player-${source_type}-${stableHash(key)}`;
}

const clamp = (value, min, max, fallback) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : fallback));

export function normalizeAthlete(raw = {}, options = {}) {
  const sourceType = Object.values(ATHLETE_SOURCES).includes(raw.source_type) ? raw.source_type : (options.sourceType || ATHLETE_SOURCES.FICTIONAL);
  const preferredSide = normalizeCourtSide(raw.preferred_side ?? raw.court_side ?? raw.position);
  const flexibility = clamp(raw.side_flexibility, 0, 1, preferredSide === COURT_SIDES.FLEX ? 0.9 : 0.25);
  const overall = clamp(raw.overall_rating ?? raw.overall, 1, 100, 50);
  const templateId = raw.template_id || raw.bot_id || raw.id || `${sourceType}:${raw.name || raw.sport_name || 'unknown'}`;
  const attributes = raw.attributes && typeof raw.attributes === 'object' ? { ...raw.attributes } : {};
  return {
    ...raw,
    id: stableAthleteId({ ...raw, source_type: sourceType, template_id: templateId }),
    template_id: String(templateId),
    athlete_schema_version: ATHLETE_SCHEMA_VERSION,
    source_type: sourceType,
    licensing_mode: sourceType === ATHLETE_SOURCES.REAL ? (raw.licensing_mode || 'reference') : 'original',
    name: String(raw.name || raw.sport_name || 'Atleta sem nome').trim(),
    sport_name: String(raw.sport_name || raw.name || 'Atleta sem nome').trim(),
    country: String(raw.country || 'Internacional'),
    nationality_code: raw.nationality_code || null,
    handedness: Object.values(HANDEDNESS).includes(raw.handedness) ? raw.handedness : HANDEDNESS.RIGHT,
    preferred_side: preferredSide,
    secondary_side: normalizeCourtSide(raw.secondary_side, preferredSide === COURT_SIDES.LEFT ? COURT_SIDES.RIGHT : COURT_SIDES.LEFT),
    side_flexibility: flexibility,
    side_experience: {
      right: clamp(raw.side_experience?.right, 0, 100, preferredSide === COURT_SIDES.RIGHT ? 85 : preferredSide === COURT_SIDES.FLEX ? 72 : 30),
      left: clamp(raw.side_experience?.left, 0, 100, preferredSide === COURT_SIDES.LEFT ? 85 : preferredSide === COURT_SIDES.FLEX ? 72 : 30),
    },
    position: toLegacyCourtSide(preferredSide),
    overall,
    overall_rating: overall,
    potential: clamp(raw.potential, overall, 100, Math.min(100, overall + 8)),
    attributes,
    tags: Array.isArray(raw.tags) ? [...new Set(raw.tags)] : [],
  };
}

export function validateAthlete(athlete) {
  const errors = [];
  if (!String(athlete?.id || '').startsWith('player-')) errors.push('id instável ou ausente');
  if (!athlete?.name?.trim()) errors.push('nome ausente');
  if (!Object.values(ATHLETE_SOURCES).includes(athlete?.source_type)) errors.push('origem inválida');
  if (!Object.values(COURT_SIDES).includes(athlete?.preferred_side)) errors.push('lado inválido');
  if (!Object.values(HANDEDNESS).includes(athlete?.handedness)) errors.push('mão dominante inválida');
  if (athlete?.overall_rating < 1 || athlete?.overall_rating > 100) errors.push('overall fora de 1–100');
  return { valid: errors.length === 0, errors };
}
