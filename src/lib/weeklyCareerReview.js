import { APP_ROUTES } from '@/navigation/routes.js';
import { formatAttributeGain } from '@/lib/numberFormat.js';

function parseDate(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inWindow(value, start, end) {
  const date = parseDate(value);
  return Boolean(date && date >= start && date <= end);
}

function matchWon(match, profileId) {
  return match?.player_won === true
    || match?.is_winner === true
    || match?.winner_id === profileId
    || match?.winner_profile_id === profileId
    || match?.winner_player_id === profileId;
}

function completedMatch(match) {
  const status = String(match?.status || '').toLowerCase();
  return ['completed', 'finished', 'concluida', 'concluido'].includes(status)
    || Boolean(match?.winner_id || match?.winner_profile_id || match?.winner_player_id || match?.winner_team_id)
    || typeof match?.player_won === 'boolean'
    || typeof match?.is_winner === 'boolean';
}

function trainingGain(session) {
  if (Number.isFinite(Number(session?.attribute_gain))) return Number(session.attribute_gain);
  const gains = session?.attribute_gains || session?.gains;
  if (!gains || typeof gains !== 'object') return 0;
  return Object.values(gains).reduce((total, value) => {
    if (Number.isFinite(Number(value))) return total + Number(value);
    if (value && Number.isFinite(Number(value.progress))) return total + Number(value.progress);
    if (value && Number.isFinite(Number(value.levels))) return total + Number(value.levels);
    return total;
  }, 0);
}

function pickHeadline({ matches, wins, trainings, unread, profile }) {
  if (profile?.is_injured || Number(profile?.injury_days_remaining) > 0) {
    return {
      tone: 'danger',
      label: 'Recuperação',
      title: 'Semana de recuperação',
      description: 'O principal objetivo é voltar à quadra sem comprometer a sequência da carreira.',
      route: '/game/calendar',
    };
  }
  if (matches >= 3 && wins === matches) {
    return {
      tone: 'success',
      label: 'Momento',
      title: 'Semana perfeita em quadra',
      description: `${wins} vitória${wins === 1 ? '' : 's'} em ${matches} partida${matches === 1 ? '' : 's'} disputada${matches === 1 ? '' : 's'}.`,
      route: '/stats',
    };
  }
  if (matches > 0 && wins === 0) {
    return {
      tone: 'warning',
      label: 'Ajuste',
      title: 'Hora de revisar o plano',
      description: 'Os resultados da semana indicam uma boa oportunidade para ajustar treino, tática e recuperação.',
      route: APP_ROUTES.TRAINING,
    };
  }
  if (trainings >= 4) {
    return {
      tone: 'info',
      label: 'Desenvolvimento',
      title: 'Semana consistente de evolução',
      description: `${trainings} sessões concluídas mantiveram o desenvolvimento da carreira em movimento.`,
      route: APP_ROUTES.TRAINING,
    };
  }
  if (unread > 0) {
    return {
      tone: 'premium',
      label: 'Comunicações',
      title: 'A equipe espera sua atenção',
      description: `${unread} comunicação${unread === 1 ? '' : 'ões'} ainda não lida${unread === 1 ? '' : 's'}.`,
      route: '/communications',
    };
  }
  return {
    tone: 'neutral',
    label: 'Planejamento',
    title: 'Semana sob controle',
    description: 'Use a próxima semana para equilibrar treino, recuperação e objetivos competitivos.',
    route: '/game/calendar',
  };
}

export function buildWeeklyCareerReview(profile, context = {}) {
  if (!profile) return null;
  const end = parseDate(profile.career_date || '2026-01-01');
  if (!end) return null;
  const start = new Date(end);
  start.setDate(start.getDate() - 6);

  const allMatches = Array.isArray(context.matches) ? context.matches : [];
  const allTrainings = Array.isArray(context.trainings) ? context.trainings : [];
  const messages = Array.isArray(context.messages) ? context.messages : [];

  const weeklyMatches = allMatches.filter((match) => completedMatch(match) && inWindow(
    match?.match_date || match?.date || match?.played_at || match?.created_date,
    start,
    end,
  ));
  const weeklyTrainings = allTrainings.filter((session) => inWindow(
    session?.training_date || session?.date || session?.created_date,
    start,
    end,
  ));
  const wins = weeklyMatches.filter((match) => matchWon(match, profile.id)).length;
  const losses = Math.max(0, weeklyMatches.length - wins);
  const gain = weeklyTrainings.reduce((total, session) => total + trainingGain(session), 0);
  const unread = messages.filter((message) => ['nao_lida', 'decisao_pendente', 'unread', 'pending'].includes(String(message?.status || '').toLowerCase())).length;
  const winRate = weeklyMatches.length ? Math.round((wins / weeklyMatches.length) * 100) : 0;
  const headline = pickHeadline({ matches: weeklyMatches.length, wins, trainings: weeklyTrainings.length, unread, profile });

  return {
    periodLabel: `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`,
    headline,
    metrics: [
      { id: 'matches', label: 'Partidas', value: weeklyMatches.length, detail: weeklyMatches.length ? `${wins}V · ${losses}D` : 'Nenhuma disputa' },
      { id: 'performance', label: 'Aproveitamento', value: `${winRate}%`, detail: weeklyMatches.length ? 'Na semana' : 'Sem partidas' },
      { id: 'trainings', label: 'Treinos', value: weeklyTrainings.length, detail: gain > 0 ? `+${formatAttributeGain(gain)} de progresso` : 'Sessões concluídas' },
      { id: 'communications', label: 'Pendências', value: unread, detail: unread ? 'Aguardando leitura' : 'Tudo em dia' },
    ],
    hasActivity: weeklyMatches.length > 0 || weeklyTrainings.length > 0 || unread > 0,
  };
}
