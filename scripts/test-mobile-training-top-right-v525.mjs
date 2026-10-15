// Playthrough 5.25, Parte 27 — "Centro de treinamento" no lado direito
// superior, FORA do header (que continua em 2 faixas), 1 toque.
import assert from 'node:assert/strict';
import { loadEvidence, source, MOBILE } from './lib/v525Evidence.mjs';

const rail = source('src/components/system/FloatingUtilityRail.jsx');
const link = rail.match(/<Link\s+to=\{APP_ROUTES\.TRAINING_CENTER\}[\s\S]*?<\/Link>/)[0];
assert.match(link, /aria-label="Centro de treinamento"/);
assert.match(link, /fixed right-\[calc\(0\.375rem\+var\(--pl-safe-r\)\)\] top-\[calc\(var\(--pl-header-h-mobile\)\+env\(safe-area-inset-top\)\+0\.5rem\)\]/, 'direita, logo abaixo do header mobile');
const layout = source('src/components/AppLayout.jsx');
const mobileHeader = layout.match(/<header className="pl-layer-header[^>]*md:hidden">[\s\S]*?<\/header>/)[0];
assert.doesNotMatch(mobileHeader, /Centro de treinamento|TRAINING_CENTER/, 'Centro não entra no header');

const evidence = loadEvidence();
for (const vp of MOBILE) {
  for (const [page, m] of Object.entries(evidence[vp].pages)) {
    assert.equal(m.trainingRight, true, `${vp}/${page}: lado direito`);
    assert.equal(m.trainingBelowHeader, true, `${vp}/${page}: abaixo do header`);
    assert.equal(m.headerRows, 2, `${vp}/${page}: header 2 faixas`);
  }
  assert.equal(evidence[vp].taps.training, '/game/training-center', `${vp}: 1 toque`);
}
console.log('   medido: direita, abaixo do header, header em 2 faixas, 1 toque → /game/training-center');
console.log('test-mobile-training-top-right-v525: PASS');
