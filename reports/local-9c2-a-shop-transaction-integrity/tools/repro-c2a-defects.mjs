// LOCAL-9C.2-A — reprodução dos defeitos C2A-01..04 da LOCAL-9C.1.
//
// Módulos REAIS do jogo (Vite SSR) sobre carreiras em MEMÓRIA
// (scripts/lib/v526bTestKit.mjs): nenhum save real é lido ou gravado.
//
// Modo "legacy": réplica fiel, passo a passo, de Shop.jsx buy() e
// Inventory.jsx sellItem() do HEAD 173562e (componentes React não rodam em
// Node). Mesmas gravações, na mesma ordem, com o perfil EM MEMÓRIA da tela.
// Modo "canonical": os mesmos cenários pela operação de domínio
// (src/game-core/shopTransactions.js), quando ela existe.
//
// Uso: TZ=UTC node reports/local-9c2-a-shop-transaction-integrity/tools/repro-c2a-defects.mjs [--out=<arquivo.json>]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { bootCareer } = await import(pathToFileURL(resolve(ROOT, 'scripts/lib/v526bTestKit.mjs')).href);
const OUT = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6) || resolve(ROOT, 'reports/local-9c2-a-shop-transaction-integrity/repro-defects.json');
const HAS_CANONICAL = existsSync(resolve(ROOT, 'src/game-core/shopTransactions.js'));

let quietDepth = 0; let saved = null;
const quiet = async (fn) => { if (process.env.PL9C2A_VERBOSE) return fn(); if (quietDepth++ === 0) { saved = [console.warn, console.log, console.debug, console.error, console.info]; console.warn = console.log = console.debug = console.error = console.info = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error, console.info] = saved; } };

async function prepare(seed) {
  const booted = await quiet(() => bootCareer(`9c2a-repro-${seed}`));
  const ctx = { ...booted, E: booted.rt.localGame.entities, load: (p) => booted.rt.load(p) };
  ctx.store = await ctx.load('/src/lib/storeCatalog.js');
  ctx.market = await ctx.load('/src/lib/marketEngine.js');
  ctx.eco = await ctx.load('/src/lib/sportsEconomyV26.js');
  ctx.S = await ctx.load('/src/lib/sponsors.js');
  ctx.PA = (await ctx.load('/src/gameplay/adapters/PlayerAdapter.js')).PlayerAdapter;
  if (HAS_CANONICAL) ctx.T = await ctx.load('/src/game-core/shopTransactions.js');
  await quiet(async () => { await ctx.market.seedMarket(ctx.profile.career_date); await ctx.store.ensureExpandedShopCatalog(); });
  ctx.profile = await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 100_000, career_level: 50, ranking_position: 5, reputation: 95, tournaments_played: 10 });
  ctx.items = ((await ctx.E.ShopItem.list('catalog_order', 2000)) || []).map(ctx.store.normalizeShopItem);
  return ctx;
}
const P = (ctx) => ctx.E.PlayerProfile.get(ctx.profile.id);
const inv = async (ctx) => (await ctx.E.PlayerInventory.filter({ profile_id: ctx.profile.id })) || [];
const ledger = async (ctx) => ((await ctx.E.FinancialTransaction.filter({ profile_id: ctx.profile.id })) || []).filter((t) => t.category === 'loja');
const byName = (ctx, name) => ctx.items.find((i) => i.name === name);

// ── Réplica de Shop.jsx buy() (HEAD 173562e) ─────────────────────────────────
// Estado da tela carregado uma vez (loadModuleTasks) e o perfil em memória.
async function loadShopScreen(ctx, profile) {
  const [events, histories, contracts, inventory] = await Promise.all([
    ctx.E.MarketEvent.filter({ is_active: true }, '-priority', 20),
    ctx.E.MarketPriceHistory.filter({}, '-last_updated_date', 200),
    ctx.E.PlayerContract.filter({ profile_id: profile.id, is_active: true }),
    ctx.E.PlayerInventory.filter({ profile_id: profile.id }),
  ]);
  return {
    profile,
    marketEvents: (events || []).map(ctx.market.normalizeMarketEvent).filter((e) => ctx.market.isMarketEventActive(e, profile.career_date)),
    priceHistories: histories || [],
    playerSponsors: (contracts || []).map((c) => ({ sponsor_id: c.sponsor_id, sponsor_name: c.sponsor_name })),
    ownedIds: new Set((inventory || []).map((i) => i.item_id)),
  };
}
async function legacyBuy(ctx, screen, item, { failDebit = false } = {}) {
  const { profile } = screen;
  const histMap = {}; screen.priceHistories.forEach((h) => { histMap[h.item_id] = h; });
  const marketState = ctx.eco.getEquipmentMarketState(item, { ...profile, active_sponsor_names: screen.playerSponsors.map((s) => s.sponsor_name) });
  if (!marketState?.available && !screen.ownedIds.has(item.id)) return { ok: false, reason: 'rotacao' };
  if (!ctx.store.getShopItemAccess(profile, item).unlocked) return { ok: false, reason: 'bloqueado' };
  const currentPrice = ctx.market.computeItemPrice(item, screen.marketEvents, histMap[item.id], screen.playerSponsors, profile.career_date).currentPrice;
  if ((profile.coins || 0) < currentPrice) return { ok: false, reason: 'saldo' };
  const restore = ctx.PA.update;
  if (failDebit) ctx.PA.update = async () => { throw new Error('falha injetada na gravação do débito'); };
  try {
    await ctx.E.PlayerInventory.create({ profile_id: profile.id, item_id: item.id, item_name: item.name, category: item.category, rarity: item.rarity, equipped: false, acquired_date: profile.career_date, current_durability: item.durability || 100, usage_count: 0 });
    await ctx.E.PlayerProfile.update(profile.id, { coins: (profile.coins || 0) - currentPrice });
  } catch (error) {
    return { ok: false, reason: 'erro', error: error.message, price: currentPrice };
  } finally { ctx.PA.update = restore; }
  await ctx.E.FinancialTransaction.create({ profile_id: profile.id, date: profile.career_date, type: 'expense', category: 'loja', description: `Compra: ${item.name}`, amount: currentPrice });
  const hist = screen.priceHistories.find((h) => h.item_id === item.id);
  if (hist) await ctx.E.MarketPriceHistory.update(hist.id, { demand_score: Math.min(100, (hist.demand_score || 50) + 5), purchase_count: (hist.purchase_count || 0) + 1, stock_remaining: hist.is_limited_stock ? Math.max(0, (hist.stock_remaining || 0) - 1) : -1 }).catch(() => {});
  return { ok: true, price: currentPrice };
}
// ── Réplica de Inventory.jsx sellItem() (HEAD 173562e) ───────────────────────
async function legacySell(ctx, profile, invItem) {
  if (invItem.equipped) return { ok: false };
  const shopItem = await ctx.E.ShopItem.get(invItem.item_id);
  const sellPrice = Math.floor((shopItem?.price || 0) * 0.3);
  await ctx.E.PlayerInventory.delete(invItem.id);
  await ctx.E.PlayerProfile.update(profile.id, { coins: (profile.coins || 0) + sellPrice });
  await ctx.E.FinancialTransaction.upsert(`inventory-sale-${invItem.id}`, { profile_id: profile.id, date: profile.career_date, type: 'income', category: 'loja', description: `Venda: ${invItem.item_name}`, amount: sellPrice });
  return { ok: true, sellPrice };
}

// ── Adaptadores canônicos (mesmos cenários) ─────────────────────────────────
// Falha injetada NO MEIO do lote: a gravação do extrato lança depois que o
// débito e a entrega já foram aplicados ao rascunho da transação.
async function withLedgerWriteFailure(ctx, fn) {
  const proto = (await ctx.load('/src/gameplay/repositories/CareerEntityRepository.js')).CareerEntityRepository.prototype;
  const original = proto.ensureCollection;
  proto.ensureCollection = function patched(entityName, career, options = {}) {
    if (entityName === 'FinancialTransaction' && options.persist) throw new Error('falha injetada na gravação do extrato (meio do lote)');
    return original.call(this, entityName, career, options);
  };
  try { return await fn(); } finally { proto.ensureCollection = original; }
}
const canonicalBuy = async (ctx, _screen, item, { failDebit = false, operationId } = {}) => {
  const run = () => ctx.T.purchaseShopItem(ctx.profile.id, item.id, { operationId });
  try {
    const r = failDebit ? await withLedgerWriteFailure(ctx, run) : await run();
    return { ok: r.ok, reason: r.code, price: r.price };
  } catch (error) {
    return { ok: false, reason: 'erro', error: error.message };
  }
};
const canonicalSell = async (ctx, _profile, invItem) => { const r = await ctx.T.sellInventoryItem(ctx.profile.id, invItem.id); return { ok: r.ok, reason: r.code, sellPrice: r.amount }; };

async function scenarios(mode) {
  const buy = mode === 'legacy' ? legacyBuy : canonicalBuy;
  const sell = mode === 'legacy' ? legacySell : canonicalSell;
  const out = {};

  // C2A-01 — dois cliques antes do re-render: mesma tela, mesmo perfil em memória.
  {
    const ctx = await prepare(`${mode}-01`);
    const item = byName(ctx, 'Padel Start Control One Club');
    const screen = await loadShopScreen(ctx, await P(ctx));
    const before = { coins: screen.profile.coins, rows: (await inv(ctx)).filter((r) => r.item_id === item.id).length, ledger: (await ledger(ctx)).length };
    const results = await quiet(() => Promise.all([buy(ctx, screen, item, { operationId: 'click-1' }), buy(ctx, screen, item, { operationId: 'click-1' })]));
    const after = { coins: (await P(ctx)).coins, rows: (await inv(ctx)).filter((r) => r.item_id === item.id).length, ledger: (await ledger(ctx)).length };
    const price = results.find((r) => r.price)?.price ?? null;
    out.C2A_01_double_purchase = { item: item.name, price, results: results.map((r) => (r.ok ? 'ok' : r.reason)), delivered: after.rows - before.rows, debited: before.coins - after.coins, ledgerRows: after.ledger - before.ledger, consistent: (after.rows - before.rows) * price === before.coins - after.coins && after.ledger - before.ledger === after.rows - before.rows };
    await ctx.rt.close();
  }
  // C2A-02 — relíquia com estoque 0, num mês em que ela está na rotação.
  {
    const ctx = await prepare(`${mode}-02`);
    const relic = ctx.items.find((i) => String(i.id).startsWith('historical-relic-') && i.category === 'raquete');
    const hist = ((await ctx.E.MarketPriceHistory.filter({ item_id: relic.id })) || [])[0];
    await ctx.E.MarketPriceHistory.update(hist.id, { stock_remaining: 0 });
    const months = Array.from({ length: 120 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-15`);
    const monthIn = months.find((d) => ctx.eco.getEquipmentMarketState(relic, { career_date: d }).available);
    await ctx.E.PlayerProfile.update(ctx.profile.id, { career_date: monthIn, coins: 1_000_000 });
    const screen = await loadShopScreen(ctx, await P(ctx));
    const before = (await P(ctx)).coins;
    const r = await quiet(() => buy(ctx, screen, relic));
    const stockAfter = (((await ctx.E.MarketPriceHistory.filter({ item_id: relic.id })) || [])[0] || {}).stock_remaining;
    out.C2A_02_zero_stock = { item: relic.name, month: monthIn, stockBefore: 0, result: r.ok ? 'ok' : r.reason, delivered: (await inv(ctx)).filter((x) => x.item_id === relic.id).length, debited: before - (await P(ctx)).coins, stockAfter };
    await ctx.rt.close();
  }
  // C2A-03 — falha entre a entrega e a cobrança.
  {
    const ctx = await prepare(`${mode}-03`);
    const item = byName(ctx, 'Tour Grip Dry Start');
    const screen = await loadShopScreen(ctx, await P(ctx));
    const before = { coins: screen.profile.coins, rows: (await inv(ctx)).length, ledger: (await ledger(ctx)).length };
    const r = await quiet(() => buy(ctx, screen, item, { failDebit: true }));
    out.C2A_03_partial_failure = { item: item.name, result: r.ok ? 'ok' : r.reason, error: r.error || null, delivered: (await inv(ctx)).length - before.rows, debited: before.coins - (await P(ctx)).coins, ledgerRows: (await ledger(ctx)).length - before.ledger };
    await ctx.rt.close();
  }
  // C2A-04 — venda a partir de perfil desatualizado + crédito legítimo (luvas de patrocínio).
  {
    const ctx = await prepare(`${mode}-04`);
    const item = byName(ctx, 'Tour Grip Dry Start');
    await quiet(async () => buy(ctx, await loadShopScreen(ctx, await P(ctx)), item));
    const row = (await inv(ctx)).find((r) => r.item_id === item.id);
    const stale = await P(ctx); // perfil carregado pela tela de Inventário
    const sponsor = ctx.S.SPONSOR_CATALOG.find((s) => s.tier === 'Bronze' && ctx.S.canSign(s, stale).ok);
    await quiet(() => ctx.S.signSponsorContract(stale, sponsor)); // crédito gravado por outro fluxo
    const credited = (await P(ctx)).coins - stale.coins;
    const r = await quiet(() => sell(ctx, stale, row));
    const final = (await P(ctx)).coins;
    const expected = stale.coins + credited + (r.sellPrice || 0);
    out.C2A_04_sale_overwrites_credit = { sponsor: sponsor.name, staleCoins: stale.coins, concurrentCredit: credited, sellPrice: r.sellPrice, expected, final, lost: expected - final, itemRemoved: !(await inv(ctx)).some((x) => x.id === row.id) };
    await ctx.rt.close();
  }
  return out;
}

const report = { generatedBy: 'LOCAL-9C.2-A repro-c2a-defects', note: 'legacy = réplica de Shop.jsx buy()/Inventory.jsx sellItem() do HEAD 173562e; canonical = src/game-core/shopTransactions.js', legacy: await scenarios('legacy') };
if (HAS_CANONICAL) report.canonical = await scenarios('canonical');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 1)}\n`);
console.log(JSON.stringify(report, null, 1));
