// LOCAL-8E — 8E-03: abrir a Loja não pode duplicar nem reescrever itens.
//
// Reprodução (LOCAL-8D 8D-03): a montagem da Loja (Shop.jsx) roda
// seedMarket() + ensureExpandedShopCatalog(). seedMarket() "reparava" os
// itens históricos casando por release_year+category entre TODOS os itens
// de manufacturer "Padel Heritage" — e dois colecionáveis do catálogo
// ampliado ("Medalha Circuito Local", raro → 2023; "Réplica Troféu Major",
// épico → 2024) têm o mesmo par de dois históricos. Eram renomeados para
// "Bola Dourada WPT Final (2023)"/"Raquete Dourada do Circuito (2024)" com
// preço de relíquia, e o catálogo (que reconcilia por nome) os recriava na
// visita seguinte: +2 itens por abertura. Além disso, o catálogo comparava o
// template com o item NORMALIZADO (preço × multiplicador de balanceamento) e
// regravava o mesmo preço a cada abertura.
//
// Para cada save (em memória; nenhum arquivo de save é escrito):
//   1. 10 aberturas da Loja: contagem estável depois da 1ª, zero criações e
//      zero regravações (JSON completo, inclusive updated_date);
//   2. ids, preços, raridade, bônus e disponibilidade preservados;
//   3. históricos (Padel Origins etc.) presentes e intactos;
//   4. save → load → Loja → save idêntico.
// Fixture sintética (documentada): save de temporada 5 com o catálogo já
// contaminado como o código antigo deixava (2 cópias renomeadas), com itens
// comprados/equipados (raro, histórico e o próprio item renomeado) e saldo.
// Nada disso pode ser apagado, renomeado ou repreçado.
// Uso: node scripts/test-local-8e-shop-integrity.mjs
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'vite';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
const quiet = async (fn) => { const s = [console.warn, console.log, console.debug, console.error]; console.warn = console.log = console.debug = console.error = () => {}; try { return await fn(); } finally { [console.warn, console.log, console.debug, console.error] = s; } };
let passed = 0; const failures = [];
const ok = (label, condition, detail = '') => { if (condition) { passed += 1; console.log(`PASS — ${label}`); } else { failures.push(label); console.log(`FAIL — ${label} ${detail}`); } };
function memoryBackend() {
  const files = new Map();
  return { isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; }, async writeText(p, c) { files.set(p, String(c)); }, async readText(p) { if (!files.has(p)) { const e = new Error('m'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); }, async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); }, async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; }, async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'm' };
}
const SAVES = 'reports/local-8a-career-audit/run10';
const FILES = { 'carreira-nova': 'reports/ui-redesign-532/fixtures/carreira-nova.json', t1: `${SAVES}/save-season-1.json`, t5: `${SAVES}/save-season-5.json`, t10: `${SAVES}/save-season-10.json` };
const OPENS = 10;
const report = { label: process.env.PL8E_LABEL || 'working-tree', saves: {} };
const STABLE_FIELDS = ['name', 'price', 'rarity', 'category', 'attribute_bonus', 'is_available', 'is_exclusive', 'release_year', 'collection'];

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const L = (p) => vite.ssrLoadModule(p);
  const { GameStorage } = await L('/src/storage/GameStorage.js'); const { CareerRepository } = await L('/src/careers/CareerRepository.js'); const { CareerManager } = await L('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await L('/src/gameplay/services/runtime.js'); const { localGame } = await L('/src/api/localGameClient.js');
  const { resetIdCollisionSequence } = await L('/src/gameplay/repositories/CareerEntityRepository.js');
  const { seedMarket, HISTORICAL_RARE_ITEMS } = await L('/src/lib/marketEngine.js'); const { ensureExpandedShopCatalog } = await L('/src/lib/storeCatalog.js');
  async function load(data) {
    resetIdCollisionSequence();
    const manager = new CareerManager(new CareerRepository(new GameStorage(memoryBackend())));
    activeCareerAdapter.careerManager = manager; activeCareerAdapter.clearActiveCareer();
    await quiet(async () => { await manager.importCareer(data); activeCareerAdapter.setActiveCareer(await manager.loadCareer(data.career_id)); });
    return manager;
  }
  // Mesma sequência da montagem de Shop.jsx.
  const openShop = () => quiet(async () => { await seedMarket(); await ensureExpandedShopCatalog(); });
  const snapshot = async () => {
    const career = await activeCareerAdapter.getActiveCareer({ fresh: false });
    const json = (rows) => new Map((rows || []).map((r) => [r.id, JSON.stringify(r)]));
    return { shop: json(career.entities.ShopItem), inventory: json(career.entities.PlayerInventory), coins: career.player?.coins ?? null, rows: career.entities.ShopItem || [] };
  };
  const delta = (a, b) => ({
    created: [...b.shop.keys()].filter((id) => !a.shop.has(id)),
    removed: [...a.shop.keys()].filter((id) => !b.shop.has(id)),
    rewritten: [...b.shop.keys()].filter((id) => a.shop.has(id) && a.shop.get(id) !== b.shop.get(id)),
  });
  const historicalNames = new Set(HISTORICAL_RARE_ITEMS.map((i) => i.name));

  async function runOpens(label, manager, careerId, extra = {}) {
    const timeline = [];
    let first = null; let prev = await snapshot(); const initial = prev;
    const t0 = performance.now();
    for (let n = 1; n <= OPENS; n += 1) {
      const t = performance.now();
      await openShop();
      const now = await snapshot();
      const d = delta(prev, now);
      timeline.push({ open: n, items: now.shop.size, created: d.created.length, rewritten: d.rewritten.length, removed: d.removed.length, ms: Math.round(performance.now() - t), createdNames: d.created.map((id) => JSON.parse(now.shop.get(id)).name).slice(0, 4) });
      if (n === 1) first = now;
      prev = now;
    }
    const total = Math.round(performance.now() - t0);
    const later = timeline.slice(1);
    const createdLater = later.reduce((s, x) => s + x.created, 0);
    const rewrittenLater = later.reduce((s, x) => s + x.rewritten, 0);
    ok(`${label}: contagem estável da 2ª à 10ª abertura (${timeline.map((x) => x.items).join('→')})`, later.every((x) => x.items === first.shop.size));
    ok(`${label}: nenhuma criação depois da 1ª abertura (${createdLater})`, createdLater === 0, JSON.stringify(later.filter((x) => x.created).slice(0, 2)));
    ok(`${label}: nenhuma regravação redundante depois da 1ª abertura (${rewrittenLater} registro(s))`, rewrittenLater === 0);
    ok(`${label}: nenhum item removido`, timeline.every((x) => x.removed === 0));
    const changedFields = [...first.shop.keys()].filter((id) => {
      const a = JSON.parse(first.shop.get(id)); const b = JSON.parse(prev.shop.get(id) || 'null');
      return !b || STABLE_FIELDS.some((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
    });
    ok(`${label}: nome/preço/raridade/bônus/disponibilidade preservados após 10 aberturas (${changedFields.length} divergente(s))`, changedFields.length === 0);
    const names = prev.rows.map((r) => r.name);
    const dupCatalog = ['Medalha Circuito Local', 'Réplica Troféu Major'].map((n) => names.filter((x) => x === n).length);
    ok(`${label}: colecionáveis do catálogo existem uma vez cada (${dupCatalog.join('/')})`, dupCatalog.every((c) => c === 1));
    // Relíquias: nos saves atuais o seedMarket nunca as cria (localSeed já traz
    // um MarketEvent ativo → retorno antecipado; preexistente, ver doc). Aqui só
    // se exige que a Loja não as crie/duplique/renomeie ao abrir.
    const relicsFirst = first.rows.filter((r) => historicalNames.has(r.name) && r.catalog_order == null).length;
    const relicsLast = prev.rows.filter((r) => historicalNames.has(r.name) && r.catalog_order == null).length;
    // Colecionável do catálogo com nome de relíquia = cópia renomeada pelo
    // código antigo. Saves legados podem tê-las (preservadas); abrir a Loja
    // não pode produzir nenhuma nova.
    const fake = (rows) => rows.filter((r) => historicalNames.has(r.name) && r.catalog_order != null).length;
    const fakeBefore = fake(initial.rows); const fakeRelics = fake(prev.rows);
    ok(`${label}: relíquias estáveis (${relicsFirst} → ${relicsLast}) e nenhuma nova cópia renomeada como relíquia (${fakeBefore} → ${fakeRelics})`, relicsFirst === relicsLast && fakeRelics === fakeBefore);
    // Save/load.
    const exported = await manager.exportCareer(careerId);
    const second = await load(JSON.parse(JSON.stringify(exported)));
    const s0 = await snapshot();
    await openShop();
    const s1 = await snapshot();
    const d = delta(s0, s1);
    ok(`${label}: save → load → Loja: zero criações/regravações (${d.created.length}/${d.rewritten.length})`, d.created.length + d.rewritten.length + d.removed.length === 0);
    const reexported = await second.exportCareer(careerId);
    ok(`${label}: inventário e saldo preservados no ciclo save/load`, JSON.stringify(reexported.entities.PlayerInventory || []) === JSON.stringify(exported.entities.PlayerInventory || []) && reexported.player?.coins === exported.player?.coins);
    report.saves[label] = { timeline, totalMs: total, items: prev.shop.size, relics: relicsLast, ...extra };
    return prev;
  }

  for (const [label, file] of Object.entries(FILES)) {
    if (!existsSync(file)) { console.log(`SKIP — ${label}: ${file} ausente`); continue; }
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const manager = await load(data);
    await runOpens(label, manager, data.career_id, { itemsInSave: (data.entities.ShopItem || []).length });
  }

  // Fixture sintética: catálogo contaminado pelo código antigo + compras.
  {
    const data = JSON.parse(readFileSync(FILES.t5, 'utf8'));
    const manager = await load(data);
    await openShop();
    const career = await activeCareerAdapter.getActiveCareer({ fresh: false });
    const rows = career.entities.ShopItem;
    const medal = rows.find((r) => r.name === 'Medalha Circuito Local');
    const replica = rows.find((r) => r.name === 'Réplica Troféu Major');
    // Relíquias sintéticas (o seedMarket não as cria nestes saves): uma 1969
    // com o preço antigo de antes da Fase 0 (o reparo legítimo tem de seguir
    // funcionando) e a 2023 colecionável — mesma chave da colisão.
    const [h1969, h2023] = ['1969:raquete', '2023:colecionavel'].map((k) => HISTORICAL_RARE_ITEMS.find((i) => `${i.release_year}:${i.category}` === k));
    const reliquia = await localGame.entities.ShopItem.create({ ...h1969, is_available: true, price: 250000 });
    const reliquia2023 = await localGame.entities.ShopItem.create({ ...h2023, is_available: true });
    const rare = rows.find((r) => r.rarity === 'raro' && r.category === 'raquete');
    // Cópias renomeadas exatamente como o seedMarket antigo deixava (o
    // catálogo recriava o original na visita seguinte).
    const byYear = new Map(HISTORICAL_RARE_ITEMS.map((i) => [`${i.release_year}:${i.category}`, i]));
    const legacy = [];
    for (const source of [medal, replica, medal]) {
      const { id, ...copy } = source;
      const h = byYear.get(`${source.release_year}:${source.category}`);
      legacy.push(await localGame.entities.ShopItem.create({ ...copy, name: h.name, description: h.description, price: h.price, history: h.history, collection: h.collection }));
    }
    const profileId = career.player?.id || data.player?.id;
    const inv = [];
    for (const [item, equipped] of [[rare, true], [reliquia, false], [legacy[0], false], [medal, true]]) {
      inv.push(await localGame.entities.PlayerInventory.create({ profile_id: profileId, item_id: item.id, item_name: item.name, category: item.category, rarity: item.rarity, equipped, acquired_date: '2030-03-01', current_durability: item.durability || 100, usage_count: 3 }));
    }
    await openShop();
    const repaired = await localGame.entities.ShopItem.get(reliquia.id);
    ok(`fixture: reparo legítimo de relíquia preservado (preço legado 250000 → ${repaired?.price})`, repaired?.price === h1969.price && repaired?.name === h1969.name);
    const r2023 = await localGame.entities.ShopItem.get(reliquia2023.id);
    ok('fixture: relíquia 2023 verdadeira continua reconhecida e intacta', r2023?.name === h2023.name && r2023?.price === h2023.price && r2023?.catalog_order == null);
    const before = await snapshot();
    const legacyBefore = legacy.map((l) => before.shop.get(l.id));
    const after = await runOpens('fixture-legado-contaminado', manager, data.career_id, { legacyRenamedCopies: legacy.length, inventoryRows: inv.length });
    ok('fixture: cópias renomeadas legadas preservadas byte a byte (não apagadas, não repreçadas)', legacy.every((l, i) => after.shop.get(l.id) === legacyBefore[i]));
    ok('fixture: inventário (comprado/equipado/raro/histórico/legado) intacto', [...before.inventory].every(([id, j]) => after.inventory.get(id) === j) && after.inventory.size === before.inventory.size);
    ok('fixture: itens referenciados pelo inventário seguem existindo com o mesmo id', inv.every((r) => after.shop.has(r.item_id)));
    ok('fixture: saldo intacto', after.coins === before.coins);
    const delta0 = delta(before, after);
    ok(`fixture: abertura sobre catálogo contaminado não cria nem reescreve (${delta0.created.length}/${delta0.rewritten.length})`, delta0.created.length + delta0.rewritten.length === 0);
  }
} finally { await vite.close(); }
mkdirSync('reports/local-8e-p1-navigation-integrity', { recursive: true });
writeFileSync(`reports/local-8e-p1-navigation-integrity/shop-${report.label}.json`, JSON.stringify({ ...report, passed, failures }, null, 2));
console.log(`test-local-8e-shop-integrity: ${passed} PASS · ${failures.length} FAIL`);
if (failures.length) process.exitCode = 1;
