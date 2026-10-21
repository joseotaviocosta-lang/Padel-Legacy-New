// LOCAL-8D — sonda: a montagem da Loja (seedMarket + ensureExpandedShopCatalog,
// como em Shop.jsx) é idempotente? Carreira nova em memória; N "aberturas".
// Registra contagem de ShopItem, itens reescritos por abertura e o
// vai-e-volta de campos (preço/nome) de um mesmo item. Uso: node scripts/test-local-8d-shop-catalog-probe.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';
globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
const quiet = async (fn) => { const s = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; try { return await fn(); } finally { [console.warn, console.log, console.debug, console.error] = s; } };
const files = new Map();
const backend = { isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; }, async writeText(p, c) { files.set(p, String(c)); }, async readText(p) { if (!files.has(p)) { const e = new Error('m'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); }, async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); }, async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; }, async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'm' };
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
const rounds = [];
try {
  const L = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await L('/src/storage/GameStorage.js'); const { CareerRepository } = await L('/src/careers/CareerRepository.js'); const { CareerManager } = await L('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await L('/src/gameplay/services/runtime.js'); const { localGame } = await L('/src/api/localGameClient.js');
  const { ensureWorldSeed2025, verifySaveFoundation } = await L('/src/lib/saveFoundation.js');
  const { seedMarket } = await L('/src/lib/marketEngine.js'); const { ensureExpandedShopCatalog } = await L('/src/lib/storeCatalog.js');
  const manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
  activeCareerAdapter.careerManager = manager; activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ playerName: 'Loja 8D' }); activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'shop-player', sport_name: 'Loja 8D', career_date: '2026-01-01', energy: 100, coins: 950, xp: 0 });
  await quiet(async () => { const s = await verifySaveFoundation(); if (!s.ok) await ensureWorldSeed2025(); });
  let prev = new Map((await localGame.entities.ShopItem.list()).map((i) => [i.id, i]));
  for (let n = 1; n <= 4; n += 1) {
    await quiet(async () => { await seedMarket(); await ensureExpandedShopCatalog(); });
    const now = new Map((await localGame.entities.ShopItem.list()).map((i) => [i.id, i]));
    const created = [...now.keys()].filter((id) => !prev.has(id));
    const changed = [...now.entries()].filter(([id, i]) => prev.has(id) && JSON.stringify({ ...prev.get(id), updated_date: 0 }) !== JSON.stringify({ ...i, updated_date: 0 }));
    const sample = changed[0]?.[1];
    rounds.push({ open: n, items: now.size, created: created.length, createdNames: created.map((id) => now.get(id).name).slice(0, 4), rewritten: changed.length, sample: sample ? { id: sample.id, before: { name: prev.get(sample.id).name, price: prev.get(sample.id).price }, after: { name: sample.name, price: sample.price } } : null });
    console.log(JSON.stringify(rounds.at(-1)));
    prev = now;
  }
} finally { await vite.close(); }
mkdirSync('reports/local-8d-navigation-persistence-audit', { recursive: true });
writeFileSync('reports/local-8d-navigation-persistence-audit/shop-catalog-probe.json', JSON.stringify(rounds, null, 2));
