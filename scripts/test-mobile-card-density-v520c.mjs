// Playthrough 5.20-C, item 1/9 — DENSIDADE DO CARD NO MOBILE.
//
// O briefing pede que o card de torneio caiba "sem excesso de altura", com o
// CTA visivel sem scroll interno e sem competir com cinco badges.
//
// Historico que justifica cada numero aqui:
//   - 5.20-B mediu 350px de altura media por card em 360px, com titulo, duas
//     tarjas, botao proprio, descricao, data, vagas, linha de analise do
//     treinador e rodape de tres numeros — cinco coisas disputando leitura;
//   - a pagina inteira renderizava 333 cards e 54.779px de altura, dos quais o
//     jogador via 19 sem rolar 68 telas.
//
// Gates: altura por card, um unico selo de estado, CTA sem scroll interno e
// densidade total da pagina.
import assert from 'node:assert/strict';
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';
import { VIEWPORTS } from './lib/visualAuditDriver.mjs';

const ALTURA_MAX = 320;      // por card, em 360px
const SELOS_MAX = 2;         // estado principal + no maximo um contextual
const CARDS_MAX = 120;       // por pagina

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const browser = await launch();
const resultados = [];
for (const vp of VIEWPORTS.filter((v) => v.width <= 390)) {
  const page = await openCareer(browser, vp);
  await goto(page, '/tournaments');
  await dismissOverlays(page);
  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.glass.rounded-2xl')].filter((c) => c.querySelector('h3'));
    const alturas = cards.map((c) => Math.round(c.getBoundingClientRect().height));
    // Selos por card: StatusBadge e tarjas em pilula.
    const selos = cards.map((c) => c.querySelectorAll('[class*="rounded-full"][class*="border"], [data-status-badge]').length);
    // O CTA precisa estar visivel sem rolagem DENTRO do card.
    let ctaEscondido = 0;
    for (const c of cards) {
      if (c.scrollHeight > c.clientHeight + 2) ctaEscondido += 1;
    }
    return {
      n: cards.length,
      media: alturas.length ? Math.round(alturas.reduce((a, b) => a + b, 0) / alturas.length) : 0,
      maior: alturas.length ? Math.max(...alturas) : 0,
      selosMax: selos.length ? Math.max(...selos) : 0,
      ctaEscondido,
      totalCards: document.querySelectorAll('[class*="rounded-2xl"],[class*="rounded-xl"][class*="border"]').length,
      altura: Math.round(document.body.scrollHeight),
    };
  });
  resultados.push({ vp: vp.width, ...m });
  console.log(`\n=== Torneios em ${vp.width}x${vp.height} ===`);
  console.log(`   cards de torneio=${m.n} | altura media=${m.media}px | maior=${m.maior}px`);
  console.log(`   selos no card mais carregado=${m.selosMax} | cards com scroll interno=${m.ctaEscondido}`);
  console.log(`   cards na pagina=${m.totalCards} | altura da pagina=${m.altura}px`);
  await page.close();
}
await browser.close();

console.log('\n=== Gates ===');
check(`item 1 (gate): card de torneio <= ${ALTURA_MAX}px no mobile`, () => {
  const ruins = resultados.filter((r) => r.maior > ALTURA_MAX).map((r) => `${r.vp}px: maior=${r.maior}px`);
  assert.deepEqual(ruins, [], `card alto demais: ${ruins.join(', ')}`);
});
check(`item 1 (gate): nenhum card compete com mais de ${SELOS_MAX} selos`, () => {
  const ruins = resultados.filter((r) => r.selosMax > SELOS_MAX).map((r) => `${r.vp}px: ${r.selosMax} selos`);
  assert.deepEqual(ruins, [], `cards com selos demais: ${ruins.join(', ')}`);
});
check('item 1 (gate): o CTA aparece sem scroll interno no card', () => {
  const ruins = resultados.filter((r) => r.ctaEscondido > 0).map((r) => `${r.vp}px: ${r.ctaEscondido} cards`);
  assert.deepEqual(ruins, [], `card com rolagem interna: ${ruins.join(', ')}`);
});
check(`item 1 (gate): a pagina nao passa de ${CARDS_MAX} cards`, () => {
  const ruins = resultados.filter((r) => r.totalCards > CARDS_MAX).map((r) => `${r.vp}px=${r.totalCards}`);
  assert.deepEqual(ruins, [], `densidade acima do teto: ${ruins.join(', ')}`);
});
note(`referencia 5.20-B: 350px de altura media, 333 cards, 54.779px de pagina`);

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
