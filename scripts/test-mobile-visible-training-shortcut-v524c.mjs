// Playthrough 5.24-C, Partes B/C — Centro de treinamento VISÍVEL no mobile,
// 1 toque, rota canônica /game/training-center dentro do AppShell.
import assert from 'node:assert/strict';
import { loadEvidence, readSource, MOBILE_VIEWPORTS } from './lib/v524cEvidence.mjs';

const rail = readSource('src/components/system/FloatingUtilityRail.jsx');
// Ancorado no elemento JSX (um comentário do arquivo também menciona <Link>).
const link = rail.match(/<Link\s+to=\{APP_ROUTES\.TRAINING_CENTER\}[\s\S]*?<\/Link>/)[0];
assert.match(link, /to=\{APP_ROUTES\.TRAINING_CENTER\}/);
assert.match(link, /aria-label="Centro de treinamento"/);
assert.doesNotMatch(link, /\bhidden\b/, 'atalho não pode ficar oculto no mobile');
assert.match(readSource('src/navigation/routes.js'), /const TRAINING_CENTER_PATH = '\/game\/training-center'/);

const evidence = loadEvidence();
for (const vp of MOBILE_VIEWPORTS) {
  for (const [page, m] of Object.entries(evidence[vp].pages)) {
    assert.equal(m.visibleByLabel['Centro de treinamento'], 1, `${vp}/${page}: atalho visível 1x`);
    assert.ok(m.shortcuts['Centro de treinamento'], `${vp}/${page}: atalho dentro da rail`);
  }
  const tap = evidence[vp].flow.steps.find((s) => s.step.startsWith('tap Centro'));
  assert.equal(tap.ok, true, `${vp}: 1 toque executado`);
  assert.equal(tap.path, '/game/training-center', `${vp}: destino ${tap.path}`);
  assert.equal(tap.shell, 1, `${vp}: abre dentro de um único AppShell`);
}
console.log('   medido: visível em Home/Ranking/Comissão técnica/Economia (360 e 390) · 1 toque → /game/training-center');
console.log('test-mobile-visible-training-shortcut-v524c: PASS');
