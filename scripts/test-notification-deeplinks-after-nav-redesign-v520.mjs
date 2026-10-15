// Playthrough 5.20, Parte AG — DEEP LINKS DE NOTIFICACAO APOS A REORGANIZACAO.
//
// Este e o teste de maior risco da fase. A consolidacao transformou 18 rotas em
// redirect, e as notificacoes do jogo apontam para VARIAS delas: /coaches,
// /staff, /press, /world-events, /game/calendar. Se um desses redirects
// estivesse errado, a notificacao abriria "o lugar certo sem contexto" — o
// defeito exato que a 5.19 corrigiu no aviso de contrato.
//
// Gate: toda rota alcancada por notificacao resolve para uma pagina real, e
// quando passa por redirect, a aba de destino e a correta.
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
const DEST = readFileSync(new URL('../src/lib/notificationDestinations.js', import.meta.url), 'utf8');

const routes = new Map();
for (const m of APP.matchAll(/<Route path="([^"]+)" element=\{([\s\S]*?)\} \/>/g)) routes.set(m[1], m[2].trim());

installShims('/notif-deeplinks');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const dest = await vite.ssrLoadModule('/src/lib/notificationDestinations.js');

// Rotas que a camada de notificacao pode abrir, extraidas do proprio arquivo.
const literals = [...new Set([...DEST.matchAll(/'(\/[a-z0-9/-]+)'/g)].map((m) => m[1]))];

console.log(`\n=== Parte AG: ${literals.length} rotas alcancadas por notificacao ===\n`);
console.log(`${'rota da notificacao'.padEnd(26)}${'situacao'.padEnd(13)}destino final`);
const rows = [];
for (const route of literals.sort()) {
  const el = routes.get(route);
  let status; let final = route;
  if (!el) { status = 'SEM ROTA'; final = '—'; }
  else if (el.includes('LegacyRedirect')) {
    const to = (/to="([^"]+)"/.exec(el) || [, '?'])[1];
    const tab = (/tab="([^"]+)"/.exec(el) || [, null])[1];
    status = 'redirect';
    final = tab ? `${to}?tab=${tab}` : to;
  } else if (el.includes('Navigate')) { status = 'navigate'; final = (/to=[{"]([^"}]+)/.exec(el) || [, '?'])[1]; }
  else { status = 'direta'; }
  rows.push({ route, status, final, el });
  console.log(`${route.padEnd(26)}${status.padEnd(13)}${final}`);
}
console.log('');

check('Parte AG (gate): toda rota de notificacao continua roteada', () => {
  const missing = rows.filter((r) => r.status === 'SEM ROTA');
  note(`rotas verificadas=${rows.length} | sem rota=${missing.length}`);
  for (const m of missing) note(`  QUEBRADA: ${m.route}`);
  assert.equal(missing.length, 0);
});

check('Parte AG (gate): redirects de notificacao levam a aba correta', () => {
  // Mapa esperado das notificacoes que passaram a redirecionar.
  const EXPECTED = {
    '/coaches': '/career/team?tab=coach',
    '/staff': '/career/team?tab=staff',
    '/press': '/world/circuit?tab=press',
    '/world-events': '/world/circuit?tab=circuit',
    '/game/calendar': '/tournaments?tab=calendar',
  };
  const wrong = [];
  for (const [route, expected] of Object.entries(EXPECTED)) {
    const row = rows.find((r) => r.route === route);
    if (!row) { wrong.push(`${route}: ausente`); continue; }
    if (row.final !== expected) wrong.push(`${route}: ${row.final} != ${expected}`);
  }
  note(`redirects de notificacao conferidos=${Object.keys(EXPECTED).length} | incorretos=${wrong.length}`);
  for (const w of wrong) note(`  ${w}`);
  assert.equal(wrong.length, 0);
});

check('Parte AG: o destino canonico do aviso de contrato segue intacto', () => {
  // A 5.19 corrigiu este fluxo; a reorganizacao de rotas nao pode desfaze-lo.
  const fn = dest.resolveNotificationDestination || dest.resolveDestination;
  assert.ok(typeof fn === 'function', 'resolvedor de destino nao exportado');
  const resolved = fn({
    message_type: 'partner_contract_expiry',
    destination: { type: 'CONTRACT', route: '/partners', params: { view: 'contract', focus: 'contract-future' } },
  });
  note(`contrato -> ${JSON.stringify(resolved).slice(0, 120)}`);
  assert.ok(String(resolved?.route || '').startsWith('/partners'), 'o aviso de contrato deixou de apontar para /partners');
  assert.ok(/view=contract/.test(String(resolved?.route)), 'perdeu a aba de contrato');
});

check('Parte AG: /partners nao foi consolidado (segue rota propria)', () => {
  // "Minha dupla" tem 707 linhas e e destino de varias notificacoes com params
  // proprios (?view=, ?focus=, ?offer=). Consolida-la custaria mais do que
  // ganha, e a Parte I pede reduzir abas INTERNAS, nao fundir a pagina.
  const el = routes.get('/partners') || '';
  note(`/partners -> ${el.slice(0, 40)}`);
  assert.ok(routes.has('/partners'), '/partners desapareceu');
  assert.ok(!el.includes('LegacyRedirect'), '/partners virou redirect e perderia ?view=/?focus=/?offer=');
});

check('Parte AG: rotas de notificacao com params proprios nao foram redirecionadas', () => {
  // Redirecionar uma rota cujo link traz params e seguro (LegacyRedirect
  // preserva), mas rotas com sistema de view PROPRIO ficam melhor intactas.
  const keepDirect = ['/tournaments', '/ranking', '/communications', '/game/missions', '/game/economy'];
  for (const route of keepDirect) {
    const el = routes.get(route) || '';
    assert.ok(routes.has(route), `${route} desapareceu`);
    assert.ok(!el.includes('LegacyRedirect'), `${route} virou redirect`);
  }
  note(`${keepDirect.length} rotas de notificacao mantidas diretas`);
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
