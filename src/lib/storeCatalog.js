import { localGame } from '@/api/localGameClient.js';

const CATEGORY_ALIASES = {
  racket: 'raquete', raquetes: 'raquete', pala: 'raquete', palas: 'raquete',
  grips: 'grip', overgrip: 'grip', overgrips: 'grip',
  bolas: 'bola', ball: 'bola', balls: 'bola',
  vestuario: 'roupa', vestuário: 'roupa', clothing: 'roupa', camiseta: 'roupa', camisa: 'roupa', shorts: 'roupa',
  tênis: 'tenis', calcado: 'tenis', calçado: 'tenis', shoes: 'tenis',
  mochilas: 'mochila', bolsa: 'mochila', bolsas: 'mochila', bag: 'mochila',
  tecnologia: 'acessorio_tec', tech: 'acessorio_tec', sensor: 'acessorio_tec', smartwatch: 'acessorio_tec',
  colecionáveis: 'colecionavel', colecionaveis: 'colecionavel', collectible: 'colecionavel',
  acessórios: 'acessorio', acessorios: 'acessorio', accessory: 'acessorio',
};

const RARITY_ALIASES = {
  comum: 'comum', common: 'comum',
  incomum: 'incomum', uncommon: 'incomum',
  raro: 'raro', rare: 'raro',
  épico: 'epico', epico: 'epico', epic: 'epico',
  lendário: 'lendario', lendario: 'lendario', legendary: 'lendario',
  mítico: 'mitico', mitico: 'mitico', mythic: 'mitico',
  exclusivo: 'exclusivo', exclusive: 'exclusivo',
};

export const SHOP_PROGRESSION = {
  comum:     { minCareerLevel: 1,  maxRanking: null, minReputation: 0,  priceFloor: 40,     label: 'Início da carreira' },
  incomum:  { minCareerLevel: 3,  maxRanking: null, minReputation: 0,  priceFloor: 250,    label: 'Circuito amador' },
  raro:     { minCareerLevel: 8,  maxRanking: 500,  minReputation: 8,  priceFloor: 1200,   label: 'Circuito regional' },
  epico:    { minCareerLevel: 15, maxRanking: 200,  minReputation: 20, priceFloor: 5000,   label: 'Circuito nacional' },
  lendario: { minCareerLevel: 25, maxRanking: 100,  minReputation: 40, priceFloor: 16000,  label: 'Circuito internacional' },
  mitico:   { minCareerLevel: 35, maxRanking: 40,   minReputation: 65, priceFloor: 45000,  label: 'Elite mundial' },
  exclusivo:{ minCareerLevel: 45, maxRanking: 10,   minReputation: 85, priceFloor: 120000, label: 'Lendas do circuito' },
};

function cleanKey(value) {
  return String(value || '').trim().toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function requirementFor(item) {
  const rarity = RARITY_ALIASES[cleanKey(item?.rarity)] || cleanKey(item?.rarity) || 'comum';
  const defaults = SHOP_PROGRESSION[rarity] || SHOP_PROGRESSION.comum;
  return {
    minCareerLevel: Math.max(1, safeNumber(item?.min_career_level, defaults.minCareerLevel)),
    maxRanking: item?.max_ranking == null ? defaults.maxRanking : Math.max(1, safeNumber(item.max_ranking, defaults.maxRanking || 9999)),
    minReputation: Math.max(0, safeNumber(item?.min_reputation, defaults.minReputation)),
    progressionLabel: String(item?.progression_label || defaults.label),
  };
}

export function normalizeShopItem(item) {
  const rawCategory = cleanKey(item?.category);
  const rawRarity = cleanKey(item?.rarity);
  const rarity = RARITY_ALIASES[rawRarity] || rawRarity || 'comum';
  const requirements = requirementFor({ ...item, rarity });
  return {
    ...item,
    name: String(item?.name || 'Item sem nome').trim(),
    description: String(item?.description || '').trim(),
    manufacturer: String(item?.manufacturer || 'Sem marca').trim(),
    category: CATEGORY_ALIASES[rawCategory] || rawCategory || 'acessorio',
    rarity,
    subcategory: cleanKey(item?.subcategory) || 'geral',
    price: (() => {
      const stored = Number(item?.price);
      const floor = SHOP_PROGRESSION[rarity]?.priceFloor || 100;
      if (Number.isFinite(stored) && stored > 0) return Math.max(stored, floor);
      const row = EXPANDED_ITEMS.find(entry => cleanKey(entry.name) === cleanKey(item?.name));
      return row ? Number(row.price) : SHOP_PROGRESSION[rarity]?.priceFloor || 100;
    })(),
    durability: Number.isFinite(Number(item?.durability)) ? Number(item.durability) : 100,
    is_available: item?.is_available !== false,
    attribute_bonus: item?.attribute_bonus && typeof item.attribute_bonus === 'object' ? item.attribute_bonus : {},
    min_career_level: requirements.minCareerLevel,
    max_ranking: requirements.maxRanking,
    min_reputation: requirements.minReputation,
    progression_label: requirements.progressionLabel,
  };
}

export function getShopItemAccess(profile, item) {
  const normalized = normalizeShopItem(item);
  const careerLevel = Math.max(1, safeNumber(profile?.career_level, 1));
  const ranking = Math.max(1, safeNumber(profile?.ranking_position ?? profile?.world_ranking_position, 9999));
  const reputation = Math.max(0, safeNumber(profile?.reputation ?? profile?.career_reputation, 0));
  const reasons = [];
  if (careerLevel < normalized.min_career_level) reasons.push(`Experiência de carreira ${normalized.min_career_level}`);
  if (normalized.max_ranking && ranking > normalized.max_ranking) reasons.push(`alcançar o Top ${normalized.max_ranking}`);
  if (reputation < normalized.min_reputation) reasons.push(`${normalized.min_reputation} de reputação`);
  return {
    unlocked: reasons.length === 0,
    reasons,
    careerLevel,
    ranking,
    reputation,
    requirements: {
      minCareerLevel: normalized.min_career_level,
      maxRanking: normalized.max_ranking,
      minReputation: normalized.min_reputation,
    },
  };
}

const TIERS = {
  comum:      { price: 1,  bonus: 1, durability: 72, year: 2021 },
  incomum:    { price: 2,  bonus: 1, durability: 80, year: 2022 },
  raro:       { price: 5,  bonus: 2, durability: 88, year: 2023 },
  epico:      { price: 12, bonus: 3, durability: 94, year: 2024 },
  lendario:   { price: 30, bonus: 4, durability: 100, year: 2025 },
  mitico:     { price: 75, bonus: 5, durability: 105, year: 2026 },
  exclusivo:  { price: 180,bonus: 6, durability: 110, year: 2026 },
};

function scaleBonus(base, rarity) {
  const mult = TIERS[rarity]?.bonus || 1;
  return Object.fromEntries(Object.entries(base || {}).map(([key, value]) => [key, Math.round(value * mult)]).filter(([, value]) => value !== 0));
}

function catalogItem({ name, category, subcategory, rarity, basePrice, manufacturer, bonus, description, country = 'Global', collection, history, ...extra }) {
  const tier = TIERS[rarity] || TIERS.comum;
  const requirement = SHOP_PROGRESSION[rarity] || SHOP_PROGRESSION.comum;
  return {
    name,
    category,
    subcategory,
    rarity,
    price: Math.max(requirement.priceFloor, Math.round(basePrice * tier.price)),
    manufacturer,
    attribute_bonus: scaleBonus(bonus, rarity),
    description,
    durability: tier.durability,
    release_year: tier.year,
    is_available: true,
    is_exclusive: rarity === 'exclusivo',
    collection: collection || `${manufacturer} ${requirement.label}`,
    icon: 'Package',
    country,
    history: history || `${name} foi desenvolvido para atletas da faixa ${requirement.label.toLowerCase()}.`,
    min_career_level: requirement.minCareerLevel,
    max_ranking: requirement.maxRanking,
    min_reputation: requirement.minReputation,
    progression_label: requirement.label,
    ...extra,
  };
}

const RACKET_LINES = [
  ['Padel Start', 'Control One', 'control', { volley: 1, positioning: 1 }, 320, 'Raquete redonda estável para aprender o jogo.'],
  ['Padel Start', 'Power Entry', 'power', { smash: 1, strength: 1 }, 380, 'Modelo de entrada para quem busca potência controlada.'],
  ['Joma', 'Soft Touch', 'control', { defense: 1, control: 1 }, 430, 'Toque macio e ampla zona de impacto.'],
  ['Head', 'Flash Motion', 'hybrid', { forehand: 1, backhand: 1 }, 520, 'Equilíbrio entre mobilidade e saída de bola.'],
  ['Nox', 'Equation', 'control', { volley: 1, defense: 1 }, 600, 'Controle para trocas longas e defesa consistente.'],
  ['Adidas', 'Drive', 'hybrid', { forehand: 1, agility: 1 }, 660, 'Raquete versátil para evolução no circuito.'],
  ['Bullpadel', 'Vertex', 'power', { smash: 1, bandeja: 1 }, 760, 'Ataque rápido e bom rendimento aéreo.'],
  ['Babolat', 'Counter', 'hybrid', { defense: 1, smash: 1 }, 820, 'Contra-ataque e resposta rápida.'],
  ['Wilson', 'Pro Staff', 'control', { volley: 1, positioning: 1 }, 880, 'Precisão e estabilidade na rede.'],
  ['Siux', 'Electra', 'power', { smash: 1, forehand: 1 }, 940, 'Aceleração ofensiva para jogadores agressivos.'],
];

const RACKET_TIERS = [
  ['comum', 'Club'], ['incomum', 'Sport'], ['raro', 'Pro'], ['epico', 'Elite'], ['lendario', 'Legend'], ['mitico', 'Mythic'],
];

const racketItems = [];
RACKET_LINES.forEach(([brand, model, subcategory, bonus, basePrice, description], lineIndex) => {
  RACKET_TIERS.forEach(([rarity, suffix], tierIndex) => {
    // Mantém variedade sem gerar todas as combinações de topo para cada linha.
    if (tierIndex >= 4 && lineIndex % 2 !== tierIndex % 2) return;
    racketItems.push(catalogItem({
      name: `${brand} ${model} ${suffix}`,
      category: 'raquete', subcategory, rarity, basePrice: basePrice * (1 + lineIndex * 0.04), manufacturer: brand,
      bonus, description, collection: `${brand} ${model}`,
      shape: subcategory === 'power' ? 'diamante' : subcategory === 'control' ? 'redonda' : 'lagrima',
      balance: subcategory === 'power' ? 'alto' : subcategory === 'control' ? 'baixo' : 'medio',
      weight: 350 + ((lineIndex * 7 + tierIndex * 3) % 36),
    }));
  });
});

const SUPPORT_ITEMS = [
  // Grips
  ['Tour Grip Dry Start','grip','dry','comum',55,'Tour Grip',{concentration:1},'Pacote econômico para treinos.'],
  ['Head Comfort Sport','grip','overgrip','incomum',120,'Head',{control:1},'Conforto e absorção para partidas longas.'],
  ['Wilson Tacky Pro','grip','tacky','raro',320,'Wilson',{forehand:1,backhand:1},'Aderência firme para acelerar golpes.'],
  ['Bullpadel Hesacore Elite','grip','replacement','epico',620,'Bullpadel',{volley:1,control:1},'Grip ergonômico de competição.'],
  ['Nox Custom Legend','grip','replacement','lendario',900,'Nox',{control:1,concentration:1},'Ajuste profissional para atletas internacionais.'],
  // Bolas
  ['Padel Start Training x3','bola','training','comum',45,'Padel Start',{},'Bolas duráveis para sessões iniciais.'],
  ['Head Club Match x3','bola','match','incomum',130,'Head',{strategy:1},'Quique estável para jogos de clube.'],
  ['Wilson Pro Tour x3','bola','match','raro',300,'Wilson',{reflexes:1},'Pressão uniforme em partidas competitivas.'],
  ['Bullpadel Premium Final x3','bola','premium','epico',650,'Bullpadel',{reflexes:1,strategy:1},'Bola de alta velocidade para torneios nacionais.'],
  ['Premier Championship Case','bola','premium','lendario',1200,'Premier Labs',{reflexes:1,agility:1},'Caixa oficial de alto rendimento.'],
  // Vestuário
  ['Joma Training Tee','roupa','camisa','comum',220,'Joma',{stamina:1},'Camisa respirável para o dia a dia.'],
  ['Adidas Match Shorts','roupa','shorts','incomum',420,'Adidas',{speed:1},'Shorts leves com ótima mobilidade.'],
  ['Bullpadel Competition Set','roupa','conjunto','raro',1200,'Bullpadel',{stamina:1,reputation:1},'Conjunto para o circuito regional.'],
  ['Nox Travel Team','roupa','jaqueta','epico',2400,'Nox',{reputation:1,emotional_control:1},'Jaqueta oficial de viagem.'],
  ['Wilson Signature Tour','roupa','agasalho','lendario',4500,'Wilson',{reputation:1,followers:5},'Linha limitada para atletas reconhecidos.'],
  // Tênis
  ['Joma Court Basic','tenis','all_court','comum',480,'Joma',{speed:1},'Estabilidade e proteção para iniciantes.'],
  ['Asics Clay Motion','tenis','clay','incomum',850,'Asics',{agility:1},'Tração segura em superfícies abrasivas.'],
  ['Mizuno Indoor Flash','tenis','indoor','raro',1800,'Mizuno',{speed:1,reflexes:1},'Resposta rápida em quadras indoor.'],
  ['Adidas Pro Stability','tenis','all_court','epico',3200,'Adidas',{agility:1,stamina:1},'Estabilidade profissional em mudanças de direção.'],
  ['Babolat Jet Legend','tenis','all_court','lendario',5800,'Babolat',{agility:1,speed:1},'Calçado de elite para o circuito internacional.'],
  // Mochilas
  ['Padel Start Compact','mochila','compact','comum',260,'Padel Start',{},'Espaço para uma raquete e acessórios.'],
  ['Head Team Backpack','mochila','compact','incomum',620,'Head',{durability:1},'Mochila resistente para treinos semanais.'],
  ['Nox Thermal Duo','mochila','thermal','raro',1400,'Nox',{durability:1,reputation:1},'Compartimento térmico para duas raquetes.'],
  ['Bullpadel Pro 12','mochila','pro','epico',2700,'Bullpadel',{reputation:1},'Raqueteira completa para viagens.'],
  ['Wilson Tour Vault','mochila','thermal','lendario',5200,'Wilson',{reputation:1,emotional_control:1},'Proteção premium para equipamentos de elite.'],
  // Tecnologia
  ['Pulse Training Band','acessorio_tec','smartwatch','incomum',900,'Pulse',{stamina:1},'Monitoramento básico de carga.'],
  ['PlaySight Shot Sensor','acessorio_tec','sensor','raro',2600,'PlaySight',{strategy:1,concentration:1},'Analisa velocidade e ponto de impacto.'],
  ['Garmin Athlete Pro','acessorio_tec','smartwatch','epico',5200,'Garmin',{stamina:1,health:1},'Controle de carga e recuperação.'],
  ['PlaySight Match Vision','acessorio_tec','camera','lendario',9800,'PlaySight',{strategy:1,tactics:1},'Análise automática de partidas.'],
  ['NeuroCourt Tactical Lab','acessorio_tec','sensor','mitico',16000,'NeuroCourt',{strategy:1,concentration:1,tactics:1},'Tecnologia avançada de leitura tática.'],
  // Acessórios
  ['Joma Wristband Base','acessorio','wristband','comum',60,'Joma',{},'Pulseira absorvente para treinos.'],
  ['Adidas Focus Headband','acessorio','headband','incomum',160,'Adidas',{concentration:1},'Mantém o foco durante rallies longos.'],
  ['Nox Racket Protector','acessorio','protetor','raro',380,'Nox',{durability:2},'Proteção adicional contra impactos.'],
  ['HydroSport Thermal Pro','acessorio','garrafa','epico',750,'HydroSport',{stamina:1},'Garrafa térmica de alto rendimento.'],
  ['Therabody Recovery Kit','acessorio','recovery','lendario',1800,'Therabody',{health:1,stamina:1},'Kit portátil de recuperação muscular.'],
  // Colecionáveis: bônus leves e alto valor, não atalho para força esportiva
  ['Medalha Circuito Local','colecionavel','medalha','raro',1100,'Padel Heritage',{reputation:1},'Peça comemorativa do circuito local.'],
  ['Réplica Troféu Major','colecionavel','replica','epico',3200,'Padel Heritage',{reputation:1,followers:5},'Réplica oficial de um Major histórico.'],
  ['Raquete Vintage 1995','colecionavel','replica','lendario',6500,'Padel Heritage',{reputation:1},'Raquete histórica restaurada.'],
  ['Troféu Fundadores','colecionavel','trofeu','mitico',12000,'Padel Heritage',{reputation:1,followers:10},'Relíquia rara da origem do circuito.'],
  ['Coroa do Grand Slam','colecionavel','trofeu','exclusivo',18000,'Padel Heritage',{reputation:2,followers:20},'Peça simbólica reservada às lendas do esporte.'],
];

const supportItems = SUPPORT_ITEMS.map(([name, category, subcategory, rarity, basePrice, manufacturer, bonus, description]) => catalogItem({
  name, category, subcategory, rarity, basePrice, manufacturer, bonus, description,
  collection: category === 'colecionavel' ? 'Padel Heritage' : undefined,
}));

const EXCLUSIVE_RACKETS = [
  catalogItem({ name: 'Bullpadel Legacy Crown', category: 'raquete', subcategory: 'power', rarity: 'exclusivo', basePrice: 1900, manufacturer: 'Bullpadel', bonus: { smash: 1, bandeja: 1 }, description: 'Edição numerada destinada aos maiores nomes do circuito.', shape: 'diamante', balance: 'alto', weight: 372, collection: 'Legacy Crown' }),
  catalogItem({ name: 'Nox Maestro One of One', category: 'raquete', subcategory: 'hybrid', rarity: 'exclusivo', basePrice: 1800, manufacturer: 'Nox', bonus: { volley: 1, strategy: 1 }, description: 'Raquete exclusiva feita sob medida para uma lenda.', shape: 'lagrima', balance: 'medio', weight: 365, collection: 'Maestro' }),
  catalogItem({ name: 'Wilson Heritage Control', category: 'raquete', subcategory: 'control', rarity: 'exclusivo', basePrice: 1750, manufacturer: 'Wilson', bonus: { defense: 1, positioning: 1 }, description: 'Controle absoluto para carreiras históricas.', shape: 'redonda', balance: 'baixo', weight: 360, collection: 'Heritage' }),
];

const EXPANDED_ITEMS = [...racketItems, ...supportItems, ...EXCLUSIVE_RACKETS];

function cleanItemForCreate(item, index) {
  return { ...item, catalog_order: index };
}

export function getExpandedCatalogSummary() {
  const byCategory = {};
  const byRarity = {};
  EXPANDED_ITEMS.forEach(item => {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    byRarity[item.rarity] = (byRarity[item.rarity] || 0) + 1;
  });
  return { total: EXPANDED_ITEMS.length, byCategory, byRarity };
}

export async function ensureExpandedShopCatalog() {
  const existing = (await localGame.entities.ShopItem.list('-created_date', 1000)) || [];
  const catalog = EXPANDED_ITEMS.map(cleanItemForCreate);
  const byName = new Map(catalog.map(item => [cleanKey(item.name), item]));
  const names = new Set(existing.map(i => cleanKey(i?.name)));
  const missing = catalog.filter(item => !names.has(cleanKey(item.name)));

  let repaired = 0;
  for (const item of existing) {
    if (!item?.id) continue;
    const template = byName.get(cleanKey(item.name));
    if (!template) continue;
    const normalized = normalizeShopItem(item);
    const patch = {};
    const fields = ['price','category','subcategory','rarity','manufacturer','description','durability','release_year','is_available','is_exclusive','collection','icon','country','history','min_career_level','max_ranking','min_reputation','progression_label','shape','balance','weight'];
    fields.forEach(field => {
      if (template[field] !== undefined && normalized[field] !== template[field]) patch[field] = template[field];
    });
    if (JSON.stringify(normalized.attribute_bonus || {}) !== JSON.stringify(template.attribute_bonus || {})) patch.attribute_bonus = template.attribute_bonus;
    if (Object.keys(patch).length > 0) {
      await localGame.entities.ShopItem.update(item.id, patch);
      repaired += 1;
    }
  }

  if (missing.length > 0) {
    if (localGame.entities.ShopItem.bulkCreate) await localGame.entities.ShopItem.bulkCreate(missing);
    else for (const item of missing) await localGame.entities.ShopItem.create(item);
  }
  return { created: missing.length, repaired, total: existing.length + missing.length, summary: getExpandedCatalogSummary() };
}
