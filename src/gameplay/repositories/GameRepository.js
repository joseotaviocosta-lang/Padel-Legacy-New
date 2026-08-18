import { ActiveCareerAdapter } from '../adapters/ActiveCareerAdapter.js';

export class GameRepository {
  constructor(adapter = new ActiveCareerAdapter()) { this.adapter = adapter; }
  setActiveCareer(career) { this.adapter.setActiveCareer(career); }
  clearActiveCareer() { this.adapter.clearActiveCareer(); }
  getActiveCareer(options) { return this.adapter.getActiveCareer(options); }
  ensureActiveCareer(options) { return this.adapter.ensureActiveCareer(options); }
  getPlayerProfile() { return this.adapter.getPlayerProfile(); }
  createPlayerProfile(profile) { return this.adapter.createPlayerProfile(profile); }
  ensureInitialData() { return this.adapter.ensureInitialData(); }
  updatePlayerProfile(id, updates) { return this.adapter.updatePlayerProfile(id, updates); }
  mutateActiveCareer(mutator, options) { return this.adapter.mutateActiveCareer(mutator, options); }
  withPersistenceTransaction(name, work, options) { return this.adapter.withPersistenceTransaction(name, work, options); }
  saveActiveCareer(career) { return this.adapter.saveActiveCareer(career); }
}
