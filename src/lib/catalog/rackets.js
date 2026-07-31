// ─── Raquetes Catalog ─────────────────────────────────────────────────────────
// Generated from real padel brands with varied shapes, balances, and rarities

const BRANDS = [
  { name: 'Bullpadel', country: 'Espanha', models: [
    ['Vertex', 'diamante', 'alto'], ['Hack', 'diamante', 'alto'], ['Next', 'lagrima', 'medio'],
    ['Flow', 'lagrima', 'medio'], ['Proline', 'diamante', 'alto'], ['Ionline', 'redonda', 'baixo'],
    ['Verbo', 'lagrima', 'medio'], ['Locus', 'redonda', 'baixo'], ['Curling', 'redonda', 'baixo'],
    ['Starter', 'redonda', 'baixo'],
  ]},
  { name: 'Nox', country: 'Espanha', models: [
    ['AT10', 'lagrima', 'medio'], ['AT10 Luxury', 'lagrima', 'medio'], ['ML10', 'diamante', 'alto'],
    ['DC10', 'redonda', 'baixo'], ['Nergy', 'lagrima', 'medio'], ['Sensation', 'redonda', 'baixo'],
    ['Equilibrium', 'redonda', 'baixo'], ['Advanced', 'lagrima', 'medio'], ['Competition', 'diamante', 'alto'],
    ['Absolute', 'lagrima', 'medio'],
  ]},
  { name: 'Head', country: 'Áustria', models: [
    ['Alpha Pro', 'diamante', 'alto'], ['Motion Pro', 'lagrima', 'medio'], ['Speed Pro', 'lagrima', 'medio'],
    ['Extreme Pro', 'diamante', 'alto'], ['Flash', 'redonda', 'baixo'], [' Radical', 'lagrima', 'medio'],
    ['Boom Pro', 'diamante', 'alto'], ['Gravity', 'redonda', 'baixo'], ['Instinct', 'lagrima', 'medio'],
    ['Spark', 'redonda', 'baixo'],
  ]},
  { name: 'Babolat', country: 'França', models: [
    ['Viper Air', 'diamante', 'alto'], ['Technical Viper', 'diamante', 'alto'], ['Counter Viper', 'lagrima', 'medio'],
    ['Vertuo', 'redonda', 'baixo'], ['Air Viper', 'lagrima', 'medio'], ['Storm', 'redonda', 'baixo'],
    ['Contact', 'redonda', 'baixo'], ['Power', 'diamante', 'alto'], ['Skill', 'redonda', 'baixo'],
    ['Pulse', 'lagrima', 'medio'],
  ]},
  { name: 'Adidas', country: 'Alemanha', models: [
    ['Metalbone', 'diamante', 'alto'], ['Adipower', 'diamante', 'alto'], ['Drive', 'lagrima', 'medio'],
    ['Essential', 'redonda', 'baixo'], ['Cross It', 'lagrima', 'medio'], ['Duran', 'diamante', 'alto'],
    ['Avanti', 'redonda', 'baixo'], ['Kombat', 'lagrima', 'medio'], ['Terrex', 'redonda', 'baixo'],
    ['Supernova', 'lagrima', 'medio'],
  ]},
  { name: 'Siux', country: 'Espanha', models: [
    ['Electra', 'diamante', 'alto'], ['Revolution', 'lagrima', 'medio'], ['Pegasus', 'lagrima', 'medio'],
    ['Rival', 'redonda', 'baixo'], ['Tron', 'diamante', 'alto'], ['Raven', 'lagrima', 'medio'],
    ['Botanica', 'redonda', 'baixo'], ['Volt', 'diamante', 'alto'], ['Hybrid', 'lagrima', 'medio'],
    ['Genesis', 'redonda', 'baixo'],
  ]},
  { name: 'Varlion', country: 'Espanha', models: [
    ['LW Pro', 'redonda', 'baixo'], ['Bourne', 'diamante', 'alto'], ['Summum', 'lagrima', 'medio'],
    ['Diffractor', 'diamante', 'alto'], ['One', 'redonda', 'baixo'], ['Absolute', 'lagrima', 'medio'],
    ['Cañon', 'diamante', 'alto'], ['Lethal Weapon', 'redonda', 'baixo'],
  ]},
  { name: 'Wilson', country: 'EUA', models: [
    ['Belgian', 'diamante', 'alto'], ['Pro Staff', 'lagrima', 'medio'], ['Ultra', 'redonda', 'baixo'],
    ['Blade', 'lagrima', 'medio'], ['Triumph', 'diamante', 'alto'], ['Tour', 'lagrima', 'medio'],
    ['Federer', 'diamante', 'alto'],
  ]},
  { name: 'Joma', country: 'Espanha', models: [
    ['Spectre', 'lagrima', 'medio'], ['Slam', 'diamante', 'alto'], ['Spin', 'redonda', 'baixo'],
    ['Pro', 'lagrima', 'medio'], ['Elite', 'diamante', 'alto'], ['Strike', 'redonda', 'baixo'],
  ]},
  { name: 'Asics', country: 'Japão', models: [
    ['Padel Pro', 'lagrima', 'medio'], ['Padel Excel', 'redonda', 'baixo'], ['Padel Strike', 'diamante', 'alto'],
    ['Padel Control', 'redonda', 'baixo'], ['Padel Power', 'diamante', 'alto'],
  ]},
  { name: 'Drop Shot', country: 'Espanha', models: [
    ['Explorer', 'diamante', 'alto'], ['Conqueror', 'lagrima', 'medio'], ['Ranger', 'redonda', 'baixo'],
    ['Venom', 'diamante', 'alto'], ['Aura', 'lagrima', 'medio'],
  ]},
  { name: 'Star Vie', country: 'Espanha', models: [
    ['Raptor', 'diamante', 'alto'], ['Aquila', 'lagrima', 'medio'], ['Basalto', 'redonda', 'baixo'],
    ['Dronos', 'diamante', 'alto'], ['Triumph', 'lagrima', 'medio'],
  ]},
];

const SHAPE_BONUS = {
  diamante: { smash: 4, forehand: 3, bandeja: -1, defense: -2 },
  lagrima:  { forehand: 2, volley: 2, smash: 1, defense: 1 },
  redonda:  { defense: 3, volley: 2, strategy: 2, smash: -2 },
};

const RARITY_TIERS = [
  { rarity: 'comum',      priceMult: 1,    durMult: 1.0,  attrMult: 1,   suffix: 'Base',     yr: 2020 },
  { rarity: 'incomum',   priceMult: 2,    durMult: 1.1,  attrMult: 1.5, suffix: 'Sport',    yr: 2021 },
  { rarity: 'raro',       priceMult: 4,    durMult: 1.2,  attrMult: 2,   suffix: 'Pro',      yr: 2022 },
  { rarity: 'epico',      priceMult: 8,    durMult: 1.3,  attrMult: 3,   suffix: 'Elite',   yr: 2023 },
  { rarity: 'lendario',   priceMult: 15,   durMult: 1.4,  attrMult: 4,   suffix: 'Legend',   yr: 2024 },
  { rarity: 'mitico',     priceMult: 30,   durMult: 1.5,  attrMult: 5,   suffix: 'Mythic',   yr: 2025 },
  { rarity: 'exclusivo',  priceMult: 60,   durMult: 1.6,  attrMult: 6,   suffix: 'Exclusive',yr: 2026 },
];

export function generateRackets() {
  const items = [];
  BRANDS.forEach((brand, bi) => {
    brand.models.forEach((model, mi) => {
      const [modelName, shape, balance] = model;
      const baseId = `racket_${bi}_${mi}`;
      RARITY_TIERS.forEach((tier, ti) => {
        const name = `${brand.name} ${modelName} ${tier.suffix}`;
        const baseBonus = SHAPE_BONUS[shape] || {};
        const bonus = {};
        Object.entries(baseBonus).forEach(([k, v]) => {
          const val = Math.round(v * tier.attrMult);
          if (val !== 0) bonus[k] = val;
        });
        const basePrice = 800;
        const price = Math.round(basePrice * tier.priceMult * (1 + mi * 0.05));
        const weight = 350 + Math.floor(Math.random() * 55);
        items.push({
          id: `${baseId}_t${ti}`,
          name,
          description: `Raquete ${shape} ${balance==='alto'?'com balanceamento alto para potência':balance==='baixo'?'com balanceamento baixo para controle':'com balanceamento médio versátil'}. Fabricada pela ${brand.name}.`,
          category: 'raquete',
          subcategory: shape === 'diamante' ? 'power' : shape === 'redonda' ? 'control' : 'hybrid',
          rarity: tier.rarity,
          price,
          manufacturer: brand.name,
          country: brand.country,
          icon: 'Disc',
          attribute_bonus: bonus,
          durability: Math.round(100 * tier.durMult),
          weight,
          balance,
          shape,
          release_year: tier.yr,
          history: `${brand.name} é uma marca ${brand.country === 'Espanha' ? 'espanhola' : brand.country === 'França' ? 'francesa' : brand.country === 'Áustria' ? 'austríaca' : brand.country === 'Alemanha' ? 'alemã' : brand.country === 'Japão' ? 'japonesa' : brand.country === 'EUA' ? 'americana' : 'reconhecida'} renomada no mundo do padel. O modelo ${modelName} ${tier.suffix} representa ${tier.rarity === 'comum' ? 'a entrada de gama' : tier.rarity === 'exclusivo' ? 'a edição mais limitada e cobiçada' : `a versão ${tier.suffix}`} da linha.`,
          is_available: tier.rarity !== 'exclusivo' || Math.random() > 0.3,
          is_exclusive: tier.rarity === 'exclusivo',
          collection: `${brand.name} ${modelName}`,
        });
      });
    });
  });
  return items;
}

export const RACKETS = generateRackets();