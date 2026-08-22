import { APP_ROUTES } from '@/navigation/routes.js';

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function daysBetween(from, to) {
  if (!from || !to) return null;
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.ceil((end - start) / 86400000);
}

const PRIORITY_WEIGHT = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
};

export function buildCareerDecisionCenter(profile, context = {}) {
  if (!profile) return { decisions: [], urgentCount: 0, totalCount: 0 };

  const messages = Array.isArray(context.messages) ? context.messages : [];
  const partnerOffers = Array.isArray(context.partnerOffers) ? context.partnerOffers : [];
  const nextTournament = context.nextTournament || null;
  const energy = clamp(profile.energy ?? 100);
  const fatigue = clamp(profile.fatigue ?? 0);
  const today = profile.career_date || '2026-01-01';
  const decisions = [];

  const pendingMessages = messages.filter((message) => message?.status === 'decisao_pendente');
  pendingMessages.slice(0, 3).forEach((message, index) => {
    decisions.push({
      id: `communication-${message.id || index}`,
      priority: 'high',
      category: 'Comunicação',
      title: message.title || message.subject || 'Uma decisão aguarda sua resposta',
      description: message.content || message.body || 'Abra a comunicação para revisar as opções disponíveis.',
      route: '/communications',
      actionLabel: 'Responder',
    });
  });

  const pendingOffers = partnerOffers.filter((offer) => offer?.status === 'pending');
  if (pendingOffers.length > 0) {
    decisions.push({
      id: 'partner-offers',
      priority: profile.partner_id ? 'medium' : 'critical',
      category: 'Dupla',
      title: `${pendingOffers.length} proposta${pendingOffers.length === 1 ? '' : 's'} de parceria`,
      description: profile.partner_id
        ? 'Compare as propostas com sua dupla atual antes de decidir.'
        : 'Você precisa escolher um parceiro para avançar no circuito competitivo.',
      route: '/partners?view=offers',
      actionLabel: 'Analisar propostas',
    });
  } else if (!profile.partner_id) {
    decisions.push({
      id: 'choose-partner',
      priority: 'critical',
      category: 'Dupla',
      title: 'Escolha seu parceiro',
      description: 'Sem uma dupla ativa, inscrições e evolução competitiva ficam limitadas.',
      route: '/partners',
      actionLabel: 'Buscar parceiro',
    });
  }

  if (profile.is_injured || Number(profile.injury_days_remaining) > 0) {
    decisions.push({
      id: 'injury-recovery',
      priority: 'critical',
      category: 'Saúde',
      title: 'Defina sua recuperação',
      description: `Você ainda possui ${Math.max(1, Number(profile.injury_days_remaining) || 1)} dia(s) de recuperação previstos.`,
      route: '/game/calendar',
      actionLabel: 'Ver recuperação',
    });
  } else if (fatigue >= 75 || energy <= 25) {
    decisions.push({
      id: 'physical-load',
      priority: 'high',
      category: 'Condição física',
      title: fatigue >= 75 ? 'Reduza a carga de treino' : 'Recupere energia antes de competir',
      description: `Energia ${Math.round(energy)}% · Fadiga ${Math.round(fatigue)}%. Ajuste o planejamento antes de avançar.`,
      route: APP_ROUTES.TRAINING,
      actionLabel: 'Ajustar treinos',
    });
  }

  const daysToTournament = nextTournament?.start_date ? daysBetween(today, nextTournament.start_date) : null;
  if (daysToTournament != null && daysToTournament >= 0 && daysToTournament <= 3) {
    decisions.push({
      id: `tournament-${nextTournament.id || nextTournament.start_date}`,
      priority: daysToTournament <= 1 ? 'high' : 'medium',
      category: 'Competição',
      title: daysToTournament === 0
        ? `${nextTournament.name || 'Torneio'} começa hoje`
        : `${nextTournament.name || 'Torneio'} em ${daysToTournament} dia(s)`,
      description: 'Revise inscrição, tática, condição física e orientação do treinador.',
      route: '/tournaments',
      actionLabel: 'Preparar torneio',
    });
  }

  const coachContractEnd = profile.head_coach_contract_end || profile.coach_contract_end;
  const coachDays = coachContractEnd ? daysBetween(today, coachContractEnd) : null;
  if (coachDays != null && coachDays >= 0 && coachDays <= 30) {
    decisions.push({
      id: 'coach-contract',
      priority: coachDays <= 7 ? 'high' : 'medium',
      category: 'Equipe',
      title: 'Contrato do treinador próximo do fim',
      description: `Restam ${coachDays} dia(s). Renove ou prepare uma substituição sem perder continuidade.`,
      route: '/coaches',
      actionLabel: 'Revisar contrato',
    });
  }

  const ordered = decisions
    .map((decision, index) => ({ ...decision, order: index }))
    .sort((a, b) => (PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]) || (a.order - b.order))
    .map(({ order, ...decision }) => decision);

  return {
    decisions: ordered,
    urgentCount: ordered.filter((decision) => ['critical', 'high'].includes(decision.priority)).length,
    totalCount: ordered.length,
  };
}
