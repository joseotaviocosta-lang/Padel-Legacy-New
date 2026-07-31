import { CareerManager } from '../../careers/CareerManager.js';

function clone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

export class ActiveCareerAdapter {
  constructor(careerManager = new CareerManager()) {
    this.careerManager = careerManager;
    this.activeCareer = null;
    this.activeCareerId = null;
  }

  setActiveCareer(career) {
    this.activeCareer = career ? clone(career) : null;
    this.activeCareerId = career?.career_id || null;
  }

  clearActiveCareer() {
    this.activeCareer = null;
    this.activeCareerId = null;
  }

  async getActiveCareer({ fresh = false } = {}) {
    const careerId = await this.careerManager.getLastCareer();
    if (!careerId) {
      this.clearActiveCareer();
      return null;
    }
    if (!fresh && this.activeCareer && this.activeCareerId === careerId) return clone(this.activeCareer);
    const career = await this.careerManager.loadCareer(careerId);
    this.setActiveCareer(career);
    return clone(this.activeCareer);
  }

  async ensureActiveCareer(options) {
    const career = await this.getActiveCareer(options);
    if (!career) throw new Error('Nenhuma carreira ativa encontrada. Escolha uma carreira na tela inicial.');
    return career;
  }

  async getPlayerProfile() {
    const career = await this.getActiveCareer();
    return career?.player?.id ? clone(career.player) : null;
  }

  async createPlayerProfile(profile = {}) {
    const career = await this.ensureActiveCareer({ fresh: true });

    // A criação precisa ser idempotente. Algumas telas chamam ensureMyProfile
    // mais de uma vez durante a montagem; se a carreira já possui jogador,
    // reutilizamos o registro existente e apenas completamos campos ausentes.
    if (career.player?.id) {
      const missingFields = Object.fromEntries(
        Object.entries(clone(profile) || {}).filter(([key, value]) => (
          key !== 'id'
          && value !== undefined
          && value !== null
          && (career.player[key] === undefined || career.player[key] === null)
        )),
      );

      if (Object.keys(missingFields).length === 0) {
        this.setActiveCareer(career);
        return clone(career.player);
      }

      const updated = {
        ...clone(career.player),
        ...missingFields,
        id: career.player.id,
        updated_date: new Date().toISOString(),
      };
      career.player = updated;
      const saved = await this.careerManager.saveCareer(career.career_id, career);
      this.setActiveCareer(saved);
      return clone(updated);
    }

    const now = new Date().toISOString();
    const created = {
      ...clone(profile),
      id: profile.id || `playerprofile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      created_date: profile.created_date || now,
      updated_date: now,
    };
    career.player = created;
    const saved = await this.careerManager.saveCareer(career.career_id, career);
    this.setActiveCareer(saved);
    return clone(created);
  }

  async updatePlayerProfile(id, updates = {}) {
    const career = await this.ensureActiveCareer({ fresh: true });
    const player = career.player || {};
    if (!player.id || player.id !== id) throw new Error('O PlayerProfile ativo não corresponde ao id informado.');
    const updated = { ...clone(player), ...clone(updates), id: player.id, updated_date: new Date().toISOString() };
    career.player = updated;
    const saved = await this.careerManager.saveCareer(career.career_id, career);
    this.setActiveCareer(saved);
    return clone(updated);
  }

  async saveActiveCareer(careerData = null) {
    const career = careerData ? clone(careerData) : await this.ensureActiveCareer({ fresh: true });
    const saved = await this.careerManager.saveCareer(career.career_id, career);
    this.setActiveCareer(saved);
    return clone(saved);
  }
}
