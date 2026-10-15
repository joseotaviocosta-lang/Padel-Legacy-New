// Playthrough 5.24-C, Parte D — o fallback ☰ → Acesso rápido continua.
import assert from 'node:assert/strict';
import { loadEvidence, readSource, MOBILE_VIEWPORTS } from './lib/v524cEvidence.mjs';

const layout = readSource('src/components/AppLayout.jsx');
const quick = layout.match(/function MobileQuickAccess[\s\S]*?\n\}/)?.[0];
assert.ok(quick, 'MobileQuickAccess continua existindo');
assert.match(quick, /Acesso rápido/);
assert.match(quick, /to=\{APP_ROUTES\.TRAINING_CENTER\}/);
assert.match(quick, /onClick=\{openCareerManager\}/);
// 5.25: ganhou também onOpenBeta (item "Beta testers").
assert.match(layout, /<MobileQuickAccess onNavigate=\{\(\) => setMobileOpen\(false\)\}[^>]*\/>/);

const evidence = loadEvidence();
for (const vp of MOBILE_VIEWPORTS) {
  const d = evidence[vp].drawerQuickAccess;
  assert.ok(d?.present, `${vp}: bloco Acesso rápido presente no drawer`);
  assert.deepEqual([...d.labels].sort(), ['Centro de treinamento', 'Gerenciar carreiras'], `${vp}: itens do Acesso rápido`);
}
console.log('   medido: ☰ → Acesso rápido com Centro de treinamento + Gerenciar carreiras em 360 e 390');
console.log('test-mobile-menu-quick-access-preserved-v524c: PASS');
