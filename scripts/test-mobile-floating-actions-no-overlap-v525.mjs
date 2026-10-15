// Playthrough 5.25, Partes 30-36 — sem sobreposição com BottomNav, Floating
// Guide e header; nada fora da tela; 44px; overflow 0; header 2 faixas;
// BottomNav 5 itens; cada atalho visível 1x; atalhos sem dados/timers.
import assert from 'node:assert/strict';
import { loadEvidence, source, ALL, MOBILE } from './lib/v525Evidence.mjs';

const rail = source('src/components/system/FloatingUtilityRail.jsx');
const code = rail.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
for (const forbidden of [/localGame/, /useEffect|useState/, /setInterval|setTimeout/, /addEventListener/]) {
  assert.doesNotMatch(code, forbidden, `rail puramente navegacional (${forbidden})`);
}

const evidence = loadEvidence();
for (const vp of ALL) {
  for (const [page, m] of Object.entries(evidence[vp].pages)) {
    const where = `${vp}/${page}`;
    assert.equal(m.overlapBottomNav, false, `${where}: cobre BottomNav`);
    assert.equal(m.overlapGuide, false, `${where}: cobre Guide`);
    assert.equal(m.overlapHeader, false, `${where}: cobre header`);
    assert.equal(m.outOfViewport, false, `${where}: fora da tela`);
    assert.ok(m.minTouch >= 44, `${where}: alvo ${m.minTouch}px`);
    assert.equal(m.overflowX, 0, `${where}: overflow ${m.overflowX}px`);
    assert.deepEqual(m.visible, { careers: 1, training: 1 }, `${where}: duplicação`);
  }
}
for (const vp of MOBILE) {
  for (const [page, m] of Object.entries(evidence[vp].pages)) {
    assert.equal(m.headerRows, 2, `${vp}/${page}: header 2 faixas`);
    assert.equal(m.bottomNavItems, 5, `${vp}/${page}: BottomNav 5 itens`);
  }
}
console.log('   medido em 360/390/844x390/desktop × 4 páginas: 0 sobreposições, 44px, overflow 0, sem duplicação');
console.log('test-mobile-floating-actions-no-overlap-v525: PASS');
