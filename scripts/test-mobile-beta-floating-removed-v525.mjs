// Playthrough 5.25, Partes 24/36 — BETA fora da superfície flutuante no mobile.
// A instância da Central continua montada uma vez (para o modal abrir pelo
// menu), só com o gatilho oculto abaixo de md.
import assert from 'node:assert/strict';
import { loadEvidence, source, MOBILE } from './lib/v525Evidence.mjs';

const rail = source('src/components/system/FloatingUtilityRail.jsx');
assert.match(rail, /<BetaTools compact open=\{betaOpen\} onOpenChange=\{onBetaOpenChange\} triggerClassName="hidden md:inline-flex" \/>/, 'gatilho da BETA oculto no mobile');
assert.equal((rail.match(/<BetaTools\b/g) || []).length, 1, 'uma única instância da Central BETA');
const beta = source('src/components/system/BetaTools.jsx');
assert.match(beta, /triggerClassName = ''/);
assert.match(beta, /\$\{triggerClassName\}/, 'classe aplicada ao botão gatilho');

const evidence = loadEvidence();
for (const vp of MOBILE) {
  for (const [page, m] of Object.entries(evidence[vp].pages)) {
    assert.equal(m.betaFloating, 0, `${vp}/${page}: BETA flutuante visível`);
  }
}
for (const vp of ['844x390', 'desktop']) {
  assert.ok(Object.values(evidence[vp].pages).every((m) => m.betaFloating === 1), `${vp}: desktop preserva a BETA na coluna`);
}
console.log('   medido: 0 BETA flutuante em 360/390 (4 páginas); desktop/paisagem mantêm a coluna');
console.log('test-mobile-beta-floating-removed-v525: PASS');
