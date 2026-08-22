import { gameRepository as repository } from '../services/runtime.js';

function clone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
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


const PlayerAdapter = {
  async list(sort, limit) {
    const profile = await repository.getPlayerProfile();
    const results = profile ? [clone(profile)] : [];
    return typeof limit === 'number' ? results.slice(0, limit) : results;
  },

  async filter(query = {}, sort, limit) {
    const profile = await repository.getPlayerProfile();
    const results = profile && matches(profile, query) ? [clone(profile)] : [];
    return typeof limit === 'number' ? results.slice(0, limit) : results;
  },

  async get(id) {
    const profile = await repository.getPlayerProfile();
    if (!profile || profile.id !== id) throw new Error(`PlayerProfile não encontrado: ${id}`);
    return clone(profile);
  },

  async create(data = {}) {
    return repository.createPlayerProfile(data);
  },

  async update(id, updates = {}) {
    const profile = await repository.updatePlayerProfile(id, updates);
    if (Object.prototype.hasOwnProperty.call(updates, 'coins') && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('padel:profile-updated', {
        detail: { profile, profileId: profile?.id, careerDate: profile?.career_date, source: 'player-adapter-balance' },
      }));
    }
    return profile;
  },

  async delete(id) {
    const profile = await repository.getPlayerProfile();
    if (!profile || profile.id !== id) throw new Error(`PlayerProfile não encontrado: ${id}`);
    throw new Error('Exclusão do PlayerProfile ativo não é permitida no novo sistema de carreira.');
  },

  async count(query = {}) {
    return (await this.filter(query)).length;
  },

  subscribe() { return () => {}; },
};

export { PlayerAdapter };
