// LOCAL-9A — extração somente-leitura do catálogo REAL da Loja e das regras econômicas.
// Carreira nova em storage de MEMÓRIA (scripts/lib/v526bTestKit.mjs): nenhum save do usuário,
// nenhum IndexedDB, nenhum código de produção alterado. O catálogo vem do mesmo caminho da
// ativação da carreira (seedMarket + ensureExpandedShopCatalog) e é lido de ShopItem.
// Uso: node reports/local-9a-equipment-sponsorship-audit/tools/catalog-economy-extract.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootCareer } from '../../../scripts/lib/v526bTestKit.mjs';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(OUT, { recursive: true });

const { rt, profile } = await bootCareer('local-9a-catalog');
try {
  const store = await rt.load('/src/lib/storeCatalog.js');
  const market = await rt.load('/src/lib/marketEngine.js');
  const eco26 = await rt.load('/src/lib/sportsEconomyV26.js');
  const sponsors = await rt.load('/src/lib/sponsors.js');
  const circuit = await rt.load('/src/lib/circuitCatalog.js');
  const balance = await rt.load('/src/lib/balance527.js');
  const training = await rt.load('/src/lib/trainingEconomy.js');
  const staff = await rt.load('/src/lib/staffCatalog.js');
  const coaches = await rt.load('/src/lib/coaches.js');
  const { ATTRIBUTE_KEYS } = await rt.load('/src/lib/attributes.js');
  const E = rt.localGame.entities;

  await market.seedMarket(profile.career_date);
  await store.ensureExpandedShopCatalog();
  const raw = (await E.ShopItem.list('catalog_order', 2000)) || [];
  const histories = (await E.MarketPriceHistory.filter({})) || [];
  const histMap = Object.fromEntries(histories.map((h) => [h.item_id, h]));
  const preset = balance.getBalance527();

  // Disponibilidade mensal medida em 120 meses (2026-01..2035-12) com a regra real.
  const months = Array.from({ length: 120 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-15`);
  const items = raw.map((item) => {
    const n = store.normalizeShopItem(item);
    const bonus = n.attribute_bonus || {};
    const bonusTotal = Object.values(bonus).reduce((s, v) => s + (Number(v) || 0), 0);
    const orphanKeys = Object.keys(bonus).filter((k) => !ATTRIBUTE_KEYS.includes(k));
    const availableMonths = months.filter((d) => eco26.getEquipmentMarketState(n, { career_date: d }).available).length;
    const priceDay1 = market.computeItemPrice(n, [], histMap[n.id] || null, [], '2026-01-01').currentPrice;
    return {
      id: n.id, name: n.name, category: n.category, subcategory: n.subcategory, rarity: n.rarity, manufacturer: n.manufacturer,
      sponsor_id: n.sponsor_id || null, stored_price: Number(item.price) || null, price: n.price, price_no_events_day1: priceDay1,
      bonus, bonusTotal, orphanKeys, pricePerBonusPoint: bonusTotal > 0 ? Math.round(n.price / bonusTotal) : null,
      min_career_level: n.min_career_level, max_ranking: n.max_ranking, min_reputation: n.min_reputation,
      release_year: n.release_year ?? null, is_exclusive: Boolean(n.is_exclusive), catalog_order: item.catalog_order ?? null,
      limited_stock: Boolean(histMap[n.id]?.is_limited_stock), stock_remaining: histMap[n.id]?.stock_remaining ?? null,
      monthly_availability_pct: Math.round((availableMonths / months.length) * 100),
      source: item.catalog_order != null ? 'storeCatalog' : String(item.id).startsWith('historical-relic-') ? 'marketEngine.HISTORICAL_RARE_ITEMS' : String(item.id).startsWith('shop-') ? 'localSeed' : 'outro',
    };
  });

  const byCategory = {}; const byRarity = {}; const brands = {};
  for (const it of items) {
    byCategory[it.category] = (byCategory[it.category] || 0) + 1;
    byRarity[it.rarity] = (byRarity[it.rarity] || 0) + 1;
    brands[it.manufacturer] = (brands[it.manufacturer] || 0) + 1;
  }
  const attrUsage = Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, items.filter((i) => i.bonus[k]).length]));
  const bestPerCategory = {};
  for (const it of items) {
    const cur = bestPerCategory[it.category];
    if (!cur || it.bonusTotal > cur.bonusTotal || (it.bonusTotal === cur.bonusTotal && it.price < cur.price)) bestPerCategory[it.category] = { name: it.name, rarity: it.rarity, bonusTotal: it.bonusTotal, price: it.price, source: it.source };
  }

  // Economia: tabelas reais.
  const tiers = Object.entries(circuit.TOURNAMENT_TIER_CONFIG).map(([key, t]) => ({
    key, label: t.shortLabel || t.label || key, entryFee: t.entryFee, rankPoints: t.rankPoints, championPrize: t.prize,
    roundCoins: t.roundCoins, minRanking: t.minRanking ?? null, maxRanking: t.maxRanking ?? null, eventsPerYear: circuit.TIER_EVENTS_PER_YEAR?.[key] ?? null,
  }));
  const sponsorRows = sponsors.SPONSOR_CATALOG.map((s) => ({
    id: s.id, name: s.name, tier: s.tier, industry: s.industry, slot: sponsors.getSponsorCategory(s),
    base_monthly_value: s.base_monthly_value, base_sign_bonus: s.base_sign_bonus,
    offer_monthly_range_balanced: [Math.round(s.base_monthly_value * 0.7 * preset.sponsor.monthlyMultiplier), Math.round(s.base_monthly_value * 1.3 * 1.45 * preset.sponsor.monthlyMultiplier)],
    offer_sign_range_balanced: [Math.round(s.base_sign_bonus * 0.7 * preset.sponsor.signMultiplier), Math.round(s.base_sign_bonus * 1.3 * 1.45 * preset.sponsor.signMultiplier)],
    min_age: s.min_age, max_age: s.max_age, min_xp: s.min_xp, min_titles: s.min_titles, min_fan_appeal: s.min_fan_appeal,
    duration_months: s.contract_duration_months, renewal_bonus_pct: s.renewal_bonus_pct,
    goals: (s.commercial_goals || []).map((g) => `${g.type}≥${g.target}/${g.period} +${g.reward}/${g.penalty}`),
    clauses: s.performance_clauses, marketing: s.marketing_requirements, has_shop_items: items.some((i) => i.sponsor_id === s.id),
  }));
  const staffCosts = staff.STAFF_MARKET.map((c) => c.monthlyCost);
  const coachSalaries = coaches.COACHES_DATA.map((c) => ({ tier: c.tier, salary: coaches.resolveCoachCanonicalSalary(c) })).filter((c) => c.salary > 0);
  const coachByTier = {};
  for (const c of coachSalaries) { (coachByTier[c.tier] ||= []).push(c.salary); }
  const summarize = (arr) => { const s = [...arr].sort((a, b) => a - b); return { n: s.length, min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1] }; };

  const result = {
    generatedBy: 'LOCAL-9A catalog-economy-extract', preset: preset.id, careerStart: profile.career_date, startingCoinsProfile: profile.coins,
    shopPriceMultiplier: preset.shopPriceMultiplier, shopBonusMultiplier: preset.shopBonusMultiplier, shopProgression: store.SHOP_PROGRESSION,
    counts: { total: items.length, byCategory, byRarity, brands, bySource: items.reduce((a, i) => ((a[i.source] = (a[i.source] || 0) + 1), a), {}) },
    attributeUsage: attrUsage, bestPerCategory,
    itemsWithoutBonus: items.filter((i) => i.bonusTotal === 0).map((i) => `${i.name} (${i.source})`),
    itemsWithOrphanKeys: items.filter((i) => i.orphanKeys.length).map((i) => `${i.name}: ${i.orphanKeys.join(',')}`),
    economy: {
      tiers, matchRewardCoins: { win: 30, loss: 10, source: 'padel.js buildMatchRewardsPatch' },
      trainingCostByStage: training.TRAINING_BASE_COST_BY_STAGE, trainingIntensity: training.TRAINING_COST_INTENSITY_MULTIPLIER,
      sponsorMultipliers: preset.sponsor, sponsors: sponsorRows, sponsorSlots: sponsors.SPONSOR_SLOT_LIMITS,
      staffMonthlyCostBase: summarize(staffCosts), staffMultiplier: preset.staffMultiplier,
      coachSalaryByTier: Object.fromEntries(Object.entries(coachByTier).map(([t, a]) => [t, summarize(a)])),
      prizeMultiplier: preset.prizeMultiplier, investmentRateMultiplier: preset.investmentRateMultiplier,
    },
    items,
  };
  writeFileSync(resolve(OUT, 'catalog-economy.json'), JSON.stringify(result, null, 1));

  const fmt = (b) => Object.entries(b).map(([k, v]) => `${k}+${v}`).join(' ') || '—';
  const req = (i) => `nível ${i.min_career_level}${i.max_ranking ? ` · Top ${i.max_ranking}` : ''}${i.min_reputation ? ` · rep ${i.min_reputation}` : ''}`;
  const avail = (i) => (i.limited_stock ? `estoque ${i.stock_remaining} · ` : '') + `${i.monthly_availability_pct}% dos meses`;
  const order = ['raquete', 'grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'acessorio', 'colecionavel'];
  const rar = ['comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico', 'exclusivo'];
  const sorted = [...items].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || rar.indexOf(a.rarity) - rar.indexOf(b.rarity) || a.price - b.price);
  const lines = ['| Item | Categoria | Raridade | Marca | Preço | Bônus | Requisito | Disponibilidade | Origem |', '|---|---|---|---|---:|---|---|---|---|'];
  for (const i of sorted) lines.push(`| ${i.name} | ${i.category} | ${i.rarity} | ${i.manufacturer} | ${i.price.toLocaleString('pt-BR')} | ${fmt(i.bonus)} | ${req(i)} | ${avail(i)} | ${i.source} |`);
  writeFileSync(resolve(OUT, 'catalog-table.md'), `# Catálogo real da Loja (LOCAL-9A)\n\nPreço = \`normalizeShopItem\` (piso da raridade × ${preset.shopPriceMultiplier} do preset ${preset.id}), antes de eventos/demanda/desconto. Disponibilidade = meses em que \`getEquipmentMarketState\` libera o item, medido de 2026-01 a 2035-12 sem patrocínio da marca.\n\n${lines.join('\n')}\n`);
  console.log(JSON.stringify({ total: items.length, byCategory, byRarity, brands: Object.keys(brands).length, bySource: result.counts.bySource, noBonus: result.itemsWithoutBonus.length }, null, 1));
} finally {
  await rt.close();
}
