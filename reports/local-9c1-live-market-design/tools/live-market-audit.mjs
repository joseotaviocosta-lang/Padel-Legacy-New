// LOCAL-9C.1 — auditoria somente-leitura do Mercado Vivo (Loja, marcas, equipamentos).
//
// Nada de produção é alterado. Tudo roda sobre os MÓDULOS REAIS do jogo (Vite SSR)
// numa carreira de MEMÓRIA (scripts/lib/v526bTestKit.mjs): sem IndexedDB, sem saves
// do usuário. O catálogo vem do mesmo caminho da ativação da carreira
// (seedMarket + ensureExpandedShopCatalog) e é lido de ShopItem.
//
// Regras reutilizadas, nunca reimplementadas: normalizeShopItem, getShopItemAccess,
// computeItemPrice, getEquipmentMarketState, findSponsorIdByManufacturer,
// getSponsorCategory, equipmentModifiers (fonte canônica da 9B), createMatch/playPoint,
// previewTraining/applyAttributeGains. ÚNICA réplica: o fluxo de compra e venda, que
// ainda vive em Shop.jsx buy() / Inventory.jsx sellItem() (sem função de domínio) —
// as sondas da §purchase reproduzem os mesmos passos e gravações desses componentes.
//
// Uso: TZ=UTC node reports/local-9c1-live-market-design/tools/live-market-audit.mjs [--matches=300] [--skip-engine]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PL527D_ISOLATE_VITE_RNG = '1';
const { bootCareer, bootModules, reloadCareer } = await import('../../../scripts/lib/v526bTestKit.mjs');

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(OUT, '../..');
mkdirSync(OUT, { recursive: true });
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const MATCHES = Number(arg('matches', 300));
const SKIP_ENGINE = process.argv.includes('--skip-engine');

const ATTRS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
const CATS = ['raquete', 'grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'acessorio', 'colecionavel'];
const RAR = ['comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico', 'exclusivo'];
const sum = (b) => Object.values(b || {}).reduce((s, v) => s + (Number(v) || 0), 0);
const ovr = (o) => +(ATTRS.reduce((s, k) => s + (Number(o?.[k]) || 0), 0) / ATTRS.length).toFixed(2);
const median = (xs) => { const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };
const stats = (xs) => { const a = xs.filter((x) => Number.isFinite(x)); return a.length ? { min: Math.min(...a), median: median(a), max: Math.max(...a) } : null; };
const r1 = (x) => Math.round(x * 10) / 10;
let quietDepth = 0; let saved = null;
const quiet = async (fn) => { if (process.env.PL9C1_VERBOSE) return fn(); if (quietDepth++ === 0) { saved = [console.warn, console.log, console.debug, console.error, console.info]; console.warn = console.log = console.debug = console.error = console.info = () => {}; } try { return await fn(); } finally { if (--quietDepth === 0) [console.warn, console.log, console.debug, console.error, console.info] = saved; } };
const write = (name, data) => { writeFileSync(resolve(OUT, name), `${JSON.stringify(data, null, 1)}\n`); console.log(`→ ${name}`); };
const tests = [];
const check = (name, ok, detail = null) => { tests.push({ name, ok: Boolean(ok), ...(detail != null ? { detail } : {}) }); console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`); };
const t0 = performance.now();

// ── Bônus declarado no código-fonte (antes do filtro de chaves de scaleBonus) ──
// Só para documentar chaves órfãs que o catálogo declara e descarta em silêncio.
const storeSrc = readFileSync(resolve(ROOT, 'src/lib/storeCatalog.js'), 'utf8');
function declaredSourceKeys(item) {
  const lines = storeSrc.split('\n');
  const supportLine = lines.find((l) => l.includes(`['${item.name}'`));
  const racketLine = !supportLine && item.category === 'raquete' && item.collection ? lines.find((l) => l.trim().startsWith(`['${item.manufacturer}', '${String(item.collection).replace(`${item.manufacturer} `, '')}'`)) : null;
  const exclusiveLine = !supportLine && !racketLine ? lines.find((l) => l.includes(`name: '${item.name}'`)) : null;
  const line = supportLine || racketLine || exclusiveLine;
  const m = line && line.match(/\{([^{}]*:[^{}]*)\}/);
  if (!m) return null;
  return m[1].split(',').map((p) => p.split(':')[0].trim()).filter(Boolean);
}

// ══ 1. Catálogo real ══════════════════════════════════════════════════════════
const booted = await quiet(() => bootCareer('local-9c1-catalog'));
let { rt } = booted;
const { storage, careerId } = booted;
const load = (p) => rt.load(p);
const store = await load('/src/lib/storeCatalog.js');
const market = await load('/src/lib/marketEngine.js');
const eco26 = await load('/src/lib/sportsEconomyV26.js');
const sponsors = await load('/src/lib/sponsors.js');
const balance = await load('/src/lib/balance527.js');
const EM = await load('/src/lib/equipmentModifiers.js');
const { ATTRIBUTE_KEYS } = await load('/src/lib/attributes.js');
let E = rt.localGame.entities;
const careerDate = booted.profile.career_date;
await quiet(async () => { await market.seedMarket(careerDate); await store.ensureExpandedShopCatalog(); });
const rawItems = (await E.ShopItem.list('catalog_order', 2000)) || [];
const histories = (await E.MarketPriceHistory.filter({})) || [];
const histMap = Object.fromEntries(histories.map((h) => [h.item_id, h]));
const activeEvents = ((await E.MarketEvent.filter({ is_active: true })) || []).map(market.normalizeMarketEvent);
const preset = balance.getBalance527();
const sponsorById = new Map(sponsors.SPONSOR_CATALOG.map((s) => [s.id, s]));

const months = Array.from({ length: 120 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-15`);
const sourceOf = (item) => (item.catalog_order != null ? 'storeCatalog' : String(item.id).startsWith('historical-relic-') ? 'reliquia' : String(item.id).startsWith('shop-') ? 'localSeed' : 'outro');
const classOf = (item, source) => (source === 'reliquia' ? 'reliquia' : source === 'localSeed' ? 'demonstracao' : item.category === 'colecionavel' ? 'colecionavel' : item.rarity === 'exclusivo' ? 'exclusivo' : 'normal');

const catalog = rawItems.map((raw) => {
  const n = store.normalizeShopItem(raw);
  const source = sourceOf(raw);
  const bonus = EM.sanitizeBonus(n.attribute_bonus);
  const bonusTotal = sum(bonus);
  const declared = source === 'storeCatalog' ? declaredSourceKeys(n) : Object.keys(raw.attribute_bonus || {});
  const droppedKeys = (declared || []).filter((k) => !ATTRIBUTE_KEYS.includes(k));
  const avail = months.filter((d) => eco26.getEquipmentMarketState(n, { career_date: d }).available).length;
  const sponsorId = n.sponsor_id || sponsors.findSponsorIdByManufacturer(n.manufacturer) || null;
  const sponsor = sponsorId ? sponsorById.get(sponsorId) : null;
  const priceNoEvents = market.computeItemPrice(n, [], histMap[n.id] || null, [], careerDate).currentPrice;
  const priceDay1 = market.computeItemPrice(n, activeEvents, histMap[n.id] || null, [], careerDate).currentPrice;
  const priceSponsored = sponsorId ? market.computeItemPrice(n, [], histMap[n.id] || null, [{ sponsor_id: sponsorId, sponsor_name: sponsor?.name }], careerDate).currentPrice : null;
  // Volatilidade por raridade: amplitude real em 31 dias do mês (sem eventos).
  const daily = Array.from({ length: 28 }, (_, i) => market.computeItemPrice(n, [], histMap[n.id] || null, [], `2026-02-${String(i + 1).padStart(2, '0')}`).currentPrice);
  const storedPrice = Number(raw.price) || null;
  return {
    id: n.id, name: n.name, manufacturer: n.manufacturer, category: n.category, subcategory: n.subcategory, rarity: n.rarity,
    source, itemClass: classOf(n, source),
    storedPrice, listPrice: n.price, priceNoEventsDay1: priceNoEvents, priceWithDay1Events: priceDay1, priceWithSponsor: priceSponsored,
    dailySwingPct: storedPrice ? r1(((Math.max(...daily) - Math.min(...daily)) / n.price) * 100) : null,
    bonus, bonusTotal, attributesTouched: Object.keys(bonus).length,
    pricePerPoint: bonusTotal > 0 ? Math.round(n.price / bonusTotal) : null,
    droppedSourceKeys: droppedKeys,
    requirement: { minCareerLevel: n.min_career_level, maxRanking: n.max_ranking, minReputation: n.min_reputation, label: n.progression_label },
    monthlyAvailabilityPct: Math.round((avail / months.length) * 100),
    alwaysInRotation: ['comum', 'incomum'].includes(n.rarity),
    releaseYear: n.release_year ?? null,
    limitedStock: Boolean(histMap[n.id]?.is_limited_stock), stockRemaining: histMap[n.id]?.is_limited_stock ? histMap[n.id].stock_remaining : null,
    isExclusiveFlag: Boolean(n.is_exclusive), isAvailableFlag: n.is_available !== false,
    sponsorId, sponsorTier: sponsor?.tier || null, sponsorSlot: sponsor ? sponsors.getSponsorCategory(sponsor) : null,
    equippable: EM.EQUIPMENT_SLOT_CATEGORIES.includes(n.category), slot: n.category,
    sellPrice: Math.floor((storedPrice || 0) * 0.3), sellPctOfList: storedPrice ? r1((Math.floor(storedPrice * 0.3) / n.price) * 100) : null,
    durability: n.durability, catalogOrder: raw.catalog_order ?? null,
    extra: Object.fromEntries(['shape', 'balance', 'weight', 'collection', 'country'].filter((k) => raw[k] != null).map((k) => [k, raw[k]])),
  };
});

// ── Achados de integridade do catálogo ─────────────────────────────────────
const byName = {}; catalog.forEach((i) => { (byName[i.name.toLowerCase()] ||= []).push(i.id); });
const duplicates = Object.entries(byName).filter(([, ids]) => ids.length > 1);
const floorOf = (r) => (store.SHOP_PROGRESSION[r]?.priceFloor || 0) * preset.shopPriceMultiplier;
const issues = {
  duplicateNames: duplicates.map(([n, ids]) => ({ name: n, ids })),
  zeroBonus: catalog.filter((i) => i.bonusTotal === 0).map((i) => ({ id: i.id, name: i.name, source: i.source })),
  droppedSourceKeys: catalog.filter((i) => i.droppedSourceKeys.length).map((i) => ({ name: i.name, rarity: i.rarity, dropped: i.droppedSourceKeys, effectiveBonus: i.bonus })),
  priceAtFloor: catalog.filter((i) => i.source === 'storeCatalog' && i.storedPrice === store.SHOP_PROGRESSION[i.rarity]?.priceFloor).map((i) => ({ name: i.name, rarity: i.rarity, listPrice: i.listPrice })),
  belowRarityFloor: catalog.filter((i) => i.listPrice < floorOf(i.rarity) - 1).map((i) => ({ name: i.name, rarity: i.rarity, listPrice: i.listPrice, floor: floorOf(i.rarity) })),
  relicsOutOfScale: catalog.filter((i) => i.source === 'reliquia').map((i) => ({ name: i.name, category: i.category, bonusTotal: i.bonusTotal, listPrice: i.listPrice, pricePerPoint: i.pricePerPoint, stock: i.stockRemaining })),
  collectiblesWithSportBonus: catalog.filter((i) => i.category === 'colecionavel' && i.bonusTotal > 0).map((i) => ({ name: i.name, rarity: i.rarity, bonusTotal: i.bonusTotal, source: i.source })),
  incomumNoBetterThanComum: (() => {
    const out = [];
    for (const c of CATS) {
      const best = (r) => Math.max(0, ...catalog.filter((i) => i.category === c && i.rarity === r && i.source === 'storeCatalog').map((i) => i.bonusTotal));
      const cheap = (r) => Math.min(...catalog.filter((i) => i.category === c && i.rarity === r && i.source === 'storeCatalog').map((i) => i.listPrice));
      if (catalog.some((i) => i.category === c && i.rarity === 'incomum') && best('incomum') <= best('comum')) out.push({ category: c, bestComum: best('comum'), bestIncomum: best('incomum'), cheapestComum: cheap('comum'), cheapestIncomum: cheap('incomum') });
    }
    return out;
  })(),
  rarityInversions: (() => {
    // Dentro da mesma categoria, item de raridade MAIOR com bônus MENOR que o melhor da raridade anterior.
    const out = [];
    for (const c of CATS) for (let k = 1; k < RAR.length; k += 1) {
      const prev = catalog.filter((i) => i.category === c && i.rarity === RAR[k - 1] && i.source === 'storeCatalog');
      const cur = catalog.filter((i) => i.category === c && i.rarity === RAR[k] && i.source === 'storeCatalog');
      if (!prev.length || !cur.length) continue;
      const bestPrev = Math.max(...prev.map((i) => i.bonusTotal));
      cur.filter((i) => i.bonusTotal < bestPrev).forEach((i) => out.push({ category: c, item: i.name, rarity: i.rarity, bonus: i.bonusTotal, bestOfPreviousRarity: bestPrev, listPrice: i.listPrice }));
    }
    return out;
  })(),
  sameRaritySamePriceBandSpread: (() => {
    // Mesma categoria e raridade, preços muito diferentes para o mesmo bônus (itens antigos no piso × itens "Fase 1").
    const out = [];
    for (const c of CATS) for (const r of RAR) {
      const rows = catalog.filter((i) => i.category === c && i.rarity === r && i.source === 'storeCatalog' && i.bonusTotal > 0);
      if (rows.length < 2) continue;
      const pp = rows.map((i) => i.pricePerPoint);
      if (Math.max(...pp) / Math.min(...pp) >= 2.5) out.push({ category: c, rarity: r, items: rows.map((i) => ({ name: i.name, listPrice: i.listPrice, bonus: i.bonusTotal, pricePerPoint: i.pricePerPoint })) });
    }
    return out;
  })(),
  exclusiveFlagMismatch: catalog.filter((i) => (i.rarity === 'exclusivo') !== i.isExclusiveFlag).map((i) => ({ name: i.name, rarity: i.rarity, is_exclusive: i.isExclusiveFlag })),
  nonEquippable: catalog.filter((i) => !i.equippable).map((i) => i.name),
  serveOnlyItems: catalog.filter((i) => i.bonus.serve).map((i) => i.name),
};
const counts = {
  items: catalog.length,
  bySource: Object.fromEntries(['storeCatalog', 'reliquia', 'localSeed', 'outro'].map((s) => [s, catalog.filter((i) => i.source === s).length])),
  byClass: catalog.reduce((o, i) => ({ ...o, [i.itemClass]: (o[i.itemClass] || 0) + 1 }), {}),
  categories: [...new Set(catalog.map((i) => i.category))].length,
  byCategory: Object.fromEntries(CATS.map((c) => [c, catalog.filter((i) => i.category === c).length])),
  byRarity: Object.fromEntries(RAR.map((r) => [r, catalog.filter((i) => i.rarity === r).length])),
  brands: [...new Set(catalog.map((i) => i.manufacturer))].length,
  attributeUsage: Object.fromEntries(ATTRS.map((k) => [k, { items: catalog.filter((i) => i.bonus[k]).length, points: catalog.reduce((s, i) => s + (i.bonus[k] || 0), 0) }])),
  activeEventsDay1: activeEvents.map((e) => ({ title: e.title, modifier: e.price_modifier, end: e.end_date })),
  pricePreset: { shopPriceMultiplier: preset.shopPriceMultiplier, floors: Object.fromEntries(RAR.map((r) => [r, store.SHOP_PROGRESSION[r].priceFloor])) },
};
check(`catálogo: ${counts.items} itens, ${counts.categories} categorias, ${counts.brands} marcas`, counts.items === 125 && counts.categories === 9 && counts.brands === 24, counts);
check('catálogo: nenhum bônus fora dos 10 atributos chega ao attribute_bonus', catalog.every((i) => Object.keys(i.bonus).every((k) => ATTRIBUTE_KEYS.includes(k))));
check('catálogo: getExpandedCatalogSummary bate com os itens do storeCatalog', store.getExpandedCatalogSummary().total === counts.bySource.storeCatalog);
check('catálogo: todo item tem categoria de slot equipável', issues.nonEquippable.length === 0);
write('catalog-audit.json', { generatedBy: 'tools/live-market-audit.mjs', head: process.env.PL9C1_HEAD || null, careerDate, counts, issues, items: catalog });

// ══ 2. Categorias ═════════════════════════════════════════════════════════════
const normal = catalog.filter((i) => i.source === 'storeCatalog');
const bestOf = (rows, c) => rows.filter((i) => i.category === c && i.bonusTotal > 0).sort((a, b) => b.bonusTotal - a.bonusTotal || a.listPrice - b.listPrice)[0] || null;
const categories = CATS.map((c) => {
  const rows = catalog.filter((i) => i.category === c);
  const shop = rows.filter((i) => i.source === 'storeCatalog' && i.bonusTotal > 0);
  const byRar = Object.fromEntries(RAR.map((r) => [r, rows.filter((i) => i.rarity === r).length]).filter(([, n]) => n));
  const ladder = RAR.map((r) => { const b = bestOf(shop.filter((i) => i.rarity === r), c); return b ? { rarity: r, best: b.name, bonus: b.bonusTotal, listPrice: b.listPrice, pricePerPoint: b.pricePerPoint } : null; }).filter(Boolean);
  const ladderSteps = ladder.slice(1).map((s, k) => ({ from: ladder[k].rarity, to: s.rarity, deltaBonus: s.bonus - ladder[k].bonus, deltaPrice: s.listPrice - ladder[k].listPrice, marginalCostPerPoint: s.bonus > ladder[k].bonus ? Math.round((s.listPrice - ladder[k].listPrice) / (s.bonus - ladder[k].bonus)) : null }));
  const pp = shop.map((i) => i.pricePerPoint);
  const bestValue = [...shop].sort((a, b) => a.pricePerPoint - b.pricePerPoint)[0];
  const worstValue = [...shop].sort((a, b) => b.pricePerPoint - a.pricePerPoint)[0];
  const attrs = {}; rows.forEach((i) => Object.entries(i.bonus).forEach(([k, v]) => { attrs[k] = (attrs[k] || 0) + v; }));
  const maxShop = Math.max(0, ...shop.map((i) => i.bonusTotal));
  const maxAll = Math.max(0, ...rows.map((i) => i.bonusTotal));
  return {
    category: c, items: rows.length, brands: [...new Set(rows.map((i) => i.manufacturer))].length, brandList: [...new Set(rows.map((i) => i.manufacturer))],
    byRarity: byRar, price: stats(rows.map((i) => i.listPrice)), bonus: stats(rows.map((i) => i.bonusTotal)), pricePerPoint: stats(pp),
    attributes: attrs, bestValue: bestValue && { name: bestValue.name, rarity: bestValue.rarity, pricePerPoint: bestValue.pricePerPoint },
    worstValue: worstValue && { name: worstValue.name, rarity: worstValue.rarity, pricePerPoint: worstValue.pricePerPoint },
    maxBonusShop: maxShop, maxBonusWithRelics: maxAll, ladder, ladderSteps,
    equivalentOptionsSameRarity: RAR.map((r) => ({ rarity: r, options: shop.filter((i) => i.rarity === r).length, brands: [...new Set(shop.filter((i) => i.rarity === r).map((i) => i.manufacturer))].length })).filter((x) => x.options),
  };
});
const totalTopBonus = categories.reduce((s, c) => s + c.maxBonusShop, 0);
categories.forEach((c) => { c.shareOfTopKitBonus = Math.round((c.maxBonusShop / totalTopBonus) * 100); });
write('category-analysis.json', { generatedBy: 'tools/live-market-audit.mjs', note: 'pricePerPoint = preço de lista (×shopPriceMultiplier) / soma do bônus declarado. ladder = melhor item de cada raridade da categoria (só storeCatalog).', totalTopKitBonusShopOnly: totalTopBonus, categories });

// ══ 3. Marcas ═════════════════════════════════════════════════════════════════
const brands = [...new Set(catalog.map((i) => i.manufacturer))].map((b) => {
  const rows = catalog.filter((i) => i.manufacturer === b);
  const attrs = {}; rows.forEach((i) => Object.entries(i.bonus).forEach(([k, v]) => { attrs[k] = (attrs[k] || 0) + v; }));
  const tot = sum(attrs) || 1;
  const profile = Object.fromEntries(Object.entries(attrs).sort((a, z) => z[1] - a[1]).map(([k, v]) => [k, Math.round((v / tot) * 100)]));
  const rackets = rows.filter((i) => i.category === 'raquete');
  const sponsorId = rows.find((i) => i.sponsorId)?.sponsorId || null;
  const sp = sponsorId ? sponsorById.get(sponsorId) : null;
  return {
    brand: b, items: rows.length, categories: [...new Set(rows.map((i) => i.category))], byRarity: Object.fromEntries(RAR.map((r) => [r, rows.filter((i) => i.rarity === r).length]).filter(([, n]) => n)),
    price: stats(rows.map((i) => i.listPrice)), pricePerPoint: stats(rows.map((i) => i.pricePerPoint)), attributeProfilePct: profile,
    racketStyles: [...new Set(rackets.map((i) => i.subcategory))], sources: [...new Set(rows.map((i) => i.source))],
    sponsor: sp ? { id: sp.id, tier: sp.tier, industry: sp.industry, slot: sponsors.getSponsorCategory(sp) } : null,
    minRarity: RAR.find((r) => rows.some((i) => i.rarity === r)), maxRarity: [...RAR].reverse().find((r) => rows.some((i) => i.rarity === r)),
  };
}).sort((a, b) => b.items - a.items);
const sponsorsWithoutItems = sponsors.SPONSOR_CATALOG.filter((s) => !catalog.some((i) => i.sponsorId === s.id)).map((s) => ({ id: s.id, name: s.name, tier: s.tier, industry: s.industry }));
// Diferença real entre marcas na mesma categoria e raridade: o bônus vem da linha, a
// raridade multiplica — mesmo total, só muda o atributo e o preço.
const racketRows = normal.filter((i) => i.category === 'raquete');
const sameTierRackets = RAR.map((r) => { const rows = racketRows.filter((i) => i.rarity === r); return rows.length ? { rarity: r, models: rows.length, bonusTotals: [...new Set(rows.map((i) => i.bonusTotal))], price: stats(rows.map((i) => i.listPrice)) } : null; }).filter(Boolean);
write('brand-analysis.json', { generatedBy: 'tools/live-market-audit.mjs', brands, sponsorsWithoutItems, racketsSameRarity: sameTierRackets, sponsorCatalogSize: sponsors.SPONSOR_CATALOG.length, brandsWithSponsor: brands.filter((b) => b.sponsor).length });

// ══ 4. Raridades ══════════════════════════════════════════════════════════════
const kitOf = (filter) => CATS.map((c) => bestOf(catalog.filter(filter), c)).filter(Boolean);
const kitSummary = (items) => ({ items: items.length, categories: items.map((i) => i.category), cost: items.reduce((s, i) => s + i.listPrice, 0), declaredBonus: items.reduce((s, i) => s + i.bonusTotal, 0), declaredOvr: r1(items.reduce((s, i) => s + i.bonusTotal, 0) / ATTRS.length), names: items.map((i) => i.name) });
const rarityRows = RAR.map((r) => {
  const rows = normal.filter((i) => i.rarity === r && i.bonusTotal > 0);
  const kit = kitOf((i) => i.source === 'storeCatalog' && i.rarity === r);
  const ks = kitSummary(kit);
  return {
    rarity: r, requirement: store.SHOP_PROGRESSION[r], bonusMultiplier: { comum: 1, incomum: 1, raro: 2, epico: 3, lendario: 4, mitico: 5, exclusivo: 6 }[r],
    items: rows.length, price: stats(rows.map((i) => i.listPrice)), bonus: stats(rows.map((i) => i.bonusTotal)), pricePerPoint: stats(rows.map((i) => i.pricePerPoint)),
    monthlyAvailabilityPct: stats(rows.map((i) => i.monthlyAvailabilityPct)), kit: ks, kitCostPerPoint: ks.declaredBonus ? Math.round(ks.cost / ks.declaredBonus) : null,
  };
});
rarityRows.forEach((row, k) => { if (k > 0 && rarityRows[k - 1].kit.cost) { row.kitCostVsPrevious = r1(row.kit.cost / rarityRows[k - 1].kit.cost); row.kitBonusVsPrevious = r1(row.kit.declaredBonus / (rarityRows[k - 1].kit.declaredBonus || 1)); } });
// Decomposição do "58 × 676–815 moedas por ponto efetivo" da 9E.1.
const cheapestCommonPerCat = CATS.map((c) => normal.filter((i) => i.category === c && i.rarity === 'comum' && i.bonusTotal > 0).sort((a, b) => a.listPrice - b.listPrice)[0]).filter(Boolean);
const raroRows = normal.filter((i) => i.rarity === 'raro' && i.bonusTotal > 0);
const upgradeComumToRaro = CATS.map((c) => {
  const com = normal.filter((i) => i.category === c && i.rarity === 'comum' && i.bonusTotal > 0).sort((a, b) => b.bonusTotal - a.bonusTotal || a.listPrice - b.listPrice)[0];
  const raro = normal.filter((i) => i.category === c && i.rarity === 'raro' && i.bonusTotal > 0).sort((a, b) => (a.listPrice / a.bonusTotal) - (b.listPrice / b.bonusTotal))[0];
  if (!raro) return null;
  const gain = raro.bonusTotal - (com?.bonusTotal || 0);
  return { category: c, from: com?.name || null, to: raro.name, raroPrice: raro.listPrice, raroBonus: raro.bonusTotal, marginalGainOverComum: gain, costPerMarginalPoint: gain > 0 ? Math.round(raro.listPrice / gain) : null, costPerNominalPoint: Math.round(raro.listPrice / raro.bonusTotal) };
}).filter(Boolean);
const decomposition = {
  observed9E1: { economico: 58, equilibrado: 189, competitivo365: 676, competitivo730: 815, note: 'moedas gastas / pontos efetivos aplicados (9E.1, simulador, pré-H1)' },
  cheapestCommonKit: { items: cheapestCommonPerCat.map((i) => ({ name: i.name, price: i.listPrice, bonus: i.bonusTotal })), costPerPoint: Math.round(cheapestCommonPerCat.slice(0, 3).reduce((s, i) => s + i.listPrice, 0) / 3) },
  floorRatioRaroVsComum: store.SHOP_PROGRESSION.raro.priceFloor / store.SHOP_PROGRESSION.comum.priceFloor,
  bonusRatioRaroVsComum: 2,
  nominalPricePerPointRaro: stats(raroRows.map((i) => i.pricePerPoint)),
  upgradeComumToRaro,
  medianMarginalCostComumToRaro: median(upgradeComumToRaro.map((u) => u.costPerMarginalPoint)),
};
write('rarity-economics.json', { generatedBy: 'tools/live-market-audit.mjs', rarities: rarityRows, decomposition, volatilityDailySwingPct: Object.fromEntries(RAR.map((r) => [r, stats(catalog.filter((i) => i.rarity === r).map((i) => i.dailySwingPct))])) });

// ══ 5. Disponibilidade por estágio (fixtures de carreira) ══════════════════════
const stageFixtures = [
  { stage: 'inicio (dia 0)', career_level: 1, ranking_position: 1001, reputation: 0, coins: 900 },
  { stage: 'amador (≈ dia 60)', career_level: 5, ranking_position: 900, reputation: 4, coins: 1500 },
  { stage: 'regional (≈ 1º ano)', career_level: 17, ranking_position: 300, reputation: 15, coins: 9000 },
  { stage: 'nacional (≈ 2º ano)', career_level: 28, ranking_position: 110, reputation: 30, coins: 15000 },
  { stage: 'internacional', career_level: 30, ranking_position: 80, reputation: 45, coins: 30000 },
  { stage: 'elite', career_level: 40, ranking_position: 30, reputation: 70, coins: 80000 },
  { stage: 'lenda', career_level: 50, ranking_position: 5, reputation: 90, coins: 200000 },
];
const availability = stageFixtures.map((fx) => {
  const perMonth = Array.from({ length: 12 }, (_, m) => {
    const profile = { ...fx, career_date: `2027-${String(m + 1).padStart(2, '0')}-10` };
    const rows = catalog.map((i) => ({ i, access: store.getShopItemAccess(profile, { ...rawItems.find((x) => x.id === i.id) }), mk: eco26.getEquipmentMarketState(i, profile) }));
    const unlocked = rows.filter((r) => r.access.unlocked);
    const visible = unlocked.filter((r) => r.mk.available);
    return { unlocked: unlocked.length, availableAndUnlocked: visible.length, affordable: visible.filter((r) => r.i.listPrice <= fx.coins).length, inRotationAll: rows.filter((r) => r.mk.available).length };
  });
  const avg = (k) => r1(perMonth.reduce((s, x) => s + x[k], 0) / perMonth.length);
  return { ...fx, economyStage: eco26.getCareerEconomyStage(fx), unlocked: avg('unlocked'), availableAndUnlocked: avg('availableAndUnlocked'), affordable: avg('affordable'), inRotationAll: avg('inRotationAll'), unlockedRarities: RAR.filter((r) => store.getShopItemAccess(fx, { rarity: r }).unlocked) };
});
check('disponibilidade: no dia 0 a Loja lista os 125 itens, mas só os comuns estão liberados (incomum pede nível 3)', availability[0].unlockedRarities.join() === 'comum' && availability[0].unlocked === 20 && catalog.length === 125, availability[0]);

// ══ 6. Fluxo de compra — sondas (réplica fiel de Shop.jsx buy / Inventory.jsx sellItem) ══
// Shop.jsx buy(): valida rotação (ou já possuído), acesso, saldo do perfil EM MEMÓRIA;
// cria PlayerInventory; grava coins = perfil_em_memória − preço; extrato; histórico.
async function shopBuyReplica(profile, item, { failDebit = false } = {}) {
  const raw = (await E.ShopItem.get(item.id)) || item;
  const n = store.normalizeShopItem(raw);
  const contracts = (await E.PlayerContract.filter({ profile_id: profile.id, is_active: true })) || [];
  const marketState = eco26.getEquipmentMarketState(n, { ...profile, active_sponsor_names: contracts.map((c) => c.sponsor_name) });
  const inv = (await E.PlayerInventory.filter({ profile_id: profile.id })) || [];
  const owned = inv.some((r) => r.item_id === n.id);
  if (!marketState.available && !owned) return { ok: false, reason: 'rotacao' };
  if (!store.getShopItemAccess(profile, n).unlocked) return { ok: false, reason: 'bloqueado' };
  const hist = ((await E.MarketPriceHistory.filter({ item_id: n.id })) || [])[0] || null;
  const price = market.computeItemPrice(n, activeEvents, hist, [], profile.career_date).currentPrice;
  if ((profile.coins || 0) < price) return { ok: false, reason: 'saldo' };
  await E.PlayerInventory.create({ profile_id: profile.id, item_id: n.id, item_name: n.name, category: n.category, rarity: n.rarity, equipped: false, acquired_date: profile.career_date, current_durability: n.durability || 100, usage_count: 0 });
  if (failDebit) throw Object.assign(new Error('falha simulada entre a entrega e o débito'), { price });
  await E.PlayerProfile.update(profile.id, { coins: (profile.coins || 0) - price });
  if (hist) await E.MarketPriceHistory.update(hist.id, { demand_score: Math.min(100, (hist.demand_score || 50) + 5), purchase_count: (hist.purchase_count || 0) + 1, stock_remaining: hist.is_limited_stock ? Math.max(0, (hist.stock_remaining || 0) - 1) : -1 });
  return { ok: true, price };
}
async function sellReplica(profile, invRow) {
  const shopItem = await E.ShopItem.get(invRow.item_id);
  const sellPrice = Math.floor((shopItem?.price || 0) * 0.3);
  await E.PlayerInventory.delete(invRow.id);
  await E.PlayerProfile.update(profile.id, { coins: (profile.coins || 0) + sellPrice });
  return sellPrice;
}
const P = async () => E.PlayerProfile.get(booted.profile.id);
const invOf = async () => (await E.PlayerInventory.filter({ profile_id: booted.profile.id })) || [];
const purchase = {};
await quiet(async () => {
  const base = await E.PlayerProfile.update(booted.profile.id, { coins: 1_000_000, career_level: 50, ranking_position: 5, reputation: 95 });
  const startInv = (await invOf()).length;
  const racket = catalog.find((i) => i.name === 'Padel Start Control One Club');
  // A — dois cliques antes do re-render: mesmo perfil em memória, compras concorrentes.
  const before = (await P()).coins;
  const [a1, a2] = await Promise.all([shopBuyReplica(base, racket), shopBuyReplica(base, racket)]);
  const afterA = await P(); const invA = await invOf();
  purchase.A_doubleClick = { results: [a1.ok, a2.ok], price: a1.price, rowsCreated: invA.length - startInv, coinsDebited: before - afterA.coins, expectedDebitIfBothPaid: (a1.price || 0) + (a2.price || 0) };
  // B — comprar de novo um item já possuído (só a interface esconde o botão).
  const b = await shopBuyReplica(await P(), racket);
  purchase.B_rebuyOwned = { ok: b.ok, rowsForItem: (await invOf()).filter((r) => r.item_id === racket.id).length };
  // C — relíquia com estoque zerado continua comprável.
  const relic = catalog.find((i) => i.source === 'reliquia' && i.category === 'raquete');
  const rh = ((await E.MarketPriceHistory.filter({ item_id: relic.id })) || [])[0];
  await E.MarketPriceHistory.update(rh.id, { stock_remaining: 0 });
  // Garante a rotação do mês (exclusivo ~20%): procura um mês em que a relíquia está na rotação.
  const monthIn = months.find((d) => eco26.getEquipmentMarketState(store.normalizeShopItem(relic), { career_date: d }).available);
  const pC = await E.PlayerProfile.update(base.id, { career_date: monthIn });
  const c = await shopBuyReplica(pC, relic);
  purchase.C_zeroStockRelic = { stockBefore: 0, monthUsed: monthIn, ok: c.ok, price: c.price, stockAfter: (((await E.MarketPriceHistory.filter({ item_id: relic.id })) || [])[0] || {}).stock_remaining };
  await E.PlayerProfile.update(base.id, { career_date: careerDate });
  // D — falha entre criar o item e debitar: item entregue sem pagamento.
  const grip = catalog.find((i) => i.name === 'Tour Grip Dry Start');
  const dBefore = await P(); const dInv = (await invOf()).length;
  let dErr = null; try { await shopBuyReplica(dBefore, grip, { failDebit: true }); } catch (e) { dErr = e.message; }
  purchase.D_failureBetweenDeliveryAndDebit = { error: dErr, rowsCreated: (await invOf()).length - dInv, coinsDebited: dBefore.coins - (await P()).coins };
  // E — item fora da rotação, já possuído: a checagem de rotação é pulada (owned).
  const epic = catalog.find((i) => i.rarity === 'mitico' && i.category === 'raquete');
  const monthOut = months.find((d) => !eco26.getEquipmentMarketState(store.normalizeShopItem(epic), { career_date: d }).available);
  const monthOn = months.find((d) => eco26.getEquipmentMarketState(store.normalizeShopItem(epic), { career_date: d }).available);
  await shopBuyReplica(await E.PlayerProfile.update(base.id, { career_date: monthOn }), epic);
  const e2 = await shopBuyReplica(await E.PlayerProfile.update(base.id, { career_date: monthOut }), epic);
  purchase.E_outOfRotationButOwned = { monthOut, ok: e2.ok, copies: (await invOf()).filter((r) => r.item_id === epic.id).length };
  await E.PlayerProfile.update(base.id, { career_date: careerDate });
  // F — venda grava saldo absoluto a partir do perfil em memória: um crédito concorrente se perde.
  const stale = await P();
  const sellRow = (await invOf()).find((r) => r.item_id === grip.id);
  await E.PlayerProfile.update(base.id, { coins: stale.coins + 500 }); // ex.: recompensa de missão gravada por outro fluxo
  const sold = await sellReplica(stale, sellRow);
  purchase.F_sellOverwritesConcurrentCredit = { sellPrice: sold, concurrentCredit: 500, coinsAfter: (await P()).coins, expected: stale.coins + 500 + sold, lost: stale.coins + 500 + sold - (await P()).coins };
  // G — base de cálculo da venda: 30% do preço GRAVADO (sem ×shopPriceMultiplier nem eventos).
  purchase.G_sellBasis = { item: racket.name, storedPrice: racket.storedPrice, listPrice: racket.listPrice, sellPrice: racket.sellPrice, pctOfListPrice: racket.sellPctOfList };
  // H — equipar dois itens da mesma categoria + save/load: um só conta; base intacta.
  const top = kitOf((i) => i.source === 'storeCatalog');
  const { toggleEquipItem } = await load('/src/game-core/equipmentLifecycle.js');
  const setBase = Object.fromEntries(ATTRS.map((k) => [k, 50]));
  await E.PlayerProfile.update(base.id, { ...setBase, coins: 5_000_000 });
  for (const it of top) {
    await shopBuyReplica(await P(), it);
    const row = (await invOf()).filter((r) => r.item_id === it.id && !r.equipped).at(-1);
    await toggleEquipItem({ profile: await P(), inventory: await invOf(), target: row, shopItems: await E.ShopItem.list() });
  }
  const pAfter = await P();
  const mods = EM.computeEquipmentModifiers(await invOf(), await E.ShopItem.list());
  purchase.H_equipTopKit = { items: top.length, baseUnchanged: ATTRS.every((k) => pAfter[k] === 50), baseOvr: ovr(pAfter), effectiveOvr: ovr(EM.applyEquipmentModifiers(pAfter, mods)), declared: sum(mods), applied: EM.totalAppliedModifier(pAfter, mods), equippedRows: (await invOf()).filter((r) => r.equipped).length };
});
check('compra A: dois cliques antes do re-render → 2 itens entregues e só 1 débito (saldo absoluto do perfil em memória)', purchase.A_doubleClick.rowsCreated === 2 && purchase.A_doubleClick.coinsDebited === purchase.A_doubleClick.price, purchase.A_doubleClick);
check('compra B: comprar de novo um item já possuído é aceito pela lógica (só a interface esconde)', purchase.B_rebuyOwned.ok && purchase.B_rebuyOwned.rowsForItem >= 3, purchase.B_rebuyOwned);
check('compra C: relíquia com estoque 0 é vendida (buy não lê o estoque)', purchase.C_zeroStockRelic.ok, purchase.C_zeroStockRelic);
check('compra D: falha entre criar o item e debitar → item entregue sem pagamento', purchase.D_failureBetweenDeliveryAndDebit.rowsCreated === 1 && purchase.D_failureBetweenDeliveryAndDebit.coinsDebited === 0, purchase.D_failureBetweenDeliveryAndDebit);
check('compra E: item já possuído fora da rotação pode ser comprado de novo', purchase.E_outOfRotationButOwned.ok, purchase.E_outOfRotationButOwned);
check('venda F: crédito concorrente sobrescrito pelo saldo absoluto da venda', purchase.F_sellOverwritesConcurrentCredit.lost === 500, purchase.F_sellOverwritesConcurrentCredit);
check('9B: comprar e equipar o melhor kit não altera o atributo-base; efetivo = base + modificador (≤ 100)', purchase.H_equipTopKit.baseUnchanged && purchase.H_equipTopKit.applied === purchase.H_equipTopKit.declared, purchase.H_equipTopKit);

// Persistência: recarrega o runtime a partir do storage e compara.
{
  const before = { p: await P(), inv: (await invOf()).map((r) => [r.id, r.item_id, r.equipped]).sort() };
  rt = await quiet(() => reloadCareer(rt, storage, careerId));
  E = rt.localGame.entities;
  const EM2 = await rt.load('/src/lib/equipmentModifiers.js');
  const after = { p: await E.PlayerProfile.get(booted.profile.id), inv: ((await E.PlayerInventory.filter({ profile_id: booted.profile.id })) || []).map((r) => [r.id, r.item_id, r.equipped]).sort() };
  const modsAfter = EM2.computeEquipmentModifiers(await E.PlayerInventory.filter({ profile_id: booted.profile.id }), await E.ShopItem.list());
  purchase.I_saveLoad = { inventoryIdentical: JSON.stringify(before.inv) === JSON.stringify(after.inv), baseIdentical: ATTRS.every((k) => before.p[k] === after.p[k]), coinsIdentical: before.p.coins === after.p.coins, effectiveOvrAfter: ovr(EM2.applyEquipmentModifiers(after.p, modsAfter)) };
  check('persistência: save → load preserva inventário, flags de equipado, base, saldo e efetivo', purchase.I_saveLoad.inventoryIdentical && purchase.I_saveLoad.baseIdentical && purchase.I_saveLoad.coinsIdentical && purchase.I_saveLoad.effectiveOvrAfter === purchase.H_equipTopKit.effectiveOvr, purchase.I_saveLoad);
}
await rt.close();

// ══ 7. Valor esportivo no motor real ══════════════════════════════════════════
const impact = { matchesPerScenario: MATCHES, design: 'pareado: mesmas seeds, mesmo parceiro e adversários com atributos planos no nível do fixture; só o modificador do jogador muda. IC 95% da diferença pareada.' };
if (!SKIP_ENGINE) {
  const pure = await bootModules();
  try {
    const PEM = await pure.load('/src/lib/equipmentModifiers.js');
    const { createMatch, playPoint } = await pure.load('/src/lib/matchEngine.js');
    const training = await pure.load('/src/lib/trainingSystemV2.js');
    const shopById = new Map(catalog.map((i) => [i.id, { id: i.id, category: i.category, attribute_bonus: i.bonus }]));
    const kitMods = (items) => PEM.computeEquipmentModifiers(items.map((it, k) => ({ id: `k${k}`, item_id: it.id, equipped: true })), shopById);
    const run = (key, base, mods, level) => {
      const me = { ...PEM.applyEquipmentModifiers(base, mods), _chemistryBonus: 0 };
      const mk = (id) => ({ id, name: id, ...Object.fromEntries(ATTRS.map((k) => [k, level])), energy: 100, morale: 70 });
      const partner = mk(`9c1-p-${level}`); const opp = [mk(`9c1-o1-${level}`), mk(`9c1-o2-${level}`)];
      let out = ''; let pa = 0; let pt = 0;
      for (let i = 0; i < MATCHES; i += 1) {
        let s = createMatch([me, partner], opp, { seed: `local-9c1-${level}-${i}` });
        let g = 0; while (!s.finished && g < 3000) { s = playPoint(s); g += 1; }
        out += s.winner === 'A' ? '1' : '0';
        const a = s.stats?.teams?.A?.pointsWon; const b = s.stats?.teams?.B?.pointsWon; if (a != null && b != null) { pa += a; pt += a + b; }
      }
      return { key, effectiveOvr: ovr(me), winRate: +(out.split('').filter((x) => x === '1').length / MATCHES).toFixed(4), pointShare: pt ? +(pa / pt).toFixed(4) : null, out };
    };
    const paired = (row, baseRow) => {
      let up = 0; let down = 0;
      for (let i = 0; i < MATCHES; i += 1) { if (row.out[i] === '1' && baseRow.out[i] === '0') up += 1; if (row.out[i] === '0' && baseRow.out[i] === '1') down += 1; }
      const d = (up - down) / MATCHES; const se = Math.sqrt(Math.max(0, (up + down) / MATCHES - d * d) / MATCHES);
      return { deltaPp: r1(d * 100), ci95: [r1((d - 1.96 * se) * 100), r1((d + 1.96 * se) * 100)], deltaPointSharePp: row.pointShare != null ? +(((row.pointShare - baseRow.pointShare) * 100).toFixed(2)) : null };
    };
    const strip = (row) => { const { out, ...rest } = row; return rest; };
    const levels = { iniciante_30: 30, intermediario_50: 50, avancado_75: 75 };
    const cheapestPositive = (filter) => CATS.map((c) => catalog.filter((i) => i.category === c && i.bonusTotal > 0 && filter(i)).sort((a, b) => a.pricePerPoint - b.pricePerPoint || a.listPrice - b.listPrice)[0]).filter(Boolean);
    const KITS = {
      K0_sem_equipamento: [],
      K1_economico_comum: kitOf((i) => i.source === 'storeCatalog' && i.rarity === 'comum'),
      K2_intermediario_raro: kitOf((i) => i.source === 'storeCatalog' && i.rarity === 'raro'),
      K3_avancado_epico: kitOf((i) => i.source === 'storeCatalog' && i.rarity === 'epico'),
      K4_premium_mitico: kitOf((i) => i.source === 'storeCatalog' && i.rarity === 'mitico'),
      K5_topo_catalogo: kitOf((i) => i.source === 'storeCatalog'),
      K6_com_reliquias: kitOf(() => true),
      K7_so_raquete_mitica: kitOf((i) => i.source === 'storeCatalog' && i.rarity === 'mitico' && i.category === 'raquete'),
    };
    impact.kits = Object.fromEntries(Object.entries(KITS).map(([k, items]) => [k, { ...kitSummary(items), modifiers: kitMods(items) }]));
    impact.economicPicks = cheapestPositive((i) => ['comum', 'incomum'].includes(i.rarity)).map((i) => ({ name: i.name, price: i.listPrice, bonus: i.bonusTotal }));
    impact.byLevel = {};
    for (const [lk, level] of Object.entries(levels)) {
      const base = Object.fromEntries(ATTRS.map((k) => [k, level]));
      const baseRow = run('K0', base, {}, level);
      const kits = {};
      for (const [k, items] of Object.entries(KITS)) {
        const row = k === 'K0_sem_equipamento' ? baseRow : run(k, base, kitMods(items), level);
        kits[k] = { ...strip(row), cost: impact.kits[k].cost, declaredOvr: impact.kits[k].declaredOvr, ...(k === 'K0_sem_equipamento' ? {} : paired(row, baseRow)) };
        if (k !== 'K0_sem_equipamento') kits[k].coinsPerPp = kits[k].deltaPp > 0 ? Math.round(kits[k].cost / kits[k].deltaPp) : null;
      }
      // Referência: OVR natural plano +k em todos os atributos (o que o treino daria).
      const flat = {};
      for (const k of [1, 2, 4, 8]) {
        const row = run(`flat+${k}`, Object.fromEntries(ATTRS.map((a) => [a, level + k])), {}, level);
        flat[`+${k}_ovr_natural`] = { ...strip(row), ...paired(row, baseRow) };
      }
      // Valor marginal por atributo: +5 num atributo só.
      const perAttr = {};
      for (const a of ATTRS) {
        const row = run(`attr-${a}`, base, { [a]: 5 }, level);
        perAttr[a] = { ...paired(row, baseRow), winRate: row.winRate };
      }
      impact.byLevel[lk] = { level, kits, flatNatural: flat, perAttributePlus5: perAttr };
      console.log(`  motor ${lk}: ${Object.entries(kits).map(([k, v]) => `${k.split('_')[0]} ${v.deltaPp ?? 0}pp`).join(' · ')}`);
    }
    // Atributos que o motor de rali não lê individualmente (RallyEngine.skill / DecisionEngine).
    impact.attributesWithoutMatchEffect = ATTRS.filter((a) => Object.values(impact.byLevel).every((L) => L.perAttributePlus5[a].deltaPp === 0 && L.perAttributePlus5[a].deltaPointSharePp === 0));
    check(`motor: +5 em agilidade não muda nenhum ponto em nenhum nível (${impact.attributesWithoutMatchEffect.join(', ')})`, impact.attributesWithoutMatchEffect.includes('agility'), impact.attributesWithoutMatchEffect);
    // Repetição para determinismo.
    {
      const base = Object.fromEntries(ATTRS.map((k) => [k, 50]));
      const a = run('det', base, kitMods(KITS.K5_topo_catalogo), 50); const b = run('det', base, kitMods(KITS.K5_topo_catalogo), 50);
      check('motor: mesmas seeds → resultados idênticos (determinismo)', a.out === b.out);
    }
    // Equivalência treino × equipamento: sessões de treino para +k OVR natural (funções puras reais).
    {
      const acts = ['court', 'physical', 'mental'].flatMap((cat) => training.TRAINING_ACTIVITIES.filter((x) => x.category === cat).slice(0, 2));
      const startLevels = [22, 40, 60];
      impact.trainingEquivalence = startLevels.map((lv) => {
        let p = { id: 'probe', potential: 75, play_style: 'equilibrado', fatigue: 0, energy: 100, morale: 70, attribute_progress: {}, ...Object.fromEntries(ATTRS.map((k) => [k, lv])) };
        const start = ovr(p); const hits = {};
        for (let s = 1; s <= 4000; s += 1) {
          const prev = training.previewTraining(p, acts[s % acts.length], 'moderado', 0, {});
          const { updates, progress } = training.applyAttributeGains(p, prev.gains);
          p = { ...p, ...updates, attribute_progress: progress };
          const g = ovr(p) - start;
          for (const k of [1, 2, 4, 8]) if (hits[k] == null && g >= k) hits[k] = s;
        }
        return { startOvr: start, sessionsFor: hits, ovrAfter4000: ovr(p) };
      });
    }
  } finally { await pure.close(); }
}
write('equipment-impact.json', { generatedBy: 'tools/live-market-audit.mjs', ...impact });

// ══ 8. Economia (baseline 9E.1 + H1, sem rodar carreiras novas) ════════════════
const sum9e1 = JSON.parse(readFileSync(resolve(ROOT, 'reports/local-9e1-decision-simulator/summary.json'), 'utf8'));
const h1 = JSON.parse(readFileSync(resolve(ROOT, 'reports/local-9e1-h1-sponsorship-renewal/economy-before-after.json'), 'utf8'));
const groups = sum9e1.groups.filter((g) => g.days >= 365).map((g) => ({ days: g.days, profile: g.profile, seeds: g.seeds, netWorth: g.netWorth.mean, finalCoins: g.finalCoins.mean, totalIncome: g.totalIncome.mean, totalExpense: g.totalExpense.mean, income: g.income, expense: g.expense, equipmentSpend: g.equipmentSpend.mean, purchases: g.purchases.mean, coinsPerEffectivePoint: g.coinsPerEffectivePoint.mean, equipApplied: g.equipApplied.mean, ovrBaseEnd: g.ovrBaseEnd.mean, ovrEffectiveEnd: g.ovrEffectiveEnd.mean, rankEnd: g.rankEnd.mean, sponsorMonthlyEnd: g.sponsorMonthlyEnd.mean }));
const careers = sum9e1.careers.filter((c) => c.days >= 365).map((c) => ({ profile: c.profile, seed: c.seed, days: c.days, careerLevel: c.sport.careerLevel, rankEnd: c.sport.rankEnd, ovrBaseEnd: c.sport.ovrBaseEnd, purchasesByRarity: c.finance.purchasesByRarity, minCoins: c.finance.minCoins, finalCoins: c.finance.finalCoins }));
const kitCosts = rarityRows.map((r) => ({ rarity: r.rarity, kitCost: r.kit.cost, kitDeclaredOvr: r.kit.declaredOvr, categories: r.kit.items }));
const monthlyNet = (g) => (g.totalIncome - (g.totalExpense - (g.expense.equipamento || 0))) / (g.days / 30.4);
const timeToBuy = groups.map((g) => ({ profile: g.profile, days: g.days, monthlyIncome: Math.round(g.totalIncome / (g.days / 30.4)), monthlySurplusBeforeEquipment: Math.round(monthlyNet(g)), monthsToKit: Object.fromEntries(kitCosts.map((k) => [k.rarity, monthlyNet(g) > 0 ? r1(k.kitCost / monthlyNet(g)) : null])) }));
const comparability = {
  baseline: '9E.1 (633298b, pré-H1)',
  hotfix: 'H1/H1-R1 (b24eef3): renovação de patrocínio limitada à janela de 30 dias, assinatura idempotente, carência de 90 dias após rescisão voluntária',
  verdict: 'O simulador 9E.1 já só renovava nos últimos 30 dias e nunca rescindia: o exploit não entrou na baseline. 30 dias: hashes idênticos. 365 dias: renovações 69 → 67, luvas e salários iguais em ordem de grandeza; diferenças de ranking vêm do deslocamento do RNG (id determinístico), não da regra.',
  comparable: ['receita por categoria (ordem de grandeza)', 'gasto com equipamento e moedas por ponto efetivo (a política de compra não mudou; 30 d idênticos)', 'participação do patrocínio na receita', 'raridades compradas por perfil'],
  notExactlyComparable: ['hashes e números exatos de 365/730 d (RNG deslocado)', 'ranking final por seed (variação caótica)', 'patrimônio do equilibrado em 365 d (−2,4 mil, quase todo da seed 3)'],
  h1Profiles365: h1.careers365d ? h1.careers365d.map((c) => ({ k: c.k, sameHash: c.sameHash, before: { final: c.b?.final, rank: c.b?.rank, inc: c.b?.inc, exp: c.b?.exp }, after: { final: c.a?.final, rank: c.a?.rank, inc: c.a?.inc, exp: c.a?.exp } })) : null,
};
write('economy-progression.json', { generatedBy: 'tools/live-market-audit.mjs', source: ['reports/local-9e1-decision-simulator/summary.json', 'reports/local-9e1-h1-sponsorship-renewal/economy-before-after.json'], comparability, groups, careers, kitCosts, timeToBuy, availabilityByStage: availability });

write('tests.json', { generatedBy: 'tools/live-market-audit.mjs', seconds: Math.round((performance.now() - t0) / 1000), passed: tests.filter((t) => t.ok).length, total: tests.length, tests });
console.log(`\nLOCAL-9C.1 auditoria: ${tests.filter((t) => t.ok).length}/${tests.length} verificações · ${Math.round((performance.now() - t0) / 1000)} s`);
process.exit(0);
