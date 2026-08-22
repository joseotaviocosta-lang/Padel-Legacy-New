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

export function buildDailyCareerBriefing(profile, context = {}) {
  if (!profile) return null;

  const energy = clamp(profile.energy ?? 100);
  const fatigue = clamp(profile.fatigue ?? 0);
  const unread = Number(context.unreadCount) || 0;
  const nextTournament = context.nextTournament || null;
  const daysToTournament = nextTournament?.start_date
    ? daysBetween(profile.career_date || '2026-01-01', nextTournament.start_date)
    : null;
  const recentMatches = Array.isArray(context.recentMatches) ? context.recentMatches : [];
  const recentWins = recentMatches.slice(0, 5).filter((match) => (
    match?.player_won === true
    || match?.is_winner === true
    || match?.winner_id === profile.id
    || match?.winner_profile_id === profile.id
  )).length;

  const priorities = [];

  if (profile.is_injured || profile.injury_days_remaining > 0) {
    priorities.push({
      id: 'injury',
      tone: 'danger',
      label: 'Recuperação',
      title: 'Proteja sua recuperação',
      description: `Faltam ${Math.max(1, Number(profile.injury_days_remaining) || 1)} dia(s) para o retorno previsto.`,
      route: '/game/calendar',
    });
  } else if (fatigue >= 65) {
    priorities.push({
      id: 'fatigue',
      tone: 'warning',
      label: 'Condição física',
      title: 'Reduza a carga hoje',
      description: `Sua fadiga está em ${Math.round(fatigue)}. Um dia leve preserva a evolução da semana.`,
      route: APP_ROUTES.TRAINING,
    });
  } else if (energy <= 35) {
    priorities.push({
      id: 'energy',
      tone: 'warning',
      label: 'Energia',
      title: 'Recupere antes de forçar',
      description: `Sua energia está em ${Math.round(energy)}. Priorize descanso ou treino leve.`,
      route: APP_ROUTES.TRAINING,
    });
  } else {
    priorities.push({
      id: 'development',
      tone: 'success',
      label: 'Desenvolvimento',
      title: 'Boa janela para evoluir',
      description: 'Sua condição permite cumprir o plano semanal sem comprometer a recuperação.',
      route: APP_ROUTES.TRAINING,
    });
  }

  if (daysToTournament != null && daysToTournament >= 0 && daysToTournament <= 7) {
    priorities.push({
      id: 'tournament',
      tone: daysToTournament <= 2 ? 'premium' : 'info',
      label: 'Competição',
      title: daysToTournament === 0 ? `${nextTournament.name || 'Torneio'} começa hoje` : `${nextTournament.name || 'Torneio'} em ${daysToTournament} dia(s)`,
      description: 'Confira inscrição, condição da dupla e orientação do treinador.',
      route: '/tournaments',
    });
  }

  if (unread > 0) {
    priorities.push({
      id: 'communications',
      tone: 'info',
      label: 'Comunicações',
      title: `${unread} mensagem${unread === 1 ? '' : 's'} aguardando`,
      description: 'Treinador, parceiro ou equipe podem precisar de uma resposta.',
      route: '/communications',
    });
  }

  if (!profile.partner_id) {
    priorities.push({
      id: 'partner',
      tone: 'warning',
      label: 'Dupla',
      title: 'Defina sua parceria',
      description: 'Sem parceiro ativo, sua evolução competitiva e inscrições ficam limitadas.',
      route: '/partners',
    });
  } else if (recentMatches.length >= 3 && recentWins >= 3) {
    priorities.push({
      id: 'form',
      tone: 'success',
      label: 'Momento',
      title: 'A dupla vive boa fase',
      description: `${recentWins} vitórias nas últimas ${Math.min(5, recentMatches.length)} partidas analisadas.`,
      route: '/stats',
    });
  }

  const date = profile.career_date || '2026-01-01';
  const primary = priorities[0];
  return {
    date,
    title: primary?.title || 'Dia de carreira',
    summary: primary?.description || 'Revise sua agenda e defina a prioridade do dia.',
    priorities: priorities.slice(0, 4),
    energy,
    fatigue,
  };
}
