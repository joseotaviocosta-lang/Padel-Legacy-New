// ─── Grips, Bolas, Mochilas Catalog ──────────────────────────────────────────

const GRIP_BRANDS = ['Bullpadel', 'Nox', 'Head', 'Babolat', 'Karakal', 'Tourna', 'Wilson', 'Siux'];

const GRIP_TYPES = [
  { sub: 'overgrip',  attr: { strategy: 1, emotional_control: 1 }, basePrice: 50,  desc: 'Overgrip fino para aderência precisa' },
  { sub: 'replacement',attr: { strategy: 2, emotional_control: 1 }, basePrice: 80,  desc: 'Grip de substituição de espuma densa' },
  { sub: 'dry',       attr: { strategy: 2 }, basePrice: 70,  desc: 'Overgrip antiderrapante para mãos suadas' },
  { sub: 'tacky',     attr: { strategy: 2, emotional_control: 2 }, basePrice: 90,  desc: 'Grip adesivo extra para máximo controle' },
];

const GRIP_TIERS = [
  { rarity: 'comum',    mult: 1,  suffix: 'Standard',   dur: 80,  yr: 2020 },
  { rarity: 'incomum', mult: 2,  suffix: 'Sport',      dur: 90,  yr: 2021 },
  { rarity: 'raro',    mult: 3,  suffix: 'Pro',         dur: 100, yr: 2022 },
  { rarity: 'epico',   mult: 5,  suffix: 'Elite',       dur: 100, yr: 2023 },
  { rarity: 'lendario',mult: 10, suffix: 'Legend',      dur: 100, yr: 2024 },
];

export function generateGrips() {
  const items = [];
  GRIP_BRANDS.forEach((brand, bi) => {
    GRIP_TYPES.forEach((type, ti) => {
      GRIP_TIERS.forEach((tier, ri) => {
        const label = type.sub === 'overgrip' ? 'Overgrip' : type.sub === 'dry' ? 'Dry Grip' : type.sub === 'tacky' ? 'Tacky Grip' : 'Replacement Grip';
        const name = `${brand} ${label} ${tier.suffix}`;
        const attr = {};
        Object.entries(type.attr).forEach(([k, v]) => { attr[k] = Math.round(v * (1 + ri * 0.4)); });
        items.push({
          id: `grip_${bi}_${ti}_${ri}`,
          name,
          description: type.desc,
          category: 'grip',
          subcategory: type.sub,
          rarity: tier.rarity,
          price: Math.round(type.basePrice * tier.mult),
          manufacturer: brand,
          country: 'Internacional',
          icon: 'Circle',
          attribute_bonus: attr,
          durability: tier.dur,
          weight: 8,
          balance: 'medio',
          shape: 'redonda',
          release_year: tier.yr,
          history: `Grip ${type.sub} da ${brand}. ${type.desc}. Essencial para manter o controle da raquete durante as partidas intensas.`,
          is_available: true,
          is_exclusive: false,
          collection: `${brand} Grips`,
        });
      });
    });
  });
  return items;
}

// ─── Bolas ───────────────────────────────────────────────────────────────────

const BALL_BRANDS = [
  { name: 'Head', country: 'Áustria', models: ['PADEL PRO', 'PADEL', 'CHAMPIONSHIP', 'TEAM'] },
  { name: 'Babolat', country: 'França', models: ['PADEL', 'PADEL PLUS', 'PROFESSIONAL', 'TRAINING'] },
  { name: 'Wilson', country: 'EUA', models: ['PADEL PRO', 'PADEL', 'TEAM', 'CHAMPIONSHIP'] },
  { name: 'Dunlop', country: 'Reino Unido', models: ['PADEL PRO', 'PADEL', 'TOURNAMENT'] },
  { name: 'Bullpadel', country: 'Espanha', models: ['PRO', 'CHAMPIONSHIP', 'TRAINING'] },
  { name: 'Slazenger', country: 'Reino Unido', models: ['PADEL', 'PROFESSIONAL'] },
];

const BALL_TIERS = [
  { rarity: 'comum',    sub: 'training',  price: 120,  dur: 60,  attr: { strategy: 1 },          suffix: 'Training',     yr: 2021 },
  { rarity: 'incomum', sub: 'match',     price: 250,  dur: 75,  attr: { strategy: 1, agility: 1 }, suffix: 'Club',         yr: 2022 },
  { rarity: 'raro',    sub: 'match',     price: 500,  dur: 85,  attr: { strategy: 2, agility: 1 }, suffix: 'Pro',          yr: 2023 },
  { rarity: 'epico',   sub: 'premium',   price: 1000, dur: 95,  attr: { strategy: 2, agility: 2 }, suffix: 'Championship',  yr: 2024 },
  { rarity: 'lendario',sub: 'premium',   price: 2000, dur: 100, attr: { strategy: 3, agility: 2, forehand: 1 }, suffix: 'Tournament', yr: 2025 },
];

export function generateBalls() {
  const items = [];
  BALL_BRANDS.forEach((brand, bi) => {
    brand.models.forEach((model, mi) => {
      BALL_TIERS.forEach((tier, ti) => {
        const name = `${brand.name} ${model} ${tier.suffix}`;
        items.push({
          id: `ball_${bi}_${mi}_${ti}`,
          name,
          description: `Bola de padel ${tier.sub === 'premium' ? 'premium profissional' : tier.sub === 'match' ? 'de partida' : 'de treino'} da ${brand.name}.`,
          category: 'bola',
          subcategory: tier.sub,
          rarity: tier.rarity,
          price: tier.price,
          manufacturer: brand.name,
          country: brand.country,
          icon: 'Target',
          attribute_bonus: tier.attr,
          durability: tier.dur,
          weight: 56,
          balance: 'medio',
          shape: 'redonda',
          release_year: tier.yr,
          history: `Bola ${brand.name} ${model}. As bolas de padel têm diâmetro entre 6.35 e 6.77 cm e pressão específica. A ${brand.name} é ${brand.country === 'Áustria' ? 'austríaca' : brand.country === 'França' ? 'francesa' : brand.country === 'EUA' ? 'americana' : brand.country === 'Espanha' ? 'espanhola' : 'britânica'} e ${ti >= 3 ? 'é usada em torneios profissionais' : 'é popular entre amadores'}.`,
          is_available: true,
          is_exclusive: false,
          collection: `${brand.name} ${model}`,
        });
      });
    });
  });
  return items;
}

// ─── Mochilas ────────────────────────────────────────────────────────────────

const BAG_BRANDS = ['Bullpadel', 'Nox', 'Head', 'Babolat', 'Adidas', 'Siux', 'Varlion', 'Joma', 'Wilson', 'Asics'];

const BAG_TYPES = [
  { sub: 'compact', cap: '1 raquete', attr: {}, price: 300, dur: 80, desc: 'Mochila compacta para 1 raquete e acessórios' },
  { sub: 'pro',     cap: '2-3 raquetes', attr: { strategy: 1 }, price: 600, dur: 90, desc: 'Mochila pro com compartimento térmico' },
  { sub: 'thermal', cap: '4+ raquetes', attr: { strategy: 2, emotional_control: 1 }, price: 1000, dur: 100, desc: 'Mochila térmica premium com proteção UV' },
];

const BAG_TIERS = [
  { rarity: 'comum',    mult: 1,  suffix: 'Base',     yr: 2020 },
  { rarity: 'incomum', mult: 1.5, suffix: 'Sport',    yr: 2021 },
  { rarity: 'raro',    mult: 2.5, suffix: 'Pro',       yr: 2022 },
  { rarity: 'epico',   mult: 4,   suffix: 'Elite',     yr: 2023 },
  { rarity: 'lendario',mult: 8,   suffix: 'Legend',    yr: 2024 },
];

export function generateBags() {
  const items = [];
  BAG_BRANDS.forEach((brand, bi) => {
    BAG_TYPES.forEach((type, ti) => {
      BAG_TIERS.forEach((tier, ri) => {
        const label = type.sub === 'compact' ? 'Compact' : type.sub === 'pro' ? 'Pro' : 'Thermal';
        const name = `${brand} ${label} Bag ${tier.suffix}`;
        items.push({
          id: `bag_${bi}_${ti}_${ri}`,
          name,
          description: type.desc,
          category: 'mochila',
          subcategory: type.sub,
          rarity: tier.rarity,
          price: Math.round(type.price * tier.mult),
          manufacturer: brand,
          country: 'Internacional',
          icon: 'Briefcase',
          attribute_bonus: type.attr,
          durability: type.dur,
          weight: 800,
          balance: 'medio',
          shape: 'redonda',
          release_year: tier.yr,
          history: `Mochila ${type.sub} da ${brand}. ${type.desc}. Capacidade: ${type.cap}.`,
          is_available: true,
          is_exclusive: false,
          collection: `${brand} Bags`,
        });
      });
    });
  });
  return items;
}

export const GRIPS = generateGrips();
export const BALLS = generateBalls();
export const BAGS = generateBags();