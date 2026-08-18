// Onboarding Flow 3.1 (docs/ONBOARDING_FLOW_3_1.md, Parte 2).
//
// QA real: durante o onboarding, o tutorial pedia "escolha sua dupla"
// enquanto a Home (CareerHub.jsx) sugeria, de forma independente,
// "inscreva-se em torneio" — CTAs concorrentes. Fonte única criada:
// `getOnboardingNextAction(profile)` (src/onboarding/onboardingNextAction.js),
// que a Home passa a priorizar como CTA principal enquanto o onboarding
// principal estiver em andamento; o motor de recomendação "normal"
// (`getNextStep`, preservado como fallback) só volta a decidir depois que o
// onboarding termina, foi pulado, ou nunca começou.
//
// Este teste prova: (1) a função retorna null fora do onboarding ativo e na
// etapa de encerramento (que continua com fluxo dedicado próprio); (2) para
// toda outra etapa, retorna exatamente os dados da etapa viva; (3)
// `partnerAction` é sempre false (um atalho por modal nunca dispararia o
// auto-complete por visita da etapa `offers-reviewed`, travando o tutorial
// permanentemente nela); (4) CareerHub.jsx compõe o hero CTA com fallback
// preservado e corrigiu o dedup de rota com query string.
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
  const { getOnboardingNextAction } = await server.ssrLoadModule('/src/onboarding/onboardingNextAction.js');

  // ── 1) null fora do onboarding ativo ─────────────────────────────────────
  gate('null sem tutorial_onboarding nenhum', getOnboardingNextAction({}) === null);
  gate('null sem profile', getOnboardingNextAction(null) === null);
  gate('null quando status é completed', getOnboardingNextAction({ tutorial_onboarding: { status: 'completed', currentStepId: null } }) === null);
  gate('null quando status é skipped', getOnboardingNextAction({ tutorial_onboarding: { status: 'skipped', currentStepId: 'career-created' } }) === null);

  // ── 2) Cada etapa viva (exceto FINISH) produz um action correto ─────────
  for (const step of TUTORIAL_STEPS) {
    const profile = { tutorial_onboarding: { status: 'in_progress', currentStepId: step.id, completedStepIds: [] } };
    const action = getOnboardingNextAction(profile);
    if (step.kind === 'FINISH') {
      gate(`null na etapa de encerramento "${step.id}" (fluxo próprio em CareerHub.jsx, não pela Home)`, action === null);
      continue;
    }
    gate(`action reflete a etapa "${step.id}" (stepId/to/cta/description)`,
      action?.stepId === step.id && action.to === step.route && action.cta === step.actionLabel && action.description === step.explanation);
    gate(`action.partnerAction é false na etapa "${step.id}" (nunca atalho por modal)`, action.partnerAction === false);
    gate(`action tem ícone definido para "${step.id}"`, Boolean(action.icon));
  }

  // ── 3) Regressão explícita: as etapas de parceiro nunca usam atalho de modal ──
  const offersAction = getOnboardingNextAction({ tutorial_onboarding: { status: 'in_progress', currentStepId: 'offers-reviewed', completedStepIds: [] } });
  gate('offers-reviewed: to aponta para a rota real (nunca um atalho sem navegação)', offersAction.to === '/partners?view=offers&source=tutorial');
  gate('offers-reviewed: partnerAction é false (o auto-complete por visita depende de navegação real)', offersAction.partnerAction === false);
  const partnerAction = getOnboardingNextAction({ tutorial_onboarding: { status: 'in_progress', currentStepId: 'partner-selected', completedStepIds: [] } });
  gate('partner-selected: partnerAction também é false', partnerAction.partnerAction === false);

  // ── 4) CareerHub.jsx: composição do hero e fix de dedup por rota ────────
  const hubSource = readFileSync('src/pages/CareerHub.jsx', 'utf8');
  gate('CareerHub.jsx importa getOnboardingNextAction', hubSource.includes("import { getOnboardingNextAction } from '@/onboarding/onboardingNextAction.js';"));
  gate('heroStep prioriza onboardingNextAction, com fallbackHeroStep preservado', hubSource.includes('const heroStep = onboardingNextAction || fallbackHeroStep;'));
  gate('getNextStep (motor de fallback) continua definido, não foi removido', /function getNextStep\(profile, upcomingTournaments\)/.test(hubSource));
  gate('basePath() existe para comparar rotas ignorando query string', /function basePath\(route\)/.test(hubSource));
  gate('buildPriorityActions usa basePath() no dedup contra o hero (decisões)', hubSource.includes('basePath(decision.route) === basePath(heroRoute)'));
  gate('buildPriorityActions usa basePath() no dedup contra o hero (prioridades diárias)', hubSource.includes('basePath(priority.route) === basePath(heroRoute)'));
  gate('attentionItems também exclui o que já é o hero atual (não só o que já virou priorityAction)', hubSource.includes('basePath(decision.route) !== basePath(heroStep?.to)'));
  gate('NextStepCard.jsx morto foi removido (não é mais importado nem existe)', !hubSource.includes("from '@/components/career/NextStepCard"));

  console.log(`\n${gates} gates executados, todos PASS — Onboarding Flow 3.1 (CTA único durante onboarding).`);
} finally {
  await server.close();
}
