// ─── Equipment Catalog Utilities ─────────────────────────────────────────────
// Shared helpers for the equipment catalog

export const RARITY_ORDER = ['comum', 'incomum', 'raro', 'epico', 'lendario', 'mitico', 'exclusivo'];

export const RARITY_STYLES = {
  comum:      { badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30',    card: 'from-slate-500/10 to-transparent',     label: 'Comum',      color: 'text-slate-300' },
  incomum:   { badge: 'bg-green-500/15 text-green-300 border-green-500/30',   card: 'from-green-500/10 to-transparent',    label: 'Incomum',    color: 'text-green-300' },
  raro:      { badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',      card: 'from-blue-500/10 to-transparent',     label: 'Raro',       color: 'text-blue-300' },
  epico:     { badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',card: 'from-purple-500/10 to-transparent',   label: 'Épico',      color: 'text-purple-300' },
  lendario:  { badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',   card: 'from-amber-500/10 to-transparent',    label: 'Lendário',   color: 'text-amber-300' },
  mitico:    { badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',      card: 'from-rose-500/10 to-transparent',     label: 'Mítico',     color: 'text-rose-300' },
  exclusivo: { badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',      card: 'from-cyan-500/10 to-transparent',      label: 'Exclusivo',  color: 'text-cyan-300' },
};

// Mesma família de cor de RARITY_STYLES/RARITY_ACCENT (generate-item-icons.mjs),
// em hex — para uso em `style` inline (CSS-in-JS), onde classes Tailwind não
// servem (ex.: tingir a boneca de Aparência pela raridade do item equipado).
export const RARITY_HEX = {
  comum: '#64748b',
  incomum: '#22c55e',
  raro: '#3b82f6',
  epico: '#a855f7',
  lendario: '#f59e0b',
  mitico: '#f43f5e',
  exclusivo: '#06b6d4',
};

export const CATEGORY_META = {
  raquete:        { label: 'Raquetes',           icon: 'Disc',      emoji: '🎾' },
  grip:           { label: 'Grips',              icon: 'Circle',    emoji: '🔘' },
  bola:           { label: 'Bolas',              icon: 'Target',    emoji: '🟡' },
  roupa:          { label: 'Vestuário',          icon: 'Shirt',     emoji: '👕' },
  tenis:          { label: 'Tênis',              icon: 'Footprints',emoji: '👟' },
  mochila:        { label: 'Mochilas',           icon: 'Briefcase', emoji: '🎒' },
  acessorio_tec:  { label: 'Tecnologia',         icon: 'Zap',       emoji: '⚡' },
  colecionavel:   { label: 'Colecionáveis',      icon: 'Crown',     emoji: '👑' },
  acessorio:      { label: 'Acessórios',         icon: 'Package',   emoji: '匣' },
};

export const SUBCATEGORY_LABELS = {
  // Raquetes
  control: 'Controle', power: 'Potência', hybrid: 'Híbrida', allround: 'All-round',
  // Roupas
  camisa: 'Camisa', shorts: 'Shorts', jaqueta: 'Jaqueta', conjunto: 'Conjunto', agasalho: 'Agasalho',
  // Tênis
  clay: 'Saibro', all_court: 'Multicancha', indoor: 'Indoor',
  // Grips
  overgrip: 'Overgrip', replacement: 'Substituição', dry: 'Antiderrapante', tacky: 'Adesivo',
  // Bolas
  match: 'Partida', training: 'Treino', premium: 'Premium',
  // Mochilas
  pro: 'Pro', compact: 'Compacta', thermal: 'Térmica',
  // Tecnologia
  smartwatch: 'Smartwatch', sensor: 'Sensor', camera: 'Câmera',
  // Colecionáveis
  trofeu: 'Troféu', medalha: 'Medalha', replica: 'Réplica',
  // Acessórios
  protetor: 'Protetor', pound: 'Vibrador', wristband: 'Pulseira', headband: 'Headband', garrafa: 'Garrafa',
};

export function getRarityStyle(rarity) {
  return RARITY_STYLES[rarity] || RARITY_STYLES.comum;
}

export function rarityValue(rarity) {
  return RARITY_ORDER.indexOf(rarity);
}

// ─── Ícones de item (categoria×raridade) ──
// Decisão já aprovada: ícone estilizado por CATEGORIA, com cor/acabamento
// por RARIDADE — não é arte única por item. Um arquivo por combinação
// categoria×raridade é reaproveitado por todo item dessa combinação. Fundo
// transparente, silhueta neutra, acento visual pela cor de RARITY_STYLES
// (o verde-lima da identidade do jogo fica só na interface). Quando os
// assets existirem, popular ShopItem.image_url com este caminho — via
// migração em ensureExpandedShopCatalog() (mesmo padrão do reparo de
// sponsor_id) — faz todo item da combinação exibir o ícone automaticamente,
// sem mudar ItemImage.jsx nem seus consumidores.
export function getCategoryRarityIconAssetPath(category, rarity) {
  return `/assets/items/${category}-${rarity}.svg`;
}