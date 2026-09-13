// Loja — Ícones de item (categoria×raridade). SVG, viewBox 0 0 100 100
// consistente em todos os arquivos.
//
// Silhuetas vêm de bibliotecas open source prontas — não são mais
// desenhadas à mão via coordenadas manuais (três rodadas de ajuste manual
// não chegaram a um resultado reconhecível de forma confiável):
//
// - Lucide (ISC, já usado em outras telas do jogo) para 8 categorias que
//   têm ícone genérico adequado: grip→cylinder, bola→circle, roupa→shirt,
//   mochila→backpack, tenis→shoe (Tabler, ver abaixo — mesma família
//   visual), acessorio_tec→watch, colecionavel→trophy, acessorio→package.
//   Node data copiada literalmente de
//   node_modules/lucide-react/dist/esm/icons/*.js (viewBox nativo 24×24,
//   stroke-width 2) — normalizada aqui só por transform (translate+scale),
//   nenhuma coordenada de path foi editada à mão.
// - Tabler Icons (MIT) para tenis→shoe.svg: Lucide não tinha ícone de
//   calçado; Tabler usa a MESMA convenção (viewBox 24×24, stroke-width 2,
//   fill=none) — não precisou de fator de escala diferente do Lucide.
// - raquete: construída a partir de elementos geométricos simples (não é
//   mais Game-icons.net). Nenhuma biblioteca (Lucide, Tabler, Phosphor,
//   Iconoir, nem Game-icons.net além do tennis-racket já descartado) tem
//   ícone de PADEL/paddle — só raquete de tênis (cabeça alongada, cordas)
//   ou ping-pong (cena de jogada). Padel tem cabeça curta e larga, corpo
//   sólido sem cordas, cabo curto com cordão de pulso — geometricamente
//   simples o bastante para construir sem repetir o erro das rodadas
//   manuais anteriores (aquelas tentavam simular categorias arbitrárias;
//   esta é literalmente 3 primitivas: oval + linha + ponto). Cabeça e
//   ponta do cabo são preenchidas (fill), não contornadas — um contorno
//   fino (fill=none) lia como espelho de mão/pirulito, não como uma
//   raquete de face sólida. O cabo usa o MESMO stroke-width das outras 8
//   categorias (não um traço mais fino) — só o preenchimento muda, nunca a
//   espessura de linha. Resultado: 9 categorias na mesma convenção 24×24 /
//   peso de traço, zero assimetria fill-vs-stroke entre categorias.
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
  tenis: [ // Tabler Icons, icons/outline/shoe.svg (MIT) — mesmo viewBox
    // 24×24 e stroke-width 2 do Lucide, mesma linhagem visual (Feather).
    ['path', { d: 'M4 6h5.426a1 1 0 0 1 .863 .496l1.064 1.823a3 3 0 0 0 1.896 1.407l4.677 1.114a4 4 0 0 1 3.074 3.89v2.27a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10a1 1 0 0 1 1 -1' }],
    ['path', { d: 'M14 13l1 -2' }],
    ['path', { d: 'M8 18v-1a4 4 0 0 0 -4 -4h-1' }],
    ['path', { d: 'M10 12l1.5 -3' }],
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

// ─── Fonte 2: raquete de padel, construída (mesmo viewBox 24×24 do Lucide) ──
// Cabeça curta e larga preenchida (fill) + cabo em trapézio (mesma peça,
// "pescoço" quase inexistente) — corpo sólido sem cordas, diferente de uma
// raquete de tênis. Grade densa de 16 furos pequenos e uniformes (mesmo
// raio) crua transparência real via <mask> — testado: poucos furos grandes
// ou 2 furos simétricos leem como rosto/chocalho; a grade densa lê como
// superfície perfurada de verdade. Recorte de "garganta" (elipse vazada, ↑
// mesma máscara) na junção cabeça↔cabo interrompe o contorno contínuo que
// fazia ler como "alfinete/chupeta" mesmo com a cabeça achatada. Laço do
// cordão de pulso usa stroke mais fino (1.3, não STROKE_WIDTH_LOCAL) só
// nesse detalhe — no raio pequeno do laço, o peso padrão fecha o furo e
// vira ponto sólido de novo.
function renderRacketIcon(category, maskId) {
  if (category !== 'raquete') return null;
  return `<g transform="translate(${LUCIDE_TRANSLATE},${LUCIDE_TRANSLATE}) scale(${LUCIDE_SCALE})">
    <defs>
      <mask id="${maskId}">
        <rect x="0" y="0" width="24" height="24" fill="white"/>
        <circle cx="8.25" cy="4.8" r="0.38" fill="black"/>
        <circle cx="10.75" cy="4.8" r="0.38" fill="black"/>
        <circle cx="13.25" cy="4.8" r="0.38" fill="black"/>
        <circle cx="15.75" cy="4.8" r="0.38" fill="black"/>
        <circle cx="8.25" cy="6.2" r="0.38" fill="black"/>
        <circle cx="10.75" cy="6.2" r="0.38" fill="black"/>
        <circle cx="13.25" cy="6.2" r="0.38" fill="black"/>
        <circle cx="15.75" cy="6.2" r="0.38" fill="black"/>
        <circle cx="8.25" cy="7.6" r="0.38" fill="black"/>
        <circle cx="10.75" cy="7.6" r="0.38" fill="black"/>
        <circle cx="13.25" cy="7.6" r="0.38" fill="black"/>
        <circle cx="15.75" cy="7.6" r="0.38" fill="black"/>
        <circle cx="8.25" cy="9.0" r="0.38" fill="black"/>
        <circle cx="10.75" cy="9.0" r="0.38" fill="black"/>
        <circle cx="13.25" cy="9.0" r="0.38" fill="black"/>
        <circle cx="15.75" cy="9.0" r="0.38" fill="black"/>
        <ellipse cx="12" cy="11.3" rx="2.1" ry="1.4" fill="black"/>
      </mask>
    </defs>
    <g mask="url(#${maskId})">
      <ellipse cx="12" cy="8" rx="7" ry="5.4" fill="${MATERIAL}"/>
      <polygon points="8,11 16,11 14,17 10,17" fill="${MATERIAL}"/>
    </g>
    <circle cx="12" cy="19" r="1.8" fill="none" stroke="${MATERIAL}" stroke-width="1.3"/>
  </g>`;
}

function renderSilhouette(category, rarity) {
  return renderLucideIcon(category) || renderRacketIcon(category, `racketThroat-${rarity}`);
}

function buildIconSvg(category, rarity) {
  const accent = RARITY_ACCENT[rarity];
  const backdrop = RARITY_BACKDROP[rarity];
  const silhouette = renderSilhouette(category, rarity);
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

export { buildIconSvg, writeIcon, RARITY_ACCENT, RARITY_BACKDROP, LUCIDE_ICON_NODES };
