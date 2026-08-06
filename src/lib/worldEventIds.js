function safeSlug(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
}

function shortHash(value) {
  const input = String(value ?? '');
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0').slice(-7);
}

function createWorldEventId(event = {}, sequence = 0) {
  const datePart = String(event.event_date || event.start_date || event.created_date || 'unknown')
    .replace(/[:.]/g, '-')
    .replace(/[^0-9-]/g, '')
    .slice(0, 16);
  const typePart = safeSlug(event.event_type || 'noticia').slice(0, 24) || 'noticia';
  const titlePart = safeSlug(event.title || event.content || event.source_event_id || event.author_name || 'evento').slice(0, 34) || 'evento';
  const fingerprint = shortHash(
    event.source_event_id
      || event.id
      || JSON.stringify({
        title: event.title,
        content: event.content,
        event_date: event.event_date,
        start_date: event.start_date,
        event_type: event.event_type,
        sequence,
      }),
  );
  const suffix = sequence > 0 ? `-${String(sequence).padStart(3, '0')}` : '';
  const ending = `-${fingerprint}${suffix}`;
  const prefix = ['worldevent', datePart, typePart, titlePart].join('-').replace(/--+/g, '-');

  // O fingerprint sempre fica no fim do ID. Antes, o slice(0, 128) removia a
  // parte aleatória de source_event_id e eventos com o mesmo título colidiam.
  return `${prefix.slice(0, Math.max(1, 128 - ending.length))}${ending}`;
}

function areWorldEventsEquivalent(a = {}, b = {}) {
  const compareKeys = ['id', 'event_type', 'title', 'content', 'event_date', 'start_date', 'end_date', 'is_macro', 'tier', 'impact_level', 'source_event_id'];
  for (const key of compareKeys) {
    const aValue = a?.[key] === undefined ? null : a[key];
    const bValue = b?.[key] === undefined ? null : b[key];
    if (JSON.stringify(aValue) !== JSON.stringify(bValue)) return false;
  }
  return true;
}

export function uniqueWorldEventsById(events = []) {
  const map = new Map();
  for (const event of events || []) {
    if (!event || !event.id) continue;
    const existing = map.get(event.id);
    if (existing) {
      if (import.meta.env.DEV && !areWorldEventsEquivalent(existing, event)) {
        throw new Error(`Evento mundial duplicado com ID conflitante: ${event.id}`);
      }
      continue;
    }
    map.set(event.id, event);
  }
  return [...map.values()];
}

export function normalizeWorldEventIds(events = []) {
  const normalized = [];
  const usedIds = new Set();
  for (let index = 0; index < (events || []).length; index += 1) {
    const event = events[index];
    if (!event || typeof event !== 'object') continue;
    let id = event.id || createWorldEventId(event, index + 1);
    if (usedIds.has(id)) {
      let sequence = 1;
      let candidate = createWorldEventId(event, index + sequence);
      while (usedIds.has(candidate)) {
        sequence += 1;
        candidate = createWorldEventId(event, index + sequence);
      }
      id = candidate;
    }
    usedIds.add(id);
    normalized.push({ ...event, id });
  }
  return normalized;
}

export function validateWorldEventIds(events = []) {
  const seen = new Set();
  const duplicates = [];
  for (const event of events || []) {
    if (!event || !event.id) {
      throw new Error('Evento mundial sem ID detectado. Todos os eventos devem ter um identificador estável.');
    }
    if (seen.has(event.id)) {
      duplicates.push(event.id);
    }
    seen.add(event.id);
  }
  if (duplicates.length > 0) {
    throw new Error(`IDs duplicados no WorldFeed: ${[...new Set(duplicates)].join(', ')}`);
  }
}

export function createWorldEventObjects(events = []) {
  return (events || []).map((event, index) => ({
    ...event,
    id: event.id || createWorldEventId(event, index + 1),
  }));
}
