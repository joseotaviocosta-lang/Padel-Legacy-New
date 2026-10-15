// Playthrough 5.25, Parte 25 — "Beta testers" acessível pelo menu ☰:
// fecha o drawer e abre a mesma Central de testes. Fora da BottomNav.
import assert from 'node:assert/strict';
import { loadEvidence, source, MOBILE } from './lib/v525Evidence.mjs';

const layout = source('src/components/AppLayout.jsx');
const quick = layout.match(/function MobileQuickAccess[\s\S]*?\n\}/)[0];
assert.match(quick, /aria-label="Beta testers"/);
assert.match(quick, /onClick=\{onOpenBeta\}/);
assert.match(layout, /const openBetaFromMenu = useCallback\(\(\) => \{ setMobileOpen\(false\); setBetaOpen\(true\); \}, \[\]\);/);
assert.match(layout, /<FloatingUtilityRail onOpenCareers=\{openCareerManager\} betaOpen=\{betaOpen\} onBetaOpenChange=\{setBetaOpen\} \/>/);
assert.doesNotMatch(source('src/components/BottomNav.jsx'), /Beta testers|BetaTools/, 'BETA não entra na BottomNav');

const evidence = loadEvidence();
for (const vp of MOBILE) {
  const m = evidence[vp].menuBeta;
  assert.equal(m.entry, true, `${vp}: item no menu`);
  assert.equal(m.opensCentral, true, `${vp}: abre a Central de testes`);
  assert.equal(m.drawerClosed, true, `${vp}: drawer fecha`);
}
console.log('   medido: ☰ → Beta testers → Central de testes (360 e 390)');
console.log('test-mobile-beta-menu-entry-v525: PASS');
