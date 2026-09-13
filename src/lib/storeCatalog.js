import { localGame } from '@/api/localGameClient.js';
import { ATTRIBUTE_KEYS } from '@/lib/attributes.js';
import { findSponsorIdByManufacturer } from '@/lib/sponsors.js';

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

// Piso de preço por raridade — a ÚNICA rampa de preço do catálogo (Fase 0 do
// redesenho da Loja). mitico/exclusivo recalibrados: o item mais caro do
// jogo deve ficar entre 1x-3x um título de Crown (30.000 moedas, a maior
// premiação do circuito — circuitCatalog.js) em vez de 40x-108x como antes
// da correção do bug de dupla rampa em catalogItem() (ver comentário na
// tabela TIERS, abaixo).
export const SHOP_PROGRESSION = {
  comum:     { minCareerLevel: 1,  maxRanking: null, minReputation: 0,  priceFloor: 40,     label: 'Início da carreira' },
  incomum:  { minCareerLevel: 3,  maxRanking: null, minReputation: 0,  priceFloor: 250,    label: 'Circuito amador' },
  raro:     { minCareerLevel: 8,  maxRanking: 500,  minReputation: 8,  priceFloor: 1200,   label: 'Circuito regional' },
  epico:    { minCareerLevel: 15, maxRanking: 200,  minReputation: 20, priceFloor: 5000,   label: 'Circuito nacional' },
  lendario: { minCareerLevel: 25, maxRanking: 100,  minReputation: 40, priceFloor: 16000,  label: 'Circuito internacional' },
  mitico:   { minCareerLevel: 35, maxRanking: 40,   minReputation: 65, priceFloor: 35000,  label: 'Elite mundial' },
  exclusivo:{ minCareerLevel: 45, maxRanking: 10,   minReputation: 85, priceFloor: 65000,  label: 'Lendas do circuito' },
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

// Fase 0 do redesenho da Loja — `price` foi removido daqui. Ele multiplicava
// basePrice de novo por cima de uma raridade que, para todo item que NÃO é
// gerado por linha de raquete, o basePrice já embutia (ex.: colecionáveis
// iam de 1.100 a 18.000 SÓ para refletir a raridade pretendida). Dupla
// rampa: é por isso que a Coroa do Grand Slam custava 3,24M de moedas —
// 108x um título de Crown, a maior premiação do circuito. Preço agora tem
// UMA rampa só: o piso de SHOP_PROGRESSION, acima. A única exceção real —
// linhas de raquete, onde um único basePrice por linha precisa mesmo virar
// 6 variantes de raridade — recebe seu próprio multiplicador aplicado no
// loop que as gera (RACKET_TIER_PRICE_MULTIPLIER, abaixo), não aqui.
const TIERS = {
  comum:      { bonus: 1, durability: 72,  year: 2021 },
  incomum:    { bonus: 1, durability: 80,  year: 2022 },
  raro:       { bonus: 2, durability: 88,  year: 2023 },
  epico:      { bonus: 3, durability: 94,  year: 2024 },
  lendario:   { bonus: 4, durability: 100, year: 2025 },
  mitico:     { bonus: 5, durability: 105, year: 2026 },
  exclusivo:  { bonus: 6, durability: 110, year: 2026 },
};

// Fase 0 do redesenho da Loja, item 4: scripts/test-equipment-bonus-integrity.mjs
// achou 12 chaves de bônus declaradas no catálogo (concentration, control,
// durability, followers, health, positioning, reflexes, reputation, speed,
// stamina, strength, tactics) que não são nenhum dos 10 ATTRIBUTE_KEYS reais
// e não são lidas por nenhum outro sistema do jogo — bônus puramente
// decorativo, sem efeito nenhum ao equipar. Decisão: sai do catálogo (não
// vira sistema novo agora — plugar em energy/fatigue/morale/confidence/form,
// que já existem, exigiria integrar um delta permanente de equip com estado
// dinâmico diário, isso é trabalho de implementação, não uma decisão de
// rumo). Filtra aqui, na função compartilhada, em vez de editar cada item —
// os itens abaixo (RACKET_LINES/SUPPORT_ITEMS) ainda declaram as chaves
// órfãs nos literais de origem, mas elas nunca chegam ao attribute_bonus
// final; isso também impede uma chave órfã nova de entrar despercebida
// quando o redesenho adicionar itens de tier alto.
function scaleBonus(base, rarity) {
  const mult = TIERS[rarity]?.bonus || 1;
  return Object.fromEntries(
    Object.entries(base || {})
      .filter(([key]) => ATTRIBUTE_KEYS.includes(key))
      .map(([key, value]) => [key, Math.round(value * mult)])
      .filter(([, value]) => value !== 0)
  );
}

function catalogItem({ name, category, subcategory, rarity, basePrice, manufacturer, bonus, description, country = 'Global', collection, history, ...extra }) {
  const tier = TIERS[rarity] || TIERS.comum;
  const requirement = SHOP_PROGRESSION[rarity] || SHOP_PROGRESSION.comum;
  return {
    name,
    category,
    subcategory,
    rarity,
    price: Math.max(requirement.priceFloor, Math.round(basePrice)),
    manufacturer,
    // Fase 1: ponte marca-patrocínio — correspondência exata de manufacturer
    // contra SPONSOR_CATALOG (sponsors.js). null quando a marca não tem
    // patrocinador correspondente (marcas fictícias do catálogo, "Padel
    // Heritage" etc.) — nesse caso o item cai no fallback de fuzzy match de
    // 10% em computeItemPrice (marketEngine.js), não neste sponsor_id.
    sponsor_id: findSponsorIdByManufacturer(manufacturer),
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

// Única rampa de preço para linhas de raquete: um basePrice por LINHA
// (~rarity-neutro, só varia ±40% entre linhas) vira as 6 variantes de tier
// multiplicando aqui — não dentro de catalogItem(), que agora só recebe
// preço final (ver comentário na tabela TIERS). Escolhido para que a linha
// mais cara em mitico fique perto do piso de exclusivo (65.000) sem passá-lo.
const RACKET_TIER_PRICE_MULTIPLIER = {
  comum: 1, incomum: 1.8, raro: 4, epico: 9, lendario: 18, mitico: 32,
};

const racketItems = [];
RACKET_LINES.forEach(([brand, model, subcategory, bonus, basePrice, description], lineIndex) => {
  RACKET_TIERS.forEach(([rarity, suffix], tierIndex) => {
    // Mantém variedade sem gerar todas as combinações de topo para cada linha.
    if (tierIndex >= 4 && lineIndex % 2 !== tierIndex % 2) return;
    const lineBasePrice = basePrice * (1 + lineIndex * 0.04);
    racketItems.push(catalogItem({
      name: `${brand} ${model} ${suffix}`,
      category: 'raquete', subcategory, rarity, basePrice: lineBasePrice * RACKET_TIER_PRICE_MULTIPLIER[rarity], manufacturer: brand,
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
  // Fase 1 da Loja — 3 itens novos por categoria com só 5 hoje (grip, roupa,
  // tenis, mochila, acessorio_tec, acessorio): 1 épico, 1 lendário, 1
  // mítico, dentro do teto recalibrado na Fase 0 (item mais caro do jogo em
  // 90.000). Bônus só nas 10 chaves reais consumidas pela simulação
  // (ATTRIBUTE_KEYS) — nada de stamina/concentration/reflexes/etc.
  ['Babolat Pro Touch Elite','grip','tacky','epico',8500,'Babolat',{forehand:1,volley:1},'Grip de competição com aderência texturizada, usado por especialistas em toque de rede.'],
  ['Wilson Championship Grip','grip','replacement','lendario',26000,'Wilson',{backhand:1,strategy:1},'Edição de torneio desenvolvida para manter precisão de golpe em partidas de alta pressão.'],
  ['Bullpadel Master Grip Pro','grip','replacement','mitico',58000,'Bullpadel',{volley:1,strategy:1},'Referência técnica da Bullpadel para o Top 10 mundial, equilíbrio absoluto entre controle e conforto.'],
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
  ['Nox Pro Competition Kit','roupa','conjunto','epico',9500,'Nox',{emotional_control:1,agility:1},'Conjunto técnico de competição com tecido de alta respirabilidade para partidas longas.'],
  ['Adidas Elite Tour Jacket','roupa','jaqueta','lendario',28000,'Adidas',{emotional_control:1,strategy:1},'Jaqueta oficial de viagem do circuito internacional, usada por atletas de elite entre partidas.'],
  ['Bullpadel Champion Series','roupa','agasalho','mitico',60000,'Bullpadel',{emotional_control:1,agility:1},'Linha limitada reservada aos campeões do circuito, corte profissional e identidade de elite mundial.'],
  // Tênis
  ['Joma Court Basic','tenis','all_court','comum',480,'Joma',{speed:1},'Estabilidade e proteção para iniciantes.'],
  ['Asics Clay Motion','tenis','clay','incomum',850,'Asics',{agility:1},'Tração segura em superfícies abrasivas.'],
  ['Mizuno Indoor Flash','tenis','indoor','raro',1800,'Mizuno',{speed:1,reflexes:1},'Resposta rápida em quadras indoor.'],
  ['Adidas Pro Stability','tenis','all_court','epico',3200,'Adidas',{agility:1,stamina:1},'Estabilidade profissional em mudanças de direção.'],
  ['Babolat Jet Legend','tenis','all_court','lendario',5800,'Babolat',{agility:1,speed:1},'Calçado de elite para o circuito internacional.'],
  ['Joma Elite Court','tenis','all_court','epico',9000,'Joma',{agility:1,defense:1},'Calçado multicancha de competição com estabilidade lateral reforçada.'],
  ['Asics Pro Tour Legend','tenis','clay','lendario',30000,'Asics',{agility:1,smash:1},'Modelo de saibro desenvolvido para tração máxima em mudanças de direção explosivas.'],
  ['Adidas Master Series','tenis','all_court','mitico',55000,'Adidas',{agility:1,smash:1},'Calçado de elite usado pelos maiores nomes do circuito internacional, resposta imediata em qualquer superfície.'],
  // Mochilas
  ['Padel Start Compact','mochila','compact','comum',260,'Padel Start',{},'Espaço para uma raquete e acessórios.'],
  ['Head Team Backpack','mochila','compact','incomum',620,'Head',{durability:1},'Mochila resistente para treinos semanais.'],
  ['Nox Thermal Duo','mochila','thermal','raro',1400,'Nox',{durability:1,reputation:1},'Compartimento térmico para duas raquetes.'],
  ['Bullpadel Pro 12','mochila','pro','epico',2700,'Bullpadel',{reputation:1},'Raqueteira completa para viagens.'],
  ['Wilson Tour Vault','mochila','thermal','lendario',5200,'Wilson',{reputation:1,emotional_control:1},'Proteção premium para equipamentos de elite.'],
  ['Head Tour Elite Bag','mochila','pro','epico',8800,'Head',{emotional_control:1,strategy:1},'Raqueteira de competição com compartimentos organizados para viagens longas do circuito.'],
  ['Wilson Champion Vault','mochila','thermal','lendario',25000,'Wilson',{emotional_control:1,strategy:1},'Proteção térmica premium para equipamentos de atletas de elite em viagens internacionais.'],
  ['Bullpadel Master Pro 20','mochila','pro','mitico',52000,'Bullpadel',{strategy:1,emotional_control:1},'A raqueteira oficial dos maiores campeões do circuito, capacidade e prestígio em um só equipamento.'],
  // Tecnologia
  ['Pulse Training Band','acessorio_tec','smartwatch','incomum',900,'Pulse',{stamina:1},'Monitoramento básico de carga.'],
  ['PlaySight Shot Sensor','acessorio_tec','sensor','raro',2600,'PlaySight',{strategy:1,concentration:1},'Analisa velocidade e ponto de impacto.'],
  ['Garmin Athlete Pro','acessorio_tec','smartwatch','epico',5200,'Garmin',{stamina:1,health:1},'Controle de carga e recuperação.'],
  ['PlaySight Match Vision','acessorio_tec','camera','lendario',9800,'PlaySight',{strategy:1,tactics:1},'Análise automática de partidas.'],
  ['NeuroCourt Tactical Lab','acessorio_tec','sensor','mitico',16000,'NeuroCourt',{strategy:1,concentration:1,tactics:1},'Tecnologia avançada de leitura tática.'],
  ['Garmin Padel Elite','acessorio_tec','smartwatch','epico',11000,'Garmin',{strategy:1,agility:1},'Monitoramento avançado de performance para atletas competitivos.'],
  ['Playtomic Court Vision','acessorio_tec','sensor','lendario',32000,'Playtomic',{strategy:1,defense:1},'Sensor de análise tática usado por academias de referência do circuito mundial.'],
  ['Movistar Smart Analytics Pro','acessorio_tec','camera','mitico',54000,'Movistar',{strategy:1,agility:1},'Sistema de análise conectada de última geração, usado por comissões técnicas de elite.'],
  // Acessórios
  ['Joma Wristband Base','acessorio','wristband','comum',60,'Joma',{},'Pulseira absorvente para treinos.'],
  ['Adidas Focus Headband','acessorio','headband','incomum',160,'Adidas',{concentration:1},'Mantém o foco durante rallies longos.'],
  ['Nox Racket Protector','acessorio','protetor','raro',380,'Nox',{durability:2},'Proteção adicional contra impactos.'],
  ['HydroSport Thermal Pro','acessorio','garrafa','epico',750,'HydroSport',{stamina:1},'Garrafa térmica de alto rendimento.'],
  ['Therabody Recovery Kit','acessorio','recovery','lendario',1800,'Therabody',{health:1,stamina:1},'Kit portátil de recuperação muscular.'],
  ['Nox Elite Wristband','acessorio','wristband','epico',7200,'Nox',{agility:1},'Pulseira de competição com tecido de alta absorção para rallies longos.'],
  ['Adidas Focus Master','acessorio','headband','lendario',22000,'Adidas',{emotional_control:1,strategy:1},'Faixa de cabeça de edição limitada usada por atletas de elite em finais de torneio.'],
  ['Therabody Recovery Master','acessorio','recovery','mitico',48000,'Therabody',{emotional_control:1,defense:1},'Kit de recuperação de ponta usado por comissões médicas de times de elite mundial.'],
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
    // Fase 1: sponsor_id é preenchido só quando AUSENTE — diferente do resto
    // de `fields` acima (que sempre sincroniza com o template), aqui um
    // valor explícito já salvo (mesmo que divirja do template) nunca é
    // sobrescrito. image_url não entra em `fields` — nunca foi, permanece
    // intocado por este reparo.
    if (!normalized.sponsor_id && template.sponsor_id) patch.sponsor_id = template.sponsor_id;
    if (Object.keys(patch).length > 0) {
      await localGame.entities.ShopItem.update(item.id, patch);
      repaired += 1;
    }
  }

  // Fase 0.1 do redesenho da Loja: 4 itens de demonstração vêm de
  // @/local/localSeed.js (via initializeCareerInitialData, ids fixos
  // shop-001..004) — antes da correção lá, usavam base_price/current_price
  // em vez do campo `price` do schema, e 2 deles estavam com rarity 'raro'
  // incoerente com o próprio preço (custavam menos que o item 'comum' ao
  // lado). O loop acima não os alcança: seus nomes não batem com nenhum
  // template de EXPANDED_ITEMS. Saves criados antes da correção em
  // localSeed.js já persistiram esses 4 registros com os campos errados —
  // repara pelos ids conhecidos para não deixar saves existentes presos no
  // estado antigo (a correção na fonte só vale para carreira nova).
  const LEGACY_LOCAL_SEED_SHOP_ITEM_FIX = {
    'shop-001': { price: 500, rarity: 'comum' },
    'shop-002': { price: 350, rarity: 'comum' },
    'shop-003': { price: 80, rarity: 'comum' },
    'shop-004': { price: 220, rarity: 'comum' },
  };
  for (const item of existing) {
    const fix = LEGACY_LOCAL_SEED_SHOP_ITEM_FIX[item?.id];
    if (!fix) continue;
    const patch = {};
    if (item.price !== fix.price) patch.price = fix.price;
    if (item.rarity !== fix.rarity) patch.rarity = fix.rarity;
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
