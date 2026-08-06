function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function daysBetween(from, to) {
  if (!from || !to) return null;
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.ceil((end - start) / 86400000);
}

export function buildCareerAssistantInsights(profile, context = {}) {
  if (!profile) return [];
  const insights = [];
  const energy = clamp(profile.energy ?? 100, 0, 100);
  const fatigue = clamp(profile.fatigue ?? 0, 0, 100);
  const injured = Boolean(profile.is_injured || profile.injury_status === 'injured' || Number(profile.injury_days_remaining) > 0);
  const nextTournament = context.nextTournament;
  const tournamentDays = nextTournament?.start_date ? daysBetween(profile.career_date, nextTournament.start_date) : null;

  if (injured) {
    insights.push({
      id: 'injury',
      priority: 100,
      tone: 'danger',
      title: 'Priorize sua recuperação',
      description: `${Math.max(1, Number(profile.injury_days_remaining) || 1)} dia(s) estimado(s) até o retorno. Evite compromissos físicos.`,
      actionLabel: 'Abrir calendário',
      route: '/game/calendar',
    });
  } else if (fatigue >= 70 || energy <= 25) {
    insights.push({
      id: 'condition',
      priority: 90,
      tone: 'warning',
      title: fatigue >= 70 ? 'Sua fadiga está alta' : 'Sua energia está baixa',
      description: 'Um dia livre agora pode melhorar a qualidade dos próximos treinos e reduzir riscos.',
      actionLabel: 'Revisar agenda',
      route: '/game/calendar',
    });
  }

  if (tournamentDays !== null && tournamentDays >= 0 && tournamentDays <= 7) {
    insights.push({
      id: `tournament-${nextTournament.id || nextTournament.start_date}`,
      priority: tournamentDays <= 2 ? 85 : 70,
      tone: 'info',
      title: tournamentDays === 0 ? `${nextTournament.name || 'Torneio'} começa hoje` : `Faltam ${tournamentDays} dia(s) para ${nextTournament.name || 'o torneio'}`,
      description: energy < 65 || fatigue > 45 ? 'Sua condição merece atenção antes da competição.' : 'Sua condição está adequada. Revise tática e inscrição.',
      actionLabel: 'Ver competição',
      route: '/tournaments',
    });
  }

  const unreadCount = Number(context.unreadCount || 0);
  if (unreadCount > 0) {
    insights.push({
      id: 'communications',
      priority: 65,
      tone: 'premium',
      title: `${unreadCount} comunicação${unreadCount === 1 ? '' : 'ões'} aguardando`,
      description: 'Treinador, parceiro ou equipe podem estar esperando uma decisão.',
      actionLabel: 'Abrir comunicações',
      route: '/communications',
    });
  }

  if (!profile.partner_id) {
    insights.push({
      id: 'partner',
      priority: 80,
      tone: 'warning',
      title: 'Você ainda precisa definir sua dupla',
      description: 'Uma parceria estável é essencial para competir, evoluir entrosamento e entrar no ranking de duplas.',
      actionLabel: 'Buscar parceiro',
      route: '/partners',
    });
  }

  if (!profile.coach_id) {
    insights.push({
      id: 'coach',
      priority: 75,
      tone: 'warning',
      title: 'Revise seu treinador principal',
      description: 'Toda dupla precisa de uma liderança técnica para treinos e partidas.',
      actionLabel: 'Abrir treinador',
      route: '/coaches',
    });
  }

  if (!injured && energy >= 55 && fatigue <= 55 && (!nextTournament || tournamentDays > 2)) {
    insights.push({
      id: 'training',
      priority: 45,
      tone: 'success',
      title: 'Boa janela para desenvolvimento',
      description: 'Sua condição permite um treino produtivo sem comprometer a recuperação.',
      actionLabel: 'Abrir treinos',
      route: '/game/training',
    });
  }

  const activeMission = context.activeMission;
  if (activeMission) {
    insights.push({
      id: `mission-${activeMission.id}`,
      priority: 40,
      tone: 'neutral',
      title: activeMission.title || 'Objetivo em andamento',
      description: activeMission.description || activeMission.explanation || 'Continue avançando em seu objetivo atual.',
      actionLabel: 'Ver objetivos',
      route: '/game/missions',
    });
  }

  return insights.sort((a, b) => b.priority - a.priority).slice(0, 6);
}

export function assistantGreeting(profile) {
  const name = profile?.display_name || profile?.name || profile?.player_name || 'atleta';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  return `${greeting}, ${String(name).split(' ')[0]}.`;
}
