// LOCAL-9C.2-B — auditoria das conquistas de coleção + reprodução do defeito.
//
// Módulos REAIS do jogo (Vite SSR) sobre carreiras em MEMÓRIA
// (scripts/lib/v526bTestKit.mjs): nenhum save real é lido ou gravado.
// Catálogo pelo mesmo caminho da ativação da carreira (seedMarket +
// ensureExpandedShopCatalog). Compras pela operação canônica da 9C.2-A.
//
// Uso: TZ=UTC node reports/local-9c2-b-collection-achievements/tools/audit-repro.mjs --out=<arquivo.json>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { bootCareer, reloadCareer } = await import(pathToFileURL(resolve(ROOT, 'scripts/lib/v526bTestKit.mjs')).href);
const OUT = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6) || resolve(ROOT, 'reports/local-9c2-b-collection-achievements/audit-repro.json');
let quietDepth = 0; let saved = null;
const quiet = async (fn) => { if (quietDepth++ === 0) { saved = [console.warn, console.log, console.debug, console.error, console.info]; console.warn = console.log = console.debug = console.error = console.info = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error, console.info] = saved; } };

export const COLLECTION_TRIGGERS = ['own_items', 'own_legendary', 'own_mythic', 'own_exclusive', 'own_rackets', 'own_shoes', 'own_apparel', 'own_tech', 'all_categories', 'all_rarities'];
const METRIC = { own_items: 'totalOwned', own_legendary: 'legendary', own_mythic: 'mythic', own_exclusive: 'exclusive', own_rackets: 'rackets', own_shoes: 'shoes', own_apparel: 'apparel', own_tech: 'tech', all_categories: 'categories (vs totalCategoriesInCatalog)', all_rarities: 'rarities (vs totalRaritiesInCatalog)' };

const booted = await quiet(() => bootCareer('9c2b-audit'));
let { rt } = booted; const { storage, careerId } = booted;
let E = rt.localGame.entities;
const L = (p) => rt.load(p);
const data = await L('/src/lib/achievementsData.js');
const engine = await L('/src/lib/achievementEngine.js');
const AC = await L('/src/lib/achievementContext.js');
const store = await L('/src/lib/storeCatalog.js');
const market = await L('/src/lib/marketEngine.js');
const eco = await L('/src/lib/sportsEconomyV26.js');
const T = await L('/src/game-core/shopTransactions.js');
const lifecycle = await L('/src/game-core/achievementLifecycle.js');
await quiet(async () => { await market.seedMarket(booted.profile.career_date); await store.ensureExpandedShopCatalog(); });

const collection = data.ACHIEVEMENT_CATALOG.filter((a) => COLLECTION_TRIGGERS.includes(a.trigger_type));
const sideCollection = data.ACHIEVEMENT_CATALOG.filter((a) => a.category === 'coleção' && !COLLECTION_TRIGGERS.includes(a.trigger_type));
const raw = (await E.ShopItem.list()) || [];
const items = raw.map((r) => ({ raw: r, n: store.normalizeShopItem(r) }));
const months = Array.from({ length: 120 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-15`);
const purchasable = (it) => it.raw.is_available !== false && months.some((d) => eco.getEquipmentMarketState(it.n, { career_date: d }).available);
const eligible = {
  own_items: (it) => true,
  own_legendary: (it) => it.raw.rarity === 'lendario' || it.raw.rarity === 'lendário',
  own_mythic: (it) => it.raw.rarity === 'mitico' || it.raw.rarity === 'mítico',
  own_exclusive: (it) => Boolean(it.raw.is_exclusive),
  own_rackets: (it) => it.raw.category === 'raquete',
  own_shoes: (it) => it.raw.category === 'tenis',
  own_apparel: (it) => it.raw.category === 'roupa',
  own_tech: (it) => it.raw.category === 'acessorio_tec',
};
const audit = collection.map((a) => {
  const pick = eligible[a.trigger_type];
  const pool = pick ? items.filter(pick) : null;
  const buyable = pool ? pool.filter(purchasable) : null;
  return {
    id: a.id, name: a.name, description: a.description, trigger: a.trigger_type, metric: `context.inventory.${METRIC[a.trigger_type]}`,
    threshold: a.threshold, coins: a.coins_reward, xp: a.xp_reward, category: a.category,
    eligibleInSave: pool ? pool.length : null, purchasable: buyable ? buyable.length : null,
    eligibleNormalized: pick ? items.filter((it) => (a.trigger_type === 'own_legendary' ? it.n.rarity === 'lendario' : a.trigger_type === 'own_mythic' ? it.n.rarity === 'mitico' : pick(it))).length : null,
    reachable: pool ? (buyable.length >= a.threshold) : null,
  };
});
const rawRarities = [...new Set(raw.map((r) => r.rarity))];
const rawCategories = [...new Set(raw.map((r) => r.category))];

// ── Reprodução: compras canônicas não contam ───────────────────────────────
const P = () => E.PlayerProfile.get(booted.profile.id);
await E.PlayerProfile.update(booted.profile.id, { coins: 50_000_000, career_level: 50, ranking_position: 1, reputation: 99 });
const ctx0 = (await quiet(async () => AC.buildAchievementContext(await P()))).inventory;
const evalCollection = async () => {
  const p = await P();
  const ctx = await quiet(() => AC.buildAchievementContext(p));
  return { inventory: Object.fromEntries(['totalOwned', 'categories', 'rarities', 'legendary', 'mythic', 'exclusive', 'rackets', 'shoes', 'apparel', 'tech', 'totalCategoriesInCatalog', 'totalRaritiesInCatalog'].map((k) => [k, ctx.inventory[k]])), rows: engine.evaluateAchievements(p, ctx).filter((r) => COLLECTION_TRIGGERS.includes(r.achievement.trigger_type)).map((r) => ({ id: r.achievement.id, value: r.value, percent: r.percent, unlocked: r.unlocked })) };
};
// Compra 1 item de cada categoria e raridade, uma relíquia (exclusiva) no mês em que está na rotação.
const bought = [];
const want = [];
for (const r of ['comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico']) want.push(items.find((it) => it.n.rarity === r && it.raw.catalog_order != null));
for (const c of ['raquete', 'grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'acessorio', 'colecionavel']) if (!want.some((it) => it.n.category === c)) want.push(items.find((it) => it.n.category === c && it.raw.catalog_order != null));
for (const it of want) {
  const month = months.find((d) => eco.getEquipmentMarketState(it.n, { career_date: d }).available);
  await E.PlayerProfile.update(booted.profile.id, { career_date: month });
  const r = await quiet(() => T.purchaseShopItem(booted.profile.id, it.n.id, { operationId: `audit-${it.n.id}` }));
  bought.push({ name: it.n.name, category: it.n.category, rarity: it.n.rarity, result: r.code, price: r.price ?? null });
}
const relic = items.find((it) => String(it.n.id).startsWith('historical-relic-'));
{
  const month = months.find((d) => eco.getEquipmentMarketState(relic.n, { career_date: d }).available);
  await E.PlayerProfile.update(booted.profile.id, { career_date: month });
  const r = await quiet(() => T.purchaseShopItem(booted.profile.id, relic.n.id, { operationId: 'audit-relic' }));
  bought.push({ name: relic.n.name, category: relic.n.category, rarity: relic.n.rarity, is_exclusive: relic.raw.is_exclusive, result: r.code, price: r.price ?? null });
}
const invRows = ((await E.PlayerInventory.filter({ profile_id: booted.profile.id })) || []).map((r) => ({ id: r.id, item: r.item_name, quantity: r.quantity === undefined ? '(ausente)' : r.quantity, starter_seed: Boolean(r.starter_seed) }));
const afterBuy = await evalCollection();
const coinsBeforeDay = (await P()).coins;
const day = await quiet(async () => lifecycle.processAchievementsDay(await P()));
const pa = ((await E.PlayerAchievement.filter({ profile_id: booted.profile.id })) || []).filter((r) => collection.some((a) => a.id === r.achievement_id));
rt = await quiet(() => reloadCareer(rt, storage, careerId));
E = rt.localGame.entities;
const AC2 = await rt.load('/src/lib/achievementContext.js');
const ctxReload = (await quiet(async () => AC2.buildAchievementContext(await E.PlayerProfile.get(booted.profile.id)))).inventory;
await rt.close();

const report = {
  generatedBy: 'LOCAL-9C.2-B audit-repro',
  head: process.env.PL9C2B_LABEL || null,
  catalog: { shopItems: raw.length, rawRarities, rawCategories, sideCollection: sideCollection.map((a) => ({ id: a.id, name: a.name, trigger: a.trigger_type, evaluable: engine.EVALUABLE_TRIGGER_TYPES.has(a.trigger_type), coins: a.coins_reward })) },
  audit, totalCoins: audit.reduce((s, a) => s + a.coins, 0), count: audit.length,
  repro: {
    contextBeforePurchases: { totalOwned: ctx0.totalOwned, categories: ctx0.categories, rarities: ctx0.rarities },
    bought, inventoryRows: invRows, afterPurchases: afterBuy,
    dayClose: { unlockedCount: day.unlocked, collectionAchievementRows: pa.map((r) => ({ id: r.achievement_id, reward_delivered: r.reward_delivered, reward_coins: r.reward_coins, reconciled: r.reconciled })), coinsDelta: (day.profile?.coins ?? coinsBeforeDay) - coinsBeforeDay },
    afterReload: { totalOwned: ctxReload.totalOwned, categories: ctxReload.categories, rarities: ctxReload.rarities, legendary: ctxReload.legendary, mythic: ctxReload.mythic, exclusive: ctxReload.exclusive },
  },
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 1)}\n`);
console.log(JSON.stringify({ count: report.count, totalCoins: report.totalCoins, rawRarities, rawCategories, audit: audit.map((a) => [a.name, a.threshold, a.eligibleInSave, a.purchasable, a.reachable]), bought: bought.map((b) => b.result), invRows, afterBuy: afterBuy.inventory, day: report.repro.dayClose, reload: report.repro.afterReload }, null, 1));
