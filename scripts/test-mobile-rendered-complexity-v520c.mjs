// Playthrough 5.20-C, item 2 — COMPLEXIDADE RENDERIZADA, MEDIDA NO DOM.
//
// Substitui o gate estrutural do M4.1, que contava TAGS JSX NO FONTE como
// proxy da complexidade da tela. A 5.20-B mostrou o proxy contradizer o que
// ele aproximava: transformar Torneios em agenda SOMOU 3 tags ao fonte (o
// cabecalho de mes fechado e marcacao nova) enquanto o DOM renderizado caiu de
// 333 para 76 cards e a pagina de 54.779px para 7.249px.
//
// Contar fonte tambem premiava o movimento errado: componentizar para fora do
// arquivo "melhorava" a metrica sem mudar nada do que o jogador recebe.
//
// Aqui mede-se o que chega ao navegador, em 360x800 e 390x844:
//   - overflow horizontal da pagina;
//   - conteudo escondido fora de carrossel intencional;
//   - CTA duplicado na mesma tela;
//   - densidade (cards, nos, altura renderizada).
import assert from 'node:assert/strict';
import { launch, goto, dismissOverlays, openCareer, PAGES } from './lib/auditSession.mjs';
import { VIEWPORTS } from './lib/visualAuditDriver.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

// Teto de densidade por tela. Nao e estetica: cada card e um bloco que o
// jogador precisa descartar para achar o que procura.
const MAX_CARDS = 120;

async function medir(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const overflowX = Math.max(0, de.scrollWidth - de.clientWidth);

    // Conteudo so alcancavel por rolagem lateral, descontando carrossel
    // declarado (overflow-x auto/scroll e intencional e documentado).
    let escondido = 0;
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el);
      if (!['auto', 'scroll'].includes(s.overflowX)) continue;
      if (el.scrollWidth > el.clientWidth + 1) escondido += el.scrollWidth - el.clientWidth;
    }

    // CTA duplicado — DUAS coisas distintas, e so uma delas e defeito.
    //
    // Uma LISTA em que cada item tem seu proprio botao ("Treinar · 20" por
    // atividade, "Ver detalhes" por torneio) nao e duplicacao: os botoes
    // agem sobre alvos diferentes. A primeira versao deste teste acusava
    // isso e teria me levado a "corrigir" uma lista legitima.
    //
    // Duplicacao de verdade e o mesmo rotulo agindo no MESMO alvo:
    //   a) duas vezes dentro do mesmo cartao/secao;
    //   b) o mesmo rotulo em DUAS barras de abas na mesma tela — foi o caso
    //      de "Calendário", que era aba do hub e aba interna de Torneios,
    //      apontando para destinos diferentes com o mesmo nome.
    const container = (el) => el.closest('[class*="rounded-2xl"], [class*="rounded-xl"], section, form') || document.body;
    const porContainer = new Map();
    for (const b of document.querySelectorAll('button, a[role="button"]')) {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.top > window.innerHeight || r.bottom < 0) continue;
      if (b.closest('[role="tablist"]')) continue;
      const txt = (b.textContent || "").trim().toLowerCase();
      if (txt.length < 4) continue;
      const chave = txt;
      const c = container(b);
      if (!porContainer.has(c)) porContainer.set(c, new Map());
      const m = porContainer.get(c);
      m.set(chave, (m.get(chave) || 0) + 1);
    }
    const duplicados = [];
    for (const m of porContainer.values()) {
      for (const [txt, n] of m) if (n > 1) duplicados.push(`${txt} x${n} no mesmo bloco`);
    }
    // Colisao de rotulo entre barras de abas distintas.
    const listas = [...document.querySelectorAll('[role="tablist"]')];
    const porLista = listas.map((l) => [...l.querySelectorAll('[role="tab"]')]
      .filter((t) => { const r = t.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((t) => (t.textContent || "").trim().toLowerCase()).filter(Boolean));
    for (let a = 0; a < porLista.length; a += 1) {
      for (let b = a + 1; b < porLista.length; b += 1) {
        for (const rotulo of porLista[a]) {
          if (porLista[b].includes(rotulo)) duplicados.push(`aba "${rotulo}" em duas barras`);
        }
      }
    }
    const cards = document.querySelectorAll('[class*="rounded-2xl"],[class*="rounded-xl"][class*="border"]').length;
    return {
      overflowX,
      escondido,
      duplicados,
      cards,
      nos: document.querySelectorAll('body *').length,
      altura: Math.round(document.body.scrollHeight),
      innerWidth: window.innerWidth,
      clientWidth: de.clientWidth,
    };
  });
}

const browser = await launch();
const resultados = [];
for (const vp of VIEWPORTS.filter((v) => v.width <= 390)) {
  const page = await openCareer(browser, vp);
  console.log(`\n=== ${vp.width}x${vp.height} ===`);
  console.log('pagina                     overflowX  escondido  cards   nos  altura  CTA dup');
  for (const pg of PAGES) {
    await goto(page, pg.path);
    await dismissOverlays(page);
    const m = await medir(page);
    resultados.push({ vp: vp.width, label: pg.label, ...m });
    console.log(`${String(pg.label).padEnd(26)}${String(m.overflowX).padStart(9)}${String(m.escondido).padStart(11)}${String(m.cards).padStart(7)}${String(m.nos).padStart(6)}${String(m.altura).padStart(8)}${String(m.duplicados.length).padStart(9)}`);
  }
  await page.close();
}
await browser.close();

console.log('\n=== Gates ===');
check('item 2 (gate): overflow horizontal = 0 em todas as telas', () => {
  const ruins = resultados.filter((r) => r.overflowX > 0).map((r) => `${r.label}@${r.vp}=${r.overflowX}px`);
  assert.deepEqual(ruins, [], `paginas com overflow: ${ruins.join(', ')}`);
});
check('item 2 (gate): o layout nao fica mais largo que o aparelho', () => {
  const ruins = resultados.filter((r) => r.innerWidth - r.clientWidth > 1)
    .map((r) => `${r.label}@${r.vp} (inner ${r.innerWidth} vs client ${r.clientWidth})`);
  assert.deepEqual(ruins, [], `layout excede o aparelho: ${ruins.join(', ')}`);
});
check('item 2 (gate): nenhum CTA duplicado visivel na mesma tela', () => {
  const ruins = resultados.filter((r) => r.duplicados.length > 0)
    .map((r) => `${r.label}@${r.vp}: ${r.duplicados.join(' | ')}`);
  assert.deepEqual(ruins, [], `CTA duplicado: ${ruins.join(' ;; ')}`);
});
check(`item 2 (gate): nenhuma tela passa de ${MAX_CARDS} cards renderizados`, () => {
  const ruins = resultados.filter((r) => r.cards > MAX_CARDS).map((r) => `${r.label}@${r.vp}=${r.cards}`);
  assert.deepEqual(ruins, [], `densidade acima do teto: ${ruins.join(', ')}`);
});

const pior = [...resultados].sort((a, b) => b.escondido - a.escondido)[0];
note(`maior volume escondido atras de rolagem lateral: ${pior.label}@${pior.vp} = ${pior.escondido}px`);
const maisAlta = [...resultados].sort((a, b) => b.altura - a.altura)[0];
note(`pagina mais alta: ${maisAlta.label}@${maisAlta.vp} = ${maisAlta.altura}px`);

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
