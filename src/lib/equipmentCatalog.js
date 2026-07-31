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