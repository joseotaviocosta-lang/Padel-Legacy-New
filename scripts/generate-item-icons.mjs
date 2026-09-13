// Loja — Ícones de item (categoria×raridade). SVG, viewBox 0 0 100 100
// consistente em todos os arquivos.
//
// Silhuetas vêm de bibliotecas open source prontas — não são mais
// desenhadas à mão via coordenadas manuais (três rodadas de ajuste manual
// não chegaram a um resultado reconhecível de forma confiável):
//
// - Lucide (ISC, já usado em outras telas do jogo) para 7 categorias que
//   têm ícone genérico adequado: grip→cylinder, bola→circle, roupa→shirt,
//   mochila→backpack, acessorio_tec→watch, colecionavel→trophy,
//   acessorio→package. Node data copiada literalmente de
//   node_modules/lucide-react/dist/esm/icons/*.js (viewBox nativo 24×24,
//   stroke-width 2) — normalizada aqui só por transform (translate+scale),
//   nenhuma coordenada de path foi editada à mão.
// - Game-icons.net (CC BY 3.0 — atribuição em ASSET_CREDITS.md) para as 2
//   categorias sem ícone genérico adequado no Lucide: raquete→tennis-racket
//   (autor: Delapouite), tenis→running-shoe (autor: Delapouite). ViewBox
//   nativo 512×512, path original preenchido (fill), só recolorido para o
//   material neutro e normalizado por transform — path `d` intocado.
//
// Sistema de raridade (anel + halo) já aprovado — não alterado aqui.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'items');

// Cores de acento por raridade — mesma família de cor usada em
// RARITY_STYLES (equipmentCatalog.js), tom 500 do Tailwind.
const RARITY_ACCENT = {
  comum: '#64748b',      // slate-500
  incomum: '#22c55e',    // green-500
  raro: '#3b82f6',       // blue-500
  epico: '#a855f7',      // purple-500
  lendario: '#f59e0b',   // amber-500
  mitico: '#f43f5e',     // rose-500
  exclusivo: '#06b6d4',  // cyan-500
};

// Presença do disco/anel de fundo por raridade — aprovado, sem alteração.
// Baixa raridade quase some, alta ganha anel mais espesso + halo (círculos
// extra de opacidade baixa, sem blur).
const RARITY_BACKDROP = {
  comum:     { ringOpacity: 0.18, ringWidth: 1.0, fillOpacity: 0.03, glow: false },
  incomum:   { ringOpacity: 0.28, ringWidth: 1.2, fillOpacity: 0.04, glow: false },
  raro:      { ringOpacity: 0.38, ringWidth: 1.4, fillOpacity: 0.05, glow: false },
  epico:     { ringOpacity: 0.48, ringWidth: 1.8, fillOpacity: 0.07, glow: false },
  lendario:  { ringOpacity: 0.58, ringWidth: 2.2, fillOpacity: 0.09, glow: false },
  mitico:    { ringOpacity: 0.75, ringWidth: 2.8, fillOpacity: 0.12, glow: true },
  exclusivo: { ringOpacity: 0.85, ringWidth: 3.2, fillOpacity: 0.14, glow: true },
};

// Material da silhueta — SEMPRE o mesmo, nunca muda com a raridade.
const MATERIAL = '#6b7280'; // gray-500

// ─── Fonte 1: Lucide (stroke) ───────────────────────────────────────────────
// Node data copiada de node_modules/lucide-react/dist/esm/icons/*.js
// (removido só o campo `key`, que é interno do React e não existe em SVG
// puro). viewBox nativo 24×24, stroke-width nativo 2.
const LUCIDE_ICON_NODES = {
  grip: [ // cylinder.js
    ['ellipse', { cx: 12, cy: 5, rx: 9, ry: 3 }],
    ['path', { d: 'M3 5v14a9 3 0 0 0 18 0V5' }],
  ],
  bola: [ // circle.js
    ['circle', { cx: 12, cy: 12, r: 10 }],
  ],
  roupa: [ // shirt.js
    ['path', { d: 'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z' }],
  ],
  mochila: [ // backpack.js
    ['path', { d: 'M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z' }],
    ['path', { d: 'M8 10h8' }],
    ['path', { d: 'M8 18h8' }],
    ['path', { d: 'M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6' }],
    ['path', { d: 'M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2' }],
  ],
  acessorio_tec: [ // watch.js
    ['circle', { cx: 12, cy: 12, r: 6 }],
    ['polyline', { points: '12 10 12 12 13 13' }],
    ['path', { d: 'm16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05' }],
    ['path', { d: 'm7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05' }],
  ],
  colecionavel: [ // trophy.js
    ['path', { d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' }],
    ['path', { d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' }],
    ['path', { d: 'M4 22h16' }],
    ['path', { d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' }],
    ['path', { d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' }],
    ['path', { d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' }],
  ],
  acessorio: [ // package.js
    ['path', { d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z' }],
    ['path', { d: 'M12 22V12' }],
    ['polyline', { points: '3.29 7 12 12 20.71 7' }],
    ['path', { d: 'm7.5 4.27 9 5.15' }],
  ],
};

const LUCIDE_TAG_ATTRS = {
  path: (a) => `d="${a.d}"`,
  circle: (a) => `cx="${a.cx}" cy="${a.cy}" r="${a.r}"`,
  ellipse: (a) => `cx="${a.cx}" cy="${a.cy}" rx="${a.rx}" ry="${a.ry}"`,
  polyline: (a) => `points="${a.points}"`,
  line: (a) => `x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}"`,
  rect: (a) => `x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}"${a.rx ? ` rx="${a.rx}"` : ''}`,
};

// Normaliza 24×24 (nativo Lucide) para o footprint de ~72 unidades usado em
// todo ícone, centralizado em (50,50): scale=3, translate=50-12*3=14.
const LUCIDE_SCALE = 3;
const LUCIDE_TRANSLATE = 50 - 12 * LUCIDE_SCALE; // 14
// stroke-width final = STROKE_WIDTH_LOCAL * LUCIDE_SCALE = 8 (mesmo peso
// visual do restante do sistema).
const STROKE_WIDTH_LOCAL = 8 / LUCIDE_SCALE;

function renderLucideIcon(category) {
  const nodes = LUCIDE_ICON_NODES[category];
  if (!nodes) return null;
  const shapes = nodes.map(([tag, attrs]) => {
    const attrString = LUCIDE_TAG_ATTRS[tag](attrs);
    return `<${tag} ${attrString} fill="none" stroke="${MATERIAL}" stroke-width="${STROKE_WIDTH_LOCAL}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('\n    ');
  return `<g transform="translate(${LUCIDE_TRANSLATE},${LUCIDE_TRANSLATE}) scale(${LUCIDE_SCALE})">
    ${shapes}
  </g>`;
}

// ─── Fonte 2: Game-icons.net (fill) ─────────────────────────────────────────
// path `d` original de game-icons.net (autor Delapouite, CC BY 3.0 — ver
// ASSET_CREDITS.md), viewBox nativo 512×512. O path de fundo do arquivo
// original (retângulo preto cobrindo o viewBox) foi descartado — só o
// glyph em si (originalmente fill="#fff") é usado aqui, recolorido para o
// material neutro. O `d` do glyph não foi editado.
const GAME_ICONS_PATHS = {
  // delapouite/tennis-racket.svg
  raquete: 'M365.6 31c-6.6 0-13.2.6-19.7 1.59-34.5 5.44-66.5 23.14-88.3 44.96-28.8 28.85-49.6 70.85-58.4 111.65-1.6 6.7-2.6 13.6-3.5 20.4L162.2 334l15.8 15.8 124.3-33.5c6.8-.9 13.7-2 20.5-3.5 40.8-8.8 82.8-29.6 111.6-58.4 21.9-21.9 39.6-53.9 45-88.4 5.2-34.5-2.4-72.3-31.9-101.71-23.8-23.93-53.1-33.44-81.9-33.29zm.1 19.29c24.3-.28 47.9 7.49 68.2 27.71 25 24.9 31 55.2 26.3 85-4.6 29.9-20.7 58.8-39.5 77.6-25.4 25.4-64.7 45.2-102 53.2-37.2 8.2-71.2 3.8-87.8-12.9-16.5-16.5-20.9-50.4-12.8-87.7 8.1-37.2 27.8-76.6 53.3-101.94 18.7-18.78 47.7-34.84 77.6-39.55 5.5-.88 11.2-1.36 16.7-1.42zm-166 214.81c3.7 11.3 9.3 21.5 17.5 29.5 8.1 8.2 18.2 14 29.5 17.6l-63 16zm-50.3 83.6L50 448.2l-5.25-5.1-13.71 13.7L55.41 481l13.7-13.6-5.41-5.4 99.5-99.6zm211 45.1c-19.5 0-35.6 16-35.6 35.5s16.1 35.5 35.6 35.5c19.4 0 35.5-16 35.5-35.5s-16.1-35.5-35.5-35.5z',
  // delapouite/running-shoe.svg
  tenis: 'M135.6 38.35l-17 6.17c6.2 16.99 9.1 34.17 2.3 51.32 4.5 4.76 8.9 9.46 13.3 14.06 12.5-24.41 9.2-50.15 1.4-71.55zm-25.8 71.95c-6.8 2.6-12.82 5.9-18.27 9.7 27.17 29.8 50.17 61.6 63.77 92.1 12.7 28.7 17.4 57.3 7.2 81.1l219.8 158.9c27.5-1.4 45.3-8.1 57.5-17.5 12.8-9.8 20.1-22.9 25.4-38.4-2.9-3.2-6.1-6.3-9.6-9.4-25.7 4.5-48.2-.6-66.9-12.4-19.5-12.2-34.8-31.1-47.8-53-24.5-41.3-41-94-57.7-137.5-44.5 4.5-77.1-1.7-102.7-14.2-30.6-15-50.7-38.1-70.7-59.4zm-31.92 21.5c-4.57 4.9-8.65 10.3-12.34 16.1-10.56 16.7-17.8 37-23.99 57.9l105.85 76.5c5.7-17.1 2.3-38.5-8.6-62.9-12.5-27.9-34.6-58.6-60.92-87.6zm238.92 47c-5.2 1-10.2 1.9-15.2 2.7 3.7 9.7 7.4 19.7 11.1 29.8l26 13.1c-6.9-16.1-13.7-31.5-21.9-45.6zm-285.29 42c-2.72 2.9-4.48 5.9-5.39 9-1.23 4-1.07 8.4 1.01 13.8L266 398c21.8 14 41.4 25.6 59.2 35.1zm290.29 15.3c6.9 18.3 14.2 36.4 22.3 53.1l33.2 14.7c-11.2-18.1-19.8-36.1-27.5-53.7zm36.2 78.8c11.7 19.2 25 34.7 40.3 44.3 11 6.9 22.9 10.9 36.8 11.3-14.8-12.4-27.1-25.2-37.6-38.2zm119.8 98.4c-5.9 13.3-14.2 25.8-27 35.6-11.4 8.7-26 15.2-44.7 18.6 17.5 4.9 31.2 6.5 41.6 6.1 14.9-.6 23.4-4.7 28.6-8.8 5.2-4.1 7.2-8.2 8.1-10.2 3.5-7.8 3.2-19.9-2.5-33.3-1.1-2.6-2.5-5.3-4.1-8z',
};

// Normaliza 512×512 (nativo game-icons.net) para o mesmo footprint de ~70
// unidades: scale=70/512, translate=50-256*scale=15.
const GAME_ICON_SCALE = 70 / 512;
const GAME_ICON_TRANSLATE = 50 - 256 * GAME_ICON_SCALE; // 15

function renderGameIcon(category) {
  const d = GAME_ICONS_PATHS[category];
  if (!d) return null;
  return `<g transform="translate(${GAME_ICON_TRANSLATE},${GAME_ICON_TRANSLATE}) scale(${GAME_ICON_SCALE})">
    <path d="${d}" fill="${MATERIAL}"/>
  </g>`;
}

function renderSilhouette(category) {
  return renderLucideIcon(category) || renderGameIcon(category);
}

function buildIconSvg(category, rarity) {
  const accent = RARITY_ACCENT[rarity];
  const backdrop = RARITY_BACKDROP[rarity];
  const silhouette = renderSilhouette(category);
  if (!accent || !backdrop) throw new Error(`Raridade sem configuração: ${rarity}`);
  if (!silhouette) throw new Error(`Categoria sem ícone-fonte definido: ${category}`);

  const glowCircles = backdrop.glow
    ? `<circle cx="50" cy="50" r="49" fill="${accent}" fill-opacity="0.05"/>
  <circle cx="50" cy="50" r="47.5" fill="${accent}" fill-opacity="0.09"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-hidden="true">
  ${glowCircles}
  <circle cx="50" cy="50" r="46" fill="${accent}" fill-opacity="${backdrop.fillOpacity}"/>
  <circle cx="50" cy="50" r="46" fill="none" stroke="${accent}" stroke-width="${backdrop.ringWidth}" stroke-opacity="${backdrop.ringOpacity}"/>
  ${silhouette}
</svg>
`;
}

function writeIcon(category, rarity) {
  mkdirSync(OUT_DIR, { recursive: true });
  const svg = buildIconSvg(category, rarity);
  const filePath = path.join(OUT_DIR, `${category}-${rarity}.svg`);
  writeFileSync(filePath, svg, 'utf8');
  return { filePath, svg };
}

// CLI: node scripts/generate-item-icons.mjs cat1:rarity1 cat2:rarity2 ...
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Uso: node scripts/generate-item-icons.mjs categoria:raridade [categoria:raridade ...]');
  process.exit(1);
}
for (const arg of args) {
  const [category, rarity] = arg.split(':');
  const { filePath } = writeIcon(category, rarity);
  console.log('Gerado:', path.relative(process.cwd(), filePath));
}

export { buildIconSvg, writeIcon, RARITY_ACCENT, RARITY_BACKDROP, LUCIDE_ICON_NODES, GAME_ICONS_PATHS };
