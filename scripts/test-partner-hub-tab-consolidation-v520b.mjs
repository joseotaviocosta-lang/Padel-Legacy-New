// Playthrough 5.20-B, Partes L/M/N/O — MINHA DUPLA: 7 ABAS -> 4.
//
// "Minha Dupla" foi a maior excecao da 5.20-A: sobreviveu com 7 abas
// (Propostas, Buscar parceiro, Minha dupla, Caixa de Entrada, Assessores,
// Contrato, Historico). Tres delas tratam do MESMO assunto — o mercado de
// duplas — e viraram filtros internos; "Assessores" nao e equipe contratada, e
// conselho sobre a dupla, e virou secao da Visao geral.
//
// O risco da consolidacao nao e visual, e de ENDERECO: cada notificacao do jogo
// aponta para /partners?view=<nome antigo>, e saves da 5.19 ja tem essas
// notificacoes gravadas. Se a traducao falhar, o aviso abre a pagina certa na
// aba errada — exatamente o defeito que a 5.19 corrigiu no aviso de contrato.
//
// Gates:
//   1. no maximo 4 abas de primeiro nivel;
//   2. TODO `view=` emitido pelo codigo de produto tem traducao;
//   3. cada nome antigo das 7 abas resolve para aba + filtro corretos;
//   4. nenhum painel foi perdido na consolidacao.
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
const SRC = readFileSync(new URL('../src/pages/PartnerHub.jsx', import.meta.url), 'utf8');

const { TAB_DEFS, MARKET_FILTERS, LEGACY_VIEW_MAP, resolveView } = HUB;

console.log('\n=== Partes L/M: reducao de abas ===');
note(`abas de primeiro nivel=${TAB_DEFS.length} (${TAB_DEFS.map((t) => t.key).join(', ')})`);
note(`filtros de mercado=${MARKET_FILTERS.length} (${MARKET_FILTERS.map((f) => f.key).join(', ')})`);
check('Parte M (gate): no maximo 4 abas de primeiro nivel', () => {
  assert.ok(TAB_DEFS.length <= 4, `${TAB_DEFS.length} abas; a Parte M pede no maximo 4`);
});
check('Parte M: as 4 areas sao as da especificacao', () => {
  assert.deepEqual(TAB_DEFS.map((t) => t.key), ['overview', 'market', 'contract', 'history']);
});

console.log('\n=== Parte O: traducao dos deep links ===');
// As 7 chaves antigas, como estavam na 5.20-A.
const OLD_TABS = ['offers', 'search', 'overview', 'inbox', 'advisors', 'contract', 'history'];
check('Parte O (gate): todas as 7 abas antigas tem traducao', () => {
  const missing = OLD_TABS.filter((k) => !LEGACY_VIEW_MAP[k]);
  assert.deepEqual(missing, [], `sem traducao: ${missing.join(', ')}`);
});

const EXPECTED = {
  offers: ['market', 'received'],
  search: ['market', 'search'],
  inbox: ['market', 'inbox'],
  advisors: ['overview', 'received'],
  overview: ['overview', 'received'],
  contract: ['contract', 'received'],
  history: ['history', 'received'],
};
console.log('\nview antigo        -> aba         filtro');
for (const view of OLD_TABS) {
  const r = resolveView(new URLSearchParams(`view=${view}`));
  console.log(`${view.padEnd(18)} -> ${r.tab.padEnd(11)} ${r.filter}`);
}
check('Parte O (gate): cada nome antigo resolve para aba e filtro corretos', () => {
  for (const view of OLD_TABS) {
    const r = resolveView(new URLSearchParams(`view=${view}`));
    assert.deepEqual([r.tab, r.filter], EXPECTED[view], `view=${view} resolveu para ${r.tab}/${r.filter}`);
    assert.ok(r.known, `view=${view} nao foi reconhecido`);
  }
});
check('Parte O: um ?filter= explicito tem prioridade sobre o padrao do mapa', () => {
  const r = resolveView(new URLSearchParams('view=offers&filter=inbox'));
  assert.equal(r.tab, 'market');
  assert.equal(r.filter, 'inbox');
});
check('Parte O: filtro invalido na URL nao deixa a aba sem conteudo', () => {
  const r = resolveView(new URLSearchParams('view=offers&filter=lixo'));
  assert.ok(MARKET_FILTERS.some((f) => f.key === r.filter), `filtro ${r.filter} nao existe`);
});
check('Parte O: um view desconhecido nao e tratado como reconhecido', () => {
  const r = resolveView(new URLSearchParams('view=inexistente'));
  assert.equal(r.known, false, 'view invalido marcado como conhecido sobrescreveria a aba atual');
});

// O gate que protege o futuro: qualquer `view=` que o produto emita precisa ter
// traducao. Sem isso, uma notificacao nova nasce apontando para o vazio.
console.log('\n=== Parte O: views emitidos pelo codigo de produto ===');
const PRODUCT_FILES = [
  'src/game-core/partnerLifecycle.js',
  'src/game-core/postSeparationMarket.js',
  'src/lib/notificationDestinations.js',
  'src/lib/careerDecisionCenter.js',
  'src/lib/careerNextAction.js',
];
const emitted = new Set();
for (const file of PRODUCT_FILES) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  // Coletar todo `view:` seria medida errada: `view: 'sponsors'` pertence a
  // /game/economy, nao a /partners. So conta o view ligado a ESTA rota, e cada
  // ocorrencia dessas esta numa unica linha.
  for (const line of text.split('\n')) {
    if (!line.includes('/partners')) continue;
    for (const m of line.matchAll(/view[=:]\s*'?([a-z-]+)'?/g)) emitted.add(m[1]);
  }
}
note(`views emitidos=${[...emitted].sort().join(', ')}`);
check('Parte O (gate): todo view emitido pelo produto tem traducao', () => {
  const orphans = [...emitted].filter((v) => !LEGACY_VIEW_MAP[v]);
  assert.deepEqual(orphans, [], `view emitido sem traducao: ${orphans.join(', ')}`);
});

console.log('\n=== Parte L: nenhum painel perdido ===');
// A consolidacao reduz abas, nao funcionalidade. Os 7 paineis continuam
// renderizados em algum lugar da pagina.
const PANELS = ['PartnerOverview', 'AdvisorPanel', 'PartnerOffersPanel', 'PartnerSearch', 'InboxPanel', 'ContractPanel', 'PartnerHistory'];
check('Parte L (gate): os 7 paineis originais continuam renderizados', () => {
  const lost = PANELS.filter((name) => !SRC.includes(`<${name}`));
  assert.deepEqual(lost, [], `painel perdido na consolidacao: ${lost.join(', ')}`);
});
check('Parte N: o conselho de assessoria ficou na Visao geral', () => {
  const overview = SRC.slice(SRC.indexOf("{activeTab === 'overview'"), SRC.indexOf("{activeTab === 'market'"));
  assert.ok(overview.includes('<AdvisorPanel'), 'AdvisorPanel nao esta no bloco da Visao geral');
});
check('Parte M: os tres paineis de mercado ficaram sob a aba Mercado', () => {
  const market = SRC.slice(SRC.indexOf("{activeTab === 'market'"), SRC.indexOf("{activeTab === 'contract'"));
  for (const name of ['PartnerOffersPanel', 'PartnerSearch', 'InboxPanel']) {
    assert.ok(market.includes(`<${name}`), `${name} nao esta sob a aba Mercado`);
  }
});

await server.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
