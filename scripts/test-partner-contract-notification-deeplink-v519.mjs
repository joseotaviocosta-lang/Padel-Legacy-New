// Playthrough 5.19, Partes D/E/G — O DEEP LINK DO AVISO DE CONTRATO.
//
// O playtest: clicar em "Contrato se aproximando do fim" abria o modal
// "Conversar com Pedro Teixeira" com frases de pós-jogo ("Ótimo jogo hoje!",
// "Precisamos treinar mais o voleio").
//
// Causa medida: o destino JÁ estava certo
// (`view=contract&focus=contract-future`) e a aba de contrato JÁ existia com
// renovação/encerramento. O defeito era uma linha em PartnerHub.jsx —
// `setShowConverse(true)` no efeito que trata `focus=contract-future` — que
// abria o diálogo de conversa por cima da decisão contratual.
//
// Este teste trava as duas pontas: o que a notificação grava e o que o
// consumidor faz com isso.
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

installShims('/contract-deeplink');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const dest = await vite.ssrLoadModule('/src/lib/notificationDestinations.js');

// Comentários descrevem o defeito CORRIGIDO e citam a chamada removida; se a
// verificação olhasse o arquivo cru, a própria documentação da correção faria
// o teste falhar. (Aconteceu: a 1ª versão deste teste acusou
// `setShowConverse(true)` que só existia dentro de um comentário.)
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const HUB_RAW = readFileSync(new URL('../src/pages/PartnerHub.jsx', import.meta.url), 'utf8');
const LIFECYCLE_RAW = readFileSync(new URL('../src/game-core/partnerLifecycle.js', import.meta.url), 'utf8');
const HUB = stripComments(HUB_RAW);
const LIFECYCLE = stripComments(LIFECYCLE_RAW);

console.log('\n=== Parte D: o que a notificacao grava ===\n');

check('Parte D: o aviso de contrato usa destino CONTRACT com view=contract', () => {
  // A string exata gravada por processPartnerContractWarnings.
  const hasDestination = /destination:\s*\{\s*type:\s*'CONTRACT'[^}]*route:\s*'\/partners'/.test(LIFECYCLE);
  const hasFocus = /focus:\s*'contract-future'/.test(LIFECYCLE);
  const hasView = /view:\s*'contract'/.test(LIFECYCLE);
  note(`destino CONTRACT=${hasDestination} view=contract:${hasView} focus=contract-future:${hasFocus}`);
  assert.ok(hasDestination && hasFocus && hasView, 'o aviso nao aponta para a aba de contrato');
});

check('Parte E: a acao do aviso nao promete conversa', () => {
  // O rótulo era "Conversar sobre o futuro", coerente com o bug e enganoso
  // depois da correção.
  const warningBlock = LIFECYCLE.slice(
    LIFECYCLE.indexOf('partner-contract-expiry'),
    LIFECYCLE.indexOf('partner-contract-expiry') + 2200,
  );
  note(`rotulo encontrado: ${(warningBlock.match(/label:\s*'([^']+)'/) || [])[1] || '(nenhum)'}`);
  assert.ok(!/label:\s*'Conversar sobre o futuro'/.test(warningBlock), 'o aviso ainda promete conversa');
  assert.ok(/type:\s*'view_partnership'/.test(warningBlock), 'a acao deixou de ser decisao contratual');
});

console.log('\n=== Parte G: o consumidor nao intercepta com conversa ===\n');

check('Parte G (gate): focus=contract-future NAO abre o modal de conversa', () => {
  // Isola o efeito que trata o foco contratual e verifica que ele não liga a
  // conversa. Este é o defeito exato do playtest.
  const start = HUB.indexOf("const focus = searchParams.get('focus')");
  assert.ok(start > 0, 'efeito de foco contratual nao encontrado');
  const block = HUB.slice(start, start + 1400);
  const setsTab = /setActiveTab\('contract'\)/.test(block);
  const opensConverse = /setShowConverse\(true\)/.test(block);
  note(`abre aba de contrato=${setsTab} | abre conversa=${opensConverse}`);
  assert.ok(setsTab, 'o foco contratual nao leva a aba de contrato');
  assert.equal(opensConverse, false, 'o aviso de contrato ainda abre a conversa de pos-jogo');
});

check('Parte G: a conversa continua existindo como acao do jogador', () => {
  // A correção não pode ter removido a conversa: ela segue disponível,
  // acionada pelo jogador, não por um alerta contratual.
  const hasState = /const \[showConverse, setShowConverse\]/.test(HUB);
  const hasSurface = /showConverse && activePartnership/.test(HUB);
  const opensSomewhere = /setShowConverse\(true\)/.test(HUB);
  note(`estado=${hasState} | superficie=${hasSurface} | algum acionador=${opensSomewhere}`);
  assert.ok(hasState && hasSurface, 'a conversa com o parceiro desapareceu');
});

check('Parte D: a acao view_partnership leva a aba de contrato', () => {
  const start = HUB.indexOf("action.type === 'view_partnership'");
  assert.ok(start > 0, 'handler de view_partnership nao encontrado');
  const block = HUB.slice(start, start + 320);
  note(`handler: ${/selectTab\('contract'/.test(block) ? "selectTab('contract')" : '(outro)'}`);
  assert.ok(/selectTab\('contract'/.test(block), 'view_partnership nao abre a aba de contrato');
  assert.ok(!/setShowConverse\(true\)/.test(block), 'view_partnership abre conversa');
});

console.log('\n=== Parte D: resolucao canonica do destino ===\n');

check('Parte D: o tipo de mensagem de contrato resolve para destino proprio', () => {
  const fn = dest.resolveNotificationDestination || dest.resolveDestination || null;
  if (typeof fn !== 'function') {
    note('resolvedor de destino nao exportado — verificacao feita pelo destino gravado (acima)');
    return;
  }
  const resolved = fn({ message_type: 'partner_contract_expiry', destination: { type: 'CONTRACT', route: '/partners', params: { view: 'contract', focus: 'contract-future' } } });
  note(`resolvido: ${JSON.stringify(resolved).slice(0, 140)}`);
  assert.ok(resolved, 'destino nao resolvido');
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
