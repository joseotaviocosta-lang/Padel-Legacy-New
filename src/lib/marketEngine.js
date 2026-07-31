// ─── Living Market Engine ─────────────────────────────────────────────────────
// Computes dynamic prices based on demand, supply, events, sponsorships & volatility

import { localGame } from '@/api/localGameClient.js';
import { RARITY_STYLES } from '@/lib/equipmentCatalog';

// ─── Price Computation ────────────────────────────────────────────────────────

/**
 * Computes the dynamic price for a shop item based on active market events,
 * price history, demand/supply, and player's active sponsors.
 *
 * @param {Object} item - ShopItem entity
 * @param {Array} marketEvents - Active MarketEvent entities
 * @param {Object|null} priceHistory - MarketPriceHistory for this item (optional)
 * @param {Array} playerSponsors - Active sponsor names from PlayerContract
 * @returns {Object} { currentPrice, basePrice, modifier, discount, badge, trend, demandScore, events }
 */
export function computeItemPrice(item, marketEvents = [], priceHistory = null, playerSponsors = []) {
  const parsedBasePrice = Number(item?.price);
  const basePrice = Number.isFinite(parsedBasePrice) && parsedBasePrice > 0 ? parsedBasePrice : 100;
  let modifier = 1;
  let demandBonus = 0;
  let appliedEvents = [];

  // 1. Apply active market events
  for (const ev of marketEvents) {
    if (!ev.is_active) continue;
    // Check if event affects this item
    if (ev.affected_item_ids?.length > 0 && !ev.affected_item_ids.includes(item.id)) continue;
    if (ev.affected_categories?.length > 0 && !ev.affected_categories.includes(item.category)) continue;
    if (ev.affected_manufacturers?.length > 0 && !ev.affected_manufacturers.includes(item.manufacturer)) continue;
    if (ev.affected_rarities?.length > 0 && !ev.affected_rarities.includes(item.rarity)) continue;

    const eventModifier = Number(ev?.price_modifier);
    modifier *= Number.isFinite(eventModifier) && eventModifier > 0 ? eventModifier : 1;
    demandBonus += ev.demand_modifier || 0;
    appliedEvents.push(ev);
  }

  // 2. Apply demand/supply from price history
  const parsedDemand = Number(priceHistory?.demand_score);
  const parsedSupply = Number(priceHistory?.supply_level);
  let demandScore = Number.isFinite(parsedDemand) ? parsedDemand : 50;
  let supplyLevel = Number.isFinite(parsedSupply) ? parsedSupply : 50;

  // High demand → price up, Low supply → price up
  const demandFactor = 1 + ((demandScore - 50) / 100) * 0.4; // ±20%
  const supplyFactor = 1 + ((50 - supplyLevel) / 100) * 0.3; // ±15%
  modifier *= demandFactor * supplyFactor;

  // 3. Player sponsor discount (if item manufacturer matches active sponsor)
  let sponsorDiscount = 0;
  if (playerSponsors.length > 0) {
    // Map sponsor names to manufacturers (fuzzy)
    const sponsorMatch = playerSponsors.some(s =>
      String(item?.manufacturer || '').toLowerCase().includes(String(s || '').toLowerCase()) ||
      String(s || '').toLowerCase().includes(String(item?.manufacturer || '').toLowerCase())
    );
    if (sponsorMatch) {
      sponsorDiscount = 0.1; // 10% off for sponsored brands
      modifier *= (1 - sponsorDiscount);
    }
  }

  // 4. Rarity-based volatility (rarer = more volatile)
  const rarityVolatility = {
    comum: 0, incomum: 0.02, raro: 0.05, epico: 0.08,
    lendario: 0.12, mitico: 0.18, exclusivo: 0.25,
  };
  const vol = rarityVolatility[item.rarity] || 0;
  // Deterministic pseudo-random based on item id + current day
  const day = new Date().getDate();
  const seed = (item.id?.charCodeAt(item.id.length - 1) || 1) * day;
  const randomSwing = vol * Math.sin(seed) * 0.5;
  modifier *= (1 + randomSwing);

  // 5. Limited stock premium
  if (priceHistory?.is_limited_stock && priceHistory?.stock_remaining >= 0) {
    const stockFactor = 1 + (1 - priceHistory.stock_remaining / 100) * 0.3;
    modifier *= stockFactor;
  }

  // Clamp modifier
  if (!Number.isFinite(modifier) || modifier <= 0) modifier = 1;
  modifier = Math.max(0.3, Math.min(3.0, modifier));

  const currentPrice = Math.max(1, Math.round(basePrice * modifier));
  const discount = currentPrice < basePrice
    ? Math.round((1 - currentPrice / basePrice) * 100)
    : 0;
  const premium = currentPrice > basePrice
    ? Math.round((currentPrice / basePrice - 1) * 100)
    : 0;

  // Determine badge from highest-priority event
  let badge = null;
  if (appliedEvents.length > 0) {
    const topEvent = appliedEvents.sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
    badge = {
      label: topEvent.badge_label || topEvent.title,
      color: topEvent.badge_color || 'primary',
    };
  } else if (discount >= 30) {
    badge = { label: 'OFERTA', color: 'green' };
  } else if (premium >= 20) {
    badge = { label: 'EM ALTA', color: 'red' };
  }

  // Trend from price history
  let trend = priceHistory?.trend || 'estavel';

  return {
    currentPrice,
    basePrice,
    modifier,
    discount,
    premium,
    badge,
    trend,
    demandScore: Math.max(0, Math.min(100, demandScore + demandBonus)),
    events: appliedEvents,
    sponsorDiscount: sponsorDiscount > 0 ? Math.round(sponsorDiscount * 100) : 0,
  };
}

// ─── Badge Colors ─────────────────────────────────────────────────────────────

export const BADGE_COLORS = {
  green: 'border-green-500/40 bg-green-500/15 text-green-400',
  red: 'border-red-500/40 bg-red-500/15 text-red-400',
  amber: 'border-amber-500/40 bg-amber-500/15 text-amber-400',
  cyan: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-400',
  purple: 'border-purple-500/40 bg-purple-500/15 text-purple-400',
  primary: 'border-primary/40 bg-primary/15 text-primary',
};

// ─── Event Type Metadata ─────────────────────────────────────────────────────

export const EVENT_TYPE_META = {
  lancamento: { emoji: '🚀', label: 'Lançamento', color: 'cyan', defaultModifier: 1.15 },
  promocao: { emoji: '🏷️', label: 'Promoção', color: 'green', defaultModifier: 0.85 },
  liquidacao: { emoji: '📉', label: 'Liquidação', color: 'red', defaultModifier: 0.6 },
  escassez: { emoji: '⚠️', label: 'Escassez', color: 'amber', defaultModifier: 1.4 },
  patrocinio: { emoji: '🤝', label: 'Patrocinado', color: 'primary', defaultModifier: 0.9 },
  sazonal: { emoji: '🎉', label: 'Sazonal', color: 'purple', defaultModifier: 0.8 },
  flash_sale: { emoji: '⚡', label: 'Flash Sale', color: 'amber', defaultModifier: 0.5 },
  historico: { emoji: '🏛️', label: 'Histórico', color: 'purple', defaultModifier: 1.5 },
  febre: { emoji: '🔥', label: 'Febre', color: 'red', defaultModifier: 1.3 },
  exclusivo: { emoji: '💎', label: 'Exclusivo', color: 'cyan', defaultModifier: 1.2 },
};

// ─── Market Tick (Daily Processing) ──────────────────────────────────────────

/**
 * Processes a daily market tick: updates demand, supply, prices, and generates
 * random events. Called when the player advances a day.
 * @param {string} careerDate - Current career date (YYYY-MM-DD)
 */
export async function processMarketTick(careerDate) {
  const today = careerDate || new Date().toISOString().slice(0, 10);

  // 1. Expire old events
  const activeEvents = await localGame.asServiceRole.entities.MarketEvent.filter({ is_active: true });
  for (const ev of activeEvents) {
    if (ev.end_date && ev.end_date < today) {
      await localGame.asServiceRole.entities.MarketEvent.update(ev.id, { is_active: false });
    }
  }

  // 2. Update price histories with demand/supply drift
  const histories = await localGame.asServiceRole.entities.MarketPriceHistory.filter({}, '-last_updated_date', 200);
  const updates = [];
  for (const h of histories) {
    // Demand drift toward 50 (mean reversion)
    const demandDrift = (50 - h.demand_score) * 0.05;
    const supplyDrift = (50 - h.supply_level) * 0.05;
    const newDemand = Math.max(0, Math.min(100, (h.demand_score || 50) + demandDrift + (Math.random() - 0.5) * 5));
    const newSupply = Math.max(0, Math.min(100, (h.supply_level || 50) + supplyDrift + (Math.random() - 0.5) * 5));

    // Recompute price
    const demandFactor = 1 + ((newDemand - 50) / 100) * 0.4;
    const supplyFactor = 1 + ((50 - newSupply) / 100) * 0.3;
    const newPrice = Math.max(1, Math.round(h.base_price * demandFactor * supplyFactor));

    // Determine trend
    let trend = 'estavel';
    const priceDiff = newPrice - (h.current_price || h.base_price);
    if (Math.abs(priceDiff) > h.base_price * 0.05) {
      trend = priceDiff > 0 ? 'subindo' : 'descendo';
    }

    // Update price history array (keep last 30 entries)
    const hist = [...(h.price_history || []), { date: today, price: newPrice }].slice(-30);

    updates.push(localGame.asServiceRole.entities.MarketPriceHistory.update(h.id, {
      previous_price: h.current_price || h.base_price,
      current_price: newPrice,
      demand_score: newDemand,
      supply_level: newSupply,
      trend,
      price_history: hist,
      all_time_low: Math.min(h.all_time_low || newPrice, newPrice),
      all_time_high: Math.max(h.all_time_high || newPrice, newPrice),
      last_updated_date: today,
    }));
  }
  await Promise.all(updates);

  // 3. Generate random events (30% chance per tick)
  if (Math.random() < 0.3) {
    await generateRandomEvent(today);
  }

  return { expired: activeEvents.length, updated: histories.length };
}

// ─── Random Event Generation ─────────────────────────────────────────────────

const RANDOM_EVENTS = [
  {
    event_type: 'flash_sale',
    title: '⚡ Flash Sale Relâmpago',
    description: 'Descontos absurdos por tempo limitado! Aproveite antes que acabe.',
    badge_label: 'FLASH',
    badge_color: 'amber',
    image_emoji: '⚡',
    price_modifier: 0.5,
    duration_days: 2,
    priority: 10,
  },
  {
    event_type: 'liquidacao',
    title: '📉 Liquidação de Estoque',
    description: 'Liquidação geral! Marcas fazendo espaço para novos lançamentos.',
    badge_label: 'LIQUIDAÇÃO',
    badge_color: 'red',
    image_emoji: '📉',
    price_modifier: 0.6,
    duration_days: 5,
    priority: 8,
  },
  {
    event_type: 'escassez',
    title: '⚠️ Escassez de Material',
    description: 'Cadeia de suprimentos interrompida. Preços em alta.',
    badge_label: 'ESCASSO',
    badge_color: 'amber',
    image_emoji: '⚠️',
    price_modifier: 1.4,
    duration_days: 4,
    priority: 7,
  },
  {
    event_type: 'febre',
    title: '🔥 Febre do Padel',
    description: 'O padel está bombando! Demanda absurdamente alta.',
    badge_label: 'EM ALTA',
    badge_color: 'red',
    image_emoji: '🔥',
    price_modifier: 1.3,
    duration_days: 3,
    priority: 6,
  },
  {
    event_type: 'lancamento',
    title: '🚀 Novo Lançamento',
    description: 'Linha recém-lançada disponível! Preço premium de lançamento.',
    badge_label: 'LANÇAMENTO',
    badge_color: 'cyan',
    image_emoji: '🚀',
    price_modifier: 1.15,
    duration_days: 7,
    priority: 5,
  },
  {
    event_type: 'sazonal',
    title: '🎉 Promoção Sazonal',
    description: 'Celebração especial! Descontos em categorias selecionadas.',
    badge_label: 'SAZONAL',
    badge_color: 'purple',
    image_emoji: '🎉',
    price_modifier: 0.8,
    duration_days: 5,
    priority: 5,
  },
  {
    event_type: 'patrocinio',
    title: '🤝 Oferta Patrocinada',
    description: 'Marca parceira com desconto especial para atletas patrocinados.',
    badge_label: 'PATROCINADO',
    badge_color: 'primary',
    image_emoji: '🤝',
    price_modifier: 0.9,
    duration_days: 6,
    priority: 4,
  },
];

const ALL_CATEGORIES = ['raquete', 'grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'colecionavel', 'acessorio'];
const ALL_RARITIES = ['comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico', 'exclusivo'];
const SOME_MANUFACTURERS = ['Bullpadel', 'Nox', 'Head', 'Babolat', 'Adidas', 'Siux', 'Asics', 'Joma'];

async function generateRandomEvent(today) {
  const template = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];

  // Randomly select affected filters
  const pickRandom = (arr, count) => {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  };

  const useCategory = Math.random() > 0.3;
  const useManufacturer = Math.random() > 0.5;
  const useRarity = Math.random() > 0.6;

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + template.duration_days);

  await localGame.asServiceRole.entities.MarketEvent.create({
    ...template,
    affected_categories: useCategory ? pickRandom(ALL_CATEGORIES, 1 + Math.floor(Math.random() * 3)) : [],
    affected_manufacturers: useManufacturer ? pickRandom(SOME_MANUFACTURERS, 1 + Math.floor(Math.random() * 2)) : [],
    affected_rarities: useRarity ? pickRandom(ALL_RARITIES, 1 + Math.floor(Math.random() * 3)) : [],
    affected_item_ids: [],
    start_date: today,
    end_date: endDate.toISOString().slice(0, 10),
    is_active: true,
    created_date: today,
  });
}

// ─── Historical Rare Items Generator ─────────────────────────────────────────

export const HISTORICAL_RARE_ITEMS = [
  {
    name: 'Raquete de Madeira Original (1969)',
    description: 'Réplica da primeira raquete de padel usada por Enrique Corcuera no México.',
    category: 'raquete', subcategory: 'power', rarity: 'exclusivo', price: 250000,
    manufacturer: 'Padel Heritage', country: 'México', icon: 'Disc',
    attribute_bonus: { emotional_control: 15, strategy: 5, forehand: 3 },
    durability: 100, weight: 420, balance: 'alto', shape: 'redonda',
    release_year: 1969,
    history: 'Em 1969, Enrique Corcuera construiu a primeira quadra de padel em Acapulco, México. Esta raquete de madeira maciça representa o nascimento do esporte. Item de museu, extremamente raro.',
    is_available: false, is_exclusive: true, collection: 'Padel Origins',
  },
  {
    name: 'Raquete Vintage Marplatense (1975)',
    description: 'Raquete de madeira usada nos primórdios do padel argentino em Mar del Plata.',
    category: 'raquete', subcategory: 'control', rarity: 'exclusivo', price: 180000,
    manufacturer: 'Padel Heritage', country: 'Argentina', icon: 'Disc',
    attribute_bonus: { emotional_control: 12, strategy: 8, defense: 3 },
    durability: 100, weight: 400, balance: 'medio', shape: 'redonda',
    release_year: 1975,
    history: 'O padel chegou à Argentina em 1974 através de Julio Menditengui. Esta raquete representa a era pioneira do padel argentino, que se tornaria a maior potência do esporte.',
    is_available: false, is_exclusive: true, collection: 'Padel Origins',
  },
  {
    name: 'Raquete Espanhola Clássica (1980)',
    description: 'Primeira raquete com estrutura metálica fabricada na Espanha.',
    category: 'raquete', subcategory: 'hybrid', rarity: 'exclusivo', price: 150000,
    manufacturer: 'Padel Heritage', country: 'Espanha', icon: 'Disc',
    attribute_bonus: { emotional_control: 10, strategy: 6, volley: 3 },
    durability: 100, weight: 380, balance: 'medio', shape: 'lagrima',
    release_year: 1980,
    history: 'A Espanha adotou o padel em meados dos anos 70. Esta raquete marca a transição da madeira para materiais metálicos, revolucionando o esporte.',
    is_available: false, is_exclusive: true, collection: 'Padel Origins',
  },
  {
    name: 'Bola de Padel Original (1970)',
    description: 'Réplica da primeira bola de padel, feita de borracha natural.',
    category: 'bola', subcategory: 'premium', rarity: 'exclusivo', price: 80000,
    manufacturer: 'Padel Heritage', country: 'México', icon: 'Target',
    attribute_bonus: { emotional_control: 8, strategy: 4 },
    durability: 100, weight: 56, balance: 'medio', shape: 'redonda',
    release_year: 1970,
    history: 'As primeiras bolas de padel eram adaptadas de tennis e squash. Esta réplica celebra os primórdios do esporte quando tudo era improvisação.',
    is_available: false, is_exclusive: true, collection: 'Padel Origins',
  },
  {
    name: 'Raquete Carbono Pioneer (1995)',
    description: 'Primeira raquete com fibra de carbono, revolucionou o padel moderno.',
    category: 'raquete', subcategory: 'power', rarity: 'exclusivo', price: 120000,
    manufacturer: 'Padel Heritage', country: 'Espanha', icon: 'Disc',
    attribute_bonus: { smash: 10, forehand: 8, emotional_control: 5 },
    durability: 100, weight: 360, balance: 'alto', shape: 'diamante',
    release_year: 1995,
    history: 'A introdução do carbono nos anos 90 mudou o padel para sempre. Esta raquete representa o salto tecnológico que deu origem ao padel moderno de alta performance.',
    is_available: false, is_exclusive: true, collection: 'Padel Origins',
  },
  {
    name: 'Raquete WPT First Edition (2013)',
    description: 'Edição comemorativa do primeiro ano do World Padel Tour.',
    category: 'raquete', subcategory: 'hybrid', rarity: 'exclusivo', price: 90000,
    manufacturer: 'Padel Heritage', country: 'Espanha', icon: 'Disc',
    attribute_bonus: { strategy: 8, emotional_control: 8, volley: 5 },
    durability: 100, weight: 365, balance: 'medio', shape: 'lagrima',
    release_year: 2013,
    history: 'O World Padel Tour foi fundado em 2013, profissionalizando o circuito mundial. Esta raquete comemora o início da era profissional do padel.',
    is_available: false, is_exclusive: true, collection: 'Padel Origins',
  },
  {
    name: 'Troféu Primeiro Campeão Mundial (1992)',
    description: 'Réplica do troféu do primeiro Campeonato Mundial de Padel em 1992.',
    category: 'colecionavel', subcategory: 'trofeu', rarity: 'exclusivo', price: 300000,
    manufacturer: 'Padel Heritage', country: 'Internacional', icon: 'Crown',
    attribute_bonus: { emotional_control: 20, strategy: 8 },
    durability: 100, weight: 1000, balance: 'medio', shape: 'redonda',
    release_year: 1992,
    history: 'O primeiro Campeonato Mundial de Padel foi realizado em 1992 em Sevilha, Espanha. A Argentina sagrou-se campeã. Este troféu celebra o nascimento do padel como esporte mundial organizado.',
    is_available: false, is_exclusive: true, collection: 'Padel Origins',
  },
  {
    name: 'Raquete Olímpica Paris 2024',
    description: 'Edição limitada comemorativa da estreia do padel nos Jogos Olímpicos.',
    category: 'raquete', subcategory: 'power', rarity: 'exclusivo', price: 200000,
    manufacturer: 'Padel Heritage', country: 'França', icon: 'Disc',
    attribute_bonus: { smash: 12, forehand: 8, emotional_control: 15, strategy: 5 },
    durability: 100, weight: 355, balance: 'alto', shape: 'diamante',
    release_year: 2024,
    history: 'O padel fez sua estreia olímpica em Paris 2024 como esporte de demonstração. Esta raquete comemora o momento histórico em que o padel chegou ao maior palco esportivo do mundo.',
    is_available: false, is_exclusive: true, collection: 'Olympic Edition',
  },
  {
    name: 'Bola Dourada WPT Final (2023)',
    description: 'Bola de ouro maciço comemorativa da final do World Padel Tour 2023.',
    category: 'colecionavel', subcategory: 'replica', rarity: 'exclusivo', price: 150000,
    manufacturer: 'Padel Heritage', country: 'Espanha', icon: 'Target',
    attribute_bonus: { emotional_control: 15, strategy: 5, forehand: 3 },
    durability: 100, weight: 100, balance: 'medio', shape: 'redonda',
    release_year: 2023,
    history: 'A final do WPT 2023 em Barcelona foi uma das mais assistidas da história. Esta bola dourada celebra o auge do padel profissional contemporâneo.',
    is_available: false, is_exclusive: true, collection: 'Golden Moments',
  },
  {
    name: 'Raquete Galán Golden Edition',
    description: 'Raquete banhada a ouro assinada por Ale Galán, #1 do mundo.',
    category: 'colecionavel', subcategory: 'replica', rarity: 'exclusivo', price: 220000,
    manufacturer: 'Padel Heritage', country: 'Espanha', icon: 'Disc',
    attribute_bonus: { smash: 15, forehand: 10, emotional_control: 10, strategy: 8 },
    durability: 100, weight: 370, balance: 'alto', shape: 'diamante',
    release_year: 2024,
    history: 'Alejandro Galán Romo, número 1 do mundo, revolucionou o padel com seu estilo explosivo. Esta raquete dourada homenageia o jogador que dominou a era moderna do esporte.',
    is_available: false, is_exclusive: true, collection: 'Golden Legends',
  },
];

// ─── Seeding ─────────────────────────────────────────────────────────────────

/**
 * Seeds initial market events and makes historical items available periodically.
 */
export async function seedMarket() {
  const today = new Date().toISOString().slice(0, 10);

  // Check if already seeded
  const existing = await localGame.asServiceRole.entities.MarketEvent.filter({ is_active: true });
  if (existing.length > 0) return { alreadySeeded: true, count: existing.length };

  // Create initial permanent-ish events
  const initialEvents = [
    {
      title: '🚀 Coleção 2025 Disponível',
      description: 'Os modelos mais recentes das principais marcas acabaram de chegar!',
      event_type: 'lancamento',
      affected_categories: ['raquete'],
      affected_rarities: ['epico', 'lendario', 'mitico'],
      affected_manufacturers: [],
      affected_item_ids: [],
      price_modifier: 1.15,
      demand_modifier: 20,
      badge_label: 'LANÇAMENTO',
      badge_color: 'cyan',
      image_emoji: '🚀',
      priority: 5,
    },
    {
      title: '⚡ Flash Sale de Raquetes',
      description: 'Raquetes comuns e incomuns com até 40% de desconto!',
      event_type: 'flash_sale',
      affected_categories: ['raquete'],
      affected_rarities: ['comum', 'incomum'],
      affected_manufacturers: [],
      affected_item_ids: [],
      price_modifier: 0.6,
      demand_modifier: 30,
      badge_label: 'FLASH SALE',
      badge_color: 'amber',
      image_emoji: '⚡',
      priority: 9,
    },
    {
      title: '🔥 Febre do Padel no Brasil',
      description: 'O padel está crescendo absurdamente no Brasil! Demanda por equipamentos em alta.',
      event_type: 'febre',
      affected_categories: [],
      affected_rarities: [],
      affected_manufacturers: ['Bullpadel', 'Adidas', 'Joma'],
      affected_item_ids: [],
      price_modifier: 1.25,
      demand_modifier: 40,
      badge_label: 'EM ALTA',
      badge_color: 'red',
      image_emoji: '🔥',
      priority: 7,
    },
    {
      title: '📉 Liquidação de Tênis',
      description: 'Tênis da temporada passada com desconto imperdível!',
      event_type: 'liquidacao',
      affected_categories: ['tenis'],
      affected_rarities: ['comum', 'incomum', 'raro'],
      affected_manufacturers: [],
      affected_item_ids: [],
      price_modifier: 0.65,
      demand_modifier: 15,
      badge_label: 'LIQUIDAÇÃO',
      badge_color: 'red',
      image_emoji: '📉',
      priority: 6,
    },
    {
      title: '⚠️ Escassez de Fibra de Carbono',
      description: 'Problemas na cadeia de suprimentos afetam raquetes premium.',
      event_type: 'escassez',
      affected_categories: ['raquete'],
      affected_rarities: ['lendario', 'mitico', 'exclusivo'],
      affected_manufacturers: [],
      affected_item_ids: [],
      price_modifier: 1.35,
      demand_modifier: -10,
      supply_modifier: -40,
      badge_label: 'ESCASSO',
      badge_color: 'amber',
      image_emoji: '⚠️',
      priority: 8,
    },
    {
      title: '🏛️ Relíquias Históricas Liberadas',
      description: 'Itens históricos extremamente raros disponíveis por tempo limitado!',
      event_type: 'historico',
      affected_categories: ['raquete', 'colecionavel', 'bola'],
      affected_rarities: ['exclusivo'],
      affected_manufacturers: ['Padel Heritage'],
      affected_item_ids: [],
      price_modifier: 1.1,
      demand_modifier: 50,
      badge_label: 'RELÍQUIA',
      badge_color: 'purple',
      image_emoji: '🏛️',
      priority: 10,
    },
  ];

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 14);

  const events = initialEvents.map(ev => ({
    ...ev,
    start_date: today,
    end_date: endDate.toISOString().slice(0, 10),
    is_active: true,
    created_date: today,
  }));

  await localGame.asServiceRole.entities.MarketEvent.bulkCreate(events);

  // Add historical rare items to ShopItem
  const existingHistorical = await localGame.asServiceRole.entities.ShopItem.filter({ manufacturer: 'Padel Heritage' });
  if (existingHistorical.length === 0) {
    const historicalItems = HISTORICAL_RARE_ITEMS.map(item => ({ ...item, is_available: true }));
    await localGame.asServiceRole.entities.ShopItem.bulkCreate(historicalItems);

    // Create limited stock entries for historical items
    const createdItems = await localGame.asServiceRole.entities.ShopItem.filter({ manufacturer: 'Padel Heritage' });
    const stockEntries = createdItems.map(item => ({
      item_id: item.id,
      item_name: item.name,
      base_price: item.price,
      current_price: item.price,
      previous_price: item.price,
      all_time_low: item.price,
      all_time_high: item.price,
      demand_score: 80,
      supply_level: 10,
      purchase_count: 0,
      trend: 'subindo',
      volatility: 50,
      price_history: [{ date: today, price: item.price }],
      last_updated_date: today,
      is_limited_stock: true,
      stock_remaining: Math.floor(Math.random() * 5) + 1, // 1-5 units
    }));
    await localGame.asServiceRole.entities.MarketPriceHistory.bulkCreate(stockEntries);
  }

  return { seeded: true, events: events.length };
}