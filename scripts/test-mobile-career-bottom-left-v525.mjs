// Playthrough 5.25, Parte 26 — "Gerenciar carreiras" sozinho no canto
// inferior esquerdo, acima da BottomNav, 44px, 1 toque → /careers.
import assert from 'node:assert/strict';
import { loadEvidence, source, MOBILE } from './lib/v525Evidence.mjs';

const rail = source('src/components/system/FloatingUtilityRail.jsx');
const btn = rail.match(/<button[\s\S]*?<\/button>/)[0];
assert.match(btn, /aria-label="Gerenciar carreiras"/);
assert.match(btn, /fixed left-\[max\(0\.75rem,env\(safe-area-inset-left\)\)\] bottom-\[calc\(var\(--pl-bottom-nav-h\)\+env\(safe-area-inset-bottom\)\+0\.5rem\)\]/, 'canto inferior esquerdo com safe area');

const evidence = loadEvidence();
for (const vp of MOBILE) {
  for (const [page, m] of Object.entries(evidence[vp].pages)) {
    assert.equal(m.careersBottomLeft, true, `${vp}/${page}: Carreiras no canto inferior esquerdo, acima da BottomNav`);
    assert.ok(m.careers.w >= 44 && m.careers.h >= 44, `${vp}/${page}: ${m.careers.w}x${m.careers.h}`);
    // Sozinho: nenhum outro atalho no canto inferior esquerdo.
    assert.ok(!m.training || m.training.y < m.careers.y - 200, `${vp}/${page}: Centro não divide o canto`);
  }
  assert.equal(evidence[vp].taps.careers, '/careers', `${vp}: 1 toque → /careers`);
}
console.log('   medido: canto inferior esquerdo, 44x44, 1 toque → /careers (360 e 390)');
console.log('test-mobile-career-bottom-left-v525: PASS');
