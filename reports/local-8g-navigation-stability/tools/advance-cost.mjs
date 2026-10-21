// LOCAL-8G — custo do avanço diário e da ativação num save grande (SSR, em
// memória): ativação, N avanços (ms por dia) e heap do processo.
// Uso: node --expose-gc reports/local-8g-navigation-stability/tools/advance-cost.mjs [cenário] [dias]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
const quiet = async (fn) => { const s = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; try { return await fn(); } finally { [console.warn, console.log, console.debug, console.error] = s; } };
const SAVES = 'reports/local-8a-career-audit/run10';
const id = process.argv[2] || 't10'; const days = Number(process.argv[3] || 3);
const file = { t1: `${SAVES}/save-season-1.json`, t5: `${SAVES}/save-season-5.json`, t10: `${SAVES}/save-season-10.json` }[id];
const files = new Map(); let writes = 0;
const backend = { isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; }, async writeText(p, c) { if (!String(p).includes('careers-index')) writes += 1; files.set(p, String(c)); }, async readText(p) { if (!files.has(p)) { const e = new Error('m'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); }, async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); }, async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; }, async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'm' };
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
const out = { scenario: id };
try {
  const L = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await L('/src/storage/GameStorage.js'); const { CareerRepository } = await L('/src/careers/CareerRepository.js'); const { CareerManager } = await L('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await L('/src/gameplay/services/runtime.js');
  const { advanceCareerDay } = await L('/src/game-core/calendarLifecycle.js');
  let init = null; try { init = await L('/src/game-core/careerSystemsInitialization.js'); } catch { init = null; }
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
  activeCareerAdapter.careerManager = manager; activeCareerAdapter.clearActiveCareer();
  await quiet(async () => { await manager.importCareer(data); activeCareerAdapter.setActiveCareer(await manager.loadCareer(data.career_id)); });
  if (init) { writes = 0; const t = performance.now(); await quiet(() => init.ensureCareerSystemsInitialized({ careerId: data.career_id })); out.activation = { ms: Math.round(performance.now() - t), writes }; }
  let p = (await activeCareerAdapter.getActiveCareer({ fresh: false })).player;
  out.days = [];
  for (let i = 0; i < days; i += 1) { writes = 0; const t = performance.now(); p = await quiet(() => advanceCareerDay(p, {})); out.days.push({ date: p?.career_date, ms: Math.round(performance.now() - t), writes }); }
  if (global.gc) global.gc();
  out.heapMB = Math.round(process.memoryUsage().heapUsed / 1048576);
  out.saveMB = Math.round(JSON.stringify(await manager.exportCareer(data.career_id)).length / 1048576 * 10) / 10;
  console.log(JSON.stringify(out));
} finally { await vite.close(); }
mkdirSync('reports/local-8g-navigation-stability', { recursive: true });
writeFileSync(`reports/local-8g-navigation-stability/advance-cost-${id}.json`, JSON.stringify(out, null, 2));
