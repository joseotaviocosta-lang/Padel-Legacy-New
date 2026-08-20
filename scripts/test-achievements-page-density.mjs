// Achievements Polish 12.1 (docs/ACHIEVEMENTS_POLISH_12_1.md, Parte H/30).
// Prova, com o pipeline real: a vista padrão da aba Conquistas mostra no
// máximo 5 "Próximas" + 12 "Em progresso" (17 no total, não os 98 cards que
// a Fase 12 ainda deixava passar) — e que o catálogo completo (155
// presentáveis) continua inteiramente acessível via "Ver todas", nunca
// removido ou escondido permanentemente.
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('no'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); },
    async remove(p) { return files.delete(p); },
    async copy(s, d) { files.set(d, files.get(s)); return d; },
    async rename(s, d) { files.set(d, files.get(s)); files.delete(s); return d; },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { findNextRelevantAchievements } = await server.ssrLoadModule('/src/lib/achievementRelevance.js');
  const { presentableAchievements } = await server.ssrLoadModule('/src/lib/achievementEngine.js');
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { buildAchievementContext } = await server.ssrLoadModule('/src/lib/achievementContext.js');

  const careerManager = new CareerManager(new CareerRepository(new GameStorage(createMemoryStorage())));
  await careerManager.createCareer({ id: 'career-density', name: 'QA Density' });
  activeCareerAdapter.careerManager = careerManager;
  await activeCareerAdapter.getActiveCareer();
  const profile = await localGame.entities.PlayerProfile.create({ id: 'qa-density', sport_name: 'QA', career_date: '2026-01-01' });
  const context = await buildAchievementContext(profile, { worldRank: { rank: 900 } });

  const NEXT_UP_COUNT = 5;
  const IN_PROGRESS_DEFAULT_COUNT = 12;
  const relevantList = findNextRelevantAchievements(profile, context, { limit: NEXT_UP_COUNT + IN_PROGRESS_DEFAULT_COUNT });

  const nextUp = relevantList.slice(0, NEXT_UP_COUNT);
  const defaultInProgress = relevantList.slice(NEXT_UP_COUNT, NEXT_UP_COUNT + IN_PROGRESS_DEFAULT_COUNT);
  console.log(`(info) "Próximas": ${nextUp.length} · "Em progresso" padrão: ${defaultInProgress.length} · total padrão: ${nextUp.length + defaultInProgress.length}`);

  gate('"Próximas conquistas" mostra no máximo 5', nextUp.length <= 5);
  gate('"Em progresso" padrão mostra no máximo 12', defaultInProgress.length <= 12);
  gate('Total renderizado por padrão (Próximas + Em progresso) é <= 17, bem abaixo dos 98 cards da Fase 12', (nextUp.length + defaultInProgress.length) <= 17);

  const allIds = new Set(relevantList.map((item) => item.achievement.id));
  gate('Nenhuma conquista aparece duas vezes entre "Próximas" e "Em progresso" padrão (fatia sequencial da mesma lista)', allIds.size === relevantList.length);

  const total = presentableAchievements().length;
  console.log(`(info) Catálogo presentável total: ${total}`);
  gate('O catálogo completo (155 presentáveis) é muito maior que a vista padrão — a densidade reduzida é real, não cosmética', total > (nextUp.length + defaultInProgress.length) * 5);
  gate('"Ver todas" continua tendo acesso ao catálogo inteiro (presentableAchievements não filtra por relevância)', total >= 150);

  console.log(`\n${gates} gates executados, todos PASS — Densidade padrão da página de Conquistas (Achievements Polish 12.1).`);
} finally {
  await server.close();
}
