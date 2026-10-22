// LOCAL-9C.2-A-R1 — compatibilidade do localGame.batch, recusa sem gravação
// física e concorrência financeira da Loja.
//
// Módulos REAIS do jogo (Vite SSR) sobre carreiras em MEMÓRIA
// (scripts/lib/v526bTestKit.mjs): nenhum save real é lido ou gravado.
//
//   B1-B8  batch: lista (ordem, formato, erro, idempotência), planejador
//          (recusa sem gravação, aceite com 1 gravação, dentro de transação)
//   C1-C7  concorrência: compra+compra, compra+venda, compra+luvas,
//          venda+luvas, venda+venda, última unidade + outra compra,
//          falha de persistência concorrente
//   E1     sonda do risco externo: investimento com saldo absoluto
//
// Uso: TZ=UTC node scripts/test-local-9c2a-r1-batch-concurrency.mjs [--out=<dir>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const { bootCareer } = await import('./lib/v526bTestKit.mjs');

const OUT_DIR = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6) || 'reports/local-9c2-a-shop-transaction-integrity';
let quietDepth = 0; let saved = null;
const quiet = async (fn) => { if (process.env.PL9C2A_VERBOSE) return fn(); if (quietDepth++ === 0) { saved = [console.warn, console.log, console.debug, console.error, console.info]; console.warn = console.log = console.debug = console.error = console.info = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error, console.info] = saved; } };
const report = { generatedBy: 'LOCAL-9C.2-A-R1 batch compatibility and financial concurrency', checks: [], cases: {} };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail != null && !ok ? ` · ${JSON.stringify(detail).slice(0, 500)}` : ''}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function prepare(seed, patch = {}) {
  const booted = await quiet(() => bootCareer(`9c2a-r1-${seed}`));
  const ctx = { ...booted, E: booted.rt.localGame.entities, load: (p) => booted.rt.load(p) };
  ctx.T = await ctx.load('/src/game-core/shopTransactions.js');
  ctx.S = await ctx.load('/src/lib/sponsors.js');
  ctx.eco = await ctx.load('/src/lib/sportsEconomyV26.js');
  ctx.economy = await ctx.load('/src/lib/economy.js');
  ctx.RepoMod = await ctx.load('/src/gameplay/repositories/CareerEntityRepository.js');
  const store = await ctx.load('/src/lib/storeCatalog.js');
  const market = await ctx.load('/src/lib/marketEngine.js');
  await quiet(async () => { await market.seedMarket(ctx.profile.career_date); await store.ensureExpandedShopCatalog(); });
  ctx.profile = await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 100_000, career_level: 50, ranking_position: 5, reputation: 95, tournaments_played: 10, ...patch });
  ctx.items = ((await ctx.E.ShopItem.list('catalog_order', 2000)) || []).map(store.normalizeShopItem);
  // Contador de gravações físicas do save (CareerManager.saveCareer).
  const cm = ctx.rt.careerManager; const original = cm.saveCareer.bind(cm);
  ctx.saves = 0; ctx.failNextSave = false;
  cm.saveCareer = async (...args) => {
    if (ctx.failNextSave && String(args[2]?.caller || '').includes(ctx.failNextSave)) { ctx.failNextSave = false; throw new Error('falha injetada na persistência'); }
    ctx.saves += 1; return original(...args);
  };
  return ctx;
}
const P = (ctx) => ctx.E.PlayerProfile.get(ctx.profile.id);
const coins = async (ctx) => Number((await P(ctx)).coins) || 0;
const inv = async (ctx) => (await ctx.E.PlayerInventory.filter({ profile_id: ctx.profile.id })) || [];
const shopLedger = async (ctx) => ((await ctx.E.FinancialTransaction.filter({ profile_id: ctx.profile.id })) || []).filter((t) => t.category === 'loja');
const snap = async (ctx) => ({
  coins: await coins(ctx),
  inv: (await inv(ctx)).map((r) => `${r.id}:${r.item_id}`).sort(),
  ledger: (await shopLedger(ctx)).map((t) => `${t.id}:${t.type}:${t.amount}`).sort(),
  stock: ((await ctx.E.MarketPriceHistory.filter({ is_limited_stock: true })) || []).map((h) => `${h.item_id}:${h.stock_remaining}`).sort(),
});
const buy = (ctx, itemId, o) => quiet(() => ctx.T.purchaseShopItem(ctx.profile.id, itemId, o));
const sell = (ctx, id) => quiet(() => ctx.T.sellInventoryItem(ctx.profile.id, id));
const commons = (ctx, n, skip = 0) => ctx.items.filter((i) => i.rarity === 'comum' && i.catalog_order != null).slice(skip, skip + n);
const attempt = async (fn) => { try { return { ok: true, value: await quiet(fn) }; } catch (e) { return { ok: false, error: e.message }; } };
const bronze = (ctx, p) => ctx.S.SPONSOR_CATALOG.filter((s) => s.tier === 'Bronze' && ctx.S.canSign(s, p).ok);
const bonusOf = async (ctx, sponsorId) => ((await ctx.E.PlayerContract.filter({ profile_id: ctx.profile.id, sponsor_id: sponsorId })) || [])[0]?.sign_bonus || 0;

// ═══ localGame.batch ═══════════════════════════════════════════════════════
{
  const ctx = await prepare('batch');
  const batch = ctx.rt.localGame.batch;
  // B1/B2 — lista: ordem preservada, formato do resultado.
  const c0 = await coins(ctx);
  const r = await quiet(() => batch([
    { type: 'create', entityName: 'CareerMessage', id: 'b1-x', data: { profile_id: ctx.profile.id, title: 'a', step: 1 } },
    { type: 'update', entityName: 'CareerMessage', id: 'b1-x', data: { step: 2 } },
    { type: 'playerIncrement', id: ctx.profile.id, data: { coins: 7 } },
    { type: 'upsert', entityName: 'CareerMessage', id: 'b1-y', data: { profile_id: ctx.profile.id, title: 'b' } },
    { type: 'delete', entityName: 'CareerMessage', id: 'b1-y' },
  ]));
  const x = await ctx.E.CareerMessage.get('b1-x');
  const y = ((await ctx.E.CareerMessage.filter({ profile_id: ctx.profile.id })) || []).find((m) => m.id === 'b1-y');
  report.cases.B1 = { keys: Object.keys(r).sort(), records: r.records.map((x) => x.id), step: x.step, yDeleted: !y, coins: (await coins(ctx)) - c0 };
  check('B1: lista aplicada na ordem (create→update→incremento→upsert→delete) numa gravação', x.step === 2 && !y && report.cases.B1.coins === 7 && same(r.records.map((q) => q.id), ['b1-x', 'b1-x', ctx.profile.id, 'b1-y', 'b1-y']), report.cases.B1);
  check('B2: formato do resultado da lista preservado (records, player, skipped=false, writes=1; outcome=null é aditivo)', r.skipped === false && r.writes === 1 && r.player?.id === ctx.profile.id && Array.isArray(r.records) && r.outcome === null && r.rejected === undefined, report.cases.B1);
  // B3 — erro no meio da lista: nada aplicado, erro propagado.
  const s3 = await snap(ctx);
  const e3 = await attempt(() => batch([
    { type: 'playerIncrement', id: ctx.profile.id, data: { coins: 1000 } },
    { type: 'create', entityName: 'PlayerInventory', id: 'b3-row', data: { profile_id: ctx.profile.id, item_id: 'x' } },
    { type: 'update', entityName: 'PlayerInventory', id: 'nao-existe', data: {} },
  ]));
  check('B3: erro no meio da lista propaga e não aplica nada (sem crédito, sem linha)', !e3.ok && /não encontrado/.test(e3.error) && same(s3, await snap(ctx)), e3);
  // B4 — idempotencyKey: segunda execução pulada.
  const b4a = await quiet(() => batch([{ type: 'playerIncrement', id: ctx.profile.id, data: { coins: 11 } }], { idempotencyKey: 'r1-b4' }));
  const c4 = await coins(ctx); const saves4 = ctx.saves;
  const b4b = await quiet(() => batch([{ type: 'playerIncrement', id: ctx.profile.id, data: { coins: 11 } }], { idempotencyKey: 'r1-b4' }));
  check('B4: idempotencyKey preservada (2ª execução skipped, sem crédito, sem gravação)', !b4a.skipped && b4b.skipped && (await coins(ctx)) === c4 && ctx.saves === saves4, { b4a: b4a.skipped, b4b: b4b.skipped });
  // B5 — planejador recusado: nenhuma mutação e nenhuma gravação física.
  const grip = ctx.items.find((i) => i.name === 'Tour Grip Dry Start');
  await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 1 });
  const s5 = await snap(ctx); const saves5 = ctx.saves; const writes5 = ctx.RepoMod.careerWriteStats.count;
  const rejections = [await buy(ctx, grip.id), await buy(ctx, 'nao-existe'), await sell(ctx, 'nao-existe')];
  report.cases.B5 = { codes: rejections.map((x) => x.code), physicalSaves: ctx.saves - saves5, logicalWrites: ctx.RepoMod.careerWriteStats.count - writes5 };
  check('B5: recusas (saldo, item inexistente, venda inexistente) → nenhuma mutação e NENHUMA gravação do save', same(report.cases.B5.codes, ['insufficient-funds', 'item-not-found', 'item-not-found']) && same(s5, await snap(ctx)) && report.cases.B5.physicalSaves === 0 && report.cases.B5.logicalWrites === 0, report.cases.B5);
  check('B5: a recusa devolve o perfil atual (a tela atualiza o saldo)', rejections[0].profile?.coins === 1, rejections[0].profile?.coins);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 100_000 });
  // B6 — planejador aceito: exatamente 1 gravação física.
  const saves6 = ctx.saves;
  const ok6 = await buy(ctx, grip.id, { operationId: 'b6' });
  check('B6: compra aceita = exatamente 1 gravação do save', ok6.ok && ctx.saves - saves6 === 1, { saves: ctx.saves - saves6 });
  // B6b — duplicada detectada na leitura: sem gravação.
  const saves6b = ctx.saves;
  const dup = await buy(ctx, grip.id, { operationId: 'b6' });
  check('B6b: operação repetida → duplicate sem gravação', dup.code === 'duplicate' && ctx.saves === saves6b, { code: dup.code, saves: ctx.saves - saves6b });
  // B7 — dentro de uma transação de persistência (como o avanço de dia):
  // recusa não invalida a transação; aceite é confirmado no commit.
  const gr = (await ctx.load('/src/gameplay/services/runtime.js')).gameRepository;
  const bag = ctx.items.find((i) => i.category === 'mochila' && i.rarity === 'comum' && i.catalog_order != null);
  const c7 = await coins(ctx);
  const t7 = await attempt(() => gr.withPersistenceTransaction('r1-b7', async () => {
    const refused = await ctx.T.purchaseShopItem(ctx.profile.id, grip.id, { operationId: 'b7-dup' }); // já possuído
    const bought = await ctx.T.purchaseShopItem(ctx.profile.id, bag.id, { operationId: 'b7' });
    await ctx.E.CareerMessage.create({ id: 'b7-after', profile_id: ctx.profile.id, title: 'depois da recusa' });
    return { refused: refused.code, bought: bought.ok, price: bought.price };
  }));
  const msg7 = ((await ctx.E.CareerMessage.filter({ profile_id: ctx.profile.id })) || []).some((m) => m.id === 'b7-after');
  report.cases.B7 = { tx: t7, msgCommitted: msg7, debit: c7 - await coins(ctx) };
  check('B7: dentro de withPersistenceTransaction a recusa não aborta a transação; a compra e as gravações seguintes são confirmadas', t7.ok && t7.value.refused === 'already-owned' && t7.value.bought && msg7 && report.cases.B7.debit === t7.value.price, report.cases.B7);
  // B8 — patrocínio (lista + idempotencyKey) intacto ao lado do planejador.
  const sp = bronze(ctx, await P(ctx))[0];
  const c8 = await coins(ctx);
  const [sg1, sg2] = await Promise.all([attempt(async () => ctx.S.signSponsorContract(await P(ctx), sp)), attempt(async () => ctx.S.signSponsorContract(await P(ctx), sp))]);
  const contracts8 = ((await ctx.E.PlayerContract.filter({ profile_id: ctx.profile.id, sponsor_id: sp.id })) || []).length;
  const bonus8 = await bonusOf(ctx, sp.id);
  check('B8: assinatura de patrocínio concorrente continua idempotente (1 contrato, 1 pagamento de luvas)', [sg1, sg2].filter((q) => q.ok).length === 1 && contracts8 === 1 && (await coins(ctx)) - c8 === bonus8, { sg1: sg1.ok || sg1.error, sg2: sg2.ok || sg2.error, contracts8, bonus8 });
  await ctx.rt.close();
}

// ═══ Concorrência financeira ═══════════════════════════════════════════════
{
  const ctx = await prepare('concurrency', { xp: 0 });
  const [a, b, c, d, e, f, g] = commons(ctx, 7);
  const owned = {};
  for (const it of [c, d, e, f]) owned[it.id] = (await buy(ctx, it.id, { operationId: `own-${it.id}` })).inventoryItem;
  const resale = async (row) => ctx.T.computeResalePrice(await ctx.E.ShopItem.get(row.item_id));

  // C1 — duas compras simultâneas de itens diferentes, saldo suficiente.
  let s = await snap(ctx);
  const [r1a, r1b] = await Promise.all([buy(ctx, a.id, { operationId: 'c1a' }), buy(ctx, b.id, { operationId: 'c1b' })]);
  let t = await snap(ctx);
  report.cases.C1 = { results: [r1a.code, r1b.code], prices: [r1a.price, r1b.price], coins: [s.coins, t.coins], rows: t.inv.length - s.inv.length, ledger: t.ledger.length - s.ledger.length };
  check('C1: duas compras simultâneas → saldo = início − p1 − p2; 2 unidades; 2 linhas de extrato', r1a.ok && r1b.ok && t.coins === s.coins - r1a.price - r1b.price && report.cases.C1.rows === 2 && report.cases.C1.ledger === 2, report.cases.C1);

  // C2 — compra e venda simultâneas.
  s = await snap(ctx);
  const v2 = await resale(owned[c.id]);
  const [r2b, r2s] = await Promise.all([buy(ctx, g.id, { operationId: 'c2' }), sell(ctx, owned[c.id].id)]);
  t = await snap(ctx);
  report.cases.C2 = { buy: r2b.code, sell: r2s.code, price: r2b.price, resale: v2, coins: [s.coins, t.coins], rows: t.inv.length - s.inv.length, ledger: t.ledger.length - s.ledger.length };
  check('C2: compra e venda simultâneas → saldo = início − preço + revenda; inventário +1 −1; 2 linhas', r2b.ok && r2s.ok && r2s.amount === v2 && t.coins === s.coins - r2b.price + v2 && report.cases.C2.rows === 0 && report.cases.C2.ledger === 2, report.cases.C2);

  // C3 — compra e luvas de patrocínio simultâneas.
  const [sp1, sp2] = bronze(ctx, await P(ctx));
  const h = ctx.items.find((i) => i.category === 'acessorio' && i.rarity === 'comum' && i.catalog_order != null && !Object.keys(owned).includes(i.id));
  s = await snap(ctx);
  const [r3b, r3s] = await Promise.all([buy(ctx, h.id, { operationId: 'c3' }), attempt(async () => ctx.S.signSponsorContract(await P(ctx), sp1))]);
  t = await snap(ctx);
  const bonus3 = await bonusOf(ctx, sp1.id);
  report.cases.C3 = { buy: r3b.code, sign: r3s.ok || r3s.error, price: r3b.price, bonus: bonus3, coins: [s.coins, t.coins] };
  check('C3: compra e luvas simultâneas → saldo = início − preço + luvas (nenhum valor sobrescrito)', r3b.ok && r3s.ok && bonus3 > 0 && t.coins === s.coins - r3b.price + bonus3, report.cases.C3);

  // C4 — venda e luvas simultâneas.
  s = await snap(ctx);
  const v4 = await resale(owned[d.id]);
  const [r4s, r4g] = await Promise.all([sell(ctx, owned[d.id].id), attempt(async () => ctx.S.signSponsorContract(await P(ctx), sp2))]);
  t = await snap(ctx);
  const bonus4 = await bonusOf(ctx, sp2.id);
  report.cases.C4 = { sell: r4s.code, sign: r4g.ok || r4g.error, resale: v4, bonus: bonus4, coins: [s.coins, t.coins] };
  check('C4: venda e luvas simultâneas → saldo = início + revenda + luvas', r4s.ok && r4g.ok && bonus4 > 0 && t.coins === s.coins + v4 + bonus4, report.cases.C4);

  // C5 — duas vendas simultâneas (unidades distintas) + repetição concorrente da mesma.
  s = await snap(ctx);
  const ve = await resale(owned[e.id]); const vf = await resale(owned[f.id]);
  const r5 = await Promise.all([sell(ctx, owned[e.id].id), sell(ctx, owned[f.id].id), sell(ctx, owned[e.id].id)]);
  t = await snap(ctx);
  report.cases.C5 = { results: r5.map((q) => q.code), coins: [s.coins, t.coins], expected: s.coins + ve + vf, rows: t.inv.length - s.inv.length, ledger: t.ledger.length - s.ledger.length };
  check('C5: duas vendas simultâneas (+ repetição da 1ª) → 2 créditos, 2 remoções, 2 linhas; a repetição é duplicate', r5.filter((q) => q.ok).length === 2 && r5[2].code === 'duplicate' && t.coins === s.coins + ve + vf && report.cases.C5.rows === -2 && report.cases.C5.ledger === 2, report.cases.C5);

  // C6 — última unidade de relíquia + outra compra, simultâneas.
  await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 5_000_000, xp: 50_000_000 });
  const months = Array.from({ length: 36 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-15`);
  const relic = ctx.items.find((i) => String(i.id).startsWith('historical-relic-') && months.some((m) => ctx.eco.getEquipmentMarketState(i, { career_date: m }).available));
  const month = months.find((m) => ctx.eco.getEquipmentMarketState(relic, { career_date: m }).available);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { career_date: month });
  const hist = ((await ctx.E.MarketPriceHistory.filter({ item_id: relic.id })) || [])[0];
  await ctx.E.MarketPriceHistory.update(hist.id, { stock_remaining: 1 });
  const other = ctx.items.find((i) => i.category === 'roupa' && i.rarity === 'comum' && i.catalog_order != null);
  s = await snap(ctx);
  const r6 = await Promise.all([buy(ctx, relic.id, { operationId: 'c6a' }), buy(ctx, relic.id, { operationId: 'c6b' }), buy(ctx, other.id, { operationId: 'c6c' })]);
  t = await snap(ctx);
  const stock6 = ((await ctx.E.MarketPriceHistory.filter({ item_id: relic.id })) || [])[0].stock_remaining;
  const paid6 = r6.filter((q) => q.ok).reduce((sum, q) => sum + q.price, 0);
  report.cases.C6 = { relic: relic.name, results: r6.map((q) => q.code), stock: stock6, coins: [s.coins, t.coins], paid: paid6, rows: t.inv.length - s.inv.length };
  check('C6: última unidade disputada + outra compra → relíquia vendida 1×, estoque 0, outra compra concluída, saldo = início − Σ pagos', r6.filter((q) => q.ok).length === 2 && r6[2].ok && stock6 === 0 && t.coins === s.coins - paid6 && report.cases.C6.rows === 2, report.cases.C6);

  // C7 — falha de persistência em uma operação concorrente com outra.
  const sellRow = (await inv(ctx)).find((r) => r.item_id === a.id);
  const target = ctx.items.find((i) => i.category === 'tenis' && i.rarity === 'comum' && i.catalog_order != null);
  s = await snap(ctx);
  const v7 = await resale(sellRow);
  ctx.failNextSave = 'purchaseShopItem'; // só a gravação da compra falha
  const [f7b, f7s] = await Promise.all([attempt(() => ctx.T.purchaseShopItem(ctx.profile.id, target.id, { operationId: 'c7' })), sell(ctx, sellRow.id)]);
  t = await snap(ctx);
  const retry7 = await buy(ctx, target.id, { operationId: 'c7' });
  const u = await snap(ctx);
  report.cases.C7 = { purchase: f7b.ok ? f7b.value.code : f7b.error, sale: f7s.code, coins: [s.coins, t.coins, u.coins], resale: v7, retry: retry7.code };
  check('C7: compra com falha de persistência não aplica nada; a venda concorrente conclui inteira; o retry da compra conclui 1×', !f7b.ok && f7s.ok && t.coins === s.coins + v7 && !t.inv.some((x) => x.endsWith(`:${target.id}`)) && retry7.ok && u.coins === t.coins - retry7.price && u.ledger.length === t.ledger.length + 1, report.cases.C7);
  await ctx.rt.close();
}

// ═══ E1 — risco externo: fluxo com saldo absoluto (investimento) ═══════════
{
  const ctx = await prepare('external');
  const stale = await P(ctx); // perfil carregado pela tela de Finanças
  const product = ctx.economy.INVESTMENTS.find((i) => i.min_amount <= 1000);
  const item = commons(ctx, 1)[0];
  const bought = await buy(ctx, item.id, { operationId: 'e1' }); // compra gravada entre a leitura e a escrita do investimento
  await quiet(() => ctx.economy.makeInvestment(stale, product, Math.max(product.min_amount, 1000)));
  const final = await coins(ctx);
  const expected = stale.coins - bought.price - Math.max(product.min_amount, 1000);
  report.cases.E1 = { product: product.id, stale: stale.coins, purchase: bought.price, final, expected, lostDebit: final - expected, itemDelivered: (await inv(ctx)).some((r) => r.item_id === item.id) };
  check('E1 (risco residual, fora do escopo): investimento a partir de perfil desatualizado sobrescreve o débito de uma compra gravada no intervalo', report.cases.E1.lostDebit === bought.price && report.cases.E1.itemDelivered, report.cases.E1);
  await ctx.rt.close();
}

const failed = report.checks.filter((c) => !c.ok);
report.summary = { total: report.checks.length, passed: report.checks.length - failed.length, failed: failed.length };
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'r1-batch-concurrency.json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`\n${report.summary.passed}/${report.summary.total} PASS`);
process.exit(failed.length ? 1 : 0);
