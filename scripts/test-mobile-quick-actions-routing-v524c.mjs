// Playthrough 5.24-C, Partes K/L — fluxo de navegação real (360 e 390):
// Ranking → [Centro] → voltar → [Carreiras] → Continuar → voltar.
// Sem perder save, sem trocar de carreira, sem duplicar AppShell.
import assert from 'node:assert/strict';
import { loadEvidence, MOBILE_VIEWPORTS } from './lib/v524cEvidence.mjs';

const evidence = loadEvidence();
for (const vp of MOBILE_VIEWPORTS) {
  const flow = evidence[vp].flow;
  const step = (prefix) => flow.steps.find((s) => s.step.startsWith(prefix));
  assert.equal(step('inicio').path, '/ranking');
  assert.equal(step('tap Centro').path, '/game/training-center', `${vp}: Centro`);
  assert.equal(step('tap Centro').shell, 1, `${vp}: Centro dentro do AppShell (1)`);
  assert.equal(step('voltar').path, '/ranking', `${vp}: voltar retorna à tela anterior`);
  assert.equal(step('tap Carreiras').path, '/careers', `${vp}: Gerenciar carreiras`);
  assert.equal(step('Continuar').ok, true, `${vp}: reentrar pela tela de carreiras`);
  assert.equal(step('Continuar').path, '/game', `${vp}: reentra na Home da carreira`);
  assert.equal(step('Continuar').shell, 1, `${vp}: um único AppShell após reentrar`);
  assert.equal(flow.sameCareer, true, `${vp}: mesma carreira ativa (${flow.start.activeId} → ${flow.reentered.activeId})`);
  assert.equal(flow.samePlayer, true, `${vp}: mesmo jogador`);
  assert.equal(flow.saveIntact, true, `${vp}: save íntegro (moedas/data)`);
  assert.equal(step('voltar após').path, '/careers', `${vp}: histórico do navegador preservado`);
}
console.log('   medido: Centro → voltar → Carreiras → Continuar → voltar íntegro em 360 e 390');
console.log('test-mobile-quick-actions-routing-v524c: PASS');
