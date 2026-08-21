// M4.3 (docs/MOBILE_M4_3_GAME_FLOW.md, Parte C/D).
//
// Fonte compartilhada para "o que fazer agora", usável por qualquer página
// (Home, Treinos, Torneios) sem duplicar a ordem de prioridade. NÃO
// substitui a lógica já existente e testada de CareerHub.jsx (heroStep/
// buildNextEvent/buildPriorityActions, já com sua própria disciplina de
// "single source of truth" com o tutorial) — a Home já resolve isso com
// dados que só ela busca (decisionCenter/dailyBriefing completos) e cobrir
// o mesmo terreno duas vezes seria a duplicação que esta fase pede pra
// EVITAR, não criar. Esta função cobre o terreno que HOJE não tem
// nenhuma resolução própria (Treinos, mensagens contextuais de torneio) e
// fica disponível para qualquer página futura que precise da mesma ordem.
//
// Pura e barata: só lê campos já presentes em `profile` mais um `context`
// opcional já pré-calculado pelo chamador (nunca busca dado sozinha,
// nunca dispara consulta — Parte R).
//
// Retorno nunca acopla JSX: `icon` é uma CHAVE (string), resolvida pelo
// componente de UI (ContextActionBar) — não uma referência de componente.
import { canPlayMatchToday, isInjured, injuryRecoveryDays, isRetired, DAILY_TRAINING_LIMIT } from '@/lib/padel.js';

/**
 * @param {object} profile
 * @param {object} [context]
 * @param {{route:string,label:string,description?:string}} [context.tournamentMatchToday] - partida de torneio disponível hoje
 * @param {{route:string,label:string,description?:string}} [context.mandatoryDecision] - decisão obrigatória pendente (ex.: describeCalendarBlock)
 * @param {{route:string,name:string,daysUntil?:number}} [context.tournamentRegistrationNeeded] - torneio com inscrição aberta
 * @param {{route:string,label:string,description?:string}} [context.priorityMission] - missão/tutorial prioritário
 * @param {{route:string,label:string,description?:string}} [context.urgentMessage] - mensagem/entrevista relevante não lida
 * @param {{label?:string,description?:string}} [context.calendarSuggestion] - sugestão não urgente de olhar o calendário
 * @param {{label?:string,description?:string,route?:string}} [context.partnershipNegotiation] - contrato vencido/negociação pendente (Fase 15)
 * @param {boolean} [context.hasPendingPartnerProposal] - existe proposta de parceria pendente (Fase 15)
 * @returns {{id:string,priority:number,label:string,description:string,route:string|null,actionType:'navigate'|'advance-day',icon:string,tone:string}|null}
 */
export function getCareerNextAction(profile, context = {}) {
  if (!profile) return null;
  if (isRetired(profile)) {
    return { id: 'retired', priority: 0, label: 'Ver legado', description: 'Carreira encerrada.', route: '/game/legacy', actionType: 'navigate', icon: 'crown', tone: 'premium' };
  }
  if (isInjured(profile)) {
    const days = injuryRecoveryDays(profile);
    return { id: 'injury-recovery', priority: 1, label: 'Ver recuperação', description: `${days} dia${days === 1 ? '' : 's'} restante${days === 1 ? '' : 's'} de recuperação.`, route: '/game/calendar', actionType: 'navigate', icon: 'heart-pulse', tone: 'danger' };
  }

  // 1. partida de torneio pendente/vencida hoje
  if (context.tournamentMatchToday) {
    const t = context.tournamentMatchToday;
    return { id: 'tournament-match', priority: 2, label: t.label || 'Jogar partida', description: t.description || '', route: t.route, actionType: 'navigate', icon: 'trophy', tone: 'premium' };
  }
  // 2. decisão obrigatória (bloqueia avanço)
  if (context.mandatoryDecision) {
    const d = context.mandatoryDecision;
    return { id: 'mandatory-decision', priority: 3, label: d.label || 'Resolver agora', description: d.description || '', route: d.route, actionType: 'navigate', icon: 'alert-circle', tone: 'warning' };
  }
  // Fase 15 (Parte 23): "partida obrigatória > decisão obrigatória >
  // negociação de parceria > sem parceiro > proposta relevante >
  // atividades normais" — ordem explícita do briefing, inserida aqui.
  // 3. negociação de contrato de parceria pendente (D-3/D-1/vencido)
  if (context.partnershipNegotiation) {
    const n = context.partnershipNegotiation;
    return { id: 'partnership-negotiation', priority: 4, label: n.label || 'Resolver contrato', description: n.description || '', route: n.route || '/partners', actionType: 'navigate', icon: 'alert-circle', tone: 'warning' };
  }
  // 4. sem parceiro (free agent) — nunca um soft-lock, sempre uma sugestão real
  if (!profile.partner_id) {
    return context.hasPendingPartnerProposal
      ? { id: 'partner-proposal', priority: 5, label: 'Responder proposta', description: 'Você tem uma proposta de parceria pendente.', route: '/partners?view=offers', actionType: 'navigate', icon: 'trophy', tone: 'info' }
      : { id: 'find-partner', priority: 5, label: 'Encontrar nova dupla', description: 'Você está sem parceiro no momento.', route: '/partners', actionType: 'navigate', icon: 'trophy', tone: 'warning' };
  }
  // 5. proposta relevante recebida mesmo já tendo parceiro (Parte 15/16 —
  // nunca troca a dupla sozinha, só avisa que existe)
  if (context.hasPendingPartnerProposal) {
    return { id: 'partner-proposal-while-paired', priority: 6, label: 'Ver proposta recebida', description: 'Outro atleta demonstrou interesse em formar dupla com você.', route: '/partners?view=offers', actionType: 'navigate', icon: 'mail', tone: 'info' };
  }
  // 6. torneio com inscrição necessária
  if (context.tournamentRegistrationNeeded) {
    const t = context.tournamentRegistrationNeeded;
    const days = Number(t.daysUntil) || 0;
    return { id: 'tournament-registration', priority: 7, label: 'Ver torneio', description: t.name ? `${t.name}${days > 0 ? ` · em ${days} dia${days === 1 ? '' : 's'}` : ' · hoje'}` : 'Inscrição aberta.', route: t.route || '/tournaments', actionType: 'navigate', icon: 'trophy', tone: 'info' };
  }
  // 7. partida treino disponível
  if (canPlayMatchToday(profile).allowed) {
    return { id: 'practice-match', priority: 8, label: 'Jogar partida', description: 'Sua partida treino de hoje ainda está disponível.', route: '/matches', actionType: 'navigate', icon: 'swords', tone: 'info' };
  }
  // 8. treino disponível
  const trainingsToday = Number(profile.trainings_today) || 0;
  if (trainingsToday < DAILY_TRAINING_LIMIT) {
    return { id: 'training', priority: 9, label: trainingsToday > 0 ? 'Treinar novamente' : 'Treinar agora', description: `${trainingsToday}/${DAILY_TRAINING_LIMIT} treinos hoje`, route: '/game/training', actionType: 'navigate', icon: 'dumbbell', tone: 'info' };
  }
  // 9. missão/tutorial prioritário
  if (context.priorityMission) {
    const m = context.priorityMission;
    return { id: 'mission', priority: 10, label: m.label || 'Ver missão', description: m.description || '', route: m.route, actionType: 'navigate', icon: 'target', tone: 'info' };
  }
  // 10. mensagens/decisões relevantes
  if (context.urgentMessage) {
    const m = context.urgentMessage;
    return { id: 'message', priority: 11, label: m.label || 'Abrir mensagem', description: m.description || '', route: m.route, actionType: 'navigate', icon: 'mail', tone: 'info' };
  }
  // 11. calendário (quando o chamador já sabe de algo relevante mas não urgente)
  if (context.calendarSuggestion) {
    const c = context.calendarSuggestion;
    return { id: 'calendar', priority: 12, label: c.label || 'Ver calendário', description: c.description || '', route: '/game/calendar', actionType: 'navigate', icon: 'calendar', tone: 'neutral' };
  }
  // 12. descanso/avanço de dia — nenhuma pendência obrigatória
  return { id: 'advance-day', priority: 13, label: 'Avançar o dia', description: 'Nenhuma pendência obrigatória.', route: null, actionType: 'advance-day', icon: 'fast-forward', tone: 'neutral' };
}
