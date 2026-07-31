import { base44 } from '@/api/base44Client';

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

function cleanKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeShopItem(item) {
  const rawCategory = cleanKey(item?.category);
  const rawRarity = cleanKey(item?.rarity);
  return {
    ...item,
    name: String(item?.name || 'Item sem nome').trim(),
    description: String(item?.description || '').trim(),
    manufacturer: String(item?.manufacturer || 'Sem marca').trim(),
    category: CATEGORY_ALIASES[rawCategory] || rawCategory || 'acessorio',
    rarity: RARITY_ALIASES[rawRarity] || rawRarity || 'comum',
    subcategory: cleanKey(item?.subcategory) || 'geral',
    price: (() => {
      const stored = Number(item?.price);
      if (Number.isFinite(stored) && stored > 0) return stored;
      const row = EXPANDED_ITEMS.find(entry => cleanKey(entry[0]) === cleanKey(item?.name));
      return row ? Number(row[4]) : 100;
    })(),
    durability: Number.isFinite(Number(item?.durability)) ? Number(item.durability) : 100,
    is_available: item?.is_available !== false,
    attribute_bonus: item?.attribute_bonus && typeof item.attribute_bonus === 'object' ? item.attribute_bonus : {},
  };
}

const EXPANDED_ITEMS = [
  ['Raquete Control One','raquete','control','comum',280,'Padel Start',{volley:1,positioning:1},'Raquete redonda para controle e aprendizagem.'],
  ['Raquete Power Entry','raquete','power','incomum',430,'Padel Start',{smash:2},'Modelo de entrada com balanceamento alto.'],
  ['Raquete Hybrid Flow','raquete','hybrid','raro',780,'Nox',{forehand:2,backhand:2},'Raquete híbrida equilibrada para todos os estilos.'],
  ['Nox AT10 Genius','raquete','hybrid','epico',1450,'Nox',{volley:3,bandeja:3},'Modelo avançado para precisão e versatilidade.'],
  ['Head Extreme Pro','raquete','power','epico',1580,'Head',{smash:4,strength:2},'Potência máxima para jogadores ofensivos.'],
  ['Adidas Metalbone','raquete','power','lendario',2600,'Adidas',{smash:5,serve:3},'Raquete de elite com sistema de pesos.'],
  ['Wilson Bela Pro','raquete','control','lendario',2450,'Wilson',{volley:4,positioning:4},'Controle profissional inspirado em uma lenda.'],
  ['Bullpadel Hack 04','raquete','power','mitico',3900,'Bullpadel',{smash:6,bandeja:4},'Equipamento de competição para atletas de elite.'],
  ['Overgrip Dry Pack','grip','dry','comum',45,'Tour Grip',{concentration:1},'Pacote com três grips secos.'],
  ['Overgrip Comfort x6','grip','overgrip','incomum',95,'Head',{control:1},'Maior conforto e absorção.'],
  ['Grip Pro Tacky','grip','tacky','raro',160,'Wilson',{forehand:1,backhand:1},'Aderência reforçada para partidas longas.'],
  ['Replacement Grip Elite','grip','replacement','epico',280,'Bullpadel',{volley:2,control:1},'Grip de substituição premium.'],
  ['Bolas Training x3','bola','training','comum',30,'Padel Start',{},'Bolas resistentes para treino.'],
  ['Bolas Match Pro x3','bola','match','incomum',55,'Head',{},'Bolas rápidas para partidas oficiais.'],
  ['Bolas Premium Tour x3','bola','premium','raro',90,'Wilson',{reflexes:1},'Pressão estável e quique uniforme.'],
  ['Camisa Performance','roupa','camisa','comum',120,'Joma',{stamina:1},'Camisa leve para treino.'],
  ['Shorts Competition','roupa','shorts','incomum',180,'Adidas',{speed:1},'Shorts elástico com bolsos.'],
  ['Conjunto Pro Tour','roupa','conjunto','raro',420,'Bullpadel',{stamina:2,reputation:1},'Conjunto oficial para torneios.'],
  ['Jaqueta Travel Team','roupa','jaqueta','epico',650,'Nox',{reputation:2},'Jaqueta de viagem da equipe.'],
  ['Agasalho Signature','roupa','agasalho','lendario',1100,'Wilson',{reputation:4,followers:20},'Linha exclusiva para atletas patrocinados.'],
  ['Tênis Court Basic','tenis','all_court','comum',260,'Joma',{speed:1},'Calçado estável para iniciantes.'],
  ['Tênis Clay Motion','tenis','clay','incomum',390,'Asics',{agility:2},'Tração reforçada em superfícies abrasivas.'],
  ['Tênis Indoor Flash','tenis','indoor','raro',590,'Mizuno',{speed:2,reflexes:1},'Leve e rápido para quadras indoor.'],
  ['Tênis Pro Stability','tenis','all_court','epico',920,'Adidas',{agility:3,stamina:2},'Estabilidade profissional em mudanças de direção.'],
  ['Mochila Compact','mochila','compact','comum',150,'Padel Start',{},'Espaço para uma raquete e acessórios.'],
  ['Mochila Thermal Duo','mochila','thermal','raro',480,'Nox',{durability:1},'Compartimento térmico para duas raquetes.'],
  ['Raqueteira Pro 12','mochila','pro','epico',780,'Bullpadel',{reputation:1},'Raqueteira completa para o circuito.'],
  ['Sensor de Golpes','acessorio_tec','sensor','raro',850,'PlaySight',{tactics:2,concentration:2},'Analisa velocidade e ponto de impacto.'],
  ['Smartwatch Athlete','acessorio_tec','smartwatch','epico',1350,'Garmin',{stamina:3,health:2},'Monitoramento de carga e recuperação.'],
  ['Câmera Match Vision','acessorio_tec','camera','lendario',2800,'PlaySight',{tactics:5},'Grava e analisa partidas automaticamente.'],
  ['Pulseira Absorvente','acessorio','wristband','comum',35,'Joma',{},'Conforto durante treinos intensos.'],
  ['Faixa de Cabeça','acessorio','headband','incomum',70,'Adidas',{concentration:1},'Mantém o suor longe dos olhos.'],
  ['Protetor de Raquete','acessorio','protetor','incomum',85,'Nox',{durability:5},'Proteção extra para impactos no vidro.'],
  ['Garrafa Térmica Pro','acessorio','garrafa','raro',210,'HydroSport',{stamina:1},'Mantém a hidratação por horas.'],
  ['Kit Recuperação','acessorio','recovery','epico',680,'Therabody',{health:3,stamina:2},'Kit portátil de recuperação muscular.'],
  ['Medalha Circuito Local','colecionavel','medalha','raro',500,'Padel Heritage',{reputation:2},'Peça comemorativa do circuito local.'],
  ['Réplica Troféu Major','colecionavel','replica','epico',1400,'Padel Heritage',{reputation:5,followers:30},'Réplica oficial de um Major histórico.'],
  ['Raquete Vintage 1995','colecionavel','replica','lendario',3200,'Padel Heritage',{reputation:8},'Raquete histórica restaurada.'],
  ['Troféu Fundadores','colecionavel','trofeu','exclusivo',6500,'Padel Heritage',{reputation:12,followers:100},'Item raro da origem do circuito profissional.'],
];

function buildItem(row, index) {
  const [name, category, subcategory, rarity, price, manufacturer, attribute_bonus, description] = row;
  return {
    name, category, subcategory, rarity, price, manufacturer, attribute_bonus, description,
    durability: 100,
    release_year: 2026,
    is_available: true,
    is_exclusive: rarity === 'exclusivo',
    collection: rarity === 'exclusivo' || category === 'colecionavel' ? 'Padel Legacy Collection' : 'Circuito 2026',
    icon: 'Package',
    country: ['Nox','Bullpadel','Joma'].includes(manufacturer) ? 'Espanha' : ['Babolat'].includes(manufacturer) ? 'França' : 'Global',
    catalog_order: index,
  };
}

export async function ensureExpandedShopCatalog() {
  const existing = (await base44.entities.ShopItem.list('-created_date', 500)) || [];
  const catalog = EXPANDED_ITEMS.map(buildItem);
  const byName = new Map(catalog.map(item => [cleanKey(item.name), item]));
  const names = new Set(existing.map(i => cleanKey(i?.name)));
  const missing = catalog.filter(item => !names.has(cleanKey(item.name)));

  // Corrige itens antigos criados com preço zero/nulo e normaliza campos essenciais.
  let repaired = 0;
  for (const item of existing) {
    if (!item?.id) continue;
    const template = byName.get(cleanKey(item.name));
    const currentPrice = Number(item.price);
    if (template && (!Number.isFinite(currentPrice) || currentPrice <= 0)) {
      await base44.entities.ShopItem.update(item.id, {
        price: template.price,
        category: template.category,
        subcategory: template.subcategory,
        rarity: template.rarity,
        manufacturer: template.manufacturer,
        is_available: item.is_available !== false,
      });
      repaired += 1;
    }
  }

  if (missing.length > 0) {
    if (base44.entities.ShopItem.bulkCreate) await base44.entities.ShopItem.bulkCreate(missing);
    else for (const item of missing) await base44.entities.ShopItem.create(item);
  }
  return { created: missing.length, repaired, total: existing.length + missing.length };
}
