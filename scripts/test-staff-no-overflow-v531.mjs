// Fase 5.31 — hard rule nas telas de Treinador / Comissão (app real,
// 360/390/desktop/paisagem): 0 overflow, 0 fora da tela, 0 botão cortado,
// 0 erro de JS, primeira ação na primeira dobra do celular.
import { gateRunner, measurements } from './lib/v531UiKit.mjs';

const { gate, finish } = gateRunner('test-staff-no-overflow-v531');
const after = measurements('after');
if (!after) { gate('medições do app real presentes (rode scripts/ui-audit-531.mjs --phase=after)', false); finish(); }
const rows = after.results.filter((r) => (r.screen.startsWith('coach') || r.screen.startsWith('staff')) && !r.skipped);
const viewports = [...new Set(rows.map((r) => r.viewport))];
gate(`1. cobertura: ${rows.length} capturas · larguras ${viewports.join('/')}`, rows.length >= 20 && ['360', '390', 'desktop', 'landscape'].every((v) => viewports.includes(v)));
gate('2. 0 overflow horizontal', rows.every((r) => r.docOverflowPx === 0));
gate('3. 0 elemento fora da tela', rows.every((r) => r.offscreenCount === 0), JSON.stringify(rows.filter((r) => r.offscreenCount).map((r) => r.offscreen)));
gate('4. 0 botão cortado (página e modal)', rows.every((r) => r.clippedCount === 0 && r.modalClippedCount === 0));
gate('5. celular: primeira ação útil dentro da primeira dobra', rows.filter((r) => (r.viewport === '360' || r.viewport === '390') && !r.modalOpen).every((r) => r.firstActionY != null && r.firstActionY < r.vh), JSON.stringify(rows.filter((r) => (r.viewport === '360' || r.viewport === '390') && r.firstActionY >= r.vh).map((r) => `${r.screen}@${r.viewport}:${r.firstActionY}`)));
gate('6. 0 erro de JS durante as capturas', (after.errors || []).length === 0);
finish();
