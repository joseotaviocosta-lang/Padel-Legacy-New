import { localDatabase } from './localDatabase';
import { LOCAL_USER } from './localSeed';
import { PlayerAdapter } from '@/gameplay/adapters/PlayerAdapter.js';
import { createEntityAdapter } from '@/gameplay/adapters/EntityAdapter.js';

const entityProxy = new Proxy({}, {
  get(_target, entityName) {
    if (typeof entityName !== 'string') return undefined;
    if (entityName === 'PlayerProfile') return PlayerAdapter;
    if (entityName === 'User') {
      return {
        list: (sort, limit) => localDatabase.list(entityName, sort, limit),
        filter: (query, sort, limit) => localDatabase.filter(entityName, query, sort, limit),
        get: (id) => localDatabase.get(entityName, id),
        count: (query) => localDatabase.count(entityName, query),
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
  async verifyOtp() { return { success: true, access_token: 'local-token' }; },
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

export const localBase44 = {
  auth,
  entities: entityProxy,
  asServiceRole: { entities: entityProxy },
  functions,
  integrations,
  localDatabase,
};
