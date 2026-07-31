import { ActiveCareerAdapter } from '../adapters/ActiveCareerAdapter.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class InMemoryCareerManager {
  constructor(career) {
    this.career = clone(career);
  }

  async getLastCareer() {
    return this.career.career_id;
  }

  async loadCareer() {
    return clone(this.career);
  }

  async saveCareer(careerId, career) {
    if (careerId !== this.career.career_id) throw new Error('careerId inesperado no teste.');
    this.career = clone(career);
    return clone(this.career);
  }
}

export async function runProfileLoadingHotfixTest() {
  const manager = new InMemoryCareerManager({
    career_id: 'profile-hotfix-test',
    player: {
      id: 'existing-player',
      sport_name: 'Jogador existente',
      xp: 25,
    },
  });
  const adapter = new ActiveCareerAdapter(manager);

  const first = await adapter.createPlayerProfile({
    sport_name: 'Não deve sobrescrever',
    created_by_id: 'local-user',
  });
  const second = await adapter.createPlayerProfile({ created_by_id: 'local-user' });

  const success = first.id === 'existing-player'
    && second.id === 'existing-player'
    && first.sport_name === 'Jogador existente'
    && second.created_by_id === 'local-user';

  if (!success) {
    throw new Error('A criação idempotente do PlayerProfile não preservou o perfil existente.');
  }

  return {
    success: true,
    reusedExistingProfile: true,
    preservedPlayerId: second.id,
    ownershipRepaired: second.created_by_id === 'local-user',
  };
}

export function setupProfileLoadingHotfixTest() {
  if (typeof window !== 'undefined') {
    window.PadelProfileHotfixTest = { run: runProfileLoadingHotfixTest };
  }
}
