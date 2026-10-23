// LOCAL-9C.2-B-R1 — validação da liberação das recompensas de coleção.
//
// Módulos REAIS do jogo (Vite SSR) sobre carreiras em MEMÓRIA
// (scripts/lib/v526bTestKit.mjs): nenhum save real é lido ou gravado.
// Usa o padrão do código (COLLECTION_REWARDS_RELEASED). Antes da ativação,
// PL9C2B_FORCE_RELEASE=1 força a liberação para validar o caminho de pagamento.
//
//   K1     kit inicial (origem, catálogo, equipar, vender, contagem)
//   E1     compra → venda → recompra em ciclo: recompensa uma vez, sem lucro
//   L1-L3  saves antigos: reconciliação concorrente, após recargas, sem prova
//   F1     falha no meio da reconciliação
//   I1     saldo = extrato (loja + conquista) em toda a sequência
//
// Uso: TZ=UTC node scripts/test-local-9c2b-r1-release.mjs [--out=<dir>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
if (process.env.PL9C2B_FORCE_RELEASE === '1') globalThis.__PL9C2B_COLLECTION_REWARDS = true;
const { bootCareer, reloadCareer } = await import('./lib/v526bTestKit.mjs');

const OUT_DIR = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6) || 'reports/local-9c2-b-collection-achievements';
let quietDepth = 0; let saved = null;
const quiet = async (fn) => { if (process.env.PL9C2B_VERBOSE) return fn(); if (quietDepth++ === 0) { saved = [console.warn, console.log, console.debug, console.error, console.info]; console.warn = console.log = console.debug = console.error = console.info = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error, console.info] = saved; } };
const report = { generatedBy: 'LOCAL-9C.2-B-R1 collection rewards release', forcedRelease: process.env.PL9C2B_FORCE_RELEASE === '1', checks: [], cases: {} };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail != null && !ok ? ` · ${JSON.stringify(detail).slice(0, 500)}` : ''}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const MONTHS = Array.from({ length: 120 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-15`);
const FLAG = 'collection_achievements_v1_reconciled';
const MIDAS = 'achv-toque-de-midas';
const ALLCAT = 'achv-pau-para-toda-obra';
const COLLECTION_IDS = ['achv-colecionador', 'achv-acumulador', 'achv-museu-pessoal', 'achv-arsenal-completo', MIDAS, 'achv-rei-mida', 'achv-mito-vivo', 'achv-exclusividade', 'achv-armeiro', 'achv-sapateiro', 'achv-guarda-roupa', 'achv-tecnologo', ALLCAT, 'achv-rainbow-collection'];

async function prepare(seed, patch = {}) {
  const booted = await quiet(() => bootCareer(`9c2b-r1-${seed}`));
  const ctx = { ...booted, E: booted.rt.localGame.entities };
  await bind(ctx);
  await quiet(async () => { await ctx.market.seedMarket(ctx.profile.career_date); await ctx.store.ensureExpandedShopCatalog(); });
  ctx.profile = await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 5_000_000, career_level: 50, ranking_position: 1, reputation: 99, ...patch });
  ctx.items = ((await ctx.E.ShopItem.list('catalog_order', 2000)) || []).map(ctx.store.normalizeShopItem);
  return ctx;
}
async function bind(ctx) {
  const L = (p) => ctx.rt.load(p);
  ctx.T = await L('/src/game-core/shopTransactions.js');
  ctx.store = await L('/src/lib/storeCatalog.js');
  ctx.market = await L('/src/lib/marketEngine.js');
  ctx.eco = await L('/src/lib/sportsEconomyV26.js');
  ctx.AC = await L('/src/lib/achievementContext.js');
  ctx.engine = await L('/src/lib/achievementEngine.js');
  ctx.life = await L('/src/game-core/achievementLifecycle.js');
  ctx.EL = await L('/src/game-core/equipmentLifecycle.js');
  ctx.Repo = (await L('/src/gameplay/repositories/CareerEntityRepository.js')).CareerEntityRepository;
}
async function reload(ctx) { ctx.rt = await quiet(() => reloadCareer(ctx.rt, ctx.storage, ctx.careerId)); ctx.E = ctx.rt.localGame.entities; await bind(ctx); }
const P = (ctx) => ctx.E.PlayerProfile.get(ctx.profile.id);
const coins = async (ctx) => Number((await P(ctx)).coins) || 0;
const inv = async (ctx) => (await ctx.E.PlayerInventory.filter({ profile_id: ctx.profile.id })) || [];
const stats = async (ctx) => (await quiet(async () => ctx.AC.buildAchievementContext(await P(ctx)))).inventory;
const pa = async (ctx) => ((await ctx.E.PlayerAchievement.filter({ profile_id: ctx.profile.id })) || []);
const paOf = async (ctx, id) => (await pa(ctx)).find((r) => r.achievement_id === id) || null;
const ledger = async (ctx) => ((await ctx.E.FinancialTransaction.filter({ profile_id: ctx.profile.id })) || []);
const day = (ctx) => quiet(async () => ctx.life.processAchievementsDay(await P(ctx)));
const byRarity = (ctx, r, k = 0) => ctx.items.filter((i) => i.rarity === r && i.catalog_order != null)[k];
const byCategory = (ctx, c, k = 0) => ctx.items.filter((i) => i.category === c && i.catalog_order != null)[k];
async function buy(ctx, item, opts) {
  const month = MONTHS.find((d) => ctx.eco.getEquipmentMarketState(item, { career_date: d }).available);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { career_date: month });
  return quiet(() => ctx.T.purchaseShopItem(ctx.profile.id, item.id, opts));
}
const sell = (ctx, id) => quiet(() => ctx.T.sellInventoryItem(ctx.profile.id, id));
// Saldo = extrato: variação do saldo explicada por loja (compras/vendas) e conquista.
async function accounting(ctx, fromCoins, fromLedgerIds) {
  const rows = (await ledger(ctx)).filter((t) => !fromLedgerIds.has(t.id) && ['loja', 'conquista'].includes(t.category));
  const explained = rows.reduce((s, t) => s + (t.type === 'income' ? 1 : -1) * t.amount, 0);
  return { delta: (await coins(ctx)) - fromCoins, explained, rows: rows.length };
}
const attempt = async (fn) => { try { return { ok: true, value: await quiet(fn) }; } catch (e) { return { ok: false, error: e.message }; } };
async function legacyRow(ctx, item, extra = {}) {
  return ctx.E.PlayerInventory.create({ profile_id: ctx.profile.id, item_id: item.id, item_name: item.name, category: item.category, rarity: item.rarity, equipped: false, acquired_date: '2025-03-01', ...extra });
}

// ── R0 — estado da liberação ───────────────────────────────────────────────
{
  const ctx = await prepare('state');
  report.releaseState = { constant: ctx.engine.COLLECTION_REWARDS_RELEASED, effective: ctx.engine.collectionRewardsReleased() };
  console.log(`liberação: constante=${report.releaseState.constant} efetiva=${report.releaseState.effective}`);
  check('R0: liberação efetiva ligada nesta execução', report.releaseState.effective === true, report.releaseState);

  // ── K1 — kit inicial ─────────────────────────────────────────────────────
  const kit = (await inv(ctx)).find((r) => r.starter_seed);
  const kitItem = kit ? await ctx.E.ShopItem.get(kit.item_id).catch(() => null) : null;
  const s0 = await stats(ctx);
  report.cases.K1 = { row: kit && { id: kit.id, item_id: kit.item_id, quantity: kit.quantity, starter_seed: kit.starter_seed }, catalogItem: kitItem && { id: kitItem.id, name: kitItem.name, available: kitItem.is_available !== false, price: kitItem.price }, counted: { totalOwned: s0.totalOwned, units: s0.totalUnits } };
  check('K1: kit inicial = linha `starter_seed` (remapSeedRow, 5.27-M) de um produto REAL do catálogo à venda na Loja; conta como 1 produto distinto', kit?.starter_seed === true && kitItem && kitItem.is_available !== false && s0.totalOwned === 1 && s0.totalUnits === 2, report.cases.K1);
  await quiet(async () => ctx.EL.toggleEquipItem({ profile: await P(ctx), inventory: await inv(ctx), target: kit, shopItems: await ctx.E.ShopItem.list() }));
  const equipped = (await inv(ctx)).find((r) => r.id === kit.id)?.equipped;
  await quiet(async () => ctx.EL.toggleEquipItem({ profile: await P(ctx), inventory: await inv(ctx), target: (await inv(ctx)).find((r) => r.id === kit.id), shopItems: await ctx.E.ShopItem.list() }));
  const c = await coins(ctx);
  const sold = await sell(ctx, kit.id);
  check('K1: kit inicial é equipamento utilizável (equipa) e vendável pela regra normal — item legítimo, não registro técnico', equipped === true && sold.ok && (await coins(ctx)) - c === ctx.T.computeResalePrice(kitItem), { equipped, sold: sold.code });
  await ctx.rt.close();
}

// ── E1 — compra → venda → recompra em ciclo ────────────────────────────────
{
  const ctx = await prepare('exploit');
  const legendary = byRarity(ctx, 'lendario');
  const c0 = await coins(ctx); const l0 = new Set((await ledger(ctx)).map((t) => t.id));
  const cycle = [];
  for (let k = 0; k < 3; k += 1) {
    const b = await buy(ctx, legendary, { operationId: `e1-${k}` });
    await day(ctx);
    const row = (await inv(ctx)).find((r) => r.item_id === legendary.id);
    const s = await sell(ctx, row.id);
    await day(ctx);
    cycle.push({ buy: b.code, price: b.price, sell: s.code, resale: s.amount });
  }
  const midasRows = (await ledger(ctx)).filter((t) => t.id === `reward-pa-${MIDAS}-${ctx.profile.id}`);
  const acc = await accounting(ctx, c0, l0);
  const midasPaid = midasRows.reduce((s, t) => s + t.amount, 0);
  const spent = cycle.reduce((s, x) => s + x.price - x.resale, 0);
  report.cases.E1 = { cycle, midasRewardRows: midasRows.length, midasPaid, netShop: -spent, coinsDelta: acc.delta, explained: acc.explained };
  check('E1: três ciclos comprar → receber → vender → recomprar: "Toque de Midas" paga UMA vez; cada ciclo perde dinheiro (sem lucro)', midasRows.length === 1 && midasPaid === 1000 && cycle.every((x) => x.price - x.resale > 0) && acc.delta < 0 && -spent + 1000 < 0, report.cases.E1);
  check('I1: saldo = extrato (loja + conquista) ao longo dos ciclos', acc.delta === acc.explained, acc);
  await reload(ctx);
  const c1 = await coins(ctx);
  await day(ctx); await day(ctx);
  check('E1: após save/load e dois fechamentos, nada pago de novo; registro único', (await coins(ctx)) === c1 && (await pa(ctx)).filter((r) => r.achievement_id === MIDAS).length === 1);
  await ctx.rt.close();
}

// ── L1 — save antigo: reconciliação concorrente e após recargas ────────────
{
  const ctx = await prepare('legacy');
  await ctx.E.PlayerProfile.update(ctx.profile.id, { [FLAG]: false });
  await legacyRow(ctx, byRarity(ctx, 'lendario'));
  await legacyRow(ctx, byRarity(ctx, 'lendario')); // duplicada legada
  for (const cat of ['grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'acessorio', 'colecionavel']) await legacyRow(ctx, byCategory(ctx, cat));
  const c0 = await coins(ctx); const l0 = new Set((await ledger(ctx)).map((t) => t.id));
  const p = await P(ctx);
  // Duas avaliações concorrentes no primeiro contato (ex.: fim de partida + fechamento do dia).
  await Promise.all([quiet(() => ctx.life.processAchievementsDay(p)), quiet(() => ctx.life.processAchievementsDay(p))]);
  const rows = (await pa(ctx)).filter((r) => COLLECTION_IDS.includes(r.achievement_id));
  const collLedger = (await ledger(ctx)).filter((t) => !l0.has(t.id) && COLLECTION_IDS.some((id) => t.id.includes(id)));
  const acc = await accounting(ctx, c0, l0);
  report.cases.L1 = { reconciled: rows.map((r) => [r.achievement_id, r.reconciled, r.reward_delivered, r.reward_coins]), collectionLedger: collLedger.map((t) => t.id), flag: (await P(ctx))[FLAG], acc };
  check('L1: save antigo com duas avaliações concorrentes → Midas e Pau para Toda Obra registradas UMA vez, reconciliadas, sem moeda nem extrato de coleção; flag gravada', rows.filter((r) => r.achievement_id === MIDAS).length === 1 && rows.filter((r) => r.achievement_id === ALLCAT).length === 1 && rows.every((r) => r.reconciled === true && r.reward_delivered === false && r.reward_coins === 0) && collLedger.length === 0 && (await P(ctx))[FLAG] === true, report.cases.L1);
  check('L1: saldo = extrato (só conquistas não-coleção pagas no dia)', acc.delta === acc.explained, acc);
  for (let k = 0; k < 2; k += 1) { await reload(ctx); await day(ctx); }
  const rows2 = (await pa(ctx)).filter((r) => COLLECTION_IDS.includes(r.achievement_id));
  check('L1: após duas recargas e fechamentos, reconciliação não se repete, nada é pago, nada duplica', same(rows2.map((r) => r.achievement_id).sort(), rows.map((r) => r.achievement_id).sort()) && rows2.every((r) => !r.reward_delivered) && !(await ledger(ctx)).some((t) => COLLECTION_IDS.some((id) => t.id.includes(id))), rows2.length);
  // L3 — depois da reconciliação, nova conquista legítima paga normalmente, uma vez.
  const cBefore = await coins(ctx);
  await buy(ctx, byRarity(ctx, 'mitico'), { operationId: 'l3' });
  const cAfterBuy = await coins(ctx);
  await day(ctx); await day(ctx);
  const mito = await paOf(ctx, 'achv-mito-vivo');
  check('L3: após a reconciliação, "Mito Vivo" (aquisição nova) paga 10.000 uma vez', mito?.reward_delivered === true && mito.reward_coins === 10000 && (await ledger(ctx)).filter((t) => t.id.includes('achv-mito-vivo')).length === 1 && (await coins(ctx)) - cAfterBuy >= 10000, { mito: mito && mito.reward_coins, cBefore });
  await ctx.rt.close();
}

// ── L2 — save antigo sem prova; F1 — falha no meio da reconciliação ────────
{
  const ctx = await prepare('legacy-empty');
  await ctx.E.PlayerProfile.update(ctx.profile.id, { [FLAG]: false });
  await legacyRow(ctx, byRarity(ctx, 'lendario'));
  // F1: falha injetada no lote da primeira avaliação (registro reconciliado + flag).
  const proto = ctx.Repo.prototype; const original = proto.ensureCollection;
  proto.ensureCollection = function patched(entityName, career, options = {}) {
    if (entityName === 'PlayerAchievement' && options.persist) throw new Error('falha injetada no meio do lote');
    return original.call(this, entityName, career, options);
  };
  const f = await attempt(async () => ctx.life.processAchievementsDay(await P(ctx)));
  proto.ensureCollection = original;
  const afterFail = { flag: (await P(ctx))[FLAG], rows: (await pa(ctx)).length };
  await day(ctx);
  const midas = await paOf(ctx, MIDAS);
  report.cases.F1 = { failure: f.ok ? 'sem erro' : f.error, afterFail, midas: midas && [midas.reconciled, midas.reward_delivered] };
  check('F1: falha no lote da reconciliação → nem registro nem flag; a próxima avaliação reconcilia uma vez, sem pagar', !f.ok && afterFail.flag === false && afterFail.rows === 0 && midas?.reconciled === true && midas.reward_delivered === false && !(await ledger(ctx)).some((t) => t.id.includes(MIDAS)), report.cases.F1);
  await ctx.rt.close();

  const ctx2 = await prepare('legacy-noproof');
  await ctx2.E.PlayerProfile.update(ctx2.profile.id, { [FLAG]: false });
  await day(ctx2);
  const flagged = (await P(ctx2))[FLAG];
  const noRows = (await pa(ctx2)).filter((r) => COLLECTION_IDS.includes(r.achievement_id)).length;
  await buy(ctx2, byRarity(ctx2, 'lendario'), { operationId: 'l2' });
  const cb = await coins(ctx2);
  await day(ctx2);
  const midas2 = await paOf(ctx2, MIDAS);
  check('L2: save antigo sem nada a provar → flag gravada sem registrar nada; a 1ª conquista real depois disso paga normalmente', flagged === true && noRows === 0 && midas2?.reward_delivered === true && (await coins(ctx2)) - cb >= 1000, { flagged, noRows, midas2: midas2 && midas2.reward_coins });
  await ctx2.rt.close();
}

const failed = report.checks.filter((c) => !c.ok);
report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, report.forcedRelease ? 'r1-release-prevalidation.json' : 'r1-release.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`\n${report.summary.passed}/${report.summary.total} PASS`);
process.exit(failed.length ? 1 : 0);
