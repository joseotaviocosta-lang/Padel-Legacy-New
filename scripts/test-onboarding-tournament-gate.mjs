// Correção UI/cronologia — Fase 2 (Padel Legacy): "Competições" foi movida
// para o fim da trilha do tutorial (tutorialSteps.js, v13), mas o 1º torneio
// real ainda pode levar semanas para abrir inscrição. Este teste prova que
// getOnboardingNextAction() nunca sugere essa etapa como CTA da Home
// enquanto nenhum torneio tiver inscrição aberta — a Home volta a decidir
// sozinha (retorna null) em vez de empurrar uma ação impossível de cumprir
// hoje, exatamente como já documentado no próprio arquivo.
import assert from 'node:assert/strict';
import { getOnboardingNextAction } from '../src/onboarding/onboardingNextAction.js';

const baseProfile = {
  tutorial_onboarding: {
    status: 'in_progress',
    currentStepId: 'tournament-registered',
    completedStepIds: [],
  },
};

// (1) Sem torneio com inscrição aberta: nunca sugere Competições, a Home
// decide sozinha (contrato já documentado: retorna null).
const locked = getOnboardingNextAction(baseProfile, { hasOpenTournamentRegistration: false });
assert.equal(locked, null, 'com Competições bloqueada, a Home deve decidir sozinha (null)');

// (2) Com torneio de inscrição aberta: volta a sugerir a etapa normalmente.
const unlocked = getOnboardingNextAction(baseProfile, { hasOpenTournamentRegistration: true });
assert.ok(unlocked, 'com um torneio de inscrição aberta, a etapa deve voltar a ser sugerida');
assert.equal(unlocked.stepId, 'tournament-registered');

// (3) Comportamento padrão (chamador antigo, sem o novo parâmetro) não muda:
// continua sugerindo normalmente — nenhuma quebra de compatibilidade.
const legacyCall = getOnboardingNextAction(baseProfile);
assert.ok(legacyCall, 'chamador sem o novo parâmetro preserva o comportamento anterior');
assert.equal(legacyCall.stepId, 'tournament-registered');

// (4) Etapas de OUTROS grupos nunca são afetadas pelo bloqueio de Competições.
const otherGroupProfile = {
  tutorial_onboarding: { status: 'in_progress', currentStepId: 'staff-known', completedStepIds: [] },
};
const otherGroup = getOnboardingNextAction(otherGroupProfile, { hasOpenTournamentRegistration: false });
assert.ok(otherGroup, 'etapas fora de Competições continuam sendo sugeridas mesmo sem torneio aberto');
assert.equal(otherGroup.stepId, 'staff-known');

console.log('OnboardingTournamentGateTest: Competições nunca é sugerida como CTA da Home sem inscrição aberta; demais etapas e compatibilidade preservadas.');
