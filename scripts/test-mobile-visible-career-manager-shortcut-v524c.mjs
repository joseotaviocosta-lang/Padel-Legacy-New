// Playthrough 5.24-C, Partes B/C — Gerenciar carreiras VISÍVEL no mobile,
// 1 toque, rota /careers (fora do AppShell de carreira, por design).
import assert from 'node:assert/strict';
import { loadEvidence, readSource, MOBILE_VIEWPORTS } from './lib/v524cEvidence.mjs';

const rail = readSource('src/components/system/FloatingUtilityRail.jsx');
const button = rail.match(/<button[\s\S]*?<\/button>/)[0];
assert.match(button, /onClick=\{onOpenCareers\}/);
assert.match(button, /aria-label="Gerenciar carreiras"/);
assert.doesNotMatch(button, /\bhidden\b/, 'atalho não pode ficar oculto no mobile');
const layout = readSource('src/components/AppLayout.jsx');
// 5.25: a rail também recebe betaOpen/onBetaOpenChange.
assert.match(layout, /<FloatingUtilityRail onOpenCareers=\{openCareerManager\}[^>]*\/>/);
assert.match(layout, /async function openCareerManager\(\)[\s\S]*?window\.location\.href = '\/careers'/);

const evidence = loadEvidence();
for (const vp of MOBILE_VIEWPORTS) {
  for (const [page, m] of Object.entries(evidence[vp].pages)) {
    assert.equal(m.visibleByLabel['Gerenciar carreiras'], 1, `${vp}/${page}: atalho visível 1x`);
    assert.ok(m.shortcuts['Gerenciar carreiras'], `${vp}/${page}: atalho dentro da rail`);
  }
  const tap = evidence[vp].flow.steps.find((s) => s.step.startsWith('tap Carreiras'));
  assert.equal(tap.ok, true, `${vp}: 1 toque executado`);
  assert.equal(tap.path, '/careers', `${vp}: destino ${tap.path}`);
  assert.equal(tap.shell, 0, `${vp}: /careers fica fora do AppShell de carreira`);
}
console.log('   medido: visível nas 4 páginas (360 e 390) · 1 toque → /careers');
console.log('test-mobile-visible-career-manager-shortcut-v524c: PASS');
