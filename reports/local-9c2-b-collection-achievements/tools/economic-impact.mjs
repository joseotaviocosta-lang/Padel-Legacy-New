// LOCAL-9C.2-B — impacto econômico das 14 conquistas de coleção.
//
// Para cada conquista: conjunto MAIS BARATO de itens que a cumpre (preço de
// lista canônico: normalizeShopItem, sem eventos, sem desconto), revenda pela
// regra atual (computeResalePrice), custo líquido de comprar → receber →
// vender, e o estágio de carreira que os requisitos atuais da Loja exigem.
// Comparado ao caixa e ao ranking das carreiras da baseline LOCAL-9E.1.
// Somente leitura sobre carreira de memória; nenhum save real.
//
// Uso: TZ=UTC node reports/local-9c2-b-collection-achievements/tools/economic-impact.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = resolve(ROOT, 'reports/local-9c2-b-collection-achievements/economic-impact.json');
const { bootCareer } = await import(pathToFileURL(resolve(ROOT, 'scripts/lib/v526bTestKit.mjs')).href);
const mute = () => { const s = [console.log, console.warn, console.error, console.info, console.debug]; console.log = console.warn = console.error = console.info = console.debug = () => {}; return () => { [console.log, console.warn, console.error, console.info, console.debug] = s; }; };

let unmute = mute();
const { rt, profile } = await bootCareer('9c2b-economy');
const L = (p) => rt.load(p);
const data = await L('/src/lib/achievementsData.js');
const engine = await L('/src/lib/achievementEngine.js');
const store = await L('/src/lib/storeCatalog.js');
const market = await L('/src/lib/marketEngine.js');
const T = await L('/src/game-core/shopTransactions.js');
await market.seedMarket(profile.career_date); await store.ensureExpandedShopCatalog();
const raw = (await rt.localGame.entities.ShopItem.list()) || [];
await rt.close();
unmute();

const items = raw.filter((r) => r.is_available !== false).map((r) => {
  const n = store.normalizeShopItem(r);
  return { id: n.id, name: n.name, category: n.category, rarity: n.rarity, exclusive: Boolean(r.is_exclusive), relic: String(n.id).startsWith('historical-relic-'), price: n.price, resale: T.computeResalePrice(r), req: { level: n.min_career_level, rank: n.max_ranking || null, reputation: n.min_reputation } };
});
const cheapest = (pool, n) => [...pool].sort((a, b) => a.price - b.price).slice(0, n);
const cheapestPer = (pool, key) => Object.values(pool.reduce((acc, it) => { if (!acc[it[key]] || acc[it[key]].price > it.price) acc[it[key]] = it; return acc; }, {}));
const POOLS = {
  own_items: (a) => cheapest(items, a.threshold),
  own_legendary: (a) => cheapest(items.filter((i) => i.rarity === 'lendario'), a.threshold),
  own_mythic: (a) => cheapest(items.filter((i) => i.rarity === 'mitico'), a.threshold),
  own_exclusive: (a) => cheapest(items.filter((i) => i.exclusive), a.threshold),
  own_rackets: (a) => cheapest(items.filter((i) => i.category === 'raquete'), a.threshold),
  own_shoes: (a) => cheapest(items.filter((i) => i.category === 'tenis'), a.threshold),
  own_apparel: (a) => cheapest(items.filter((i) => i.category === 'roupa'), a.threshold),
  own_tech: (a) => cheapest(items.filter((i) => i.category === 'acessorio_tec'), a.threshold),
  all_categories: () => cheapestPer(items, 'category'),
  all_rarities: () => cheapestPer(items, 'rarity'),
};
const collection = data.ACHIEVEMENT_CATALOG.filter((a) => engine.COLLECTION_ACHIEVEMENT_TRIGGERS.has(a.trigger_type));
const rows = collection.map((a) => {
  const set = POOLS[a.trigger_type](a);
  const need = ['own_items', 'own_legendary', 'own_mythic', 'own_exclusive', 'own_rackets', 'own_shoes', 'own_apparel', 'own_tech'].includes(a.trigger_type) ? a.threshold : set.length;
  const reachable = set.length >= need;
  const cost = set.reduce((s, i) => s + i.price, 0);
  const resale = set.reduce((s, i) => s + i.resale, 0);
  const req = { level: Math.max(...set.map((i) => i.req.level)), rank: set.some((i) => i.req.rank) ? Math.min(...set.filter((i) => i.req.rank).map((i) => i.req.rank)) : null, reputation: Math.max(...set.map((i) => i.req.reputation)) };
  return {
    id: a.id, name: a.name, threshold: a.threshold, coins: a.coins_reward, xp: a.xp_reward, reachable,
    itemsAvailable: set.length, cheapestSetCost: reachable ? cost : null, resaleOfSet: reachable ? resale : null,
    netCostBuyRewardSell: reachable ? cost - resale - a.coins_reward : null,
    rewardShareOfCost: reachable ? Math.round((a.coins_reward / cost) * 1000) / 10 : null,
    profitableExploit: reachable ? a.coins_reward > cost - resale : null,
    requires: req, includesRelic: set.some((i) => i.relic),
  };
});
// Baseline LOCAL-9E.1 (versionada): caixa, renda, ranking e compras por horizonte.
const baseline = JSON.parse(readFileSync(resolve(ROOT, 'reports/local-9e1-decision-simulator/summary.json'), 'utf8'));
const horizons = baseline.groups.map((g) => ({ days: g.days, profile: g.profile, finalCoins: g.finalCoins.mean, totalIncome: g.totalIncome.mean, rankEnd: g.rankEnd.mean, rankBest: g.rankBest.mean, purchases: g.purchases.mean, equipmentSpend: g.equipmentSpend.mean, achievementIncome: g.income?.conquista ?? null }));
const theoretical = rows.reduce((s, r) => s + r.coins, 0);
const reachableMax = rows.filter((r) => r.reachable).reduce((s, r) => s + r.coins, 0);
// LOCAL-9C.2-B-R1 — propostas (NÃO aplicadas) para as três metas inalcançáveis.
const relicFree = items.filter((i) => !i.relic);
const proposal = (label, pool, n, reward) => {
  const set = cheapest(pool, n);
  const reachable = set.length >= n;
  const cost = set.reduce((s, i) => s + i.price, 0);
  const resale = set.reduce((s, i) => s + i.resale, 0);
  return { label, threshold: n, reachable, eligible: pool.length, cheapestSetCost: reachable ? cost : null, resale: reachable ? resale : null, rewardShareOfCost: reachable ? Math.round((reward / cost) * 1000) / 10 : null, profitableExploit: reachable ? reward > cost - resale : null, requires: reachable ? { level: Math.max(...set.map((i) => i.req.level)), rank: set.some((i) => i.req.rank) ? Math.min(...set.filter((i) => i.req.rank).map((i) => i.req.rank)) : null, reputation: Math.max(...set.map((i) => i.req.reputation)) } : null, includesRelic: set.some((i) => i.relic) };
};
const proposals = {
  'achv-arsenal-completo': { current: 250, reward: 30000, options: [
    proposal('A) 120 itens (catálogo menos 5)', items, 120, 30000),
    proposal('B) 115 itens (todo o catálogo sem relíquias)', items, 115, 30000),
    proposal('C) todos os 125 (meta = tamanho do catálogo)', items, 125, 30000),
    proposal('B′) 115 só itens não-relíquia (sem depender de estoque limitado)', relicFree, 115, 30000),
  ] },
  'achv-sapateiro': { current: 10, reward: 1200, options: [
    proposal('A) 9 (todos os tênis)', items.filter((i) => i.category === 'tenis'), 9, 1200),
    proposal('B) 8', items.filter((i) => i.category === 'tenis'), 8, 1200),
  ] },
  'achv-guarda-roupa': { current: 15, reward: 1200, options: [
    proposal('A) 8 (todo o vestuário)', items.filter((i) => i.category === 'roupa'), 8, 1200),
    proposal('B) 6', items.filter((i) => i.category === 'roupa'), 6, 1200),
  ] },
};
const report = {
  generatedBy: 'LOCAL-9C.2-B economic-impact',
  proposalsNotApplied: proposals,
  pricing: 'preço de lista canônico (normalizeShopItem × shopPriceMultiplier), sem eventos, sem desconto de patrocínio, sem volatilidade diária; revenda = computeResalePrice (30% do preço gravado)',
  totals: { theoreticalMax: theoretical, reachableMax, unreachable: theoretical - reachableMax, achievements: rows.length, profitableExploits: rows.filter((r) => r.profitableExploit).map((r) => r.name) },
  rows, baseline9E1: horizons,
};
writeFileSync(OUT, `${JSON.stringify(report, null, 1)}\n`);
console.log(JSON.stringify(report.totals));
for (const r of rows) console.log(r.name.padEnd(20), 'meta', String(r.threshold).padStart(3), 'moedas', String(r.coins).padStart(6), 'custo', String(r.cheapestSetCost).padStart(8), 'revenda', String(r.resaleOfSet).padStart(7), 'líquido', String(r.netCostBuyRewardSell).padStart(8), `${r.rewardShareOfCost}%`, 'exploit', r.profitableExploit, 'req', JSON.stringify(r.requires), r.includesRelic ? 'relíquia' : '');
