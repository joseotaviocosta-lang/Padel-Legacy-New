import { ActiveCareerAdapter } from '../adapters/ActiveCareerAdapter.js';

export class GameRepository {
  constructor(adapter = new ActiveCareerAdapter()) { this.adapter = adapter; }
  setActiveCareer(career) { this.adapter.setActiveCareer(career); }
  clearActiveCareer() { this.adapter.clearActiveCareer(); }
  getActiveCareer(options) { return this.adapter.getActiveCareer(options); }
  ensureActiveCareer(options) { return this.adapter.ensureActiveCareer(options); }
  getPlayerProfile() { return this.adapter.getPlayerProfile(); }
  createPlayerProfile(profile) { return this.adapter.createPlayerProfile(profile); }
  updatePlayerProfile(id, updates) { return this.adapter.updatePlayerProfile(id, updates); }
  mutateActiveCareer(mutator) { return this.adapter.mutateActiveCareer(mutator); }
  saveActiveCareer(career) { return this.adapter.saveActiveCareer(career); }
}
