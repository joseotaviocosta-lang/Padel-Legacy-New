import { careerDataStore } from './careerDataStore.js';
import { LOCAL_USER } from './localSeed';
import { PlayerAdapter } from '@/gameplay/adapters/PlayerAdapter.js';
import { batchEntities, createEntityAdapter } from '@/gameplay/adapters/EntityAdapter.js';

export const LOCAL_DEV_MODE = true;

const entityProxy = new Proxy({}, {
  get(_target, entityName) {
    if (typeof entityName !== 'string') return undefined;
    if (entityName === 'PlayerProfile') return PlayerAdapter;
    if (entityName === 'User') {
      return {
        list: (sort, limit) => careerDataStore.list(entityName, sort, limit),
        filter: (query, sort, limit) => careerDataStore.filter(entityName, query, sort, limit),
        get: (id) => careerDataStore.get(entityName, id),
        count: (query) => careerDataStore.count(entityName, query),
        subscribe: () => () => {},
      };
    }
    return createEntityAdapter(entityName);
  },
});

const auth = {
  async me() { return { ...LOCAL_USER }; },
  async loginViaEmailPassword() { return { ...LOCAL_USER }; },
  async loginWithProvider() { window.location.href = '/game'; },
  async register() { return { ...LOCAL_USER }; },
  async verifyOtp() { return { success: true, access_token: 'offline-token' }; },
  async resendOtp() { return { success: true }; },
  async resetPasswordRequest() { return { success: true }; },
  async resetPassword() { return { success: true }; },
  setToken() {},
  logout(redirect) { if (redirect) window.location.href = '/'; },
  redirectToLogin() { window.location.href = '/game'; },
};

const functions = new Proxy({}, {
  get(_target, functionName) {
    return async (payload = {}) => ({
      data: { success: true, local: true, functionName, payload },
    });
  },
});

const integrations = new Proxy({}, {
  get(_target, integrationName) {
    return async (payload = {}) => ({
      data: { success: true, local: true, integrationName, payload },
    });
  },
});

export const localGame = {
  auth,
  entities: entityProxy,
  asServiceRole: { entities: entityProxy },
  functions,
  integrations,
  storage: careerDataStore,
  batch: batchEntities,
};
