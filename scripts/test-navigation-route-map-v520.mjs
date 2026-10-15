// Playthrough 5.20, Partes A/B/AJ/AK — MAPA DE NAVEGACAO E METRICA DE COMPLEXIDADE.
//
// Metricas "antes", medidas contra HEAD=d5e5a2e (docs/UI_UX_AUDIT_V520.md):
//   6 grupos | 38 itens de menu | 57 rotas em App.jsx
//
// A auditoria mostrou 11 itens so em "Carreira" e varias paginas de 135-157
// linhas ocupando entrada propria (Temporada: 78, Administracao: 66). A Parte AK
// pede comprovar a simplificacao, sem perseguir numero arbitrario.
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

const BEFORE = Object.freeze({ groups: 6, items: 38, routes: 57 });

installShims('/nav-map');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const nav = await vite.ssrLoadModule('/src/navigation/navigationConfig.js');
const { NAV_GROUPS, ALL_SHELL_ITEMS, groupForPath } = nav;

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const routePaths = [...APP.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
const leafItems = NAV_GROUPS.flatMap((g) => g.items);

console.log('\n=== Parte AK: metrica de complexidade ===\n');
console.log(`${'metrica'.padEnd(28)}${'antes'.padStart(8)}${'depois'.padStart(9)}${'delta'.padStart(9)}`);
const rows = [
  ['grupos no sidebar', BEFORE.groups, NAV_GROUPS.length],
  ['itens de menu (folhas)', BEFORE.items, leafItems.length],
  ['rotas em App.jsx', BEFORE.routes, routePaths.length],
];
for (const [label, before, after] of rows) {
  const d = after - before;
  console.log(`${label.padEnd(28)}${String(before).padStart(8)}${String(after).padStart(9)}${String(d > 0 ? `+${d}` : d).padStart(9)}`);
}
console.log('');
console.log('Estrutura resultante:');
for (const g of NAV_GROUPS) {
  console.log(`  ${g.label.padEnd(12)}${String(g.items.length).padStart(2)} itens${g.items.length ? '  — ' + g.items.map((i) => i.label).join(' · ') : ''}`);
}
console.log('');

check('Parte AK (gate): o menu ficou substancialmente menor', () => {
  note(`itens: ${BEFORE.items} -> ${leafItems.length}`);
  assert.ok(leafItems.length < BEFORE.items, 'o menu nao diminuiu');
  // "Substancialmente" = pelo menos um terco menor. Nao e alvo arbitrario: a
  // auditoria identificou 21 itens unificaveis em 38.
  assert.ok(leafItems.length <= BEFORE.items * 0.67, `${leafItems.length} itens ainda e proximo de ${BEFORE.items}`);
});

check('Parte B: os 6 grupos principais foram preservados', () => {
  note(`grupos: ${NAV_GROUPS.map((g) => g.label).join(' · ')}`);
  assert.equal(NAV_GROUPS.length, 6);
});

check('Parte AJ: nenhum grupo volta a ter menu longo', () => {
  const fat = NAV_GROUPS.filter((g) => g.items.length > 6);
  note(`itens por grupo: ${NAV_GROUPS.map((g) => `${g.label}=${g.items.length}`).join(' ')}`);
  for (const g of fat) note(`  grupo longo: ${g.label} (${g.items.length})`);
  assert.equal(fat.length, 0, 'algum grupo passou de 6 itens');
});

check('Parte E/F/G/H: Carreira caiu de 11 para no maximo 6 itens', () => {
  const career = NAV_GROUPS.find((g) => g.id === 'career');
  note(`Carreira: 11 -> ${career.items.length} (${career.items.map((i) => i.label).join(', ')})`);
  assert.ok(career.items.length <= 6, `Carreira tem ${career.items.length} itens`);
});

check('Parte N/O/P: Mundo caiu de 7 para no maximo 2 itens', () => {
  const world = NAV_GROUPS.find((g) => g.id === 'world');
  note(`Mundo: 7 -> ${world.items.length} (${world.items.map((i) => i.label).join(', ')})`);
  assert.ok(world.items.length <= 2, `Mundo tem ${world.items.length} itens`);
});

check('Parte J/K/L: Calendario e Temporada sairam do menu', () => {
  const targets = leafItems.map((i) => i.to);
  note(`itens de Competir: ${NAV_GROUPS.find((g) => g.id === 'competition').items.map((i) => i.label).join(', ')}`);
  assert.ok(!targets.includes('/game/calendar'), 'Calendario ainda esta no menu');
  assert.ok(!targets.includes('/game/season'), 'Temporada ainda esta no menu');
});

check('Parte S/T: Notificacoes saiu do menu (entrada e o sino do header)', () => {
  const targets = leafItems.map((i) => i.to);
  assert.ok(!targets.includes('/communications'), 'Notificacoes ainda ocupa entrada de menu');
  note('entrada principal de notificacoes: sino do header (CommunicationBell)');
});

check('Parte R: ferramentas de dev sairam do menu do jogador', () => {
  const targets = leafItems.map((i) => i.to);
  for (const devTool of ['/admin', '/database']) {
    assert.ok(!targets.includes(devTool), `${devTool} ainda esta no menu`);
  }
  note('/admin e /database continuam acessiveis por URL, fora do menu');
});

check('Parte AK: ALL_SHELL_ITEMS continua coerente com os grupos', () => {
  const expected = NAV_GROUPS.reduce((n, g) => n + (g.to ? 1 : 0) + g.items.length, 0);
  note(`ALL_SHELL_ITEMS=${ALL_SHELL_ITEMS.length} | esperado=${expected}`);
  assert.equal(ALL_SHELL_ITEMS.length, expected);
});

check('Parte AJ: groupForPath resolve as rotas novas e as antigas', () => {
  const cases = [
    ['/career/athlete', 'career'],
    ['/career/training', 'career'],
    ['/career/team', 'career'],
    ['/career/relations', 'career'],
    ['/world/circuit', 'world'],
    ['/world/directory', 'world'],
    ['/profile', 'career'],
    ['/press', 'world'],
    ['/game/calendar', 'competition'],
  ];
  for (const [path, expectedId] of cases) {
    const g = groupForPath(path);
    assert.ok(g, `${path} nao resolve grupo nenhum`);
    assert.equal(g.id, expectedId, `${path} resolveu ${g.id}, esperado ${expectedId}`);
  }
  note(`${cases.length} caminhos verificados, todos com grupo ativo correto`);
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
