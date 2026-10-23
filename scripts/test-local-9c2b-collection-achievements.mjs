// LOCAL-9C.2-B — conquistas de coleção: progresso, coleção, recompensas e
// compatibilidade de saves.
//
// Módulos REAIS do jogo (Vite SSR) sobre carreiras em MEMÓRIA
// (scripts/lib/v526bTestKit.mjs): nenhum save real é lido ou gravado.
// Compras e vendas pela operação canônica da 9C.2-A; avaliação pelo caminho
// real do fechamento do dia (achievementLifecycle.processAchievementsDay).
// A liberação das recompensas de coleção (decisão pendente) é ligada só nos
// casos que testam o pagamento: globalThis.__PL9C2B_COLLECTION_REWARDS.
//
//   A progresso · B coleção · C recompensas · D compatibilidade · G liberação
//
// Uso: TZ=UTC node scripts/test-local-9c2b-collection-achievements.mjs [--out=<dir>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const { bootCareer, reloadCareer } = await import('./lib/v526bTestKit.mjs');

const OUT_DIR = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6) || 'reports/local-9c2-b-collection-achievements';
let quietDepth = 0; let saved = null;
const quiet = async (fn) => { if (process.env.PL9C2B_VERBOSE) return fn(); if (quietDepth++ === 0) { saved = [console.warn, console.log, console.debug, console.error, console.info]; console.warn = console.log = console.debug = console.error = console.info = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error, console.info] = saved; } };
const report = { generatedBy: 'LOCAL-9C.2-B collection achievements integrity', checks: [], cases: {} };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail != null && !ok ? ` · ${JSON.stringify(detail).slice(0, 500)}` : ''}`); };
const release = (on) => { globalThis.__PL9C2B_COLLECTION_REWARDS = on; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const MONTHS = Array.from({ length: 120 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-15`);
const FLAG = 'collection_achievements_v1_reconciled';
const MIDAS = 'achv-toque-de-midas';
const MITO = 'achv-mito-vivo';
const ALLCAT = 'achv-pau-para-toda-obra';

async function prepare(seed, patch = {}) {
  const booted = await quiet(() => bootCareer(`9c2b-${seed}`));
  const ctx = { ...booted, E: booted.rt.localGame.entities };
  await bind(ctx);
  await quiet(async () => { await ctx.market.seedMarket(ctx.profile.career_date); await ctx.store.ensureExpandedShopCatalog(); });
  ctx.profile = await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 5_000_000, career_level: 50, ranking_position: 1, reputation: 99, tournaments_played: 10, ...patch });
  ctx.items = ((await ctx.E.ShopItem.list('catalog_order', 2000)) || []).map(ctx.store.normalizeShopItem);
  return ctx;
}
async function bind(ctx) {
  const L = (p) => ctx.rt.load(p);
  ctx.T = await L('/src/game-core/shopTransactions.js');
  ctx.store = await L('/src/lib/storeCatalog.js');
  ctx.market = await L('/src/lib/marketEngine.js');
  ctx.eco = await L('/src/lib/sportsEconomyV26.js');
  ctx.S = await L('/src/lib/sponsors.js');
  ctx.AC = await L('/src/lib/achievementContext.js');
  ctx.engine = await L('/src/lib/achievementEngine.js');
  ctx.life = await L('/src/game-core/achievementLifecycle.js');
  ctx.EL = await L('/src/game-core/equipmentLifecycle.js');
  ctx.Repo = (await L('/src/gameplay/repositories/CareerEntityRepository.js')).CareerEntityRepository;
}
async function reload(ctx) {
  ctx.rt = await quiet(() => reloadCareer(ctx.rt, ctx.storage, ctx.careerId));
  ctx.E = ctx.rt.localGame.entities;
  await bind(ctx);
}
const P = (ctx) => ctx.E.PlayerProfile.get(ctx.profile.id);
const coins = async (ctx) => Number((await P(ctx)).coins) || 0;
const inv = async (ctx) => (await ctx.E.PlayerInventory.filter({ profile_id: ctx.profile.id })) || [];
const stats = async (ctx) => (await quiet(async () => ctx.AC.buildAchievementContext(await P(ctx)))).inventory;
const progressOf = async (ctx, id) => {
  const p = await P(ctx);
  const c = await quiet(() => ctx.AC.buildAchievementContext(p));
  return ctx.engine.evaluateAchievements(p, c).find((r) => r.achievement.id === id);
};
const pa = async (ctx, id) => ((await ctx.E.PlayerAchievement.filter({ profile_id: ctx.profile.id })) || []).find((r) => r.achievement_id === id) || null;
const paAll = async (ctx) => ((await ctx.E.PlayerAchievement.filter({ profile_id: ctx.profile.id })) || []).map((r) => `${r.achievement_id}:${r.reward_delivered}:${r.reward_coins}`).sort();
const rewardLedger = async (ctx) => ((await ctx.E.FinancialTransaction.filter({ profile_id: ctx.profile.id })) || []).filter((t) => t.category === 'conquista');
const day = (ctx) => quiet(async () => ctx.life.processAchievementsDay(await P(ctx)));
const byRarity = (ctx, r, skip = 0) => ctx.items.filter((i) => i.rarity === r && i.catalog_order != null)[skip];
const byCategory = (ctx, c, skip = 0) => ctx.items.filter((i) => i.category === c && i.catalog_order != null)[skip];
async function buy(ctx, item, opts = {}) {
  const month = MONTHS.find((d) => ctx.eco.getEquipmentMarketState(item, { career_date: d }).available);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { career_date: month });
  return quiet(() => ctx.T.purchaseShopItem(ctx.profile.id, item.id, opts));
}
async function withLedgerWriteFailure(ctx, fn) {
  const proto = ctx.Repo.prototype; const original = proto.ensureCollection;
  proto.ensureCollection = function patched(entityName, career, options = {}) {
    if (entityName === 'FinancialTransaction' && options.persist) throw new Error('falha injetada no meio do lote');
    return original.call(this, entityName, career, options);
  };
  try { return await fn(); } finally { proto.ensureCollection = original; }
}
const attempt = async (fn) => { try { return { ok: true, value: await quiet(fn) }; } catch (e) { return { ok: false, error: e.message }; } };

// ═══ A — progresso ═════════════════════════════════════════════════════════
{
  release(false);
  const ctx = await prepare('progress');
  const U = ctx.AC.inventoryRowUnits;
  const units = { ausente: U({}), nulo: U({ quantity: null }), um: U({ quantity: 1 }), dois: U({ quantity: 2 }), texto3: U({ quantity: '3' }), zero: U({ quantity: 0 }), negativo: U({ quantity: -2 }), invalido: U({ quantity: 'abc' }), fracao: U({ quantity: 1.7 }), semLinha: U(null) };
  report.cases.A_units = units;
  check('A2/A3: unidades da linha — ausente = 1 (equipamento único); número = parte inteira; 0, negativo, inválido = 0', same(units, { ausente: 1, nulo: 1, um: 1, dois: 2, texto3: 3, zero: 0, negativo: 0, invalido: 0, fracao: 1, semLinha: 0 }), units);
  const s0 = await stats(ctx);
  const racket = byRarity(ctx, 'lendario');
  const r1 = await buy(ctx, racket, { operationId: 'a1' });
  const s1 = await stats(ctx);
  report.cases.A1 = { before: { totalOwned: s0.totalOwned, legendary: s0.legendary, rackets: s0.rackets, units: s0.totalUnits }, after: { totalOwned: s1.totalOwned, legendary: s1.legendary, rackets: s1.rackets, units: s1.totalUnits } };
  check('A1: compra legítima incrementa itens possuídos, lendários e raquetes em exatamente 1', r1.ok && s1.totalOwned === s0.totalOwned + 1 && s1.legendary === s0.legendary + 1 && s1.rackets === s0.rackets + 1 && s1.totalUnits === s0.totalUnits + 1, report.cases.A1);
  const demo = (await inv(ctx)).find((r) => r.id === 'inventory-001');
  check('A3: linha de demonstração (quantity 2) conta 1 item diferente e 2 unidades', demo && s0.totalOwned === 1 && s0.totalUnits === 2, { demo: demo?.quantity, s0: [s0.totalOwned, s0.totalUnits] });
  // A4 — equipado continua contando.
  const row = r1.inventoryItem;
  await quiet(async () => ctx.EL.toggleEquipItem({ profile: await P(ctx), inventory: await inv(ctx), target: row, shopItems: await ctx.E.ShopItem.list() }));
  const s4 = await stats(ctx);
  check('A4: item equipado continua contabilizado', (await inv(ctx)).find((x) => x.id === row.id)?.equipped === true && s4.totalOwned === s1.totalOwned && s4.legendary === 1, { totalOwned: s4.totalOwned });
  // A5 — compra recusada (saldo, estoque) não conta.
  const mythic = byRarity(ctx, 'mitico');
  await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 10 });
  const rf = await buy(ctx, mythic);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 5_000_000 });
  const relic = ctx.items.find((i) => String(i.id).startsWith('historical-relic-'));
  const h = ((await ctx.E.MarketPriceHistory.filter({ item_id: relic.id })) || [])[0];
  await ctx.E.MarketPriceHistory.update(h.id, { stock_remaining: 0 });
  const rs = await buy(ctx, relic);
  const s5 = await stats(ctx);
  check('A5: compras recusadas (saldo, estoque) não geram progresso', rf.code === 'insufficient-funds' && rs.code === 'out-of-stock' && s5.totalOwned === s4.totalOwned && s5.mythic === 0 && s5.exclusive === 0, { rf: rf.code, rs: rs.code });
  // A6 — mesma operação repetida e clique duplo concorrente.
  const grip = byCategory(ctx, 'grip');
  const dd = await Promise.all([buy(ctx, grip, { operationId: 'a6' }), buy(ctx, grip, { operationId: 'a6' })]);
  const again = await buy(ctx, grip, { operationId: 'a6' });
  const s6 = await stats(ctx);
  check('A6: clique duplo / repetição da mesma operação → progresso +1 só', dd.filter((x) => x.ok).length === 1 && again.code === 'duplicate' && s6.totalOwned === s5.totalOwned + 1, { dd: dd.map((x) => x.code), again: again.code, totalOwned: s6.totalOwned });
  // A8 — compras concorrentes distintas contam exatamente.
  const pair = [byCategory(ctx, 'bola'), byCategory(ctx, 'mochila'), byCategory(ctx, 'acessorio')];
  const pr = await Promise.all(pair.map((it, k) => buy(ctx, it, { operationId: `a8-${k}` })));
  const s8 = await stats(ctx);
  check('A8: três compras concorrentes distintas → +3 exatamente', pr.every((x) => x.ok) && s8.totalOwned === s6.totalOwned + 3, { codes: pr.map((x) => x.code), totalOwned: s8.totalOwned });
  // A9 — falha transacional não conta.
  const shoe = byCategory(ctx, 'tenis');
  const f9 = await attempt(() => withLedgerWriteFailure(ctx, () => ctx.T.purchaseShopItem(ctx.profile.id, shoe.id, { operationId: 'a9' })));
  const s9 = await stats(ctx);
  check('A9: compra com falha injetada no lote não gera progresso', !f9.ok && s9.totalOwned === s8.totalOwned && s9.shoes === s8.shoes, f9);
  // A7 — save/load preserva sem duplicar.
  await reload(ctx);
  const s7 = await stats(ctx);
  const again7 = await buy(ctx, grip, { operationId: 'a6' });
  check('A7: após save/load o progresso é o mesmo e repetir a compra não duplica', s7.totalOwned === s9.totalOwned && again7.code === 'duplicate' && (await stats(ctx)).totalOwned === s9.totalOwned, { s7: s7.totalOwned, s9: s9.totalOwned, again7: again7.code });
  // A10 — compra concorrente com venda; venda reduz, recompra restaura (posse atual).
  const bag = (await inv(ctx)).find((x) => x.item_id === pair[1].id);
  const tech = byCategory(ctx, 'acessorio_tec');
  const [sold, boughtTech] = await Promise.all([quiet(() => ctx.T.sellInventoryItem(ctx.profile.id, bag.id)), buy(ctx, tech, { operationId: 'a10' })]);
  const s10 = await stats(ctx);
  const rebuy = await buy(ctx, pair[1], { operationId: 'a10-recompra' });
  const s10b = await stats(ctx);
  report.cases.A10 = { sold: sold.code, boughtTech: boughtTech.code, afterSaleAndBuy: s10.totalOwned, afterRebuy: s10b.totalOwned };
  check('A10: venda + compra concorrentes → posse atual −1 +1; recompra do vendido → +1 (sem duplicar)', sold.ok && boughtTech.ok && s10.totalOwned === s7.totalOwned && rebuy.ok && s10b.totalOwned === s10.totalOwned + 1, report.cases.A10);
  await ctx.rt.close();
}

// ═══ B — coleção (critérios existentes) ════════════════════════════════════
{
  release(false);
  const ctx = await prepare('collection');
  // B10/B3 — linhas legadas (id aleatório, sem quantity) e duplicadas do mesmo item.
  const legendary = byRarity(ctx, 'lendario');
  for (let k = 0; k < 3; k += 1) await ctx.E.PlayerInventory.create({ profile_id: ctx.profile.id, item_id: legendary.id, item_name: legendary.name, category: legendary.category, rarity: legendary.rarity, equipped: false, acquired_date: '2025-06-01' });
  const sL = await stats(ctx);
  check('B10/B3: linhas legadas sem quantity contam; três linhas do MESMO item contam como 1 item diferente', sL.totalOwned === 2 && sL.legendary === 1 && sL.rackets === 1 && sL.totalUnits === 5, { totalOwned: sL.totalOwned, legendary: sL.legendary, units: sL.totalUnits });
  // B4/B7 — categorias distintas (inclui colecionáveis).
  for (const c of ['grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'acessorio', 'colecionavel']) await buy(ctx, byCategory(ctx, c), { operationId: `b4-${c}` });
  const sC = await stats(ctx);
  const allCat = await progressOf(ctx, ALLCAT);
  check('B4/B7: uma peça de cada uma das 9 categorias (colecionável incluído) completa "Pau para Toda Obra"', sC.categories === 9 && sC.totalCategoriesInCatalog === 9 && allCat.unlocked, { categories: sC.categories, unlocked: allCat.unlocked });
  // B6/B8 — raridades; relíquia conta como exclusiva.
  await buy(ctx, byRarity(ctx, 'mitico'), { operationId: 'b6-m' });
  for (const r of ['incomum', 'raro', 'epico']) await buy(ctx, byRarity(ctx, r, 1), { operationId: `b6-${r}` });
  const relic = ctx.items.find((i) => String(i.id).startsWith('historical-relic-'));
  const rr = await buy(ctx, relic, { operationId: 'b8' });
  const sR = await stats(ctx);
  const rainbow = await progressOf(ctx, 'achv-rainbow-collection');
  const excl = await progressOf(ctx, 'achv-exclusividade');
  report.cases.B6 = { relic: rr.code, rarities: sR.rarities, exclusive: sR.exclusive, mythic: sR.mythic, rainbow: rainbow.unlocked, exclusividade: excl.unlocked };
  check('B6/B8: relíquia (is_exclusive) conta para "Exclusividade"; 7 raridades completam "Rainbow Collection"', rr.ok && sR.exclusive === 1 && sR.rarities === 7 && rainbow.unlocked && excl.unlocked && sR.mythic === 1, report.cases.B6);
  check('B9: item de demonstração (kit inicial, quantity 2) segue contando como posse atual — semântica preservada', (await inv(ctx)).some((r) => r.id === 'inventory-001') && sR.totalOwned >= 1);
  check('B1: a métrica é a POSSE ATUAL (contexto lido do inventário a cada avaliação; nenhum contador paralelo gravado)', !Object.keys(await P(ctx)).some((k) => /collection_count|owned_count|acquired_count/.test(k)));
  await ctx.rt.close();
}

// ═══ C — recompensas (liberação ligada) ════════════════════════════════════
{
  release(true);
  const ctx = await prepare('rewards');
  // C2 — incompleta não paga.
  await day(ctx);
  const c0 = await coins(ctx);
  check('C2: sem item lendário, "Toque de Midas" não é registrada nem paga', !(await pa(ctx, MIDAS)), null);
  // C1 — concluída legitimamente paga uma vez, com extrato e registro no mesmo lote.
  const bought = await buy(ctx, byRarity(ctx, 'lendario'), { operationId: 'c1' });
  const cBuy = await coins(ctx);
  const led0 = await rewardLedger(ctx);
  const d1 = await day(ctx);
  const row = await pa(ctx, MIDAS);
  const led1 = await rewardLedger(ctx);
  const newLed = led1.filter((t) => !led0.some((x) => x.id === t.id));
  const delta1 = (await coins(ctx)) - cBuy;
  report.cases.C1 = { bought: bought.code, row: row && { reward_delivered: row.reward_delivered, reward_coins: row.reward_coins, reconciled: row.reconciled }, ledger: newLed.map((t) => [t.id, t.amount]), delta: delta1, unlocked: d1.unlocked };
  check('C1: "Toque de Midas" registrada e paga (1.000) com linha de extrato reward-pa-… no mesmo lote', row?.reward_delivered === true && row.reward_coins === 1000 && newLed.some((t) => t.id === `reward-pa-${MIDAS}-${ctx.profile.id}` && t.amount === 1000) && delta1 === newLed.reduce((s, t) => s + t.amount, 0), report.cases.C1);
  // C3 — repetir a avaliação não paga.
  const before3 = await coins(ctx);
  await day(ctx); await day(ctx);
  check('C3: repetir a avaliação (dois fechamentos de dia) não paga de novo', (await coins(ctx)) === before3 && (await rewardLedger(ctx)).length === led1.length);
  // C4 — save/load depois do pagamento.
  await reload(ctx);
  const before4 = await coins(ctx);
  await day(ctx);
  check('C4: após save/load, conquista paga continua registrada e não paga outra vez', (await pa(ctx, MIDAS))?.reward_delivered === true && (await coins(ctx)) === before4, null);
  // C5 — falha entre conclusão e pagamento: nada aplicado; próximo fechamento paga uma vez.
  await buy(ctx, byRarity(ctx, 'mitico'), { operationId: 'c5' });
  const s5 = { coins: await coins(ctx), pa: await paAll(ctx), led: (await rewardLedger(ctx)).length };
  const f5 = await attempt(() => withLedgerWriteFailure(ctx, async () => ctx.life.processAchievementsDay(await P(ctx))));
  const a5 = { coins: await coins(ctx), pa: await paAll(ctx), led: (await rewardLedger(ctx)).length };
  await day(ctx);
  const b5 = { coins: await coins(ctx), mito: await pa(ctx, MITO), led: (await rewardLedger(ctx)).length };
  report.cases.C5 = { failure: f5.ok ? 'sem erro' : f5.error, unchanged: same(s5, a5), after: { delta: b5.coins - s5.coins, mito: b5.mito?.reward_coins, led: b5.led - s5.led } };
  check('C5: falha no lote de conclusão+pagamento → nem registro, nem moedas, nem extrato; o próximo fechamento conclui e paga uma vez', !f5.ok && same(s5, a5) && b5.mito?.reward_delivered === true && b5.mito.reward_coins === 10000 && b5.coins - s5.coins >= 10000, report.cases.C5);
  // C6 — sincronizações concorrentes + crédito concorrente (luvas).
  await buy(ctx, ctx.items.find((i) => i.category === 'acessorio_tec' && i.rarity === 'lendario') || byRarity(ctx, 'lendario', 1), { operationId: 'c6' });
  for (const c of ['grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'acessorio', 'colecionavel']) await buy(ctx, byCategory(ctx, c), { operationId: `c6-${c}` });
  const sponsor = ctx.S.SPONSOR_CATALOG.find((s) => s.tier === 'Bronze' && ctx.S.canSign(s, ctx.profile).ok);
  const s6 = { coins: await coins(ctx), led: await rewardLedger(ctx) };
  const pNow = await P(ctx);
  const c6ctx = await quiet(() => ctx.AC.buildAchievementContext(pNow));
  const res6 = await Promise.all([
    quiet(() => ctx.engine.syncPlayerAchievements(pNow, c6ctx, { localGame: ctx.rt.localGame })),
    quiet(() => ctx.engine.syncPlayerAchievements(pNow, c6ctx, { localGame: ctx.rt.localGame })),
    quiet(() => ctx.S.signSponsorContract(pNow, sponsor)),
  ]);
  const bonus = ((await ctx.E.PlayerContract.filter({ profile_id: ctx.profile.id, sponsor_id: sponsor.id })) || [])[0]?.sign_bonus || 0;
  const led6 = (await rewardLedger(ctx)).filter((t) => !s6.led.some((x) => x.id === t.id));
  const paid6 = led6.reduce((s, t) => s + t.amount, 0);
  const allcat = await pa(ctx, ALLCAT);
  report.cases.C6 = { rewarded: [res6[0].rewarded.map((a) => a.id), res6[1].rewarded.map((a) => a.id)], ledger: led6.map((t) => [t.id, t.amount]), bonus, delta: (await coins(ctx)) - s6.coins, expected: paid6 + bonus };
  check('C6: duas sincronizações concorrentes + luvas → cada conquista registrada/paga uma vez; nenhum crédito sobrescrito', allcat?.reward_delivered === true && led6.filter((t) => t.id.includes(ALLCAT)).length === 1 && (res6[0].rewarded.length === 0 || res6[1].rewarded.length === 0) && bonus > 0 && report.cases.C6.delta === report.cases.C6.expected, report.cases.C6);
  // C9 — saldo e extrato consistentes no total.
  const allLed = await rewardLedger(ctx);
  const paidRows = ((await ctx.E.PlayerAchievement.filter({ profile_id: ctx.profile.id })) || []).filter((r) => r.reward_delivered);
  check('C9: cada conquista paga tem 1 linha de extrato com o mesmo valor; nenhuma linha órfã', paidRows.filter((r) => r.reward_coins > 0).every((r) => allLed.filter((t) => t.id === `reward-pa-${r.achievement_id}-${ctx.profile.id}`).length === 1 && allLed.find((t) => t.id === `reward-pa-${r.achievement_id}-${ctx.profile.id}`).amount === r.reward_coins) && allLed.every((t) => paidRows.some((r) => t.id === `reward-pa-${r.achievement_id}-${ctx.profile.id}`)), { paid: paidRows.length, ledger: allLed.length });
  // C10 — XP por incremento.
  check('C10: XP e moedas creditados por incremento (registro guarda reward_xp/reward_coins)', (await pa(ctx, MIDAS)).reward_xp === 500, null);
  void c0;
  await ctx.rt.close();
}

// ═══ D — compatibilidade de saves antigos (liberação ligada) ═══════════════
{
  release(true);
  const ctx = await prepare('legacy');
  // Save "anterior à 9C.2-B": sem a flag, inventário legado que já prova conquistas,
  // conquista antiga paga e conquista antiga ambígua (reconciliada, sem pagamento).
  await ctx.E.PlayerProfile.update(ctx.profile.id, { [FLAG]: false });
  const legacyLegendary = byRarity(ctx, 'lendario');
  await ctx.E.PlayerInventory.create({ id: 'playerinventory-legado-1', profile_id: ctx.profile.id, item_id: legacyLegendary.id, item_name: legacyLegendary.name, category: 'raquete', rarity: 'lendario', equipped: false, acquired_date: '2025-03-01' });
  await ctx.E.PlayerInventory.create({ id: 'playerinventory-legado-2', profile_id: ctx.profile.id, item_id: legacyLegendary.id, item_name: legacyLegendary.name, category: 'raquete', rarity: 'lendario', equipped: false, acquired_date: '2025-03-01' });
  for (const c of ['grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'acessorio', 'colecionavel']) {
    const it = byCategory(ctx, c);
    await ctx.E.PlayerInventory.create({ profile_id: ctx.profile.id, item_id: it.id, item_name: it.name, category: it.category, rarity: it.rarity, equipped: false, acquired_date: '2025-03-01' });
  }
  await ctx.E.PlayerAchievement.create({ id: `pa-achv-colecionador-${ctx.profile.id}`, profile_id: ctx.profile.id, achievement_id: 'achv-colecionador', achievement_name: 'Colecionador', reward_delivered: true, reward_coins: 1000, reward_xp: 500, reconciled: false });
  await ctx.E.PlayerAchievement.create({ id: `pa-achv-armeiro-${ctx.profile.id}`, profile_id: ctx.profile.id, achievement_id: 'achv-armeiro', achievement_name: 'Armeiro', reconciled: true, reward_delivered: false, reward_coins: 0 });
  const invBefore = (await inv(ctx)).map((r) => r.id).sort();
  const attrsBefore = Object.fromEntries(ATTRS.map((k) => [k, ctx.profile[k]]));
  const c0 = await coins(ctx);
  const led0 = await rewardLedger(ctx);
  const d = await day(ctx);
  const midas = await pa(ctx, MIDAS); const allcat = await pa(ctx, ALLCAT);
  const coll = await pa(ctx, 'achv-colecionador'); const arm = await pa(ctx, 'achv-armeiro');
  const ledNew = (await rewardLedger(ctx)).filter((t) => !led0.some((x) => x.id === t.id));
  const p1 = await P(ctx);
  report.cases.D1 = { midas: midas && [midas.reconciled, midas.reward_delivered, midas.reward_coins], allcat: allcat && [allcat.reconciled, allcat.reward_delivered], collectionLedger: ledNew.filter((t) => /colecionador|armeiro|midas|toda-obra/.test(t.id)).map((t) => t.id), flag: p1[FLAG], unlocked: d.unlocked };
  check('D1: save antigo — conquistas de coleção que o inventário legado já prova são registradas SEM recompensa (reconciliadas), uma vez; flag gravada no mesmo lote', midas?.reconciled === true && midas.reward_delivered === false && midas.reward_coins === 0 && allcat?.reconciled === true && report.cases.D1.collectionLedger.length === 0 && p1[FLAG] === true, report.cases.D1);
  check('D3/D4: conquista antiga paga preservada, sem estorno; conquista antiga ambígua (reconciliada) segue sem pagamento', coll?.reward_delivered === true && coll.reward_coins === 1000 && arm?.reconciled === true && arm.reward_delivered === false && !ledNew.some((t) => /colecionador|armeiro/.test(t.id)), { coll: coll && coll.reward_delivered, arm: arm && arm.reward_delivered });
  check('D2/D6: nenhuma linha de inventário perdida (inclusive duplicadas); atributos naturais intactos', same(invBefore, (await inv(ctx)).map((r) => r.id).sort()) && ATTRS.every((k) => p1[k] === attrsBefore[k]), null);
  check('D8: nenhuma moeda de coleção paga retroativamente (variação de saldo = só conquistas não-coleção do dia)', (await coins(ctx)) - c0 === ledNew.reduce((s, t) => s + t.amount, 0) && !ledNew.some((t) => /colecionador|armeiro|midas|toda-obra|rainbow|mito|exclusividade|rei-mida|acumulador|museu|sapateiro|guarda-roupa|tecnologo/.test(t.id)), { delta: (await coins(ctx)) - c0, ledger: ledNew.map((t) => t.id) });
  // D5 — progresso parcial: depois da flag, uma aquisição nova que completa uma conquista paga normalmente.
  const before5 = await coins(ctx);
  await buy(ctx, byRarity(ctx, 'mitico'), { operationId: 'd5' });
  const afterBuy5 = await coins(ctx);
  await day(ctx);
  const mito = await pa(ctx, MITO);
  check('D5: após a reconciliação, aquisição nova que completa "Mito Vivo" paga normalmente (10.000), uma vez', mito?.reward_delivered === true && mito.reward_coins === 10000 && (await coins(ctx)) - afterBuy5 >= 10000, { mito: mito && mito.reward_coins, before5 });
  // D7 — save anterior à Fase 12 (achievements_v2_reconciled ausente) continua 100% silencioso.
  await ctx.rt.close();
  const ctx2 = await prepare('legacy-v2');
  await ctx2.E.PlayerProfile.update(ctx2.profile.id, { achievements_v2_reconciled: false, [FLAG]: false });
  await buy(ctx2, byRarity(ctx2, 'lendario'), { operationId: 'd7' });
  const c7 = await coins(ctx2);
  await day(ctx2);
  const m7 = await pa(ctx2, MIDAS);
  check('D7: save anterior à Fase 12 segue a reconciliação antiga — tudo registrado sem recompensa', m7?.reconciled === true && m7.reward_delivered === false && (await coins(ctx2)) === c7, { m7: m7 && m7.reward_delivered });
  await ctx2.rt.close();
}

// ═══ G — liberação: padrão ligado (aprovado na R1) e desligamento ══════════
{
  release(undefined);
  const ctx = await prepare('gate');
  check('G0: padrão do código = recompensas de coleção LIBERADAS (aprovado na LOCAL-9C.2-B-R1)', ctx.engine.collectionRewardsReleased() === true && ctx.engine.COLLECTION_REWARDS_RELEASED === true);
  // G1/G2: `false` continua funcionando como desligamento seguro.
  release(false);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { [FLAG]: false });
  const bought = await buy(ctx, byRarity(ctx, 'lendario'), { operationId: 'g1' });
  const c1 = await coins(ctx);
  const prog = await progressOf(ctx, MIDAS);
  await day(ctx);
  const p = await P(ctx);
  report.cases.G1 = { bought: bought.code, progress: { value: prog.value, percent: prog.percent, unlocked: prog.unlocked }, registered: Boolean(await pa(ctx, MIDAS)), coinsDelta: (await coins(ctx)) - c1, flag: p[FLAG] };
  check('G1: com a liberação desligada o progresso aparece correto (1/1, 100%), mas nada é registrado nem pago, e a flag de saves antigos não é gravada', bought.ok && prog.value === 1 && prog.percent === 100 && !report.cases.G1.registered && p[FLAG] === false && !(await rewardLedger(ctx)).some((t) => t.id.includes(MIDAS)), report.cases.G1);
  release(true);
  await day(ctx);
  const m = await pa(ctx, MIDAS);
  check('G2: ao liberar, save sem flag reconcilia o que já possui (sem pagamento) — política de saves antigos vale no dia da liberação', m?.reconciled === true && m.reward_delivered === false && (await P(ctx))[FLAG] === true, { m: m && [m.reconciled, m.reward_delivered] });
  release(undefined);
  await ctx.rt.close();
}

const failed = report.checks.filter((c) => !c.ok);
report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'tests.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`\n${report.summary.passed}/${report.summary.total} PASS`);
process.exit(failed.length ? 1 : 0);
