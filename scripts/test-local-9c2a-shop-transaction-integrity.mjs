// LOCAL-9C.2-A — integridade transacional da Loja: compra e venda canônicas
// (src/game-core/shopTransactions.js).
//
// Módulos REAIS do jogo (Vite SSR) sobre carreiras em MEMÓRIA
// (scripts/lib/v526bTestKit.mjs): nenhum save real é lido ou gravado.
// Catálogo pelo mesmo caminho da ativação da carreira (seedMarket +
// ensureExpandedShopCatalog).
//
//   P1-P16  compra          S17-S26 venda
//   R27-R32 persistência    I33-I40 integração      X* casos extras
//
// Uso: TZ=UTC node scripts/test-local-9c2a-shop-transaction-integrity.mjs [--out=<dir>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const { bootCareer, reloadCareer } = await import('./lib/v526bTestKit.mjs');

const OUT_DIR = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6) || 'reports/local-9c2-a-shop-transaction-integrity';
let quietDepth = 0; let saved = null;
const quiet = async (fn) => { if (process.env.PL9C2A_VERBOSE) return fn(); if (quietDepth++ === 0) { saved = [console.warn, console.log, console.debug, console.error, console.info]; console.warn = console.log = console.debug = console.error = console.info = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error, console.info] = saved; } };
const report = { generatedBy: 'LOCAL-9C.2-A shop transaction integrity', checks: [], cases: {} };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail != null && !ok ? ` · ${JSON.stringify(detail).slice(0, 500)}` : ''}`); };
const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const MONTHS = Array.from({ length: 120 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-15`);

async function prepare(seed, patch = {}) {
  const booted = await quiet(() => bootCareer(`9c2a-${seed}`));
  const ctx = { ...booted, E: booted.rt.localGame.entities, load: (p) => booted.rt.load(p) };
  await bindModules(ctx);
  await quiet(async () => { await ctx.market.seedMarket(ctx.profile.career_date); await ctx.store.ensureExpandedShopCatalog(); });
  ctx.profile = await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 100_000, career_level: 50, ranking_position: 5, reputation: 95, tournaments_played: 10, ...patch });
  ctx.items = ((await ctx.E.ShopItem.list('catalog_order', 2000)) || []).map(ctx.store.normalizeShopItem);
  return ctx;
}
async function bindModules(ctx) {
  ctx.T = await ctx.load('/src/game-core/shopTransactions.js');
  ctx.store = await ctx.load('/src/lib/storeCatalog.js');
  ctx.market = await ctx.load('/src/lib/marketEngine.js');
  ctx.eco = await ctx.load('/src/lib/sportsEconomyV26.js');
  ctx.S = await ctx.load('/src/lib/sponsors.js');
  ctx.EM = await ctx.load('/src/lib/equipmentModifiers.js');
  ctx.EL = await ctx.load('/src/game-core/equipmentLifecycle.js');
  ctx.AC = await ctx.load('/src/lib/achievementContext.js');
  ctx.Repo = (await ctx.load('/src/gameplay/repositories/CareerEntityRepository.js')).CareerEntityRepository;
}
async function reload(ctx) {
  ctx.rt = await quiet(() => reloadCareer(ctx.rt, ctx.storage, ctx.careerId));
  ctx.E = ctx.rt.localGame.entities;
  ctx.load = (p) => ctx.rt.load(p);
  await bindModules(ctx);
}
const P = (ctx) => ctx.E.PlayerProfile.get(ctx.profile.id);
const coins = async (ctx) => Number((await P(ctx)).coins) || 0;
const inv = async (ctx) => (await ctx.E.PlayerInventory.filter({ profile_id: ctx.profile.id })) || [];
const shopLedger = async (ctx) => ((await ctx.E.FinancialTransaction.filter({ profile_id: ctx.profile.id })) || []).filter((t) => t.category === 'loja');
const histOf = async (ctx, itemId) => ctx.T.selectItemPriceHistory((await ctx.E.MarketPriceHistory.filter({ item_id: itemId })) || [], itemId);
const byName = (ctx, name) => { const it = ctx.items.find((i) => i.name === name); if (!it) throw new Error(`fixture: item ${name}`); return it; };
const buy = (ctx, itemId, options) => quiet(() => ctx.T.purchaseShopItem(ctx.profile.id, itemId, options));
const sell = (ctx, invId) => quiet(() => ctx.T.sellInventoryItem(ctx.profile.id, invId));
const snap = async (ctx) => ({
  coins: await coins(ctx),
  inv: (await inv(ctx)).map((r) => `${r.id}:${r.item_id}:${r.equipped}`).sort(),
  ledger: (await shopLedger(ctx)).map((t) => `${t.id}:${t.type}:${t.amount}:${t.date}`).sort(),
  hist: ((await ctx.E.MarketPriceHistory.filter({})) || []).map((h) => `${h.id}:${h.stock_remaining}:${h.purchase_count ?? 0}:${h.demand_score}`).sort(),
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Cotação exatamente como a tela da Loja carrega e calcula (Shop.jsx).
async function shopScreenQuote(ctx, item) {
  const p = await P(ctx);
  const [events, histories, contracts] = await Promise.all([
    ctx.E.MarketEvent.filter({ is_active: true }, '-priority', 20),
    ctx.E.MarketPriceHistory.filter({}, '-last_updated_date', 200),
    ctx.E.PlayerContract.filter({ profile_id: p.id, is_active: true }),
  ]);
  const marketEvents = (events || []).map(ctx.market.normalizeMarketEvent).filter((e) => ctx.market.isMarketEventActive(e, p.career_date));
  const sponsors = (contracts || []).map((c) => ({ sponsor_id: c.sponsor_id, sponsor_name: c.sponsor_name }));
  return ctx.T.quoteShopItem(item, { events: marketEvents, history: ctx.T.selectItemPriceHistory(histories || [], item.id), sponsors, careerDate: p.career_date });
}
async function withLedgerWriteFailure(ctx, fn) {
  const proto = ctx.Repo.prototype; const original = proto.ensureCollection;
  proto.ensureCollection = function patched(entityName, career, options = {}) {
    if (entityName === 'FinancialTransaction' && options.persist) throw new Error('falha injetada no meio do lote');
    return original.call(this, entityName, career, options);
  };
  try { return await fn(); } finally { proto.ensureCollection = original; }
}
async function withSaveFailure(ctx, fn) {
  const cm = ctx.rt.careerManager; const original = cm.saveCareer;
  cm.saveCareer = async () => { throw new Error('falha injetada na gravação do save'); };
  try { return await fn(); } finally { cm.saveCareer = original; }
}
const attempt = async (fn) => { try { return { ok: true, value: await quiet(fn) }; } catch (error) { return { ok: false, error: error.message }; } };
const relicIn = (ctx, category = 'raquete') => ctx.items.find((i) => String(i.id).startsWith('historical-relic-') && i.category === category);
const monthWhere = (ctx, item, available) => MONTHS.find((d) => ctx.eco.getEquipmentMarketState(item, { career_date: d }).available === available);

// ═══ Compras ═══════════════════════════════════════════════════════════════
{
  const ctx = await prepare('purchase');
  const racket = byName(ctx, 'Padel Start Control One Club');
  // P1 — compra legítima.
  const s0 = await snap(ctx);
  const quote = await shopScreenQuote(ctx, racket);
  const histBefore = await histOf(ctx, racket.id);
  const r1 = await buy(ctx, racket.id, { operationId: 'p1', expectedPrice: quote.currentPrice });
  const s1 = await snap(ctx);
  const row = (await inv(ctx)).find((r) => r.item_id === racket.id);
  const led = (await shopLedger(ctx)).find((t) => t.id === 'shop-purchase-p1');
  const histAfter = await histOf(ctx, racket.id);
  report.cases.P1 = { result: r1.code, price: r1.price, quote: quote.currentPrice, debited: s0.coins - s1.coins, row: row && { id: row.id, acquired_date: row.acquired_date, quantity: row.quantity ?? null }, ledger: led && { amount: led.amount, date: led.date, type: led.type }, purchaseCount: [histBefore?.purchase_count ?? 0, histAfter?.purchase_count ?? 0] };
  check('P1: compra legítima debita exatamente o preço cotado pela Loja, entrega 1 unidade e grava 1 linha de extrato com a data da carreira',
    r1.ok && r1.price === quote.currentPrice && s0.coins - s1.coins === r1.price && s1.inv.length === s0.inv.length + 1 && row?.id === 'inventory-shop-p1'
    && led && led.amount === r1.price && led.type === 'expense' && led.date === ctx.profile.career_date.slice(0, 10) && s1.ledger.length === s0.ledger.length + 1
    && (!histBefore || histAfter.purchase_count === (histBefore.purchase_count || 0) + 1), report.cases.P1);

  // P2 — saldo insuficiente.
  const grip = byName(ctx, 'Tour Grip Dry Start');
  const gq = await shopScreenQuote(ctx, grip);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: gq.currentPrice - 1 });
  const s2 = await snap(ctx);
  const r2 = await buy(ctx, grip.id);
  check('P2: saldo insuficiente é recusado sem efeito algum', !r2.ok && r2.code === 'insufficient-funds' && same(s2, await snap(ctx)), { r2, s2 });
  await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 100_000 });

  // P3 — item inexistente.
  const s3 = await snap(ctx);
  const r3 = await buy(ctx, 'shopitem-nao-existe');
  check('P3: item inexistente é recusado sem efeito', !r3.ok && r3.code === 'item-not-found' && same(s3, await snap(ctx)), r3);

  // P4 — item bloqueado (incomum pede experiência 3; sempre na rotação).
  const unc = ctx.items.find((i) => i.rarity === 'incomum' && i.catalog_order != null);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { career_level: 1, ranking_position: 9999, reputation: 0 });
  const s4 = await snap(ctx);
  const r4 = await buy(ctx, unc.id);
  check('P4: item bloqueado pelos requisitos atuais é recusado sem efeito', !r4.ok && r4.code === 'locked' && same(s4, await snap(ctx)), r4);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { career_level: 50, ranking_position: 5, reputation: 95 });

  // X1 — fora da rotação e X2 — item fora de venda.
  const excl = ctx.items.find((i) => i.rarity === 'exclusivo' && i.catalog_order != null && monthWhere(ctx, i, false));
  const monthOut = monthWhere(ctx, excl, false);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { career_date: monthOut });
  const rx1 = await buy(ctx, excl.id);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { career_date: ctx.profile.career_date });
  check('X1: item fora da rotação mensal é recusado (regra atual preservada)', !rx1.ok && rx1.code === 'out-of-rotation', { rx1, monthOut });
  const ball = ctx.items.find((i) => i.category === 'bola' && i.rarity === 'comum' && i.catalog_order != null);
  await ctx.E.ShopItem.update(ball.id, { is_available: false });
  const rx2 = await buy(ctx, ball.id);
  await ctx.E.ShopItem.update(ball.id, { is_available: true });
  check('X2: item marcado como fora de venda é recusado', !rx2.ok && rx2.code === 'item-unavailable', rx2);

  // P9 — repetição da mesma operação; P16 — item único já possuído.
  const s9 = await snap(ctx);
  const r9 = await buy(ctx, racket.id, { operationId: 'p1' });
  const r16 = await buy(ctx, racket.id, { operationId: 'p16-outra-intencao' });
  check('P9: repetir a mesma operação não cobra nem entrega de novo', !r9.ok && r9.code === 'duplicate' && same(s9, await snap(ctx)), r9);
  check('P16: item único já possuído não é comprado de novo (intenção nova)', !r16.ok && r16.code === 'already-owned' && same(s9, await snap(ctx)), r16);

  // P12 — preço forjado.
  const s12 = await snap(ctx);
  const gq2 = await shopScreenQuote(ctx, grip);
  const r12a = await buy(ctx, grip.id, { operationId: 'p12a', expectedPrice: 1, price: 1 });
  const s12a = await snap(ctx);
  const r12b = await buy(ctx, grip.id, { operationId: 'p12b', price: 1, currentPrice: 1 });
  const s12b = await snap(ctx);
  report.cases.P12 = { forgedExpected: r12a.code, forgedIgnored: { code: r12b.code, charged: s12a.coins - s12b.coins, canonical: gq2.currentPrice } };
  check('P12: preço forjado nunca é cobrado — teto abaixo do canônico recusa; campos de preço do chamador são ignorados',
    !r12a.ok && r12a.code === 'price-changed' && same(s12, s12a) && r12b.ok && s12a.coins - s12b.coins === gq2.currentPrice && r12b.price === gq2.currentPrice, report.cases.P12);

  // P15 — desconto forjado.
  const shoe = ctx.items.find((i) => i.category === 'tenis' && i.rarity === 'comum' && i.catalog_order != null && i.sponsor_id);
  const sq = await shopScreenQuote(ctx, shoe);
  const before15 = await coins(ctx);
  const r15 = await buy(ctx, shoe.id, { operationId: 'p15', sponsors: [{ sponsor_id: shoe.sponsor_id, sponsor_name: shoe.manufacturer }], discount: 90, sponsorDiscount: 15 });
  report.cases.P15 = { item: shoe.name, charged: before15 - await coins(ctx), canonical: sq.currentPrice, sponsorDiscount: r15.pricing?.sponsorDiscount };
  check('P15: desconto forjado pelo chamador é ignorado (sem contrato ativo, preço cheio)', r15.ok && report.cases.P15.charged === sq.currentPrice && !r15.pricing.sponsorDiscount, report.cases.P15);

  // P7 — duas compras simultâneas do mesmo item (intenções diferentes).
  const bag = ctx.items.find((i) => i.category === 'mochila' && i.rarity === 'comum' && i.catalog_order != null);
  const s7 = await snap(ctx);
  const r7 = await Promise.all([buy(ctx, bag.id, { operationId: 'p7a' }), buy(ctx, bag.id, { operationId: 'p7b' }), buy(ctx, bag.id)]);
  const s7b = await snap(ctx);
  const paid7 = r7.filter((r) => r.ok);
  report.cases.P7 = { results: r7.map((r) => r.code), delivered: s7b.inv.length - s7.inv.length, debited: s7.coins - s7b.coins, ledger: s7b.ledger.length - s7.ledger.length };
  check('P7: três compras simultâneas do mesmo item → 1 entrega, 1 débito, 1 linha de extrato', paid7.length === 1 && report.cases.P7.delivered === 1 && report.cases.P7.debited === paid7[0].price && report.cases.P7.ledger === 1, report.cases.P7);

  // P8 — duas compras simultâneas de itens diferentes, saldo para só uma.
  const pair = ctx.items.filter((i) => i.rarity === 'comum' && i.catalog_order != null && !s7b.inv.some((x) => x.includes(`:${i.id}:`))).slice(0, 12);
  const quotes = await Promise.all(pair.map(async (i) => ({ i, p: (await shopScreenQuote(ctx, i)).currentPrice })));
  const [qa, qb] = quotes.sort((a, b) => b.p - a.p);
  const budget = qa.p; // a + b > budget; cada uma cabe sozinha
  await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: budget });
  const s8 = await snap(ctx);
  const r8 = await Promise.all([buy(ctx, qa.i.id, { operationId: 'p8a' }), buy(ctx, qb.i.id, { operationId: 'p8b' })]);
  const s8b = await snap(ctx);
  const ok8 = r8.filter((r) => r.ok);
  report.cases.P8 = { prices: [qa.p, qb.p], budget, results: r8.map((r) => r.code), final: s8b.coins, delivered: s8b.inv.length - s8.inv.length };
  check('P8: saldo para uma compra só → uma aprovada, outra recusada por saldo; saldo final = saldo − preço aprovado ≥ 0',
    ok8.length === 1 && r8.some((r) => r.code === 'insufficient-funds') && s8b.coins === budget - ok8[0].price && s8b.coins >= 0 && report.cases.P8.delivered === 1, report.cases.P8);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 100_000 });

  // P11 — falha no meio do lote e falha da gravação do save.
  const glove = ctx.items.find((i) => i.category === 'acessorio' && i.rarity === 'comum' && i.catalog_order != null);
  const s11 = await snap(ctx);
  const f1 = await attempt(() => withLedgerWriteFailure(ctx, () => ctx.T.purchaseShopItem(ctx.profile.id, glove.id, { operationId: 'p11' })));
  const s11a = await snap(ctx);
  const f2 = await attempt(() => withSaveFailure(ctx, () => ctx.T.purchaseShopItem(ctx.profile.id, glove.id, { operationId: 'p11' })));
  const s11b = await snap(ctx);
  const retry = await buy(ctx, glove.id, { operationId: 'p11' });
  const s11c = await snap(ctx);
  report.cases.P11 = { midBatch: f1.ok ? 'sem erro' : f1.error, saveFailure: f2.ok ? 'sem erro' : f2.error, retry: retry.code, debitedAfterRetry: s11.coins - s11c.coins };
  check('P11: falha no meio do lote ou na gravação do save → nada aplicado (sem item, sem débito, sem extrato, sem estoque)', !f1.ok && !f2.ok && same(s11, s11a) && same(s11, s11b), report.cases.P11);
  check('P11: depois da falha, a mesma operação conclui uma única vez', retry.ok && s11c.inv.length === s11.inv.length + 1 && s11.coins - s11c.coins === retry.price && s11c.ledger.length === s11.ledger.length + 1, report.cases.P11);

  // X3 — recusas não poluem a lista de idempotência das partidas.
  const keys = (await P(ctx)).processed_match_finalizations || [];
  check('X3: compras não gravam chaves em processed_match_finalizations (sem disputa com partidas/patrocínios)', !keys.some((k) => String(k).includes('shop')), keys.slice(-5));
  await ctx.rt.close();
}

// ── P5, P6, P13 — estoque de relíquia ─────────────────────────────────────
{
  const ctx = await prepare('stock', { coins: 5_000_000 });
  const relic = relicIn(ctx, 'raquete');
  const monthIn = monthWhere(ctx, relic, true);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { career_date: monthIn });
  const h = await histOf(ctx, relic.id);
  await ctx.E.MarketPriceHistory.update(h.id, { stock_remaining: 0 });
  const s5 = await snap(ctx);
  const r5 = await buy(ctx, relic.id, { operationId: 'p5' });
  const r13 = await buy(ctx, relic.id, { operationId: 'p13', stock: 5, stockRemaining: 5, stock_remaining: 5 });
  check('P5: relíquia com estoque 0 é recusada sem efeito', !r5.ok && r5.code === 'out-of-stock' && same(s5, await snap(ctx)), r5);
  check('P13: estoque forjado pelo chamador é ignorado', !r13.ok && r13.code === 'out-of-stock' && same(s5, await snap(ctx)), r13);
  // P6 — última unidade.
  await ctx.E.MarketPriceHistory.update(h.id, { stock_remaining: 1 });
  const before = await coins(ctx);
  const r6 = await buy(ctx, relic.id, { operationId: 'p6' });
  const after = await histOf(ctx, relic.id);
  report.cases.P6 = { result: r6.code, stockAfter: after.stock_remaining, outcomeStock: r6.stockRemaining, debited: before - await coins(ctx), price: r6.price };
  check('P6: última unidade vendida uma vez; estoque vai a 0 (nunca negativo) no mesmo lote', r6.ok && after.stock_remaining === 0 && r6.stockRemaining === 0 && report.cases.P6.debited === r6.price, report.cases.P6);
  // X4 — última unidade disputada: vende, devolve ao inventário por venda, e duas intenções simultâneas disputam a última unidade.
  const relic2 = ctx.items.find((i) => String(i.id).startsWith('historical-relic-') && i.id !== relic.id && ctx.eco.getEquipmentMarketState(i, { career_date: monthIn }).available);
  if (relic2) {
    const h2 = await histOf(ctx, relic2.id);
    await ctx.E.MarketPriceHistory.update(h2.id, { stock_remaining: 1 });
    const s = await snap(ctx);
    const rr = await Promise.all([buy(ctx, relic2.id, { operationId: 'x4a' }), buy(ctx, relic2.id, { operationId: 'x4b' })]);
    const e = await snap(ctx);
    const stock = (await histOf(ctx, relic2.id)).stock_remaining;
    report.cases.X4 = { relic: relic2.name, results: rr.map((r) => r.code), stock, delivered: e.inv.length - s.inv.length };
    check('X4: duas compras simultâneas da última unidade → uma aprovada, estoque 0, uma entrega', rr.filter((r) => r.ok).length === 1 && stock === 0 && report.cases.X4.delivered === 1, report.cases.X4);
  } else check('X4: segunda relíquia na rotação do mês', false, { monthIn });
  await ctx.rt.close();
}

// ── P14 + I39 — desconto legítimo de patrocínio ──────────────────────────
{
  const ctx = await prepare('discount', { xp: 1_000_000, tournaments_won: 50, fan_appeal: 100 });
  let sponsor = null; let item = null;
  for (const s of ctx.S.SPONSOR_CATALOG) {
    if (!ctx.S.canSign(s, await P(ctx)).ok) continue;
    const candidate = ctx.items.find((i) => i.sponsor_id === s.id && ['comum', 'incomum'].includes(i.rarity) && i.catalog_order != null);
    if (candidate) { sponsor = s; item = candidate; break; }
  }
  if (!sponsor) check('P14: fixture — patrocinador assinável com item no catálogo', false);
  else {
    const full = await shopScreenQuote(ctx, item);
    await quiet(() => ctx.S.signSponsorContract(ctx.profile, sponsor));
    const discounted = await shopScreenQuote(ctx, item);
    const before = await coins(ctx);
    const r = await buy(ctx, item.id, { operationId: 'p14', expectedPrice: discounted.currentPrice });
    report.cases.P14 = { sponsor: sponsor.name, item: item.name, full: full.currentPrice, discounted: discounted.currentPrice, charged: before - await coins(ctx), sponsorDiscount: r.pricing?.sponsorDiscount };
    check('P14/I39: desconto legítimo de patrocínio ativo (15% por sponsor_id) é aplicado e cobrado igual à tela',
      r.ok && r.pricing.sponsorDiscount === 15 && discounted.sponsorDiscount === 15 && report.cases.P14.charged === discounted.currentPrice && discounted.currentPrice < full.currentPrice, report.cases.P14);
  }
  await ctx.rt.close();
}

// ═══ Vendas ════════════════════════════════════════════════════════════════
{
  const ctx = await prepare('sale');
  const pick = (cat) => ctx.items.find((i) => i.category === cat && i.rarity === 'comum' && i.catalog_order != null);
  const owned = {};
  for (const cat of ['grip', 'bola', 'roupa', 'mochila', 'acessorio', 'tenis', 'raquete']) owned[cat] = (await buy(ctx, pick(cat).id, { operationId: `own-${cat}` })).inventoryItem;
  const raw = async (itemId) => ctx.E.ShopItem.get(itemId);

  // S17 + S26 — venda legítima e valor de revenda.
  const g = owned.grip;
  const resale = Math.floor((Number((await raw(g.item_id)).price) || 0) * 0.3);
  const s0 = await snap(ctx);
  const r17 = await sell(ctx, g.id);
  const s1 = await snap(ctx);
  const led = (await shopLedger(ctx)).find((t) => t.id === `inventory-sale-${g.id}`);
  report.cases.S17 = { result: r17.code, amount: r17.amount, resale, credited: s1.coins - s0.coins, ledger: led && { amount: led.amount, type: led.type, date: led.date } };
  check('S17: venda legítima remove a unidade, credita e grava 1 linha de extrato (data da carreira)', r17.ok && s1.coins - s0.coins === r17.amount && s1.inv.length === s0.inv.length - 1 && led?.amount === r17.amount && led.type === 'income' && led.date === ctx.profile.career_date.slice(0, 10), report.cases.S17);
  check('S26: revenda = 30% do preço gravado do ShopItem (fórmula atual preservada) e igual ao valor exibido no Inventário', r17.amount === resale && ctx.T.computeResalePrice(await raw(g.item_id)) === resale, report.cases.S17);

  // S18 — inexistente; S19 — venda duplicada.
  const r18 = await sell(ctx, 'inventory-nao-existe');
  const s19 = await snap(ctx);
  const r19 = await sell(ctx, g.id);
  check('S18: vender item inexistente é recusado', !r18.ok && r18.code === 'item-not-found', r18);
  check('S19: vender a mesma unidade de novo → duplicada, sem crédito', !r19.ok && r19.code === 'duplicate' && same(s19, await snap(ctx)), r19);

  // S20 — venda simultânea da mesma unidade.
  const b = owned.bola;
  const s20 = await snap(ctx);
  const r20 = await Promise.all([sell(ctx, b.id), sell(ctx, b.id), sell(ctx, b.id)]);
  const s20b = await snap(ctx);
  report.cases.S20 = { results: r20.map((r) => r.code), credited: s20b.coins - s20.coins, ledger: s20b.ledger.length - s20.ledger.length };
  check('S20: três vendas simultâneas da mesma unidade → 1 crédito, 1 remoção, 1 extrato', r20.filter((r) => r.ok).length === 1 && report.cases.S20.credited === r20.find((r) => r.ok).amount && report.cases.S20.ledger === 1 && s20b.inv.length === s20.inv.length - 1, report.cases.S20);

  // S21 — venda e créditos simultâneos (luvas de patrocínio + crédito genérico por incremento).
  const sponsor = ctx.S.SPONSOR_CATALOG.find((s) => s.tier === 'Bronze' && ctx.S.canSign(s, ctx.profile).ok);
  const s21 = await snap(ctx);
  const stale = await P(ctx);
  const [r21, signed] = await Promise.all([
    sell(ctx, owned.roupa.id),
    quiet(() => ctx.S.signSponsorContract(stale, sponsor)),
    quiet(() => ctx.rt.localGame.batch([{ type: 'playerIncrement', id: ctx.profile.id, data: { coins: 500 } }])),
  ]);
  const bonus = ((await ctx.E.PlayerContract.filter({ profile_id: ctx.profile.id, sponsor_id: sponsor.id })) || [])[0]?.sign_bonus || 0;
  const final21 = await coins(ctx);
  report.cases.S21 = { start: s21.coins, sale: r21.amount, sponsorBonus: bonus, otherCredit: 500, expected: s21.coins + r21.amount + bonus + 500, final: final21, signed: Boolean(signed) };
  check('S21: venda concorrente com luvas de patrocínio e outro crédito → nenhum valor sobrescrito', r21.ok && bonus > 0 && final21 === report.cases.S21.expected, report.cases.S21);

  // S22 — venda e compra simultâneas; venda e outra venda.
  const s22 = await snap(ctx);
  const target = ctx.items.find((i) => i.category === 'acessorio_tec' && i.rarity === 'incomum' && i.catalog_order != null);
  const [r22s, r22b] = await Promise.all([sell(ctx, owned.mochila.id), buy(ctx, target.id, { operationId: 's22' })]);
  const s22b = await snap(ctx);
  report.cases.S22 = { sale: r22s.amount, price: r22b.price, start: s22.coins, final: s22b.coins };
  check('S22: venda e compra simultâneas → saldo = início + revenda − preço', r22s.ok && r22b.ok && s22b.coins === s22.coins + r22s.amount - r22b.price, report.cases.S22);
  const s22c = await snap(ctx);
  const rr = await Promise.all([sell(ctx, owned.acessorio.id), sell(ctx, owned.tenis.id)]);
  check('S22b: duas vendas simultâneas de unidades distintas → as duas creditadas', rr.every((r) => r.ok) && (await coins(ctx)) === s22c.coins + rr[0].amount + rr[1].amount, rr.map((r) => r.code));

  // S23 — falha injetada na venda.
  const racketRow = owned.raquete;
  const s23 = await snap(ctx);
  const f23 = await attempt(() => withLedgerWriteFailure(ctx, () => ctx.T.sellInventoryItem(ctx.profile.id, racketRow.id)));
  const f23b = await attempt(() => withSaveFailure(ctx, () => ctx.T.sellInventoryItem(ctx.profile.id, racketRow.id)));
  check('S23: falha no meio do lote ou na gravação → venda não aplicada (item continua, sem crédito, sem extrato)', !f23.ok && !f23b.ok && same(s23, await snap(ctx)), { f23, f23b });

  // S24 — item equipado; I36 — vendido não fica ativo.
  const shopItems = await ctx.E.ShopItem.list();
  await quiet(async () => ctx.EL.toggleEquipItem({ profile: await P(ctx), inventory: await inv(ctx), target: racketRow, shopItems }));
  const s24 = await snap(ctx);
  const r24 = await sell(ctx, racketRow.id);
  check('S24: item equipado não pode ser vendido (regra atual preservada); estado intacto', !r24.ok && r24.code === 'equipped' && same(s24, await snap(ctx)), r24);
  const equippedRow = (await inv(ctx)).find((r) => r.id === racketRow.id);
  await quiet(async () => ctx.EL.toggleEquipItem({ profile: await P(ctx), inventory: await inv(ctx), target: equippedRow, shopItems }));
  const r36 = await sell(ctx, racketRow.id);
  const mods36 = ctx.EM.computeEquipmentModifiers(await inv(ctx), await ctx.E.ShopItem.list());
  check('I36: desequipado e vendido → sem linha, sem modificador ativo', r36.ok && !(await inv(ctx)).some((r) => r.id === racketRow.id) && Object.values(mods36).every((v) => !v), { r36: r36.code, mods36 });

  // S25 — item sem valor de revenda (referência de catálogo inexistente).
  await ctx.E.PlayerInventory.create({ id: 'inventory-orfao', profile_id: ctx.profile.id, item_id: 'shopitem-removido', item_name: 'Item removido', category: 'grip', rarity: 'comum', equipped: false });
  const s25 = await snap(ctx);
  const r25 = await sell(ctx, 'inventory-orfao');
  check('S25: item sem preço de catálogo é recusado como não vendável (não some por 0 moedas)', !r25.ok && r25.code === 'not-sellable' && same(s25, await snap(ctx)), r25);
  // X5 — item de outro perfil.
  await ctx.E.PlayerInventory.create({ id: 'inventory-alheio', profile_id: 'outro-perfil', item_id: g.item_id, item_name: 'Alheio', category: 'grip', rarity: 'comum', equipped: false });
  const rx5 = await sell(ctx, 'inventory-alheio');
  check('X5: linha de inventário de outro perfil não pode ser vendida', !rx5.ok && rx5.code === 'item-not-found', rx5);
  await ctx.rt.close();
}

// ═══ Persistência ══════════════════════════════════════════════════════════
{
  const ctx = await prepare('persist');
  const start = await coins(ctx);
  const items = ctx.items.filter((i) => i.rarity === 'comum' && i.catalog_order != null).slice(0, 5);
  const bought = [];
  for (const [k, it] of items.entries()) bought.push(await buy(ctx, it.id, { operationId: `r-${k}` }));
  const before = await snap(ctx);
  await reload(ctx);
  const afterBuy = await snap(ctx);
  check('R27: save/load após compra preserva inventário, saldo, extrato e estoque', same(before, afterBuy), { before, afterBuy });
  const sold = await sell(ctx, bought[0].inventoryItem.id);
  const sold2 = await sell(ctx, bought[1].inventoryItem.id);
  const beforeSale = await snap(ctx);
  await reload(ctx);
  const afterSale = await snap(ctx);
  check('R28: save/load após venda preserva o estado', same(beforeSale, afterSale), { beforeSale, afterSale });
  const again = await buy(ctx, items[2].id, { operationId: 'r-2' });
  const againSale = await sell(ctx, bought[0].inventoryItem.id);
  const rebuySold = await buy(ctx, items[0].id, { operationId: 'r-0' });
  check('R29/P10: após recarregar, repetir compra e venda já feitas → duplicadas, sem efeito', again.code === 'duplicate' && againSale.code === 'duplicate' && rebuySold.code === 'duplicate' && same(afterSale, await snap(ctx)), { again: again.code, againSale: againSale.code, rebuySold: rebuySold.code });
  // X6 — compra distinta legítima depois de vender: nova intenção compra de novo.
  const rebuy = await buy(ctx, items[0].id, { operationId: 'r-0-recompra' });
  check('X6: depois de vender, uma nova intenção pode comprar o mesmo item de novo (compra distinta legítima)', rebuy.ok, rebuy.code);
  const end = await snap(ctx);
  const ledgerRows = await shopLedger(ctx);
  const spent = ledgerRows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const earned = ledgerRows.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  report.cases.R30_32 = { start, end: end.coins, spent, earned, purchases: ledgerRows.filter((t) => t.type === 'expense').length, sales: ledgerRows.filter((t) => t.type === 'income').length, inventory: end.inv.length };
  check('R31/R32: saldo final = inicial − Σ compras + Σ vendas do extrato; uma linha por operação', end.coins === start - spent + earned && report.cases.R30_32.purchases === 6 && report.cases.R30_32.sales === 2, report.cases.R30_32);
  const invRows = await inv(ctx);
  const nonSeed = invRows.filter((r) => r.id !== 'inventory-001');
  check('R30: inventário íntegro — uma linha por item possuído, ids da operação, nenhum vendido remanescente', nonSeed.length === 4 && new Set(nonSeed.map((r) => r.item_id)).size === 4 && nonSeed.every((r) => r.id.startsWith('inventory-shop-')) && sold.ok && sold2.ok, nonSeed.map((r) => r.id));
  await ctx.rt.close();
}

// ═══ Integração ════════════════════════════════════════════════════════════
{
  const shopSrc = readFileSync('src/pages/Shop.jsx', 'utf8');
  const invSrc = readFileSync('src/pages/Inventory.jsx', 'utf8');
  const actSrc = readFileSync('scripts/lib/v526Actions.mjs', 'utf8');
  check('I33: Loja e Inventário usam o domínio (sem gravar inventário, saldo ou extrato direto)',
    /purchaseShopItem\(/.test(shopSrc) && !/PlayerInventory\.(create|delete)/.test(shopSrc) && !/PlayerProfile\.update/.test(shopSrc) && !/recordFinancialEntry|MarketPriceHistory\.update/.test(shopSrc)
    && /sellInventoryItem\(/.test(invSrc) && !/PlayerInventory\.(create|delete)/.test(invSrc) && !/coins:\s*\(profile/.test(invSrc) && !/recordFinancialEntry/.test(invSrc));
  check('I34: simulador compra pela operação canônica (sem réplica de Shop.jsx)', /purchaseShopItem\(/.test(actSrc) && !/PlayerInventory\.create/.test(actSrc) && !/coins:\s*\(profile\.coins \|\| 0\) - row\.price/.test(actSrc));
}
{
  const ctx = await prepare('integration');
  const base = Object.fromEntries(ATTRS.map((k) => [k, 50]));
  await ctx.E.PlayerProfile.update(ctx.profile.id, base);
  const statsBefore = (await quiet(async () => ctx.AC.buildAchievementContext(await P(ctx)))).inventory;
  const achRowsBefore = ((await ctx.E.PlayerAchievement.filter({ profile_id: ctx.profile.id })) || []).length;
  const racket = ctx.items.find((i) => i.category === 'raquete' && i.rarity === 'comum' && i.catalog_order != null && Object.keys(i.attribute_bonus || {}).length);
  const r = await buy(ctx, racket.id, { operationId: 'i35' });
  const shopItems = await ctx.E.ShopItem.list();
  await quiet(async () => ctx.EL.toggleEquipItem({ profile: await P(ctx), inventory: await inv(ctx), target: r.inventoryItem, shopItems }));
  const p = await P(ctx);
  const mods = ctx.EM.computeEquipmentModifiers(await inv(ctx), shopItems);
  const expected = ctx.EM.sanitizeBonus(racket.attribute_bonus);
  report.cases.I35_38 = { item: racket.name, equipped: (await inv(ctx)).find((x) => x.id === r.inventoryItem.id)?.equipped, mods, expected, baseAfter: Object.fromEntries(ATTRS.map((k) => [k, p[k]])) };
  check('I35: equipamento comprado pela operação canônica pode ser equipado', r.ok && report.cases.I35_38.equipped === true, report.cases.I35_38);
  check('I37: bônus da LOCAL-9B = bônus do catálogo (derivado, um por categoria)', same(Object.fromEntries(Object.entries(mods).filter(([, v]) => v)), Object.fromEntries(Object.entries(expected).filter(([, v]) => v))), report.cases.I35_38);
  check('I38: atributos naturais não mudam com compra/equipar', ATTRS.every((k) => p[k] === 50), report.cases.I35_38);
  const statsAfter = (await quiet(async () => ctx.AC.buildAchievementContext(await P(ctx)))).inventory;
  const achRowsAfter = ((await ctx.E.PlayerAchievement.filter({ profile_id: ctx.profile.id })) || []).length;
  report.cases.I40 = { quantityField: r.inventoryItem.quantity ?? null, totalOwned: [statsBefore.totalOwned, statsAfter.totalOwned], achievementRows: [achRowsBefore, achRowsAfter] };
  check('I40: compra canônica não altera contagem/progresso das conquistas de coleção (fica para a 9C.2-B)', r.inventoryItem.quantity === undefined && statsBefore.totalOwned === statsAfter.totalOwned && achRowsBefore === achRowsAfter, report.cases.I40);

  // I34b — o simulador compra pela operação canônica: extrato e estoque gravados.
  const act = await import('./lib/v526Actions.mjs');
  const A = await quiet(() => act.loadActionModules(ctx.rt));
  const shop = await quiet(async () => act.shopOptions(ctx.rt, A, await P(ctx)));
  const row = shop.rows.find((x) => x.unlocked && x.available && !x.owned && x.item.category === 'grip');
  const ledgerBefore = (await shopLedger(ctx)).length;
  const before = await coins(ctx);
  const res = await quiet(async () => act.buyAndEquip(ctx.rt, await P(ctx), row, shop.inventory));
  const charged = before - await coins(ctx);
  report.cases.I34b = { item: row.item.name, rowPrice: row.price, paid: res.paid, charged, ledgerDelta: (await shopLedger(ctx)).length - ledgerBefore };
  check('I34b: buyAndEquip do simulador grava extrato e cobra o preço cotado pela tela', res.bought && res.paid === row.price && report.cases.I34b.ledgerDelta === 1 && (await shopScreenQuote(ctx, row.item)).currentPrice >= 0, report.cases.I34b);
  await ctx.rt.close();
}

// X7 — determinismo: mesma carreira, mesmas ações → mesmo estado.
{
  const run = async () => {
    const ctx = await prepare('determinism');
    const its = ctx.items.filter((i) => i.rarity === 'comum' && i.catalog_order != null).slice(0, 4);
    const results = [];
    for (const it of its) results.push((await buy(ctx, it.id)).code);
    const first = (await inv(ctx)).find((r) => r.id.startsWith('inventory-shop-'));
    results.push((await sell(ctx, first.id)).code);
    const s = await snap(ctx);
    await ctx.rt.close();
    return { results, coins: s.coins, inv: s.inv.map((x) => x.split(':').slice(0, 2).join(':')), ledger: s.ledger };
  };
  const a = await run(); const b = await run();
  check('X7: mesmas ações → mesmo resultado (ids de operação padrão determinísticos, sem RNG)', same(a, b), { a, b });
}

const failed = report.checks.filter((c) => !c.ok);
report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'tests.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`\n${report.summary.passed}/${report.summary.total} PASS`);
process.exit(failed.length ? 1 : 0);
