// Fase 5.30 — Home no app real (Tauri/WebView2), estados "nova" (sem
// parceiro, sem compromisso) e "torneio" (campanha em andamento), em 360,
// 390, desktop e paisagem: zero overflow / fora da tela / botão estourado /
// erro de JS, e a primeira dobra mobile mostra status + compromisso + CTA.
import { afterMeasurements, gateRunner } from './lib/v530HomeKit.mjs';

const { gate, finish } = gateRunner('test-home-mobile-overflow-v530');
const m = afterMeasurements();
const states = [...new Set(m.results.map((r) => r.state))];
gate('1. pelo menos 2 estados medidos', states.length >= 2, states.join(','));
for (const r of m.results) {
  gate(`2. [${r.state} ${r.viewport}] 0 overflow horizontal`, r.docOverflowPx === 0);
  gate(`3. [${r.state} ${r.viewport}] 0 elemento fora da tela`, r.offscreenCount === 0, JSON.stringify(r.offscreen));
  gate(`4. [${r.state} ${r.viewport}] 0 botão com texto estourado`, r.clippedCount === 0, JSON.stringify(r.clipped));
  if (['360', '390'].includes(r.viewport)) gate(`5. [${r.state} ${r.viewport}] compromisso começa na primeira dobra (y=${r.commitmentY})`, r.commitmentY != null && r.commitmentY < r.vh * 0.6);
}
gate('6. 0 erro de JavaScript nas capturas', (m.errors || []).length === 0, (m.errors || []).join(' | '));
finish();
