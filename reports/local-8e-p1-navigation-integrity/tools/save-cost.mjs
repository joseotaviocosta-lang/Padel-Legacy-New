// LOCAL-8E — custo no save de 3 aberturas de cada tela (Mercado, Jornal,
// Loja) em SSR com save em memória: tamanho exportado antes/depois, gravações
// do backend (writeText) e custo de serializar o save.
// Uso: PL8E_LABEL=<rótulo> node reports/local-8e-p1-navigation-integrity/tools/save-cost.mjs <cenário…>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
const quiet = async (fn) => { const s = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; try { return await fn(); } finally { [console.warn, console.log, console.debug, console.error] = s; } };
const SAVES = 'reports/local-8a-career-audit/run10';
const FILES = { 'carreira-nova': 'reports/ui-redesign-532/fixtures/carreira-nova.json', t1: `${SAVES}/save-season-1.json`, t5: `${SAVES}/save-season-5.json`, t10: `${SAVES}/save-season-10.json` };
const label = process.env.PL8E_LABEL || 'working-tree';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FILES);
const out = { label, scenarios: {} };
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const L = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await L('/src/storage/GameStorage.js'); const { CareerRepository } = await L('/src/careers/CareerRepository.js'); const { CareerManager } = await L('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await L('/src/gameplay/services/runtime.js');
  const { resetIdCollisionSequence } = await L('/src/gameplay/repositories/CareerEntityRepository.js');
  const { getGlobalMarketSnapshot } = await L('/src/game-core/globalMarketLifecycle.js');
  const { generateJournal } = await L('/src/lib/journal.js');
  const { seedMarket } = await L('/src/lib/marketEngine.js'); const { ensureExpandedShopCatalog } = await L('/src/lib/storeCatalog.js');
  const SCREENS = {
    mercado: async (p) => getGlobalMarketSnapshot(p, p.career_date),
    jornal: async () => generateJournal(),
    loja: async () => { await seedMarket(); await ensureExpandedShopCatalog(); },
  };
  for (const id of ids) {
    if (!existsSync(FILES[id])) continue;
    const data = JSON.parse(readFileSync(FILES[id], 'utf8'));
    out.scenarios[id] = {};
    for (const [screen, open] of Object.entries(SCREENS)) {
      resetIdCollisionSequence();
      let writes = 0; let bytesWritten = 0; const files = new Map();
      const backend = { isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; }, async writeText(p, c) { writes += 1; bytesWritten += String(c).length; files.set(p, String(c)); }, async readText(p) { if (!files.has(p)) { const e = new Error('m'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); }, async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); }, async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; }, async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'm' };
      const manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
      activeCareerAdapter.careerManager = manager; activeCareerAdapter.clearActiveCareer();
      await quiet(async () => { await manager.importCareer(data); activeCareerAdapter.setActiveCareer(await manager.loadCareer(data.career_id)); });
      const t0 = performance.now(); const size0 = JSON.stringify(await manager.exportCareer(data.career_id)).length; const serializeMs = Math.round(performance.now() - t0);
      const profile = (await activeCareerAdapter.getActiveCareer({ fresh: false })).player;
      writes = 0; bytesWritten = 0;
      const ms = [];
      for (let i = 0; i < 3; i += 1) { const t = performance.now(); await quiet(() => open(profile)); ms.push(Math.round(performance.now() - t)); }
      const size1 = JSON.stringify(await manager.exportCareer(data.career_id)).length;
      out.scenarios[id][screen] = { openMs: ms, saveWrites: writes, bytesWritten, saveBytesBefore: size0, saveBytesDelta: size1 - size0, exportSerializeMs: serializeMs };
      console.log(id, screen, JSON.stringify(out.scenarios[id][screen]));
    }
  }
} finally { await vite.close(); }
writeFileSync(`reports/local-8e-p1-navigation-integrity/save-cost-${label}.json`, JSON.stringify(out, null, 2));
