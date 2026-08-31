import { CalendarDays, Dumbbell, GraduationCap, Sparkles, Swords, Trophy, UserRound, Users } from 'lucide-react';
import { getCurrentTutorialStep } from './tutorialState.js';

// Onboarding Flow 3.1 (docs/ONBOARDING_FLOW_3_1.md, Parte 2): mapeamento
// puramente visual por id de etapa — não precisa acompanhar toda mudança de
// conteúdo do tutorial, só existe para o card principal da Home não usar um
// único ícone genérico do início ao fim.
const STEP_ICON_BY_ID = {
  'career-created': GraduationCap,
  'athlete-named': UserRound,
  'side-selected': UserRound,
  'difficulty-selected': Sparkles,
  'style-selected': Sparkles,
  'appearance-known': UserRound,
  'profile-reviewed': UserRound,
  'offers-reviewed': Users,
  'partner-selected': Users,
  'coaches-known': GraduationCap,
  'first-training': Dumbbell,
  'calendar-known': CalendarDays,
  'tournament-registered': Trophy,
  'first-match': Swords,
};

/**
 * Fonte única do CTA principal da Home enquanto o onboarding principal está
 * ativo (docs/ONBOARDING_FLOW_3_1.md, Parte 2, item 10). Retorna `null`
 * sempre que a Home deve voltar a decidir sozinha: onboarding nunca
 * começou/já terminou/foi pulado, ou a etapa atual é a de encerramento
 * (`kind: 'FINISH'`, ver tutorialSteps.js) — esse momento continua sendo o
 * banner dedicado "Começar carreira livre" já existente em CareerHub.jsx.
 *
 * `partnerAction` é sempre `false` de propósito: um atalho por modal (sem
 * navegar) nunca dispararia o auto-complete por visita da etapa
 * `offers-reviewed` (que exige uma troca real de `location.pathname` para
 * `/partners`), travando o tutorial nesse ponto para sempre.
 */
// Correção UI/cronologia: "Competições" (tutorialSteps.js) foi movida para
// o fim da trilha, mas o 1º torneio real ainda pode levar semanas para
// abrir inscrição (Fase 15.7, calendário rebalanceado). Enquanto nenhum
// torneio tiver inscrição aberta, esta etapa nunca deve virar o CTA
// principal da Home — a Home volta a decidir sozinha (retorna `null`,
// mesmo contrato já documentado abaixo) em vez de sugerir uma ação
// impossível de cumprir hoje. `hasOpenTournamentRegistration` default=true
// preserva o comportamento anterior para qualquer chamador que ainda não
// passe o novo parâmetro.
export function getOnboardingNextAction(profile, { hasOpenTournamentRegistration = true } = {}) {
  const onboarding = profile?.tutorial_onboarding;
  if (!onboarding || onboarding.status !== 'in_progress') return null;
  const step = getCurrentTutorialStep(onboarding);
  if (!step || step.kind === 'FINISH') return null;
  if (step.chapter === 'Competições' && !hasOpenTournamentRegistration) return null;
  return {
    stepId: step.id,
    icon: STEP_ICON_BY_ID[step.id] || GraduationCap,
    title: step.title,
    description: step.explanation,
    // `to`/`cta` são o contrato que PriorityActionsPanel/getNextStep já usam
    // (mantidos para não forçar um rename em cascata). `destination`/
    // `actionLabel`/`actionType` são aliases aditivos — hotfix "Single
    // Source of Truth" pediu esse formato explicitamente para comparar
    // Home x Guia sem depender de nomes de campo específicos de um único
    // consumidor. `actionType` é sempre 'navigate' porque toda ação de
    // onboarding hoje é "ir até esta rota" — não existe um segundo tipo
    // real para justificar uma taxonomia maior.
    to: step.route,
    cta: step.actionLabel,
    destination: step.route,
    actionLabel: step.actionLabel,
    actionType: 'navigate',
    partnerAction: false,
  };
}
