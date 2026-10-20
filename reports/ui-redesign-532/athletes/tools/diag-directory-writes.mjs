// Fase 5.32-C — diagnóstico (só leitura do save real; tudo em memória):
// o que a MONTAGEM do diretório de atletas grava, desde antes desta fase.
//   ensureAthleteProfiles(): cria perfis de bots ausentes no save;
//   generateRelationships(): regrava `relationships` de até 200 atletas.
// Uso: node reports/ui-redesign-532/athletes/tools/diag-directory-writes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const SAVE = 'reports/local-8a-career-audit/run10/save-season-10.json';
const files = new Map();
const backend = {
  isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
  async writeText(p, c) { files.set(p, String(c)); },
  async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
  async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
  async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
  async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'memória',
};
const quiet = async (fn) => { const s = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; try { return await fn(); } finally { [console.warn, console.log, console.debug, console.error] = s; } };
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const load = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await load('/src/storage/GameStorage.js');
  const { CareerRepository } = await load('/src/careers/CareerRepository.js');
  const { CareerManager } = await load('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await load('/src/gameplay/services/runtime.js');
  const { localGame } = await load('/src/api/localGameClient.js');
  const { ensureAthleteProfiles, generateRelationships } = await load('/src/lib/athleteBehavior.js');
  const manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
  activeCareerAdapter.careerManager = manager;
  const data = JSON.parse(readFileSync(SAVE, 'utf8'));
  await quiet(async () => { await manager.importCareer(data); activeCareerAdapter.setActiveCareer(await manager.loadCareer(data.career_id)); });
  const before = await localGame.entities.AthleteProfile.list('-overall_rating');
  await quiet(() => ensureAthleteProfiles());
  const afterEnsure = await localGame.entities.AthleteProfile.list('-overall_rating');
  const created = afterEnsure.filter((a) => !before.some((b) => b.id === a.id));
  const relBefore = new Map(afterEnsure.map((a) => [a.id, JSON.stringify(a.relationships || null)]));
  await quiet(() => generateRelationships());
  const relAfter1 = new Map((await localGame.entities.AthleteProfile.list('-overall_rating')).map((a) => [a.id, JSON.stringify(a.relationships || null)]));
  await quiet(() => generateRelationships());
  const relAfter2 = new Map((await localGame.entities.AthleteProfile.list('-overall_rating')).map((a) => [a.id, JSON.stringify(a.relationships || null)]));
  const changed1 = [...relAfter1].filter(([id, v]) => relBefore.get(id) !== v).length;
  const changed2 = [...relAfter2].filter(([id, v]) => relAfter1.get(id) !== v).length;
  const out = {
    save: SAVE,
    athletesInSave: before.length,
    createdByEnsureAthleteProfiles: created.length,
    createdSample: created.slice(0, 5).map((a) => ({ id: a.id, name: a.name, overall: a.overall_rating, points: a.world_ranking_points ?? a.ranking_points ?? null })),
    createdWithWorldPoints: created.filter((a) => Number(a.world_ranking_points ?? a.ranking_points) > 0).length,
    relationshipsChangedFirstOpen: changed1,
    relationshipsChangedSecondOpen: changed2,
    note: 'Comportamento anterior à 5.32-C (montagem do diretório). Não alterado nesta fase: mudar exigiria tocar em persistência/geração de dados.',
  };
  writeFileSync('reports/ui-redesign-532/athletes/directory-writes.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
} finally {
  await vite.close();
}
