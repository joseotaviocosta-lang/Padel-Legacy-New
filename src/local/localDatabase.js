import { LOCAL_SEED } from './localSeed';

const STORE_FILE = 'padel-legacy-careers.json';
const INDEX_KEY = 'career-index';
const ACTIVE_KEY = 'active-career-id';
const SAVE_SCHEMA_VERSION = '4.0.0';
const clone = (value) => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();
const makeId = (prefix = 'career') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

let storePromise = null;
let database = null;
let activeCareerId = null;
let dirty = false;
let flushTimer = null;
let writeChain = Promise.resolve();
let lastSavedAt = null;

async function openStore() {
  if (!window.__TAURI_INTERNALS__) {
    throw new Error('O Padel Legacy deve ser executado pelo aplicativo instalado, não pelo navegador.');
  }
  if (!storePromise) {
    storePromise = import('@tauri-apps/plugin-store')
      .then(({ load }) => load(STORE_FILE, { autoSave: false }))
      .catch((error) => { storePromise = null; throw error; });
  }
  return storePromise;
}

function careerKey(id, slot = 'current') { return `career:${id}:${slot}`; }

function normalizeDatabase(value) {
  const source = value && typeof value === 'object' ? clone(value) : {};
  const result = {};
  const entities = new Set([...Object.keys(LOCAL_SEED || {}), ...Object.keys(source)]);
  for (const entity of entities) result[entity] = Array.isArray(source[entity]) ? source[entity] : [];
  result.__save_meta = {
    ...(source.__save_meta || {}),
    schema_version: SAVE_SCHEMA_VERSION,
    active_career_id: activeCareerId,
    updated_at: now(),
  };
  return result;
}

function createSeedDatabase(options = {}) {
  const seeded = clone(LOCAL_SEED || {});
  const profile = Array.isArray(seeded.PlayerProfile) ? seeded.PlayerProfile[0] : null;
  if (profile) {
    Object.assign(profile, {
      sport_name: options.playerName || profile.sport_name || 'Novo jogador',
      position: options.position || profile.position || 'direita',
      play_style: options.playStyle || profile.play_style || 'Equilibrado',
      career_date: '2026-01-01',
      updated_date: now(),
    });
  }
  return normalizeDatabase(seeded);
}

async function getIndex() {
  const store = await openStore();
  return clone((await store.get(INDEX_KEY)) || []);
}

async function saveIndex(index) {
  const store = await openStore();
  await store.set(INDEX_KEY, clone(index));
  await store.save();
}

async function requireActiveCareer() {
  if (activeCareerId) return activeCareerId;
  const store = await openStore();
  activeCareerId = await store.get(ACTIVE_KEY);
  if (!activeCareerId) throw new Error('Nenhuma carreira selecionada. Escolha uma carreira na tela inicial.');
  return activeCareerId;
}

async function ensureLoaded() {
  if (database) return database;
  const id = await requireActiveCareer();
  const store = await openStore();
  const current = await store.get(careerKey(id));
  const backup = await store.get(careerKey(id, 'backup'));
  const source = current?.database || backup?.database;
  if (!source) throw new Error('O arquivo da carreira selecionada não foi encontrado.');
  database = normalizeDatabase(source);
  lastSavedAt = current?.saved_at || backup?.saved_at || null;
  return database;
}

async function flushNow() {
  if (!dirty || !database) return true;
  dirty = false;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const id = await requireActiveCareer();
  const snapshot = normalizeDatabase(database);
  const savedAt = now();

  writeChain = writeChain.then(async () => {
    const store = await openStore();
    const previous = await store.get(careerKey(id));
    if (previous) await store.set(careerKey(id, 'backup'), previous);
    await store.set(careerKey(id), { schema_version: SAVE_SCHEMA_VERSION, saved_at: savedAt, database: snapshot });
    const index = await getIndex();
    const item = index.find((career) => career.id === id);
    if (item) {
      const profile = snapshot.PlayerProfile?.[0] || {};
      Object.assign(item, {
        player_name: profile.sport_name || item.player_name,
        position: profile.position || item.position,
        play_style: profile.play_style || item.play_style,
        career_date: profile.career_date || item.career_date,
        ranking_position: profile.ranking_position ?? item.ranking_position,
        last_played_at: savedAt,
      });
      await store.set(INDEX_KEY, index);
    }
    await store.save();
    lastSavedAt = savedAt;
    window.dispatchEvent(new CustomEvent('padel-persistent-save-complete', { detail: { saved_at: savedAt, career_id: id } }));
  }).catch((error) => { dirty = true; throw error; });
  return writeChain;
}

function scheduleFlush(delay = 80) {
  dirty = true;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flushNow().catch(console.error), delay);
}

function rows(entity) {
  if (!Array.isArray(database[entity])) database[entity] = [];
  return database[entity];
}

function matches(row, query = {}) {
  return Object.entries(query || {}).every(([key, expected]) => {
    const actual = row?.[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected && !expected.$in.includes(actual)) return false;
      if ('$nin' in expected && expected.$nin.includes(actual)) return false;
      if ('$ne' in expected && actual === expected.$ne) return false;
      if ('$gte' in expected && !(actual >= expected.$gte)) return false;
      if ('$lte' in expected && !(actual <= expected.$lte)) return false;
      if ('$gt' in expected && !(actual > expected.$gt)) return false;
      if ('$lt' in expected && !(actual < expected.$lt)) return false;
      if ('$contains' in expected && !String(actual ?? '').toLowerCase().includes(String(expected.$contains).toLowerCase())) return false;
      return true;
    }
    return actual === expected;
  });
}

function sortRows(items, sort) {
  if (!sort || typeof sort !== 'string') return [...items];
  const fields = sort.split(',').map((field) => field.trim()).filter(Boolean);
  return [...items].sort((a, b) => {
    for (const raw of fields) {
      const desc = raw.startsWith('-');
      const field = desc ? raw.slice(1) : raw;
      const av = a?.[field] ?? ''; const bv = b?.[field] ?? '';
      if (av === bv) continue;
      const result = av > bv ? 1 : -1;
      return desc ? -result : result;
    }
    return 0;
  });
}

window.addEventListener('beforeunload', () => { if (dirty) flushNow().catch(console.error); });

export const careerManager = {
  async list() { return getIndex(); },
  async activeId() { const store = await openStore(); return (await store.get(ACTIVE_KEY)) || null; },
  async create(options = {}) {
    const store = await openStore();
    const index = await getIndex();
    const id = makeId();
    const createdAt = now();
    const db = createSeedDatabase(options);
    const item = {
      id,
      name: options.careerName || options.playerName || `Carreira ${index.length + 1}`,
      player_name: options.playerName || 'Novo jogador',
      position: options.position || 'direita',
      play_style: options.playStyle || 'Equilibrado',
      career_date: '2026-01-01',
      ranking_position: db.PlayerProfile?.[0]?.ranking_position || 0,
      type: options.type || 'normal',
      created_at: createdAt,
      last_played_at: createdAt,
    };
    index.push(item);
    await store.set(INDEX_KEY, index);
    await store.set(careerKey(id), { schema_version: SAVE_SCHEMA_VERSION, saved_at: createdAt, database: db });
    await store.set(ACTIVE_KEY, id);
    await store.save();
    activeCareerId = id; database = db; lastSavedAt = createdAt;
    return clone(item);
  },
  async select(id) {
    const index = await getIndex();
    if (!index.some((item) => item.id === id)) throw new Error('Carreira não encontrada.');
    await flushNow();
    const store = await openStore();
    await store.set(ACTIVE_KEY, id); await store.save();
    activeCareerId = id; database = null; dirty = false; lastSavedAt = null;
    await ensureLoaded();
    return index.find((item) => item.id === id);
  },
  async close() {
    await flushNow();
    const store = await openStore();
    await store.delete(ACTIVE_KEY); await store.save();
    activeCareerId = null; database = null; dirty = false; lastSavedAt = null;
  },
  async rename(id, name) {
    const index = await getIndex(); const item = index.find((row) => row.id === id);
    if (!item) throw new Error('Carreira não encontrada.');
    item.name = String(name || '').trim() || item.name; await saveIndex(index); return clone(item);
  },
  async duplicate(id, name) {
    const store = await openStore(); const index = await getIndex();
    const source = await store.get(careerKey(id)); if (!source) throw new Error('Save original não encontrado.');
    const original = index.find((row) => row.id === id); const newId = makeId(); const createdAt = now();
    const item = { ...clone(original), id: newId, name: name || `${original?.name || 'Carreira'} — cópia`, created_at: createdAt, last_played_at: createdAt, type: 'experiment' };
    index.push(item); await store.set(INDEX_KEY, index);
    await store.set(careerKey(newId), { ...clone(source), saved_at: createdAt }); await store.save(); return clone(item);
  },
  async remove(id) {
    const store = await openStore(); const index = (await getIndex()).filter((row) => row.id !== id);
    await store.set(INDEX_KEY, index); await store.delete(careerKey(id)); await store.delete(careerKey(id, 'backup'));
    if ((await store.get(ACTIVE_KEY)) === id) await store.delete(ACTIVE_KEY);
    await store.save(); if (activeCareerId === id) { activeCareerId = null; database = null; }
  },
};

export const localDatabase = {
  async ready() { await ensureLoaded(); return true; },
  async list(entity, sort = null, limit = null) { await ensureLoaded(); const out = sortRows(rows(entity), sort); return clone(limit ? out.slice(0, limit) : out); },
  async filter(entity, query = {}, sort = null, limit = null) { await ensureLoaded(); const out = sortRows(rows(entity).filter((row) => matches(row, query)), sort); return clone(limit ? out.slice(0, limit) : out); },
  async get(entity, id) { await ensureLoaded(); const found = rows(entity).find((row) => row.id === id); if (!found) throw new Error(`${entity} não encontrado: ${id}`); return clone(found); },
  async create(entity, data = {}) { await ensureLoaded(); const timestamp = now(); const record = { ...clone(data), id: data.id || makeId(String(entity).toLowerCase()), created_date: data.created_date || timestamp, updated_date: timestamp }; rows(entity).push(record); scheduleFlush(); return clone(record); },
  async update(entity, id, data = {}) { await ensureLoaded(); const list = rows(entity); const i = list.findIndex((row) => row.id === id); if (i < 0) throw new Error(`${entity} não encontrado para atualização: ${id}`); list[i] = { ...list[i], ...clone(data), id, updated_date: now() }; scheduleFlush(); return clone(list[i]); },
  async delete(entity, id) { await ensureLoaded(); const list = rows(entity); const i = list.findIndex((row) => row.id === id); if (i >= 0) list.splice(i, 1); scheduleFlush(); return { success: true }; },
  async bulkCreate(entity, data = []) { const created = []; for (const item of data) created.push(await this.create(entity, item)); return created; },
  async bulkUpdate(entity, updates = []) { const result = []; for (const item of updates) { if (!item?.id) continue; try { result.push(await this.update(entity, item.id, item)); } catch { result.push(await this.create(entity, item)); } } return result; },
  async count(entity, query = {}) { await ensureLoaded(); return rows(entity).filter((row) => matches(row, query)).length; },
  async checkpoint(reason = 'manual') { await ensureLoaded(); database.__save_meta.checkpoint_reason = reason; dirty = true; await flushNow(); return { success: true, saved_at: lastSavedAt, reason }; },
  async reset({ confirmed = false } = {}) { if (!confirmed) throw new Error('Reset bloqueado.'); database = createSeedDatabase(); dirty = true; await flushNow(); return clone(database); },
  export() { return clone(database || {}); },
  async exportPersistent() { await ensureLoaded(); await flushNow(); return { format: 'padel-legacy-career', career_id: activeCareerId, schema_version: SAVE_SCHEMA_VERSION, exported_at: now(), database: clone(database) }; },
  async import(data) { const source = data?.database || data; if (!source || typeof source !== 'object') throw new Error('Arquivo de save inválido.'); database = normalizeDatabase(source); dirty = true; await flushNow(); return clone(database); },
  async restoreBackup() { const id = await requireActiveCareer(); const store = await openStore(); const backup = await store.get(careerKey(id, 'backup')); if (!backup?.database) throw new Error('Nenhum backup disponível.'); database = normalizeDatabase(backup.database); dirty = true; await flushNow(); return clone(database); },
  async status() { await ensureLoaded(); return { ready: true, active_career_id: activeCareerId, schema_version: SAVE_SCHEMA_VERSION, saved_at: lastSavedAt, dirty, storage: 'Arquivo local nativo (Tauri Store)', entities: Object.keys(database).filter((key) => !key.startsWith('__')).length }; },
  storageKey: STORE_FILE,
  schemaVersion: SAVE_SCHEMA_VERSION,
};
