import { ActiveCareerAdapter } from '../adapters/ActiveCareerAdapter.js';

function clone(value) { return JSON.parse(JSON.stringify(value)); }

export async function runGameplayIntegrationTest() {
  const careers = new Map([
    ['career-a', { career_id: 'career-a', player: { id: 'player-a', xp: 10 } }],
    ['career-b', { career_id: 'career-b', player: { id: 'player-b', xp: 20 } }],
  ]);
  let activeId = 'career-a';
  const manager = {
    async getLastCareer() { return activeId; },
    async loadCareer(id) { return clone(careers.get(id)); },
    async saveCareer(id, data) { careers.set(id, clone(data)); return clone(data); },
  };
  const adapter = new ActiveCareerAdapter(manager);
  const first = await adapter.getPlayerProfile();
  await adapter.updatePlayerProfile('player-a', { xp: 99 });
  activeId = 'career-b';
  const second = await adapter.getPlayerProfile();
  await adapter.updatePlayerProfile('player-b', { xp: 55 });
  const a = careers.get('career-a').player;
  const b = careers.get('career-b').player;
  const success = first.id === 'player-a' && second.id === 'player-b' && a.xp === 99 && b.xp === 55;
  if (!success) throw new Error('Falha na independência entre carreiras da Fase 1F.');
  return { success, careerA: a, careerB: b, switchedWithoutLeak: true };
}

export function setupGameplayIntegrationTest() {
  if (typeof window !== 'undefined') {
    window.PadelGameplayTest = { run: runGameplayIntegrationTest };
  }
}
