import { localDatabase } from '@/local/localDatabase.js';
import { gameRepository as repository } from '../services/runtime.js';
import { isNewCareerSystemEnabled } from '../config/featureFlags.js';

function clone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function fallbackEntity() {
  return {
    list: (sort, limit) => localDatabase.list('PlayerProfile', sort, limit),
    filter: (query, sort, limit) => localDatabase.filter('PlayerProfile', query, sort, limit),
    get: (id) => localDatabase.get('PlayerProfile', id),
    create: (data) => localDatabase.create('PlayerProfile', data),
    update: (id, data) => localDatabase.update('PlayerProfile', id, data),
    delete: (id) => localDatabase.delete('PlayerProfile', id),
    count: (query) => localDatabase.count('PlayerProfile', query),
  };
}

function matches(row, query = {}) {
  if (!row) return false;
  if (!query || typeof query !== 'object' || Array.isArray(query)) return true;
  return Object.entries(query).every(([key, expected]) => {
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

const legacy = fallbackEntity();

const PlayerAdapter = {
  async list(sort, limit) {
    if (!isNewCareerSystemEnabled()) return legacy.list(sort, limit);
    const profile = await repository.getPlayerProfile();
    const results = profile ? [clone(profile)] : [];
    return typeof limit === 'number' ? results.slice(0, limit) : results;
  },

  async filter(query = {}, sort, limit) {
    if (!isNewCareerSystemEnabled()) return legacy.filter(query, sort, limit);
    const profile = await repository.getPlayerProfile();
    const results = profile && matches(profile, query) ? [clone(profile)] : [];
    return typeof limit === 'number' ? results.slice(0, limit) : results;
  },

  async get(id) {
    if (!isNewCareerSystemEnabled()) return legacy.get(id);
    const profile = await repository.getPlayerProfile();
    if (!profile || profile.id !== id) throw new Error(`PlayerProfile não encontrado: ${id}`);
    return clone(profile);
  },

  async create(data = {}) {
    if (!isNewCareerSystemEnabled()) return legacy.create(data);
    return repository.createPlayerProfile(data);
  },

  async update(id, updates = {}) {
    if (!isNewCareerSystemEnabled()) return legacy.update(id, updates);
    return repository.updatePlayerProfile(id, updates);
  },

  async delete(id) {
    if (!isNewCareerSystemEnabled()) return legacy.delete(id);
    const profile = await repository.getPlayerProfile();
    if (!profile || profile.id !== id) throw new Error(`PlayerProfile não encontrado: ${id}`);
    throw new Error('Exclusão do PlayerProfile ativo não é permitida no novo sistema de carreira.');
  },

  async count(query = {}) {
    if (!isNewCareerSystemEnabled()) return legacy.count(query);
    return (await this.filter(query)).length;
  },

  subscribe() { return () => {}; },
};

export { PlayerAdapter };
