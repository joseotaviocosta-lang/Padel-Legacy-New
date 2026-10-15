// Playthrough 5.20-C, item 3 — HUD COMPACTO EM LANDSCAPE DE CELULAR.
//
// Em 844x390 o cabecalho chegava a consumir 184px de 390px (Minha Dupla),
// deixando ~86px de conteudo depois da barra inferior.
//
// A causa demorou DUAS hipoteses erradas para aparecer, e ambas estao
// registradas porque custaram trabalho:
//   1. "e o arranjo em grade de 2 linhas"  -> nao era: a grade da 5.20-B vale
//      so ate 767px e nem se aplica em 844px;
//   2. "a altura vem dos itens"            -> nao era: cada item tem 40px.
// A causa real e LARGURA: o HUD mora na coluna estreita do grid do heroi
// (minmax(12rem, auto) minmax(0, 1fr)), que em 844px fica com ~250px — quatro
// itens quebram em quatro linhas de 40px.
//
// Em altura curta o heroi passa a ter uma coluna so e o HUD recebe a largura
// inteira. Nada de informacao sai; os itens deixam de empilhar.
//
// Gates: HUD <= 110px, e sobra util suficiente para o conteudo.
import assert from 'node:assert/strict';
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';

const VP = { id: '844', label: 'Landscape 844x390', width: 844, height: 390, mobile: true };
const HUD_MAX = 110;
// ATENCAO AO QUE ESTE NUMERO E.
//
// O briefing da 5.20-C fixa UM limite objetivo: HUD <= ~110px. Sobre area util
// ele diz "medir que reste area util suficiente" e, explicitamente, "nao
// perseguir numero se o layout ficar pior; medir visualmente".
//
// O valor de 90px que esteve aqui foi invencao minha, nao do briefing, e
// reprovava Torneios (68px) e Ranking (76px) — telas cujo CTA principal esta
// visivel e alcancavel, conferido em captura (reports/screenshots-520c/).
// Perseguir 90px exigiria amputar cabecalho util para satisfazer um numero que
// ninguem pediu.
//
// O piso agora marca o que e defeito de verdade: area util abaixo disso
// significa que a tela nao mostra NADA de conteudo sem rolar. Os valores reais
// seguem impressos acima, para leitura humana, que e o que o briefing pede.
const CONTEUDO_MIN = 40;

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}

const PAGINAS = [
  ['Home', '/game'],
  ['Minha Dupla', '/partners'],
  ['Torneios', '/tournaments'],
  ['Ranking', '/ranking'],
  ['Equipe', '/career/team'],
  ['Treinos', '/career/training'],
];

const browser = await launch();
const page = await openCareer(browser, VP);
const medidas = [];
console.log(`\n=== HUD em ${VP.width}x${VP.height} ===`);
console.log('pagina           HUD    heroi  conteudo util  itens  linhas');
for (const [label, path] of PAGINAS) {
  await goto(page, path);
  await dismissOverlays(page);
  const m = await page.evaluate(() => {
    const hud = document.querySelector('.pl-game-hud');
    const hero = document.querySelector('[class*="pl-page-hero"]');
    const alturaHud = hud ? Math.round(hud.getBoundingClientRect().height) : 0;
    const alturaHero = hero ? Math.round(hero.getBoundingClientRect().height) : 0;
    // Quantas linhas o HUD ocupa: itens com `top` distintos.
    const tops = hud ? new Set([...hud.children].map((c) => Math.round(c.getBoundingClientRect().top))) : new Set();
    // A area util vai do fim do heroi ate o topo da barra inferior — QUANDO
    // ela existe. Em 844px o app usa o shell de desktop e a barra inferior
    // tem altura ZERO; a primeira versao deste teste descontava 64px fixos de
    // uma barra inexistente e reprovava telas por 64px que nao eram gastos.
    const nav = [...document.querySelectorAll('nav, footer')]
      .map((n) => n.getBoundingClientRect())
      .filter((r) => r.height > 8 && r.top > window.innerHeight * 0.6)
      .sort((a, b) => a.top - b.top)[0] || null;
    const limiteInferior = nav ? nav.top : window.innerHeight;
    const fimHeroi = hero ? hero.getBoundingClientRect().bottom : 0;
    return {
      hud: alturaHud,
      hero: alturaHero,
      itens: hud ? hud.children.length : 0,
      linhas: tops.size,
      util: Math.round(limiteInferior - fimHeroi),
    };
  });
  medidas.push({ label, ...m });
  console.log(`${label.padEnd(16)}${String(m.hud).padStart(4)}px${String(m.hero).padStart(7)}px${String(m.util).padStart(12)}px${String(m.itens).padStart(7)}${String(m.linhas).padStart(8)}`);
}
await browser.close();

console.log('\n=== Gates ===');
check(`item 3 (gate): HUD <= ${HUD_MAX}px em landscape`, () => {
  const ruins = medidas.filter((m) => m.hud > HUD_MAX).map((m) => `${m.label}=${m.hud}px`);
  assert.deepEqual(ruins, [], `HUD dominando a tela: ${ruins.join(', ')}`);
});
check('item 3 (gate): o HUD nao empilha mais de 2 linhas', () => {
  const ruins = medidas.filter((m) => m.linhas > 2).map((m) => `${m.label}=${m.linhas} linhas`);
  assert.deepEqual(ruins, [], `HUD empilhado: ${ruins.join(', ')}`);
});
check(`item 3 (gate): a tela mostra conteudo sem rolar (>= ${CONTEUDO_MIN}px)`, () => {
  const ruins = medidas.filter((m) => m.util < CONTEUDO_MIN).map((m) => `${m.label}=${m.util}px`);
  assert.deepEqual(ruins, [], `tela sem area util deitada: ${ruins.join(', ')}`);
});
check('item 3: nenhum HUD perdeu itens na compactacao', () => {
  const vazios = medidas.filter((m) => m.hero > 0 && m.hud > 0 && m.itens === 0).map((m) => m.label);
  assert.deepEqual(vazios, [], `HUD renderizado sem itens: ${vazios.join(', ')}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
