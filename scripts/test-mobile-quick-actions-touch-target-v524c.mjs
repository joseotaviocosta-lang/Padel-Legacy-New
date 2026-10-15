// Playthrough 5.24-C, Parte M — alvo de toque >= 44px e aria-label.
import assert from 'node:assert/strict';
import { loadEvidence, readSource, ALL_VIEWPORTS } from './lib/v524cEvidence.mjs';

const rail = readSource('src/components/system/FloatingUtilityRail.jsx');
for (const label of ['Centro de treinamento', 'Gerenciar carreiras']) {
  assert.ok(rail.includes(`aria-label="${label}"`), `aria-label "${label}"`);
}
// 5.25: a classe comum dos atalhos virou a constante SHORTCUT_CLASS.
assert.match(rail, /const SHORTCUT_CLASS = 'pointer-events-auto flex h-11 w-11[^']*'/, 'h-11 w-11 (44px)');
assert.equal((rail.match(/\$\{SHORTCUT_CLASS\}/g) || []).length, 2, 'aplicada nos dois atalhos');
// Design system: tokens existentes, sem cor hardcoded nos atalhos.
const shortcuts = rail.match(/const SHORTCUT_CLASS = '([^']*)'/).slice(1);
for (const cls of shortcuts) {
  assert.match(cls, /text-primary/, 'ícone lime (token primary)');
  assert.match(cls, /border-border\/70 bg-background\/88/, 'mesma superfície dos floating controls');
  assert.doesNotMatch(cls, /#[0-9a-f]{3,6}|rgb\(/i, 'sem cor hardcoded');
}

const evidence = loadEvidence();
for (const vp of ALL_VIEWPORTS) {
  for (const [page, m] of Object.entries(evidence[vp].pages)) {
    assert.ok(m.minTouch >= 44, `${vp}/${page}: menor alvo ${m.minTouch}px`);
    for (const label of ['Centro de treinamento', 'Gerenciar carreiras']) {
      const b = m.shortcuts[label];
      assert.ok(b && b.w >= 44 && b.h >= 44, `${vp}/${page}: ${label} ${b?.w}x${b?.h}`);
    }
  }
}
console.log('   medido: todos os atalhos 44x44px em 4 viewports');
console.log('test-mobile-quick-actions-touch-target-v524c: PASS');
