// Playthrough 5.25, Partes 27/28 — o Centro fica LOGO ABAIXO do botão
// Avançar, alinhado à borda direita dele (medido no navegador).
import assert from 'node:assert/strict';
import { loadEvidence, MOBILE } from './lib/v525Evidence.mjs';

const evidence = loadEvidence();
for (const vp of MOBILE) {
  for (const [page, m] of Object.entries(evidence[vp].pages)) {
    assert.ok(m.advance, `${vp}/${page}: botão Avançar encontrado`);
    assert.equal(m.trainingBelowAdvance, true, `${vp}/${page}: Centro (${JSON.stringify(m.training)}) abaixo do Avançar (${JSON.stringify(m.advance)})`);
    const gap = m.training.y - m.advance.b;
    assert.ok(gap >= 0 && gap <= 40, `${vp}/${page}: distância vertical ${gap}px`);
    assert.ok(Math.abs(m.training.r - m.advance.r) <= 8, `${vp}/${page}: bordas direitas alinhadas (${m.training.r} x ${m.advance.r})`);
  }
}
const m = evidence['360'].pages.home;
console.log(`   medido 360: Avançar ${m.advance.y}-${m.advance.b}px (dir ${m.advance.r}) · Centro ${m.training.y}-${m.training.b}px (dir ${m.training.r})`);
console.log('test-mobile-training-below-advance-v525: PASS');
