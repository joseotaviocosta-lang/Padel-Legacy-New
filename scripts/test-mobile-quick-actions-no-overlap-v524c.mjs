// Playthrough 5.24-C, Partes G/H — atalhos sem sobrepor BottomNav, Floating
// Guide nem header; inteiros na tela; safe area; fixos ao rolar; e no fim da
// rolagem o conteúdo da rota termina acima da rail (nada fica coberto).
import assert from 'node:assert/strict';
import { loadEvidence, readSource, MOBILE_VIEWPORTS, ALL_VIEWPORTS } from './lib/v524cEvidence.mjs';

const rail = readSource('src/components/system/FloatingUtilityRail.jsx');
// 5.25 (nova decisão de UX): no mobile cada atalho se posiciona sozinho —
// Carreiras no canto inferior esquerdo, Centro abaixo do Avançar. A safe
// area e a folga acima do BottomNav seguem no botão de Carreiras; a coluna
// do desktop continua. Medição da nova disposição: testes *-v525.mjs.
// Ancorado no elemento (um comentário do arquivo também menciona <aside>).
const aside = rail.match(/<aside\s+data-floating-utility-rail[\s\S]*?>/)[0];
const careers = rail.match(/<button[\s\S]*?<\/button>/)[0];
assert.match(careers, /left-\[max\(0\.75rem,env\(safe-area-inset-left\)\)\]/, 'safe area lateral');
assert.match(careers, /bottom-\[calc\(var\(--pl-bottom-nav-h\)\+env\(safe-area-inset-bottom\)\+0\.5rem\)\]/, 'acima do BottomNav + safe area inferior');
assert.match(aside, /md:flex-col/, 'desktop: coluna de sempre');
// A linha (46px + 0.5rem) cabe na reserva de 3.5rem da <main>.
assert.match(readSource('src/components/AppLayout.jsx'), /pb-\[calc\(var\(--pl-bottom-nav-h\)\+env\(safe-area-inset-bottom\)\+3\.5rem\)\]/);

const evidence = loadEvidence();
for (const vp of ALL_VIEWPORTS) {
  for (const [page, m] of Object.entries(evidence[vp].pages)) {
    const where = `${vp}/${page}`;
    assert.equal(m.overlapBottomNav, false, `${where}: cobre BottomNav`);
    assert.equal(m.overlapGuide, false, `${where}: cobre Floating Guide`);
    assert.equal(m.overlapHeader, false, `${where}: cobre header`);
    assert.equal(m.outOfViewport, false, `${where}: botão parcialmente fora da tela`);
    assert.equal(m.overflowX, 0, `${where}: overflow horizontal ${m.overflowX}px`);
    assert.equal(m.scroll.stableWhenScrolling, true, `${where}: rail se move ao rolar`);
  }
}
for (const vp of MOBILE_VIEWPORTS) {
  for (const [page, m] of Object.entries(evidence[vp].pages)) {
    assert.ok(m.guide, `${vp}/${page}: Floating Guide presente para o teste de conflito`);
    assert.equal(m.scroll.contentClearOfRail, true, `${vp}/${page}: no fim da rolagem o conteúdo (${m.scroll.contentBottomAtEnd}) passa da rail (${m.scroll.railTop})`);
  }
}
console.log('   medido em 360/390/844x390/desktop × 4 páginas: 0 sobreposições, 0 fora da tela, 0 overflow; fim da rolagem livre no mobile');
console.log('test-mobile-quick-actions-no-overlap-v524c: PASS');
