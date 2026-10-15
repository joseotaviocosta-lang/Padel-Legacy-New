// Playthrough 5.24-C, Parte I — desktop (e paisagem 844x390, que usa o
// shell desktop) mostra cada atalho UMA vez; nenhuma tela duplica.
import assert from 'node:assert/strict';
import { loadEvidence, readSource, ALL_VIEWPORTS } from './lib/v524cEvidence.mjs';

const layout = readSource('src/components/AppLayout.jsx');
// O fallback do menu só existe dentro do drawer md:hidden (fechado por padrão).
const drawer = layout.match(/<motion\.aside[^>]*id="mobile-navigation-drawer"[\s\S]*?<\/motion\.aside>/)[0];
assert.match(drawer, /md:hidden/);
assert.match(drawer, /<MobileQuickAccess/);
assert.equal((layout.match(/<FloatingUtilityRail\b/g) || []).length, 1, 'uma única rail no shell');
const desktopBar = layout.slice(layout.indexOf('app-desktop-bar'), layout.indexOf('app-desktop-bar') + 2200);
assert.doesNotMatch(desktopBar, /Gerenciar carreiras|Centro de treinamento|MobileQuickAccess/, 'barra desktop sem atalhos repetidos');

const evidence = loadEvidence();
for (const vp of ALL_VIEWPORTS) {
  for (const [page, m] of Object.entries(evidence[vp].pages)) {
    for (const [label, count] of Object.entries(m.visibleByLabel)) {
      assert.equal(count, 1, `${vp}/${page}: "${label}" visível ${count}x`);
    }
  }
}
console.log('   medido: cada atalho visível exatamente 1x em 360/390/844x390/desktop');
console.log('test-desktop-no-duplicate-quick-actions-v524c: PASS');
