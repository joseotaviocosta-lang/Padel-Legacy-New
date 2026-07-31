import { gameRepository as repository } from '../services/runtime.js';
import { LOCAL_SEED, LOCAL_PROFILE } from '@/local/localSeed.js';

function clone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = 'entity') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      const av = a?.[field] ?? '';
      const bv = b?.[field] ?? '';
      if (av === bv) continue;
      const result = av > bv ? 1 : -1;
      return desc ? -result : result;
    }
    return 0;
  });
}

export class CareerEntityRepository {
  constructor(gameRepository = repository) {
    this.repository = gameRepository;
  }

  async withCareer(mutator, { save = false } = {}) {
    if (save) {
      const transaction = await this.repository.mutateActiveCareer(async (career) => {
        if (!career.entities || typeof career.entities !== 'object' || Array.isArray(career.entities)) career.entities = {};
        return mutator(career);
      });
      return clone(transaction.result);
    }

    const career = await this.repository.ensureActiveCareer({ fresh: true });
    if (!career.entities || typeof career.entities !== 'object' || Array.isArray(career.entities)) career.entities = {};
    return clone(await mutator(career));
  }

  seedFor(entityName, career) {
    if (entityName === 'PlayerProfile' || entityName === 'User') return [];
    const activePlayerId = career?.player?.id || null;
    return clone(LOCAL_SEED[entityName] || []).map((row) => {
      const seeded = { ...row };
      if (activePlayerId && seeded.profile_id === LOCAL_PROFILE.id) seeded.profile_id = activePlayerId;
      if (activePlayerId && seeded.created_by_id === LOCAL_PROFILE.id) seeded.created_by_id = activePlayerId;
      return seeded;
    });
  }

  async ensureCollection(entityName, career) {
    if (!Array.isArray(career.entities[entityName])) career.entities[entityName] = this.seedFor(entityName, career);
    return career.entities[entityName];
  }

  async list(entityName, sort = null, limit = null) {
    return this.withCareer(async (career) => {
      const rows = await this.ensureCollection(entityName, career);
      const out = sortRows(rows, sort);
      return limit ? out.slice(0, limit) : out;
    }, { save: false });
  }

  async filter(entityName, query = {}, sort = null, limit = null) {
    return this.withCareer(async (career) => {
      const rows = await this.ensureCollection(entityName, career);
      const out = sortRows(rows.filter((row) => matches(row, query)), sort);
      return limit ? out.slice(0, limit) : out;
    }, { save: false });
  }

  async get(entityName, id) {
    return this.withCareer(async (career) => {
      const rows = await this.ensureCollection(entityName, career);
      const found = rows.find((row) => row.id === id);
      if (!found) throw new Error(`${entityName} não encontrado: ${id}`);
      return found;
    }, { save: false });
  }

  async create(entityName, data = {}) {
    return this.withCareer(async (career) => {
      const rows = await this.ensureCollection(entityName, career);
      const timestamp = new Date().toISOString();
      const record = { ...clone(data), id: data.id || makeId(entityName.toLowerCase()), created_date: data.created_date || timestamp, updated_date: timestamp };
      rows.push(record);
      return record;
    }, { save: true });
  }

  async update(entityName, id, data = {}) {
    return this.withCareer(async (career) => {
      const rows = await this.ensureCollection(entityName, career);
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) throw new Error(`${entityName} não encontrado para atualização: ${id}`);
      rows[index] = { ...rows[index], ...clone(data), id, updated_date: new Date().toISOString() };
      return rows[index];
    }, { save: true });
  }

  async delete(entityName, id) {
    return this.withCareer(async (career) => {
      const rows = await this.ensureCollection(entityName, career);
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) rows.splice(index, 1);
      return { success: true };
    }, { save: true });
  }

  async bulkCreate(entityName, data = []) {
    const created = [];
    for (const item of data) created.push(await this.create(entityName, item));
    return created;
  }

  async bulkUpdate(entityName, updates = []) {
    const result = [];
    for (const item of updates) {
      if (!item?.id) continue;
      try { result.push(await this.update(entityName, item.id, item)); }
      catch { result.push(await this.create(entityName, item)); }
    }
    return result;
  }

  async count(entityName, query = {}) {
    const rows = await this.filter(entityName, query);
    return rows.length;
  }
}
