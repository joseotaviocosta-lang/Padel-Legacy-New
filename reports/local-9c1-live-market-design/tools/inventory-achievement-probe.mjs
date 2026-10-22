// LOCAL-9C.1 — sonda somente-leitura: itens comprados pela Loja contam nas conquistas de coleção?
//
// achievementContext.fetchInventoryStats só conta linhas com `quantity > 0`. Shop.jsx buy()
// cria a linha de PlayerInventory SEM `quantity` (o schema da entidade não tem o campo).
// Carreira de memória; a compra repete as gravações de Shop.jsx buy() (única réplica).
// Uso: TZ=UTC node reports/local-9c1-live-market-design/tools/inventory-achievement-probe.mjs
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const { bootCareer } = await import('../../../scripts/lib/v526bTestKit.mjs');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mute = () => { const s = [console.log, console.warn, console.error, console.info, console.debug]; console.log = console.warn = console.error = console.info = console.debug = () => {}; return () => { [console.log, console.warn, console.error, console.info, console.debug] = s; }; };

let unmute = mute();
const { rt, profile } = await bootCareer('local-9c1-achievement-probe');
const E = rt.localGame.entities;
const market = await rt.load('/src/lib/marketEngine.js');
const store = await rt.load('/src/lib/storeCatalog.js');
const { buildAchievementContext } = await rt.load('/src/lib/achievementContext.js');
await market.seedMarket(profile.career_date); await store.ensureExpandedShopCatalog();
const items = ((await E.ShopItem.list('catalog_order', 2000)) || []).map(store.normalizeShopItem);
const p0 = await E.PlayerProfile.update(profile.id, { coins: 10_000_000, career_level: 50, ranking_position: 1, reputation: 99 });
const before = (await buildAchievementContext(p0)).inventory;
// Um item de cada raridade e categoria (lendário, mítico e exclusivo incluídos).
const picks = [];
for (const r of ['comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico', 'exclusivo']) picks.push(items.find((i) => i.rarity === r && i.catalog_order != null));
for (const c of ['raquete', 'grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'acessorio', 'colecionavel']) if (!picks.some((i) => i.category === c)) picks.push(items.find((i) => i.category === c && i.catalog_order != null));
let p = p0;
for (const item of picks) {
  // Shop.jsx buy(): mesmos campos, mesma ordem.
  await E.PlayerInventory.create({ profile_id: p.id, item_id: item.id, item_name: item.name, category: item.category, rarity: item.rarity, equipped: false, acquired_date: p.career_date, current_durability: item.durability || 100, usage_count: 0 });
  p = await E.PlayerProfile.update(p.id, { coins: (p.coins || 0) - item.price });
}
const rows = (await E.PlayerInventory.filter({ profile_id: p.id })) || [];
const after = (await buildAchievementContext(p)).inventory;
unmute();
const result = {
  generatedBy: 'tools/inventory-achievement-probe.mjs',
  bought: picks.map((i) => ({ name: i.name, rarity: i.rarity, category: i.category })),
  inventoryRows: rows.length,
  rowsWithQuantity: rows.filter((r) => Number(r.quantity) > 0).map((r) => ({ item_name: r.item_name, quantity: r.quantity, origin: r.id === 'inventory-001' ? 'localSeed' : 'compra' })),
  boughtRowsQuantityField: [...new Set(rows.filter((r) => r.id !== 'inventory-001').map((r) => String(r.quantity)))],
  contextBefore: { totalOwned: before.totalOwned, legendary: before.legendary, mythic: before.mythic, exclusive: before.exclusive, categories: before.categories, rarities: before.rarities },
  contextAfter: { totalOwned: after.totalOwned, legendary: after.legendary, mythic: after.mythic, exclusive: after.exclusive, categories: after.categories, rarities: after.rarities },
};
result.verdict = result.contextAfter.totalOwned === result.contextBefore.totalOwned && result.contextAfter.legendary === 0
  ? 'DEFEITO CONFIRMADO: itens comprados não contam para as conquistas de coleção (quantity ausente)'
  : 'itens comprados contam';
writeFileSync(resolve(OUT, 'inventory-achievement-probe.json'), `${JSON.stringify(result, null, 1)}\n`);
console.log(JSON.stringify({ ...result, bought: result.bought.length }, null, 1));
await rt.close();
process.exit(0);
