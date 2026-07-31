import { CareerEntityRepository } from '../repositories/CareerEntityRepository.js';

function clone(value) { return JSON.parse(JSON.stringify(value)); }

export async function runSprint2IntegrationTest() {
  const careers = new Map([
    ['career-a', { career_id: 'career-a', entities: {}, player: {}, metadata: {} }],
    ['career-b', { career_id: 'career-b', entities: {}, player: {}, metadata: {} }],
  ]);
  let activeId = 'career-a';
  const fakeRepository = {
    async ensureActiveCareer() { return clone(careers.get(activeId)); },
    async saveActiveCareer(career) { careers.set(activeId, clone(career)); return clone(career); },
  };
  const repo = new CareerEntityRepository(fakeRepository);
  const a = await repo.create('WorldEvent', { title: 'Evento exclusivo A' });
  activeId = 'career-b';
  const bBefore = await repo.filter('WorldEvent', { title: 'Evento exclusivo A' });
  const b = await repo.create('WorldEvent', { title: 'Evento exclusivo B' });
  activeId = 'career-a';
  const aRows = await repo.filter('WorldEvent', { id: a.id });
  const leakedB = await repo.filter('WorldEvent', { id: b.id });
  const success = aRows.length === 1 && bBefore.length === 0 && leakedB.length === 0;
  if (!success) throw new Error('Falha no isolamento das entidades entre carreiras na Sprint 2.');
  return { success, switchedWithoutLeak: true, careerAEvent: a.title, careerBEvent: b.title };
}

export function setupSprint2IntegrationTest() {
  if (typeof window !== 'undefined') window.PadelSprint2Test = { run: runSprint2IntegrationTest };
}
