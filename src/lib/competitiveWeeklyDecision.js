import { buildUpcomingTournamentPlanning, getTournamentPlanningRecommendation } from '@/lib/weeklyCareerReview.js';
import { isPlayerParticipating } from '@/lib/tournamentRegistrationState.js';

// Playthrough 5.14, Partes B/D/E/L — PROJEÇÃO ÚNICA da decisão competitiva
// da semana.
//
// Problema que isto resolve (auditoria da Parte A): o planner já produzia
// uma recomendação toda semana, mas `buildUpcomingTournamentPlanning` /
// `getTournamentPlanningRecommendation` só eram consumidos dentro de um
// `useMemo` do CareerHub. A decisão existia como ESTADO DE TELA e nunca
// virava mensagem. Enquanto isso, `staff-weekly-report:<semana>` falava de
// folha salarial e moral — outro domínio. Resultado: as únicas mensagens
// sobre torneio eram os lembretes da FEDERAÇÃO (D-7/D-5/D-4), e o jogador
// descobria que precisava competir pelo prazo, não pelo planejamento.
//
// Esta função é a fonte única: a reunião da comissão, o relatório e o
// CareerHub leem a MESMA decisão. Não há segunda lógica de escolha — só a
// autoridade que o planner já usava.

export const COMPETITIVE_DECISION_STATES = Object.freeze({
  DECISION: 'decision',       // há torneio recomendado e inscrição possível
  COMMITTED: 'committed',     // jogador já inscrito nesta janela
  NO_EVENT: 'no_event',       // nenhuma opção adequada (Parte I)
});

const MAX_ALTERNATIVES = 3;

function describeReason(item) {
  if (!item) return null;
  if (item.conflictWith) return item.conflictWith;
  if (!item.eligible) return 'Ranking fora da faixa de entrada deste tier.';
  if (!item.registrationAllowed) return 'Inscrição indisponível nesta janela.';
  return null;
}

// Parte D — "por quê" derivado dos MESMOS números do planner, nunca texto
// inventado nem hardcode de torneio (Parte E).
export function buildRecommendationRationale(item) {
  if (!item) return [];
  const reasons = [];
  const fit = Number(item.fit);
  if (Number.isFinite(fit)) {
    if (fit >= 70) reasons.push('Adequado ao seu ranking atual.');
    else if (fit >= 40) reasons.push('Compatível com sua faixa de ranking.');
    else reasons.push('Fora da sua faixa ideal, mas é a melhor opção da semana.');
  }
  const chance = Number(item.choice?.semifinalChance);
  if (Number.isFinite(chance) && chance > 0) {
    reasons.push(`Chance estimada de avançar: ${Math.round(chance)}%.`);
  }
  const points = Number(item.points);
  if (Number.isFinite(points) && points > 0) reasons.push(`Vale ${points} pontos de ranking.`);
  const cost = Number(item.cost);
  if (Number.isFinite(cost)) {
    reasons.push(cost > 0 ? `Inscrição custa ${cost.toLocaleString('pt-BR')} moedas.` : 'Sem custo de inscrição.');
  }
  if (item.conflictWith) reasons.push(item.conflictWith);
  return reasons;
}

export function buildCompetitiveWeeklyDecision(profile, context = {}) {
  const items = buildUpcomingTournamentPlanning(profile, context) || [];
  if (!items.length) {
    return {
      state: COMPETITIVE_DECISION_STATES.NO_EVENT,
      recommended: null, alternatives: [], deadline: null, committed: null,
      reason: 'Nenhum torneio elegível na janela de planejamento.',
      rationale: [], items,
    };
  }

  // Parte J — um compromisso já assumido tem precedência sobre pedir uma
  // decisão que o jogador já tomou.
  const committed = items.find((item) => isPlayerParticipating(item.registrationState)) || null;
  if (committed) {
    return {
      state: COMPETITIVE_DECISION_STATES.COMMITTED,
      recommended: committed,
      alternatives: items.filter((item) => item.id !== committed.id).slice(0, MAX_ALTERNATIVES),
      deadline: committed.deadline || null,
      committed,
      reason: null,
      rationale: buildRecommendationRationale(committed),
      items,
    };
  }

  const recommendation = getTournamentPlanningRecommendation(items);
  const recommended = recommendation
    ? items.find((item) => item.id === recommendation.tournamentId) || null
    : null;

  // Parte I — sem opção acionável, a comissão diz isso explicitamente em vez
  // de inventar torneio.
  const actionable = recommended && recommended.canRegisterNow && recommended.registrationAllowed;
  if (!actionable) {
    return {
      state: COMPETITIVE_DECISION_STATES.NO_EVENT,
      recommended: null,
      alternatives: items.slice(0, MAX_ALTERNATIVES).map((item) => ({ ...item, why: describeReason(item) })),
      deadline: null,
      committed: null,
      reason: recommended
        ? 'Nenhuma inscrição aberta e adequada nesta janela.'
        : 'Nenhum torneio adequado ao seu ranking nesta janela.',
      rationale: [],
      items,
    };
  }

  return {
    state: COMPETITIVE_DECISION_STATES.DECISION,
    recommended,
    // Parte S — UMA decisão + até 3 alternativas, nunca uma mensagem por
    // torneio.
    alternatives: items
      .filter((item) => item.id !== recommended.id)
      .slice(0, MAX_ALTERNATIVES)
      .map((item) => ({ ...item, why: describeReason(item) })),
    deadline: recommended.deadline || null,
    committed: null,
    reason: null,
    rationale: buildRecommendationRationale(recommended),
    items,
  };
}

// Parte O — o CTA depende do estado real do torneio, sem criar fluxo novo.
export function resolveCompetitiveDecisionCta(decision) {
  if (!decision) return null;
  const target = decision.recommended || decision.committed;
  if (!target) return null;
  if (decision.state === COMPETITIVE_DECISION_STATES.COMMITTED) {
    return target.drawn
      ? { id: 'view_bracket', label: 'Ver chave' }
      : { id: 'view_commitment', label: 'Ver compromisso' };
  }
  if (target.canRegisterNow && target.registrationAllowed) {
    return { id: 'register', label: 'Inscrever-se' };
  }
  return { id: 'view_tournament', label: 'Ver torneio' };
}
