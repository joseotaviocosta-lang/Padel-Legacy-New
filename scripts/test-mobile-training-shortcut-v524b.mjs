// Playthrough 5.24-B, Partes C/D — "Centro de treinamento" acessível no mobile.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../src/components/AppLayout.jsx', import.meta.url), 'utf8');
const rail = readFileSync(new URL('../src/components/system/FloatingUtilityRail.jsx', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../src/navigation/routes.js', import.meta.url), 'utf8');

const quick = layout.match(/function MobileQuickAccess[\s\S]*?\n\}/)?.[0];
assert.ok(quick, 'MobileQuickAccess deve existir');
assert.match(quick, /to=\{APP_ROUTES\.TRAINING_CENTER\}/, 'mesma rota da rail e da navegação principal');
assert.match(quick, /aria-label="Centro de treinamento"/);
assert.match(quick, /onClick=\{onNavigate\}/, 'fecha o drawer ao navegar');
assert.match(routes, /TRAINING_CENTER:\s*TRAINING_CENTER_PATH/);
assert.match(routes, /const TRAINING_CENTER_PATH = '\/game\/training-center'/);

// A rail continua com o atalho (5.24-C: visível também no mobile).
assert.match(rail, /to=\{APP_ROUTES\.TRAINING_CENTER\}/, 'rail mantém o atalho');

const evidenceFile = new URL('../reports/screenshots-524b/evidence.json', import.meta.url);
if (existsSync(evidenceFile)) {
  const evidence = JSON.parse(readFileSync(evidenceFile, 'utf8'));
  for (const vp of ['360', '390']) {
    const s = evidence[vp]?.shortcuts?.training;
    assert.ok(s, `atalho medido em ${vp}`);
    assert.ok(s.taps <= 2, `${vp}: ${s.taps} toques`);
    assert.equal(s.landed, '/game/training-center', `${vp}: destino ${s.landed}`);
  }
  console.log('   medido: 2 toques (☰ → Centro de treinamento) em 360 e 390 → /game/training-center');
}

console.log('test-mobile-training-shortcut-v524b: PASS');
