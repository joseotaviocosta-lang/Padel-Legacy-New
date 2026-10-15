// Playthrough 5.20, Partes U/V/AE — NAVEGACAO MOVEL E ALVOS DE TOQUE.
//
// A auditoria da Parte A encontrou o BottomNav JA implementado (5 colunas +
// bottom sheet "Mais"), com "Gestao" aninhada no sheet em vez de ocupar uma 6a
// aba. Esta fase nao recriou a barra; ela melhora o CONTEUDO dela, porque o
// sheet "Mais" caiu de 7 para 4 itens e "Carreira" de 11 para 6.
//
// O que este teste protege: a barra continua com no maximo 5 botoes, todo grupo
// seguue alcancavel no mobile, e os alvos de toque respeitam 44px (Parte AE).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const BOTTOM = readFileSync(new URL('../src/components/BottomNav.jsx', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

installShims('/mobile-nav');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { NAV_GROUPS } = await vite.ssrLoadModule('/src/navigation/navigationConfig.js');

const tabIds = (/const TAB_GROUP_IDS = \[([^\]]+)\]/.exec(BOTTOM) || [, ''])[1]
  .split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);

console.log('\n=== Parte V: barra inferior ===\n');
console.log(`  abas fixas: ${tabIds.join(' · ')} + Mais`);
console.log(`  colunas no grid: ${(/grid-cols-(\d+)/.exec(BOTTOM.slice(BOTTOM.indexOf('pl-bottom-nav-h'))) || [, '?'])[1]}`);
const moreGroup = NAV_GROUPS.find((g) => g.id === 'more');
const mgmtGroup = NAV_GROUPS.find((g) => g.id === 'management');
console.log(`  sheet "Mais": ${moreGroup.items.length} itens (era 7)`);
console.log(`  sheet "Gestão": ${mgmtGroup.items.length} itens`);
console.log('');

check('Parte V (gate): no maximo 5 botoes principais', () => {
  const total = tabIds.length + 1; // +1 = botao "Mais"
  note(`botoes fixos=${total}`);
  assert.ok(total <= 5, `${total} botoes na barra inferior`);
});

check('Parte V: todo grupo do sidebar e alcancavel no mobile', () => {
  const reachable = new Set([...tabIds, 'more']);
  // Gestao nao e aba, mas aparece DENTRO do sheet "Mais".
  if (/managementGroup/.test(BOTTOM)) reachable.add('management');
  const unreachable = NAV_GROUPS.filter((g) => !reachable.has(g.id));
  note(`grupos=${NAV_GROUPS.length} | alcancaveis=${reachable.size} | inalcancaveis=${unreachable.length}`);
  for (const g of unreachable) note(`  INALCANCAVEL no mobile: ${g.label}`);
  assert.equal(unreachable.length, 0);
});

check('Parte V: nao usa menu hamburguer como navegacao principal', () => {
  const hasFixedBar = /fixed/.test(BOTTOM) && /bottom-0|inset-x-0/.test(BOTTOM);
  note(`barra fixa inferior=${hasFixedBar}`);
  assert.ok(hasFixedBar, 'a navegacao movel nao e uma barra fixa');
});

console.log('=== Parte AE: alvos de toque ===\n');
const tokens = {};
for (const m of CSS.matchAll(/--pl-(bottom-nav-h|touch-min|header-h):\s*([0-9.]+)(rem|px)/g)) {
  const px = m[3] === 'rem' ? Number(m[2]) * 16 : Number(m[2]);
  tokens[m[1]] = px;
  console.log(`  --pl-${m[1].padEnd(14)} ${m[2]}${m[3]} = ${px}px`);
}
const minWidth = (/min-w-\[([0-9.]+)rem\]/.exec(BOTTOM) || [, null])[1];
if (minWidth) console.log(`  largura minima do alvo  ${minWidth}rem = ${Number(minWidth) * 16}px`);
console.log('');

check('Parte AE (gate): altura da barra respeita 44px', () => {
  note(`--pl-bottom-nav-h = ${tokens['bottom-nav-h']}px`);
  assert.ok(tokens['bottom-nav-h'] >= 44, `barra com ${tokens['bottom-nav-h']}px`);
});

check('Parte AE (gate): largura do alvo respeita 44px', () => {
  const px = minWidth ? Number(minWidth) * 16 : null;
  note(`largura minima do botao = ${px}px`);
  assert.ok(px && px >= 44, `alvo com ${px}px de largura`);
});

check('Parte AE: existe token de area minima de toque', () => {
  note(`--pl-touch-min = ${tokens['touch-min'] ?? '(ausente)'}px`);
  assert.ok(tokens['touch-min'] >= 44, 'token de toque minimo abaixo de 44px ou ausente');
});

check('Parte V: a barra respeita a area segura do aparelho', () => {
  const safe = /safe-area-inset-bottom|env\(safe-area/.test(BOTTOM) || /safe-area-inset-bottom/.test(CSS);
  note(`safe-area-inset-bottom considerado=${safe}`);
  assert.ok(safe, 'a barra pode ficar sob o gesto do sistema');
});

check('Parte U: o sheet "Mais" ficou menor com a consolidacao', () => {
  note(`itens no sheet: 7 -> ${moreGroup.items.length}`);
  assert.ok(moreGroup.items.length < 7, 'o sheet "Mais" nao diminuiu');
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
