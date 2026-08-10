import fs from 'node:fs';
import assert from 'node:assert/strict';

const page = fs.readFileSync('src/components/design-system/Page.jsx', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const registration = fs.readFileSync('src/components/calendar/TournamentRegistrationModal.jsx', 'utf8');
const modal = fs.readFileSync('src/components/design-system/ModalShell.jsx', 'utf8');
const communications = fs.readFileSync('src/pages/Communications.jsx', 'utf8');
const tournament = fs.readFileSync('src/components/tournaments/TournamentModal.jsx', 'utf8');
const market = fs.readFileSync('src/pages/WorldMarket.jsx', 'utf8');

const checks = [
  ['PageSection não usa content-visibility automático', !page.includes('pl-section-enter pl-auto-contain')],
  ['guard para modal dentro de contain', css.includes('.pl-auto-contain:has(.fixed.inset-0)')],
  ['guard para listas virtualizadas', css.includes('.render-window > *:has(.fixed.inset-0)')],
  ['contain removido durante overlay', css.includes('contain: none !important')],
  ['rota não cria coordenada deslocada com overlay', css.includes('.app-route-stage:has(.fixed.inset-0)')],
  ['modal de inscrição usa o portal global', registration.includes('<ModalShell') && modal.includes('createPortal') && modal.includes('fixed inset-0')],
  ['comunicações, torneio e mercado usam o portal global', [communications, tournament, market].every(source => source.includes('<ModalShell') && !source.includes('className="fixed inset-0 z-50'))],
  ['versão rc.1.9', pkg.version === '0.9.0-rc.1.9'],
  ['script registrado', pkg.scripts?.['test:viewport-overlays-rc1']?.includes('test-viewport-overlays-rc1.mjs')],
];

for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`PASS: ${name}`);
}
console.log(`ViewportOverlaysRC1Test: PASS (${checks.length}/${checks.length})`);
