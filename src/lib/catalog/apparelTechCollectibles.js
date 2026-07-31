// ─── Vestuário, Tênis, Tecnologia, Colecionáveis, Acessórios Catalog ──────────

const APPAREL_BRANDS = ['Adidas', 'Joma', 'Asics', 'Bullpadel', 'Head', 'Babolat', 'Siux', 'Under Armour', 'Nike', 'Puma'];

const APPAREL_TYPES = [
  { sub: 'camisa',   attr: { emotional_control: 1 }, price: 200,  desc: 'Camisa técnica respirável' },
  { sub: 'shorts',   attr: { agility: 1 },          price: 180,  desc: 'Shorts leves para movimentação' },
  { sub: 'jaqueta',  attr: { emotional_control: 2 }, price: 500,  desc: 'Jaqueta corta-vento para aquecimento' },
  { sub: 'agasalho',attr: { emotional_control: 2, strategy: 1 }, price: 700,  desc: 'Conjunto agasalho térmico completo' },
  { sub: 'conjunto', attr: { emotional_control: 1, agility: 1 }, price: 800,  desc: 'Conjunto completo de partida' },
];

const APPAREL_TIERS = [
  { rarity: 'comum',    mult: 1,  suffix: 'Club',     yr: 2020 },
  { rarity: 'incomum', mult: 1.5, suffix: 'Sport',    yr: 2021 },
  { rarity: 'raro',    mult: 3,  suffix: 'Pro',       yr: 2022 },
  { rarity: 'epico',   mult: 5,  suffix: 'Elite',     yr: 2023 },
  { rarity: 'lendario',mult: 10, suffix: 'Legend',    yr: 2024 },
];

export function generateApparel() {
  const items = [];
  APPAREL_BRANDS.forEach((brand, bi) => {
    APPAREL_TYPES.forEach((type, ti) => {
      APPAREL_TIERS.forEach((tier, ri) => {
        const label = type.sub === 'camisa' ? 'Camisa' : type.sub === 'shorts' ? 'Shorts' : type.sub === 'jaqueta' ? 'Jaqueta' : type.sub === 'agasalho' ? 'Agasalho' : 'Conjunto';
        const name = `${brand} ${label} ${tier.suffix}`;
        const attr = {};
        Object.entries(type.attr).forEach(([k, v]) => { attr[k] = Math.round(v * (1 + ri * 0.3)); });
        items.push({
          id: `apparel_${bi}_${ti}_${ri}`,
          name,
          description: type.desc,
          category: 'roupa',
          subcategory: type.sub,
          rarity: tier.rarity,
          price: Math.round(type.price * tier.mult),
          manufacturer: brand,
          country: 'Internacional',
          icon: 'Shirt',
          attribute_bonus: attr,
          durability: 90,
          weight: 200,
          balance: 'medio',
          shape: 'redonda',
          release_year: tier.yr,
          history: `${label} ${brand} ${tier.suffix}. Tecido tecnológico com tecnologia de respiração e secagem rápida. ${brand === 'Adidas' ? 'A Adidas é alemã e líder em vestuário esportivo.' : brand === 'Nike' ? 'A Nike é americana e referência mundial.' : brand === 'Joma' ? 'A Joma é espanhola, especializada em padel.' : 'Marca reconhecida no esporte.'}`,
          is_available: true,
          is_exclusive: false,
          collection: `${brand} Apparel`,
        });
      });
    });
  });
  return items;
}

// ─── Tênis ───────────────────────────────────────────────────────────────────

const SHOE_BRANDS = ['Asics', 'Adidas', 'Babolat', 'Head', 'Joma', 'Bullpadel', 'K-Swiss', 'Mizuno', 'Lotto', 'Nike'];

const SHOE_TYPES = [
  { sub: 'clay',     attr: { agility: 2, defense: 1 },  price: 600,  desc: 'Tênis específico para saibro' },
  { sub: 'all_court',attr: { agility: 2 },              price: 700,  desc: 'Tênis multicancha versátil' },
  { sub: 'indoor',   attr: { agility: 3, defense: 1 },  price: 800,  desc: 'Tênis indoor com sola de borracha' },
];

const SHOE_TIERS = [
  { rarity: 'comum',    mult: 1,  suffix: 'Team',       dur: 70,  yr: 2020 },
  { rarity: 'incomum', mult: 1.5, suffix: 'Sport',      dur: 80,  yr: 2021 },
  { rarity: 'raro',    mult: 2.5, suffix: 'Pro',        dur: 90,  yr: 2022 },
  { rarity: 'epico',   mult: 4,   suffix: 'Elite',      dur: 100, yr: 2023 },
  { rarity: 'lendario',mult: 8,   suffix: 'Legend',     dur: 100, yr: 2024 },
  { rarity: 'mitico',  mult: 15,  suffix: 'Mythic',    dur: 100, yr: 2025 },
];

export function generateShoes() {
  const items = [];
  SHOE_BRANDS.forEach((brand, bi) => {
    SHOE_TYPES.forEach((type, ti) => {
      SHOE_TIERS.forEach((tier, ri) => {
        const label = type.sub === 'clay' ? 'Clay' : type.sub === 'all_court' ? 'All Court' : 'Indoor';
        const name = `${brand} ${label} ${tier.suffix}`;
        const attr = {};
        Object.entries(type.attr).forEach(([k, v]) => { attr[k] = Math.round(v * (1 + ri * 0.3)); });
        items.push({
          id: `shoe_${bi}_${ti}_${ri}`,
          name,
          description: type.desc,
          category: 'tenis',
          subcategory: type.sub,
          rarity: tier.rarity,
          price: Math.round(type.price * tier.mult),
          manufacturer: brand,
          country: 'Internacional',
          icon: 'Footprints',
          attribute_bonus: attr,
          durability: tier.dur,
          weight: 350,
          balance: 'medio',
          shape: 'redonda',
          release_year: tier.yr,
          history: `Tênis ${label} da ${brand}. ${type.desc}. ${brand === 'Asics' ? 'Asics é japonesa e líder em calçados de quadra.' : brand === 'Babolat' ? 'Babolat é francesa e pioneira em tênis de padel.' : 'Marca reconhecida no esporte.'}`,
          is_available: true,
          is_exclusive: false,
          collection: `${brand} Shoes`,
        });
      });
    });
  });
  return items;
}

// ─── Acessórios Tecnológicos ─────────────────────────────────────────────────

const TECH_TYPES = [
  { sub: 'smartwatch', attr: { strategy: 3, emotional_control: 2 }, price: 2000, desc: 'Smartwatch com métricas de desempenho em tempo real' },
  { sub: 'sensor',     attr: { strategy: 4 }, price: 3500, desc: 'Sensor de raquete que mede velocidade e impacto' },
  { sub: 'camera',     attr: { strategy: 2, emotional_control: 3 }, price: 5000, desc: 'Câmera automática para análise de jogadas' },
];

const TECH_BRANDS = ['Garmin', 'Apple', 'Polar', 'Suunto', 'Fitbit', 'WHOOP', 'Babolat Play', 'Zepp', 'Sony', 'Samsung'];

const TECH_TIERS = [
  { rarity: 'raro',    mult: 1,  suffix: 'Pro',        yr: 2022 },
  { rarity: 'epico',   mult: 2,  suffix: 'Elite',      yr: 2023 },
  { rarity: 'lendario',mult: 3,  suffix: 'Legend',     yr: 2024 },
  { rarity: 'mitico',  mult: 5,  suffix: 'Mythic',    yr: 2025 },
];

export function generateTech() {
  const items = [];
  TECH_BRANDS.forEach((brand, bi) => {
    TECH_TYPES.forEach((type, ti) => {
      TECH_TIERS.forEach((tier, ri) => {
        const label = type.sub === 'smartwatch' ? 'Smartwatch' : type.sub === 'sensor' ? 'Sensor' : 'Camera';
        const name = `${brand} ${label} ${tier.suffix}`;
        const attr = {};
        Object.entries(type.attr).forEach(([k, v]) => { attr[k] = Math.round(v * (1 + ri * 0.2)); });
        items.push({
          id: `tech_${bi}_${ti}_${ri}`,
          name,
          description: type.desc,
          category: 'acessorio_tec',
          subcategory: type.sub,
          rarity: tier.rarity,
          price: Math.round(type.price * tier.mult),
          manufacturer: brand,
          country: 'Internacional',
          icon: 'Zap',
          attribute_bonus: attr,
          durability: 100,
          weight: 50,
          balance: 'medio',
          shape: 'redonda',
          release_year: tier.yr,
          history: `${label} ${brand} ${tier.suffix}. ${type.desc}. ${brand === 'Garmin' ? 'Garmin é americana e líder em wearables esportivos.' : brand === 'Apple' ? 'Apple Watch é referência em tecnologia vestível.' : 'Marca de tecnologia reconhecida.'}`,
          is_available: true,
          is_exclusive: tier.rarity === 'mitico',
          collection: `${brand} Tech`,
        });
      });
    });
  });
  return items;
}

// ─── Colecionáveis ───────────────────────────────────────────────────────────

const COLLECTIBLE_ITEMS = [
  { sub: 'trofeu',  name: 'Troféu Aberto Brasil',     attr: { emotional_control: 5 }, price: 10000, rarity: 'lendario',  desc: 'Réplica do troféu do Aberto do Brasil' },
  { sub: 'trofeu',  name: 'Troféu World Padel Tour',   attr: { emotional_control: 7, strategy: 3 }, price: 30000, rarity: 'mitico', desc: 'Réplica do troféu do WPT' },
  { sub: 'trofeu',  name: 'Troféu Premier Padel',      attr: { emotional_control: 8, strategy: 4 }, price: 50000, rarity: 'mitico', desc: 'Réplica do troféu do Premier Padel' },
  { sub: 'medalha', name: 'Medalha de Ouro Olímpica',  attr: { emotional_control: 10 }, price: 100000, rarity: 'exclusivo', desc: 'Medalha de ouro dos Jogos Olímpicos (exposição)' },
  { sub: 'medalha', name: 'Medalha de Prata Mundial',   attr: { emotional_control: 5, strategy: 2 }, price: 20000, rarity: 'lendario', desc: 'Medalha de prata do Mundial' },
  { sub: 'medalha', name: 'Medalha de Bronze Europeu',  attr: { emotional_control: 3, strategy: 1 }, price: 10000, rarity: 'epico', desc: 'Medalha de bronze do Europeu' },
  { sub: 'replica', name: 'Raquete Dourada Galán',     attr: { smash: 5, forehand: 3 }, price: 40000, rarity: 'exclusivo', desc: 'Réplica dourada da raquete de Ale Galán' },
  { sub: 'replica', name: 'Raquete Dourada Tapia',      attr: { defense: 5, volley: 3 }, price: 40000, rarity: 'exclusivo', desc: 'Réplica dourada da raquete de Federico Tapia' },
  { sub: 'replica', name: 'Raquete Dourada Stupaczuk', attr: { strategy: 4, emotional_control: 4 }, price: 35000, rarity: 'mitico', desc: 'Réplica da raquete de Franco Stupaczuk' },
  { sub: 'replica', name: 'Raquete Dourada Lima',      attr: { forehand: 5, smash: 2 }, price: 38000, rarity: 'mitico', desc: 'Réplica da raquete de Juan Lebrón' },
  { sub: 'replica', name: 'Bola Autografada Lenda',     attr: { emotional_control: 3 }, price: 15000, rarity: 'lendario', desc: 'Bola autografada por lendas do padel' },
  { sub: 'replica', name: 'Camisa Autografada Galán',   attr: { emotional_control: 4, strategy: 2 }, price: 25000, rarity: 'lendario', desc: 'Camisa autografada por Ale Galán' },
  { sub: 'replica', name: 'Camisa Autografada Tapia',    attr: { emotional_control: 4, defense: 2 }, price: 25000, rarity: 'lendario', desc: 'Camisa autografada por Federico Tapia' },
  { sub: 'replica', name: 'Troféu Hall da Fama',        attr: { emotional_control: 12, strategy: 5 }, price: 200000, rarity: 'exclusivo', desc: 'Troféu de indução ao Hall da Fama do Padel' },
  { sub: 'replica', name: 'Cinturão Campeão Mundial',   attr: { emotional_control: 8, strategy: 3, smash: 2 }, price: 80000, rarity: 'exclusivo', desc: 'Cinturão simbólico de campeão mundial' },
];

export function generateCollectibles() {
  return COLLECTIBLE_ITEMS.map((c, i) => ({
    id: `collect_${i}`,
    name: c.name,
    description: c.desc,
    category: 'colecionavel',
    subcategory: c.sub,
    rarity: c.rarity,
    price: c.price,
    manufacturer: 'Padel Legacy',
    country: 'Internacional',
    icon: 'Crown',
    attribute_bonus: c.attr,
    durability: 100,
    weight: 500,
    balance: 'medio',
    shape: 'redonda',
    release_year: 2024,
    history: `${c.name}. ${c.desc}. Item de coleção exclusivo do Padel Legacy, inspirado nos maiores momentos da história do esporte.`,
    is_available: true,
    is_exclusive: c.rarity === 'exclusivo' || c.rarity === 'mitico',
    collection: 'Padel Legacy Collectibles',
  }));
}

// ─── Acessórios ──────────────────────────────────────────────────────────────

const ACCESSORY_TYPES = [
  { sub: 'wristband', attr: { emotional_control: 1 }, price: 80,  desc: 'Pulseira absorvente' },
  { sub: 'headband',  attr: { emotional_control: 1, strategy: 1 }, price: 100, desc: 'Headband para prender o suor' },
  { sub: 'garrafa',   attr: {},                       price: 120, desc: 'Garrafa térmica para hidratação' },
  { sub: 'protetor',  attr: { strategy: 1 },          price: 150, desc: 'Protetor de raquete anti-impacto' },
  { sub: 'pound',     attr: { strategy: 2 },          price: 200, desc: 'Vibrador anti-vibração para raquete' },
];

const ACCESSORY_BRANDS = ['Bullpadel', 'Nox', 'Head', 'Babolat', 'Adidas', 'Siux'];

const ACCESSORY_TIERS = [
  { rarity: 'comum',    mult: 1,  suffix: 'Base',   dur: 80,  yr: 2020 },
  { rarity: 'incomum', mult: 1.5, suffix: 'Sport',  dur: 90,  yr: 2021 },
  { rarity: 'raro',    mult: 2.5, suffix: 'Pro',    dur: 100, yr: 2022 },
  { rarity: 'epico',   mult: 4,   suffix: 'Elite',  dur: 100, yr: 2023 },
];

export function generateAccessories() {
  const items = [];
  ACCESSORY_BRANDS.forEach((brand, bi) => {
    ACCESSORY_TYPES.forEach((type, ti) => {
      ACCESSORY_TIERS.forEach((tier, ri) => {
        const label = type.sub === 'wristband' ? 'Wristband' : type.sub === 'headband' ? 'Headband' : type.sub === 'garrafa' ? 'Garrafa' : type.sub === 'protetor' ? 'Protetor' : 'Vibrador';
        const name = `${brand} ${label} ${tier.suffix}`;
        const attr = {};
        Object.entries(type.attr).forEach(([k, v]) => { attr[k] = Math.round(v * (1 + ri * 0.3)); });
        items.push({
          id: `accessory_${bi}_${ti}_${ri}`,
          name,
          description: type.desc,
          category: 'acessorio',
          subcategory: type.sub,
          rarity: tier.rarity,
          price: Math.round(type.price * tier.mult),
          manufacturer: brand,
          country: 'Internacional',
          icon: 'Package',
          attribute_bonus: attr,
          durability: tier.dur,
          weight: 50,
          balance: 'medio',
          shape: 'redonda',
          release_year: tier.yr,
          history: `${label} ${brand}. ${type.desc}.`,
          is_available: true,
          is_exclusive: false,
          collection: `${brand} Accessories`,
        });
      });
    });
  });
  return items;
}

export const APPAREL = generateApparel();
export const SHOES = generateShoes();
export const TECH = generateTech();
export const COLLECTIBLES = generateCollectibles();
export const ACCESSORIES = generateAccessories();