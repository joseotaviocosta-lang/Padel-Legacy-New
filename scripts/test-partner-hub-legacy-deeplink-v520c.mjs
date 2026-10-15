// Playthrough 5.20-C, item 4 — MINHA DUPLA: 4 ABAS E DEEP LINKS LEGADOS.
//
// A consolidacao 7 -> 4 da 5.20-B so e segura enquanto TODO link antigo
// continuar chegando onde deve. As notificacoes gravadas em saves da 5.19
// conhecem apenas os nomes antigos de aba, e nenhuma delas sera reescrita:
// quem tem de ceder e a tela.
//
// Este teste cobre as tres chaves que o produto emite — ?view=, ?focus= e
// ?offer= — inclusive combinadas, que e como a notificacao de contrato chega
// (view=contract&focus=contract-future&partnership=...).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const HUB = await server.ssrLoadModule('/src/pages/PartnerHub.jsx');
const { TAB_DEFS, MARKET_FILTERS, LEGACY_VIEW_MAP, resolveView } = HUB;
const SRC = readFileSync(new URL('../src/pages/PartnerHub.jsx', import.meta.url), 'utf8');

console.log('\n=== Item 4: as 4 areas continuam ===');
note(`abas=${TAB_DEFS.length} (${TAB_DEFS.map((t) => t.key).join(', ')})`);
check('item 4 (gate): exatamente 4 abas, nas areas do briefing', () => {
  assert.deepEqual(TAB_DEFS.map((t) => t.key), ['overview', 'market', 'contract', 'history']);
});
check('item 4: Mercado mantem os 3 filtros internos', () => {
  assert.deepEqual(MARKET_FILTERS.map((f) => f.key), ['received', 'search', 'inbox']);
});

console.log('\n=== Item 4: deep links legados ===');
// Nome antigo -> onde tem de cair. Os cinco casos nomeados no briefing estao
// todos aqui: contrato, proposta recebida, buscar parceiro, caixa, historico.
const CASOS = [
  ['contrato', 'view=contract', 'contract', null],
  ['proposta recebida', 'view=offers', 'market', 'received'],
  ['buscar parceiro', 'view=search', 'market', 'search'],
  ['caixa de entrada', 'view=inbox', 'market', 'inbox'],
  ['historico', 'view=history', 'history', null],
  ['visao geral', 'view=overview', 'overview', null],
  ['assessores (aba extinta)', 'view=advisors', 'overview', null],
];
console.log('caso                        url                   aba        filtro');
for (const [nome, qs] of CASOS) {
  const r = resolveView(new URLSearchParams(qs));
  console.log(`${nome.padEnd(27)} ?${qs.padEnd(20)} ${r.tab.padEnd(10)} ${r.filter}`);
}
check('item 4 (gate): os 5 destinos nomeados no briefing resolvem certo', () => {
  for (const [nome, qs, aba, filtro] of CASOS) {
    const r = resolveView(new URLSearchParams(qs));
    assert.equal(r.tab, aba, `${nome}: aba`);
    if (filtro) assert.equal(r.filter, filtro, `${nome}: filtro`);
    assert.ok(r.known, `${nome}: view nao reconhecido`);
  }
});

console.log('\n=== Item 4: chaves combinadas ===');
check('item 4 (gate): view + focus (aviso de contrato) chega ao contrato', () => {
  const r = resolveView(new URLSearchParams('view=contract&focus=contract-future&partnership=abc'));
  assert.equal(r.tab, 'contract');
  assert.ok(SRC.includes("focus === 'contract-future'"), 'o foco de contrato deixou de ser tratado');
});
check('item 4 (gate): view + offer (proposta especifica) chega ao mercado', () => {
  const r = resolveView(new URLSearchParams('view=offers&offer=xyz'));
  assert.equal(r.tab, 'market');
  assert.equal(r.filter, 'received');
  assert.ok(SRC.includes("searchParams.get('offer')"), 'o id da oferta deixou de ser lido');
});
check('item 4: ?filter= explicito tem prioridade sobre o padrao do mapa', () => {
  const r = resolveView(new URLSearchParams('view=offers&filter=inbox'));
  assert.equal(r.filter, 'inbox');
});
check('item 4: view desconhecido nao sequestra a aba atual', () => {
  assert.equal(resolveView(new URLSearchParams('view=coisa-que-nao-existe')).known, false);
});

console.log('\n=== Item 4: nada emitido pelo produto ficou sem traducao ===');
const FONTES = [
  'src/game-core/partnerLifecycle.js',
  'src/game-core/postSeparationMarket.js',
  'src/lib/notificationDestinations.js',
  'src/lib/careerDecisionCenter.js',
  'src/lib/careerNextAction.js',
];
const emitidos = new Set();
for (const f of FONTES) {
  const texto = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  for (const linha of texto.split('\n')) {
    if (!linha.includes('/partners')) continue;
    for (const m of linha.matchAll(/view[=:]\s*'?([a-z-]+)'?/g)) emitidos.add(m[1]);
  }
}
note(`views emitidos pelo produto: ${[...emitidos].sort().join(', ')}`);
check('item 4 (gate): todo view emitido tem traducao', () => {
  const orfaos = [...emitidos].filter((v) => !LEGACY_VIEW_MAP[v]);
  assert.deepEqual(orfaos, [], `sem traducao: ${orfaos.join(', ')}`);
});

console.log('\n=== Item 4: nenhuma funcao perdida ===');
const PAINEIS = ['PartnerOverview', 'AdvisorPanel', 'PartnerOffersPanel', 'PartnerSearch', 'InboxPanel', 'ContractPanel', 'PartnerHistory'];
check('item 4 (gate): os 7 paineis originais continuam renderizados', () => {
  const perdidos = PAINEIS.filter((n) => !SRC.includes(`<${n}`));
  assert.deepEqual(perdidos, [], `painel perdido: ${perdidos.join(', ')}`);
});

await server.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
