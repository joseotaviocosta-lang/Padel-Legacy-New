// Playthrough 5.20, Partes AH/AL — NENHUMA ROTA APAGADA, NENHUMA FUNCAO PERDIDA.
//
// A Parte AH e explicita: nao apagar rota sem redirect, e nao quebrar
// notificacoes antigas, saves, deep links nem links internos. A Parte AL exige
// que, ao unir paginas, o conteudo continue acessivel e a acao continue
// funcionando.
//
// Este teste verifica a matriz inteira: para cada rota que SAIU do menu, existe
// rota (redirect ou hub) e a aba de destino esta correta.
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

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const routes = new Map();
for (const m of APP.matchAll(/<Route path="([^"]+)" element=\{([\s\S]*?)\} \/>/g)) {
  routes.set(m[1], m[2].trim());
}

installShims('/legacy-redirects');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { NAV_GROUPS } = await vite.ssrLoadModule('/src/navigation/navigationConfig.js');
const menuTargets = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to)));

// Matriz da Parte AL: pagina antiga -> novo destino -> aba.
const MATRIX = [
  ['/profile', '/career/athlete', 'profile'],
  ['/character', '/career/athlete', 'appearance'],
  ['/game/inventory', '/career/training', 'inventory'],
  ['/game/shop', '/career/training', 'shop'],
  ['/coaches', '/career/team', 'coach'],
  ['/staff', '/career/team', 'staff'],
  ['/relationships', '/career/relations', 'people'],
  ['/fans', '/career/relations', 'fans'],
  ['/journal', '/world/circuit', 'news'],
  ['/world-events', '/world/circuit', 'circuit'],
  ['/press', '/world/circuit', 'press'],
  ['/community', '/world/circuit', 'community'],
  ['/athletes', '/world/directory', 'athletes'],
  ['/clubs', '/world/directory', 'clubs'],
  ['/history', '/encyclopedia', 'history'],
  ['/hall-of-fame', '/game/legacy', 'hall'],
];

console.log('\n=== Parte AL: matriz de preservacao ===\n');
console.log(`${'pagina antiga'.padEnd(20)}${'novo destino'.padEnd(22)}${'aba'.padEnd(13)}rota existe?`);
for (const [from, to, tab] of MATRIX) {
  const el = routes.get(from) || '';
  const ok = el.includes('LegacyRedirect') && el.includes(`to="${to}"`) && el.includes(`tab="${tab}"`);
  console.log(`${from.padEnd(20)}${to.padEnd(22)}${tab.padEnd(13)}${ok ? 'sim' : 'NAO'}`);
}
console.log('');

check('Parte AH (gate): toda rota antiga continua atendida', () => {
  const missing = MATRIX.filter(([from]) => !routes.has(from));
  note(`rotas antigas verificadas: ${MATRIX.length} | ausentes: ${missing.length}`);
  for (const [from] of missing) note(`  APAGADA SEM REDIRECT: ${from}`);
  assert.equal(missing.length, 0);
});

check('Parte AH (gate): cada redirect aponta para o destino e a aba corretos', () => {
  const wrong = [];
  for (const [from, to, tab] of MATRIX) {
    const el = routes.get(from) || '';
    if (!el.includes('LegacyRedirect')) { wrong.push(`${from}: nao e redirect`); continue; }
    if (!el.includes(`to="${to}"`)) wrong.push(`${from}: destino errado`);
    if (!el.includes(`tab="${tab}"`)) wrong.push(`${from}: aba errada`);
  }
  note(`redirects conferidos: ${MATRIX.length} | incorretos: ${wrong.length}`);
  for (const w of wrong) note(`  ${w}`);
  assert.equal(wrong.length, 0);
});

check('Parte AH: o redirect PRESERVA query params do link original', () => {
  const src = readFileSync(new URL('../src/components/navigation/LegacyRedirect.jsx', import.meta.url), 'utf8');
  const keepsSearch = /new URLSearchParams\(location\.search\)/.test(src);
  const keepsHash = /location\.hash/.test(src);
  const doesNotClobber = /if \(tab && !params\.get\(paramName\)\)/.test(src);
  note(`preserva search=${keepsSearch} | preserva hash=${keepsHash} | nao sobrescreve aba do link=${doesNotClobber}`);
  assert.ok(keepsSearch, 'o redirect descarta query params — deep link perderia contexto');
  assert.ok(doesNotClobber, 'o redirect sobrescreve a aba pedida pelo link original');
});

check('Parte AL: todo destino de menu tem rota declarada', () => {
  const orphans = [...menuTargets].filter((t) => {
    const base = String(t).split('?')[0];
    return !routes.has(base);
  });
  note(`destinos de menu: ${menuTargets.size} | sem rota: ${orphans.length}`);
  for (const o of orphans) note(`  ORFAO: ${o}`);
  assert.equal(orphans.length, 0);
});

check('Parte AL: os hubs existem como rota real', () => {
  for (const hub of ['/career/athlete', '/career/training', '/career/team', '/career/relations', '/world/circuit', '/world/directory']) {
    assert.ok(routes.has(hub), `hub sem rota: ${hub}`);
    assert.ok(/Hub \/>/.test(routes.get(hub)), `${hub} nao renderiza um hub`);
  }
  note('6 hubs com rota propria');
});

check('Parte AL: /encyclopedia e /game/legacy passaram a renderizar hub', () => {
  note(`/encyclopedia -> ${routes.get('/encyclopedia')}`);
  note(`/game/legacy  -> ${routes.get('/game/legacy')}`);
  assert.ok(/EncyclopediaHub/.test(routes.get('/encyclopedia') || ''));
  assert.ok(/LegacyHub/.test(routes.get('/game/legacy') || ''));
});

check('Parte AH: nenhuma rota duplicada (comportamento ambiguo)', () => {
  const all = [...APP.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
  const dup = all.filter((x, i) => all.indexOf(x) !== i);
  note(`rotas declaradas: ${all.length} | duplicadas: ${new Set(dup).size}`);
  for (const d of new Set(dup)) note(`  DUPLICADA: ${d}`);
  assert.equal(new Set(dup).size, 0);
});

check('Parte AL: /game/training-center preservou seu sistema de views', () => {
  // Esta rota tem params proprios (?view=training|match|agenda|progress|center)
  // usados por APP_ROUTES.TRAINING_AGENDA etc. Redirecionar para a aba do hub
  // DESCARTARIA o view — por isso ela nao foi redirecionada, apenas saiu do
  // menu, e o hub renderiza a mesma pagina na aba "Treinos".
  //
  // ATENCAO: esta rota e declarada por EXPRESSAO (path={APP_ROUTES.TRAINING_CENTER}),
  // nao por string literal. A 1a versao deste teste procurava so literais e
  // acusou "rota desapareceu" — era a verificacao incompleta, nao o produto.
  const marker = String.fromCharCode(123) + "APP_ROUTES.TRAINING_CENTER" + String.fromCharCode(125);
  const declared = APP.includes("<Route path=" + marker);
  const isRedirect = APP.includes("<Route path=" + marker + " element={<LegacyRedirect");
  note("declarada por expressao: " + declared + " | virou redirect: " + isRedirect);
  assert.ok(declared, 'a rota do centro de treinamento desapareceu');
  assert.equal(isRedirect, false, 'redirecionar esta rota perderia o parametro ?view=');
  assert.ok(routes.has('/training-center'), 'o alias /training-center desapareceu');
  note("/training-center -> " + String(routes.get("/training-center") || "").slice(0, 56));
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
