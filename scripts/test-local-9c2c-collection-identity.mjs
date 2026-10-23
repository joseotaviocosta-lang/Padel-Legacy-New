// LOCAL-9C.2-C — identidade estavel de colecao + metas alcancaveis.
//
// Modulos REAIS do jogo (Vite SSR) sobre carreiras em MEMORIA
// (scripts/lib/v526bTestKit.mjs): nenhum save real e lido ou gravado.
// Compras e vendas pela operacao canonica da 9C.2-A; avaliacao pelo caminho
// real do fechamento do dia (achievementLifecycle.processAchievementsDay).
//
//   U identidade pura · A censo de alcancabilidade · B colecao (posse atual)
//   C metas · D economia · E saves legados · F kill switch · G determinismo
//   H I40 (inalterado)
//
// Uso: TZ=UTC node scripts/test-local-9c2c-collection-identity.mjs [--out=<dir>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const { bootCareer, reloadCareer } = await import('./lib/v526bTestKit.mjs');

const OUT_DIR = (process.argv.find((a) => a.startsWith('--out=')) || '').slice(6) || 'reports/local-9c2-c-collection-identity';
let quietDepth = 0; let saved = null;
const quiet = async (fn) => { if (process.env.PL9C2C_VERBOSE) return fn(); if (quietDepth++ === 0) { saved = [console.warn, console.log, console.debug, console.error, console.info]; console.warn = console.log = console.debug = console.error = console.info = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error, console.info] = saved; } };
const report = { generatedBy: 'LOCAL-9C.2-C stable collection identity and reachable goals', checks: [], cases: {} };
const check = (name, ok, detail = null) => { report.checks.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail != null && !ok ? ` · ${JSON.stringify(detail).slice(0, 600)}` : ''}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const MONTHS = Array.from({ length: 120 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-15`);
const ARSENAL = 'achv-arsenal-completo';
const SAPATEIRO = 'achv-sapateiro';
const GUARDA_ROUPA = 'achv-guarda-roupa';

async function prepare(seed, patch = {}) {
  const booted = await quiet(() => bootCareer(`9c2c-${seed}`));
  const ctx = { ...booted, E: booted.rt.localGame.entities };
  await bind(ctx);
  await quiet(async () => { await ctx.market.seedMarket(ctx.profile.career_date); await ctx.store.ensureExpandedShopCatalog(); });
  ctx.profile = await ctx.E.PlayerProfile.update(ctx.profile.id, { coins: 50_000_000, career_level: 50, ranking_position: 1, reputation: 99, tournaments_played: 10, ...patch });
  ctx.items = ((await ctx.E.ShopItem.list('catalog_order', 5000)) || []).map((r) => ctx.store.normalizeShopItem(r));
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
  ctx.CI = await L('/src/lib/collectionIdentity.js');
  ctx.AD = await L('/src/lib/achievementsData.js');
}
async function reload(ctx) {
  ctx.rt = await quiet(() => reloadCareer(ctx.rt, ctx.storage, ctx.careerId));
  ctx.E = ctx.rt.localGame.entities;
  await bind(ctx);
}
const P = (ctx) => ctx.E.PlayerProfile.get(ctx.profile.id);
const inv = async (ctx) => (await ctx.E.PlayerInventory.filter({ profile_id: ctx.profile.id })) || [];
const stats = async (ctx) => (await quiet(async () => ctx.AC.buildAchievementContext(await P(ctx)))).inventory;
const progressOf = async (ctx, id) => {
  const p = await P(ctx);
  const c = await quiet(() => ctx.AC.buildAchievementContext(p));
  return ctx.engine.evaluateAchievements(p, c).find((r) => r.achievement.id === id);
};
const pa = async (ctx, id) => ((await ctx.E.PlayerAchievement.filter({ profile_id: ctx.profile.id })) || []).find((r) => r.achievement_id === id) || null;
const rewardTx = async (ctx) => ((await ctx.E.FinancialTransaction.filter({ profile_id: ctx.profile.id })) || []).filter((t) => t.category === 'conquista');
const day = (ctx) => quiet(async () => ctx.life.processAchievementsDay(await P(ctx)));
const byName = (ctx, name) => ctx.items.find((i) => i.name === name);
async function buy(ctx, item, opts = {}) {
  const month = MONTHS.find((d) => ctx.eco.getEquipmentMarketState(item, { career_date: d }).available);
  await ctx.E.PlayerProfile.update(ctx.profile.id, { career_date: month });
  return quiet(() => ctx.T.purchaseShopItem(ctx.profile.id, item.id, opts));
}

// U — identidade pura
{
  const ctx = await prepare('identity');
  const { CI } = ctx;
  const row = (over = {}) => ({ id: 'inv-x', profile_id: ctx.profile.id, item_id: 'shop-1', item_name: 'Nox Equation', category: 'raquete', ...over });
  const shop = (over = {}) => ({ id: 'shop-1', name: 'Nox Equation', category: 'raquete', rarity: 'incomum', catalog_order: 12, ...over });

  const a = CI.resolveCollectionId(row(), shop());
  const b = CI.resolveCollectionId(row(), shop());
  check('U1: identidade estavel e deterministica', typeof a === 'string' && a === b, { a });
  report.cases.U1 = { identity: a };

  check('U2: nome exibido nao e identidade (chave normalizada, sem hash)', CI.cleanCollectionKey('  Nox EQUATION ') === 'nox equation', null);

  const relic = { id: 'historical-relic-1992-colecionavel', name: 'Trofeu Primeiro Mundial (1992)', category: 'colecionavel', rarity: 'exclusivo', release_year: 1992 };
  const relicRenamed = { ...relic, name: 'Trofeu Primeiro Mundial - Edicao Historica', description: 'outra descricao', history: 'outra historia', price: 1 };
  const rid1 = CI.resolveCollectionId({ item_id: relic.id, item_name: relic.name }, relic);
  const rid2 = CI.resolveCollectionId({ item_id: relic.id, item_name: relicRenamed.name }, relicRenamed);
  check('U3: reliquia renomeada mantem a identidade (estrutural, sem alias)', rid1 === rid2 && rid1 === 'relic:1992:colecionavel', { rid1, rid2 });
  report.cases.U3 = { relicId: rid1 };

  const withAlias = { aliases: { 'old grip x': 'tour grip dry start' } };
  const oid = CI.resolveCollectionId({ item_id: 'legacy-1', item_name: 'Old Grip X' }, null, withAlias);
  const nid = CI.resolveCollectionId({ item_id: 'shop-9', item_name: 'Tour Grip Dry Start' }, shop({ id: 'shop-9', name: 'Tour Grip Dry Start', category: 'grip' }), withAlias);
  check('U4: old ID + new ID com alias = 1 produto', oid !== null && oid === nid, { oid, nid });
  const v1 = CI.resolveCollectionId({ item_id: 'l1', item_name: 'Zap A v1' }, null, { aliases: { 'zap a v1': 'zap a', 'zap a v2': 'zap a' } });
  const v2 = CI.resolveCollectionId({ item_id: 'l2', item_name: 'Zap A v2' }, null, { aliases: { 'zap a v1': 'zap a', 'zap a v2': 'zap a' } });
  const v3 = CI.resolveCollectionId({ item_id: 'c3', item_name: 'Zap A' }, { id: 'c3', name: 'Zap A', category: 'bola', catalog_order: 99 }, { aliases: { 'zap a v1': 'zap a', 'zap a v2': 'zap a' } });
  check('U5: A-v1/A-v2/A-v3 = 1 produto', v1 === v2 && v2 === v3, { v1, v2, v3 });

  const d1 = CI.resolveCollectionId({ item_id: 'x1', item_name: 'Shoe A' }, { id: 'x1', name: 'Shoe A', category: 'tenis', catalog_order: 1 });
  const d2 = CI.resolveCollectionId({ item_id: 'x2', item_name: 'Shoe B' }, { id: 'x2', name: 'Shoe B', category: 'tenis', catalog_order: 2 });
  check('U6: produtos genuinamente distintos nunca colapsam', d1 !== null && d2 !== null && d1 !== d2, { d1, d2 });
  check('U7: sem nome e sem item = null (fail conservador)', CI.resolveCollectionId({ item_id: 'x' }, null) === null, null);

  check('U8: reliquia excluida do Arsenal; normal e colecionavel incluidos',
    !CI.isArsenalEligible('relic:1992:colecionavel') && CI.isArsenalEligible('catalog:nox-equation') && CI.isArsenalEligible('catalog:medalha circuito local'), null);

  const starterRow = (await inv(ctx)).find((r) => r.id === 'inventory-001');
  const starterShop = starterRow ? ctx.items.find((i) => i.id === starterRow.item_id) || null : null;
  const starterId = starterRow ? CI.resolveCollectionId(starterRow, starterShop) : null;
  check('U9: kit inicial tem identidade valida e conta como 1 produto', starterRow && starterId !== null && CI.isArsenalEligible(starterId), { starterId, starterItemId: starterRow?.item_id });
  report.cases.U9 = { starterId, starterItemId: starterRow?.item_id };
}

// A — censo de alcancabilidade
{
  const ctx = await prepare('census');
  const { CI } = ctx;
  const seen = new Map();
  for (const item of ctx.items) {
    const cid = CI.resolveCollectionId({ item_id: item.id, item_name: item.name, category: item.category }, item);
    if (cid && !seen.has(cid)) seen.set(cid, item);
  }
  const eligible = [...seen.entries()].filter(([id]) => CI.isArsenalEligible(id));
  const shoes = [...seen.values()].filter((i) => i.category === 'tenis');
  const apparel = [...seen.values()].filter((i) => i.category === 'roupa');
  const relics = [...seen.keys()].filter((id) => CI.isRelicCollectionId(id));
  report.cases.A_census = { total: seen.size, eligible: eligible.length, shoes: shoes.length, apparel: apparel.length, relics: relics.length };
  check('A1: catalogo proprio tem 125 identidades distintas', seen.size === 125, { total: seen.size });
  check('A2: reliquias = 10 (modelo canonico)', relics.length === 10, { relics: relics.length });
  check('A3: elegiveis Arsenal = 115 = meta', eligible.length === 115, { eligible: eligible.length });
  check('A4: tenis = 9 = meta Sapateiro', shoes.length === 9, { shoes: shoes.map((i) => i.name) });
  check('A5: vestuario = 8 = meta Guarda-Roupa', apparel.length === 8, { apparel: apparel.map((i) => i.name) });

  const seedIds = new Set(['shop-001', 'shop-002', 'shop-003', 'shop-004']);
  const profile = await P(ctx);
  const blocked = [];
  for (const [, item] of eligible) {
    if (seedIds.has(item.id)) continue;
    const access = ctx.store.getShopItemAccess(profile, item);
    if (!access || access.unlocked !== true) blocked.push(item.name);
  }
  check('A6: 115 elegiveis alcancaveis (seed ou Loja no teto)', blocked.length === 0, { blocked: blocked.slice(0, 5) });
}

// B — comportamento de colecao (posse atual)
{
  const ctx = await prepare('collection');
  const s0 = await stats(ctx);
  check('B1: kit inicial conta exatamente 1 na carreira nova', s0.totalOwned === 1 && s0.equipmentOwned === 1, { totalOwned: s0.totalOwned, equipmentOwned: s0.equipmentOwned });

  const grip = (await inv(ctx)).find((r) => r.id === 'inventory-001');
  const sold = await quiet(() => ctx.T.sellInventoryItem(ctx.profile.id, grip.id));
  const s2 = await stats(ctx);
  check('B2: vender o starter reduz em exatamente 1', sold.ok && s2.totalOwned === 0 && s2.equipmentOwned === 0, { totalOwned: s2.totalOwned });

  const shopGrip = byName(ctx, 'Grip Performance');
  const rebuy = shopGrip ? await buy(ctx, shopGrip, { operationId: 'b3' }) : { ok: false };
  const s3 = await stats(ctx);
  check('B3: recompra do vendido volta a 1, sem duplicar', rebuy.ok && s3.totalOwned === 1 && s3.equipmentOwned === 1, { totalOwned: s3.totalOwned, ok: rebuy.ok });

  const relic = ctx.items.find((i) => String(i.id).startsWith('historical-relic-'));
  const rb = relic ? await buy(ctx, relic, { operationId: 'b4' }) : { ok: false };
  const s4 = await stats(ctx);
  check('B4: reliquia soma no total e fica fora do Arsenal', rb.ok && s4.totalOwned === s3.totalOwned + 1 && s4.equipmentOwned === s3.equipmentOwned, { totalOwned: s4.totalOwned, equipmentOwned: s4.equipmentOwned });

  const pin = byName(ctx, 'Medalha Circuito Local');
  const cb = pin ? await buy(ctx, pin, { operationId: 'b5' }) : { ok: false };
  const s5 = await stats(ctx);
  check('B5: colecionavel soma no total e no Arsenal', cb.ok && s5.equipmentOwned === s4.equipmentOwned + 1, { equipmentOwned: s5.equipmentOwned });

  globalThis.__PL9C2C_COLLECTION_ALIASES = undefined;
  await ctx.E.PlayerInventory.create({ id: 'inv-old-x', profile_id: ctx.profile.id, item_id: 'legacy-grip-x', item_name: 'Old Grip X', category: 'grip' });
  await ctx.E.ShopItem.create({ id: 'shop-newgrip', name: 'New Grip X', category: 'grip', rarity: 'comum', price: 100, manufacturer: 'Court Labs', is_available: true, durability: 100, attribute_bonus: {} });
  await ctx.E.PlayerInventory.create({ id: 'inv-newgrip', profile_id: ctx.profile.id, item_id: 'shop-newgrip', item_name: 'New Grip X', category: 'grip' });
  const s6 = await stats(ctx);
  check('B6: rename sem alias fratura em 2 (risco documentado)', s6.totalOwned === s5.totalOwned + 2, { totalOwned: s6.totalOwned, expected: s5.totalOwned + 2 });
  globalThis.__PL9C2C_COLLECTION_ALIASES = { 'old grip x': 'new grip x' };
  const s7 = await stats(ctx);
  check('B7: com alias explicito, old+new = 1', s7.totalOwned === s5.totalOwned + 1, { totalOwned: s7.totalOwned, expected: s5.totalOwned + 1 });

  await reload(ctx);
  const s8 = await stats(ctx);
  check('B8: save/load estavel com alias ativo', s8.totalOwned === s7.totalOwned, { before: s7.totalOwned, after: s8.totalOwned });
  globalThis.__PL9C2C_COLLECTION_ALIASES = undefined;
  const s8b = await stats(ctx);
  check('B8b: sem alias a fratura reaparece (+1)', s8b.totalOwned === s7.totalOwned + 1, { totalOwned: s8b.totalOwned });
  globalThis.__PL9C2C_COLLECTION_ALIASES = undefined;

  globalThis.__PL9C2C_COLLECTION_ALIASES = { 'old grip x': 'new grip x' };
  const shoeA = byName(ctx, 'Joma Court Basic');
  const shoeB = byName(ctx, 'Asics Clay Motion');
  const pa1 = shoeA ? await buy(ctx, shoeA, { operationId: 'b9a' }) : { ok: false };
  const pa2 = shoeB ? await buy(ctx, shoeB, { operationId: 'b9b' }) : { ok: false };
  const s9 = await stats(ctx);
  check('B9: tenis distintos contam 2, alias alheio nao interfere', pa1.ok && pa2.ok && s9.shoes === 2, { shoes: s9.shoes });
  // (alias do fixture segue ativo ate o fim do bloco B para nao re-fraturar)

  await ctx.E.PlayerInventory.create({ id: 'inv-dupe', profile_id: ctx.profile.id, item_id: shoeA.id, item_name: shoeA.name, category: 'tenis' });
  const s10 = await stats(ctx);
  check('B10: linha duplicada do mesmo item nao infla', s10.shoes === 2 && s10.totalOwned === s9.totalOwned, { shoes: s10.shoes });
  globalThis.__PL9C2C_COLLECTION_ALIASES = undefined;
}

// C — metas
{
  const ctx = await prepare('goals');
  const arsenal = ctx.AD.ACHIEVEMENT_CATALOG.find((a) => a.id === ARSENAL);
  const shoe = ctx.AD.ACHIEVEMENT_CATALOG.find((a) => a.id === SAPATEIRO);
  const apparel = ctx.AD.ACHIEVEMENT_CATALOG.find((a) => a.id === GUARDA_ROUPA);
  check('C1: Arsenal = 115 via own_equipment', arsenal && arsenal.threshold === 115 && arsenal.trigger_type === 'own_equipment', { threshold: arsenal?.threshold, trigger: arsenal?.trigger_type });
  check('C2: Sapateiro = 9 pares', shoe && shoe.threshold === 9, { threshold: shoe?.threshold });
  check('C3: Guarda-Roupa = 8 pecas', apparel && apparel.threshold === 8, { threshold: apparel?.threshold });
  check('C4: nomes e recompensas intactos', arsenal && arsenal.name === 'Arsenal Completo' && arsenal.coins_reward === 30000 && shoe.coins_reward === 1200 && apparel.coins_reward === 1200, null);
  report.cases.C_desc = { arsenal: arsenal?.description, sapateiro: shoe?.description, guardaRoupa: apparel?.description };

  const buyAll = async (names, tag) => {
    for (const [k, n] of names.entries()) {
      const item = byName(ctx, n);
      if (!item) return { ok: false, missing: n };
      const r = await buy(ctx, item, { operationId: `c-${tag}-${k}` });
      if (!r.ok) return { ok: false, at: n, code: r.code };
    }
    return { ok: true };
  };
  const shoeNames = ['Joma Court Basic', 'Asics Clay Motion', 'Mizuno Indoor Flash', 'Adidas Pro Stability', 'Babolat Jet Legend', 'Joma Elite Court', 'Asics Pro Tour Legend', 'Adidas Master Series', 'Tênis Court Pro'];
  const apparelNames = ['Joma Training Tee', 'Adidas Match Shorts', 'Bullpadel Competition Set', 'Nox Travel Team', 'Wilson Signature Tour', 'Nox Pro Competition Kit', 'Adidas Elite Tour Jacket', 'Bullpadel Champion Series'];
  const rShoes = await buyAll(shoeNames, 'sh');
  const rApp = await buyAll(apparelNames, 'ap');
  const unlocked = await day(ctx);
  const hasShoe = (await pa(ctx, SAPATEIRO)) !== null;
  const hasApp = (await pa(ctx, GUARDA_ROUPA)) !== null;
  check('C5: 9 tenis comprados -> Sapateiro desbloqueia no fechamento', rShoes.ok && hasShoe, { rShoes, unlockedCount: unlocked.unlocked });
  check('C6: 8 pecas compradas -> Guarda-Roupa desbloqueia no fechamento', rApp.ok && hasApp, { rApp });
  report.cases.C_unlock = { shoeProgress: (await progressOf(ctx, SAPATEIRO))?.value, apparelProgress: (await progressOf(ctx, GUARDA_ROUPA))?.value };
}

// D — economia (conjuntos minimos, sem exploit)
{
  const ctx = await prepare('economy');
  const items = ctx.items.filter((i) => i.is_available !== false);
  const price = (i) => i.price;
  const resaleOf = (i) => ctx.T.computeResalePrice(i);
  const cheapest = (pool, n) => [...pool].sort((a, b) => a.price - b.price).slice(0, n);
  const nonRelic = items.filter((i) => !String(i.id).startsWith('historical-relic-'));
  const shoes = items.filter((i) => i.category === 'tenis');
  const apparel = items.filter((i) => i.category === 'roupa');
  const evaluate = (label, pool, n, reward) => {
    const set = cheapest(pool, n);
    const cost = set.reduce((s, i) => s + price(i), 0);
    const resale = set.reduce((s, i) => s + resaleOf(i), 0);
    return { label, n, poolSize: pool.length, reachable: set.length >= n, cost, resale, net: cost - resale - reward, exploit: cost - resale < reward };
  };
  const rows = [
    evaluate('arsenal-115', nonRelic, 115, 30000),
    evaluate('sapateiro-9', shoes, 9, 1200),
    evaluate('guarda-roupa-8', apparel, 8, 1200),
  ];
  report.cases.D_economy = rows;
  for (const r of rows) {
    check(`D: ${r.label} alcancavel e sem exploit (custo ${r.cost}, liquido ${r.net})`, r.reachable && !r.exploit && r.net > 0, r);
  }
  const shoe = cheapest(shoes, 1)[0];
  const resaleStatic = ctx.T.computeResalePrice(shoe);
  check('D4a: revenda abaixo do preco (sem lucro mecanico)', resaleStatic < shoe.price, { price: shoe.price, resale: resaleStatic });
  await buy(ctx, shoe, { operationId: 'd4a' });
  await day(ctx);
  const rows2 = await inv(ctx);
  const mine = rows2.find((r) => r.item_id === shoe.id);
  await quiet(() => ctx.T.sellInventoryItem(ctx.profile.id, mine.id));
  const rebuy2 = await buy(ctx, shoe, { operationId: 'd4b' });
  await day(ctx);
  check('D4b: ciclo completo nao desbloqueia nem paga Sapateiro', rebuy2.ok && (await pa(ctx, 'achv-sapateiro')) === null, { ok: rebuy2.ok });
}

// E — saves legados
{
  const ctx = await prepare('legacy');
  await ctx.E.PlayerInventory.create({ id: 'inv-old-dupe', profile_id: ctx.profile.id, item_id: 'shop-003', item_name: 'Grip Performance', category: 'grip' });
  await ctx.E.PlayerInventory.create({ id: 'inv-orphan', profile_id: ctx.profile.id, item_id: 'shop-gone-1', item_name: 'Raquete Antiga X', category: 'raquete' });
  const before = await stats(ctx);
  const out = await day(ctx);
  const after = await stats(ctx);
  check('E1: duplicata antiga + orfa nao quebram nem inflam', after.totalOwned === before.totalOwned, { before: before.totalOwned, after: after.totalOwned, unlocked: out.unlocked.length });

  const ctx2 = await prepare('legacy-paid');
  const all = ctx2.items.filter((i) => !String(i.id).startsWith('historical-relic-')).slice(0, 115);
  for (const [k, item] of all.entries()) {
    await ctx2.E.PlayerInventory.create({ id: `inv-e2-${k}`, profile_id: ctx2.profile.id, item_id: item.id, item_name: item.name, category: item.category });
  }
  await ctx2.E.PlayerAchievement.create({
    id: `pa-${ARSENAL}-${ctx2.profile.id}`, profile_id: ctx2.profile.id, achievement_id: ARSENAL,
    achievement_name: 'Arsenal Completo', unlocked_date: '2026-01-15T12:00:00.000Z', career_date: '2026-01-15',
    is_new: false, progress: 115, reconciled: false, reward_delivered: true, reward_xp: 15000, reward_coins: 30000,
  });
  await ctx2.E.FinancialTransaction.create({
    id: `reward-pa-${ARSENAL}-${ctx2.profile.id}`, profile_id: ctx2.profile.id, date: '2026-01-15',
    type: 'income', category: 'conquista', source_id: `pa-${ARSENAL}-${ctx2.profile.id}`,
    description: 'Conquista: Arsenal Completo', amount: 30000,
  });
  const txBefore = (await rewardTx(ctx2)).length;
  const out2 = await day(ctx2);
  const txAfter = (await rewardTx(ctx2)).length;
  const stillThere = (await pa(ctx2, ARSENAL)) !== null;
  const arsenalTx = (await rewardTx(ctx2)).filter((t) => t.source_id === `pa-${ARSENAL}-${ctx2.profile.id}`);
  check('E2: Arsenal ja pago nunca e pago de novo', stillThere && arsenalTx.length === 1 && Number(arsenalTx[0].amount) === 30000, { txBefore, txAfter, arsenalTx: arsenalTx.length });

  const ctx3 = await prepare('legacy-keep');
  const it = byName(ctx3, 'Joma Court Basic');
  await buy(ctx3, it, { operationId: 'e3' });
  await day(ctx3);
  check('E3a: setup sem unlock de Sapateiro', (await pa(ctx3, SAPATEIRO)) === null, null);
  const rows3 = await inv(ctx3);
  for (const r of rows3.filter((x) => x.item_id !== 'shop-003')) await quiet(() => ctx3.T.sellInventoryItem(ctx3.profile.id, r.id));
  await day(ctx3);
  check('E3b: vender tudo nao cria unlock fantasma nem erro', (await pa(ctx3, SAPATEIRO)) === null, null);

  // E4: save da era R1 (flag V1 gravada, sem versao) com 9 tenis -> a primeira
  // avaliacao sob as metas novas reconcilia em silencio (sem pagar) e grava
  // a flag V2 + versao. Transicao fail-closed, mesma politica da R1.
  const ctx4 = await prepare('legacy-v2');
  const shoeNames9 = ['Joma Court Basic', 'Asics Clay Motion', 'Mizuno Indoor Flash', 'Adidas Pro Stability', 'Babolat Jet Legend', 'Joma Elite Court', 'Asics Pro Tour Legend', 'Adidas Master Series', 'Tênis Court Pro'];
  for (const [k, n] of shoeNames9.entries()) {
    const it = byName(ctx4, n);
    if (!it) { check('E4: setup tem os 9 tenis', false, { missing: n }); break; }
    await ctx4.E.PlayerInventory.create({ id: `inv-e4-${k}`, profile_id: ctx4.profile.id, item_id: it.id, item_name: it.name, category: it.category });
  }
  await ctx4.E.PlayerProfile.update(ctx4.profile.id, { collection_achievements_v1_reconciled: true, collection_achievements_v2_reconciled: false });
  try { await ctx4.E.PlayerProfile.update(ctx4.profile.id, { collection_achievements_goals_version: null }); } catch { /* campo pode nao aceitar null */ }
  const txE4Before = (await rewardTx(ctx4)).length;
  await day(ctx4);
  const paE4 = await pa(ctx4, SAPATEIRO);
  const txE4After = await rewardTx(ctx4);
  const txSapateiro = txE4After.filter((t) => String(t.source_id || '').includes('sapateiro'));
  const p4 = await P(ctx4);
  check('E4: save R1 com 9 tenis reconcilia Sapateiro em silencio (sem pagar)', paE4 !== null && paE4.reconciled === true && paE4.reward_delivered === false && txSapateiro.length === 0 && p4.collection_achievements_v2_reconciled === true && p4.collection_achievements_goals_version === 2, { reconciled: paE4 && paE4.reconciled, paid: paE4 && paE4.reward_delivered, sapateiroTx: txSapateiro.length, v2: p4.collection_achievements_v2_reconciled, version: p4.collection_achievements_goals_version });
}

// F — kill switch
{
  globalThis.__PL9C2B_COLLECTION_REWARDS = false;
  const ctx = await prepare('killswitch');
  const ownedIds = new Set((await inv(ctx)).map((r) => r.item_id));
  const cheap = ctx.items.filter((i) => !String(i.id).startsWith('historical-relic-') && !ownedIds.has(i.id)).sort((a, b) => a.price - b.price).slice(0, 25);
  for (const [k, item] of cheap.entries()) {
    const r = await buy(ctx, item, { operationId: `f1-${k}` });
    if (!r.ok) { check('F1: setup comprou 25 itens baratos', false, { at: item.name, code: r.code }); break; }
  }
  const out = await day(ctx);
  const s = await stats(ctx);
  const collIds = new Set(ctx.AD.ACHIEVEMENT_CATALOG.filter((a) => ctx.engine.COLLECTION_ACHIEVEMENT_TRIGGERS.has(a.trigger_type)).map((a) => a.id));
  const noCollectionRows = !((await ctx.E.PlayerAchievement.filter({ profile_id: ctx.profile.id })) || []).some((r) => collIds.has(r.achievement_id));
  check('F1: false = progresso visivel, nada de colecao registrado nem pago', s.totalOwned >= 25 && noCollectionRows, { totalOwned: s.totalOwned, unlockedCount: out.unlocked });
  globalThis.__PL9C2B_COLLECTION_REWARDS = true;
  const txBefore = new Set((await rewardTx(ctx)).map((t) => t.id));
  await day(ctx);
  const colecionador = await pa(ctx, 'achv-colecionador');
  const newTx = (await rewardTx(ctx)).filter((t) => !txBefore.has(t.id));
  const colecionadorTx = newTx.filter((t) => t.source_id === `pa-achv-colecionador-${ctx.profile.id}`);
  check('F2: true volta a registrar e pagar (Colecionador, 1.000, 1 extrato)', colecionador !== null && colecionador.reward_delivered === true && colecionadorTx.length === 1 && Number(colecionadorTx[0].amount) === 1000, { newTx: newTx.map((t) => `${t.source_id}:${t.amount}`) });
  globalThis.__PL9C2B_COLLECTION_REWARDS = undefined;
}

// G — determinismo
{
  const run = async (tag) => {
    const ctx = await prepare(`det-${tag}`);
    const s = await stats(ctx);
    await ctx.rt.close().catch(() => {});
    return [s.totalOwned, s.equipmentOwned, s.shoes, s.apparel, s.rackets, s.legendary, s.mythic, s.exclusive];
  };
  const r1 = await run('a');
  const r2 = await run('b');
  check('G1: censo deterministico entre carreiras', same(r1, r2), { r1, r2 });
}

// H — I40 inalterado
{
  const ctx = await prepare('i40');
  const s0 = await stats(ctx);
  const racket = ctx.items.find((i) => i.rarity === 'lendario' && i.category === 'raquete' && i.catalog_order != null);
  const r1 = await buy(ctx, racket, { operationId: 'h1' });
  const s1 = await stats(ctx);
  check('H1 (I40): compra legitima +1 produto e +1 Arsenal, sem gravar quantity', r1.ok && s1.totalOwned === s0.totalOwned + 1 && s1.equipmentOwned === (s0.equipmentOwned || 0) + 1 && r1.inventoryItem.quantity === undefined, { totalOwned: [s0.totalOwned, s1.totalOwned] });
  const repeat = await buy(ctx, racket, { operationId: 'h1' });
  const s2 = await stats(ctx);
  check('H2 (I40): repeticao da mesma operacao nao conta', repeat.code === 'duplicate' && s2.totalOwned === s1.totalOwned, { code: repeat.code });
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'identity-tests.json'), `${JSON.stringify(report, null, 1)}\n`);
const failed = report.checks.filter((c) => !c.ok);
console.log(`\n9C.2-C identity: ${report.checks.length - failed.length}/${report.checks.length} PASS`);
if (failed.length) { console.log('FALHAS:', failed.map((f) => f.name).join(' | ')); }
// Saida deterministica: os runtimes Vite do harness mantem handles abertos.
process.exit(failed.length ? 1 : 0);
