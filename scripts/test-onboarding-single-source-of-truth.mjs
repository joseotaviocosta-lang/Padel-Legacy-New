// Onboarding Single Source of Truth / Zero Conflict Flow
// (docs/ONBOARDING_SINGLE_SOURCE_OF_TRUTH.md).
//
// QA real após Onboarding Flow 3.1: o Guia corretamente mostrava "Dê um
// nome ao atleta" enquanto a Home mostrava, ao mesmo tempo, "[Começar
// tutorial]" + "ESCOLHA SEU PARCEIRO". Causa raiz A, confirmada por leitura
// direta do código: `careerDecisionCenter.js` produz uma decisão
// `choose-partner` (prioridade 'critical') sempre que `!profile.partner_id`
// — verdade durante praticamente todo o início de jogo, independente da
// etapa atual do tutorial — e o dedup de Onboarding Flow 3.1 só removia
// itens cuja rota batia EXATAMENTE com a do CTA principal, nunca "qualquer
// coisa à frente da etapa atual". Corrigido suprimindo por completo
// priorityActions/attentionItems em CareerHub.jsx sempre que
// getOnboardingNextAction() está ativo — mais simples e robusto que
// tentar rankear decisões arbitrárias contra a sequência do tutorial.
//
// Este teste prova, para as 15 etapas: (1) Guia (getCurrentTutorialStep) e
// Home (getOnboardingNextAction) sempre concordam em stepId/destination/
// actionLabel — comparando os campos, não o texto renderizado; (2) a fonte
// do bug (`choose-partner`) continua existindo na camada de dados (não foi
// removida/alterada — não é uma mudança de conteúdo do tutorial); (3) a
// supressão das listas secundárias existe no código-fonte da Home sempre
// que o onboarding está ativo.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { TUTORIAL_STEPS } = await server.ssrLoadModule('/src/onboarding/tutorialSteps.js');
  const { getCurrentTutorialStep } = await server.ssrLoadModule('/src/onboarding/tutorialState.js');
  const { getOnboardingNextAction } = await server.ssrLoadModule('/src/onboarding/onboardingNextAction.js');
  const { buildCareerDecisionCenter } = await server.ssrLoadModule('/src/lib/careerDecisionCenter.js');

  // ── 1) Guia e Home concordam em stepId/destination/actionLabel, para TODAS as 15 etapas ──
  for (const step of TUTORIAL_STEPS) {
    const onboarding = { status: 'in_progress', currentStepId: step.id, completedStepIds: [] };
    const profile = { tutorial_onboarding: onboarding };
    const guideStep = getCurrentTutorialStep(onboarding);
    const homeAction = getOnboardingNextAction(profile);

    gate(`Guia resolve a etapa "${step.id}" corretamente`, guideStep?.id === step.id);

    if (step.kind === 'FINISH') {
      // autonomy: a Home NUNCA mostra isto como CTA genérico (fluxo próprio
      // dedicado em CareerHub.jsx, "Começar carreira livre") — Guia continua
      // mostrando normalmente (botão "Entendi, continuar" dedicado).
      gate(`Home retorna null na etapa de encerramento "${step.id}" (não é CTA genérico)`, homeAction === null);
      gate(`Guia continua reconhecendo "${step.id}" mesmo sem CTA na Home`, guideStep?.completionType === 'confirm_understanding');
      continue;
    }

    gate(`Home.stepId === Guia.stepId na etapa "${step.id}"`, homeAction?.stepId === guideStep.id);
    gate(`Home.destination === rota real da etapa "${step.id}"`, homeAction.destination === guideStep.route);
    gate(`Home.actionLabel === actionLabel real da etapa "${step.id}"`, homeAction.actionLabel === guideStep.actionLabel);
    gate(`Home.actionType é 'navigate' na etapa "${step.id}"`, homeAction.actionType === 'navigate');
    // Compatibilidade: to/cta (contrato já consumido por PriorityActionsPanel) continuam batendo com destination/actionLabel.
    gate(`Home.to === Home.destination na etapa "${step.id}" (sem divergência entre os dois contratos)`, homeAction.to === homeAction.destination && homeAction.cta === homeAction.actionLabel);
  }

  // ── 2) A fonte do bug (choose-partner) continua existindo — não foi removida do conteúdo/regra de negócio, só suprimida da UI durante onboarding ──
  const partnerlessProfile = { id: 'p1', partner_id: null, energy: 100, fatigue: 0, career_date: '2026-01-01' };
  const decisionCenter = buildCareerDecisionCenter(partnerlessProfile, { messages: [], partnerOffers: [], nextTournament: null });
  gate('careerDecisionCenter.js ainda produz choose-partner para perfil sem parceiro (regra de negócio intacta, não alterada)', decisionCenter.decisions.some((decision) => decision.id === 'choose-partner'));
  gate('choose-partner continua prioridade critical (não rebaixamos o dado, só suprimimos a apresentação)', decisionCenter.decisions.find((decision) => decision.id === 'choose-partner')?.priority === 'critical');

  // ── 3) CareerHub.jsx suprime priorityActions/attentionItems quando onboardingNextAction está ativo ──
  const hubSource = readFileSync('src/pages/CareerHub.jsx', 'utf8');
  gate('priorityActions é [] quando onboardingNextAction existe', hubSource.includes('onboardingNextAction ? [] : buildPriorityActions('));
  gate('attentionItems é [] quando onboardingNextAction existe', hubSource.includes('onboardingNextAction ? [] : (decisionCenter.decisions'));
  gate('useLocation importado (para a comparação de mesma página)', hubSource.includes("useLocation") && hubSource.includes("react-router-dom"));
  gate('heroIsCurrentPage compara basePath(heroStep.to) com a rota atual', hubSource.includes('basePath(heroStep.to) === location.pathname'));
  gate('PriorityActionsPanel recebe isCurrentPage', hubSource.includes('isCurrentPage={heroIsCurrentPage}'));
  gate('PriorityActionsPanel nunca renderiza um link para a própria página atual', hubSource.includes('isCurrentPage\n    ? <span'));

  // ── 4) Nenhuma etapa (exceto FINISH) fica sem destination/actionLabel — nenhum CTA "vazio" ──
  for (const step of TUTORIAL_STEPS.filter((item) => item.kind !== 'FINISH')) {
    const action = getOnboardingNextAction({ tutorial_onboarding: { status: 'in_progress', currentStepId: step.id, completedStepIds: [] } });
    gate(`Etapa "${step.id}" tem destination não vazio`, Boolean(action.destination));
    gate(`Etapa "${step.id}" tem actionLabel não vazio`, Boolean(action.actionLabel));
  }

  console.log(`\n${gates} gates executados, todos PASS — Single Source of Truth (Home === Guia em todas as 15 etapas).`);
} finally {
  await server.close();
}
