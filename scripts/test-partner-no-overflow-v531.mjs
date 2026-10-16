// Fase 5.31 — hard rule nas telas da Dupla (app real, 360/390/desktop/
// paisagem, com e sem parceiro): 0 overflow horizontal, 0 elemento fora da
// tela, 0 botão cortado, 0 erro de JS.
import { gateRunner, measurements } from './lib/v531UiKit.mjs';

const { gate, finish } = gateRunner('test-partner-no-overflow-v531');
const after = measurements('after');
if (!after) { gate('medições do app real presentes (rode scripts/ui-audit-531.mjs --phase=after)', false); finish(); }
const rows = after.results.filter((r) => r.screen.startsWith('partner-') && !r.skipped);
const states = [...new Set(rows.map((r) => r.state))];
const viewports = [...new Set(rows.map((r) => r.viewport))];
gate(`1. cobertura: ${rows.length} capturas · estados ${states.join('/')} · larguras ${viewports.join('/')}`, rows.length >= 30 && states.length >= 2 && ['360', '390', 'desktop', 'landscape'].every((v) => viewports.includes(v)));
gate('2. 0 overflow horizontal', rows.every((r) => r.docOverflowPx === 0), JSON.stringify(rows.filter((r) => r.docOverflowPx).map((r) => `${r.screen}@${r.viewport}`)));
gate('3. 0 elemento fora da tela', rows.every((r) => r.offscreenCount === 0), JSON.stringify(rows.filter((r) => r.offscreenCount).map((r) => r.offscreen)));
gate('4. 0 botão cortado (página e modal)', rows.every((r) => r.clippedCount === 0 && r.modalClippedCount === 0));
gate('5. no celular, no máximo 1 CTA primário por tela', rows.filter((r) => r.viewport === '360' || r.viewport === '390').every((r) => r.primaryCount <= 1));
gate('6. 0 erro de JS durante as capturas', (after.errors || []).length === 0, JSON.stringify(after.errors));
finish();
