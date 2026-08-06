const DAY_MS = 86400000;

function daysBetween(from, to) {
  if (!from || !to) return null;
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.ceil((end - start) / DAY_MS);
}

function isCompletedMatch(match) {
  const status = String(match?.status || '').toLowerCase();
  return ['completed', 'finished', 'concluida', 'concluido'].includes(status)
    || Boolean(match?.winner_id || match?.winner_player_id || match?.winner_team_id);
}

function playerWon(match, profileId) {
  return match?.winner_id === profileId
    || match?.winner_player_id === profileId
    || match?.player_won === true
    || match?.is_winner === true;
}

function matchDate(match) {
  return match?.match_date || match?.date || match?.played_at || match?.created_date || '';
}

function tournamentName(match) {
  return match?.tournament_name || match?.competition_name || match?.event_name || 'um torneio';
}

export function deriveCareerMoment(profile, context = {}) {
  if (!profile) return null;
  const matches = (context.matches || []).filter(isCompletedMatch).sort((a, b) => String(matchDate(b)).localeCompare(String(matchDate(a))));
  const latestMatch = matches[0];
  const careerDate = profile.career_date || '2026-01-01';
  const nextTournament = context.nextTournament || null;
  const worldRank = context.worldRank || { rank: 0 };

  if (profile.injury_status === 'injured' || profile.is_injured || Number(profile.injury_days_remaining) > 0) {
    const days = Math.max(1, Number(profile.injury_days_remaining) || daysBetween(careerDate, profile.injured_until) || 1);
    return {
      id: `injury-${profile.injured_until || days}`,
      type: 'injury',
      tone: 'danger',
      eyebrow: 'Momento da carreira',
      title: 'Recuperação em primeiro lugar',
      description: `Faltam cerca de ${days} dia${days === 1 ? '' : 's'} para voltar à quadra. O foco agora é preservar sua evolução e retornar em boas condições.`,
      primaryAction: { label: 'Ver recuperação', route: '/game/calendar' },
      secondaryAction: { label: 'Equipe médica', route: '/staff' },
    };
  }

  if (latestMatch && playerWon(latestMatch, profile.id) && (latestMatch.is_final || latestMatch.round === 'final' || latestMatch.title_won || latestMatch.tournament_won)) {
    return {
      id: `title-${latestMatch.id || matchDate(latestMatch)}`,
      type: 'title',
      tone: 'premium',
      eyebrow: 'Conquista em destaque',
      title: `Campeões de ${tournamentName(latestMatch)}`,
      description: 'Uma vitória importante entrou para a história da sua carreira. Aproveite o momento antes de definir o próximo objetivo.',
      primaryAction: { label: 'Ver legado', route: '/legacy' },
      secondaryAction: { label: 'Ver estatísticas', route: '/stats' },
    };
  }

  const rank = Number(worldRank.displayRank || worldRank.rank || 0);
  if (rank > 0 && rank <= 10) {
    return {
      id: `rank-top10-${rank}`,
      type: 'ranking',
      tone: 'premium',
      eyebrow: 'Marco no ranking',
      title: `Você está no Top ${rank <= 3 ? 3 : 10} mundial`,
      description: `A posição #${rank} coloca sua dupla entre as principais forças do circuito. Cada resultado agora tem peso ainda maior.`,
      primaryAction: { label: 'Abrir ranking', route: '/ranking' },
      secondaryAction: { label: 'Planejar temporada', route: '/game/calendar' },
    };
  }

  if (rank > 10 && rank <= 100) {
    return {
      id: `rank-top100-${Math.ceil(rank / 10) * 10}`,
      type: 'ranking',
      tone: 'success',
      eyebrow: 'Evolução competitiva',
      title: `Você chegou ao Top 100`,
      description: `A posição #${rank} confirma sua entrada no circuito profissional. O próximo passo é transformar regularidade em campanhas maiores.`,
      primaryAction: { label: 'Abrir ranking', route: '/ranking' },
      secondaryAction: { label: 'Ver torneios', route: '/tournaments' },
    };
  }

  const daysToTournament = nextTournament ? daysBetween(careerDate, nextTournament.start_date) : null;
  if (nextTournament && daysToTournament != null && daysToTournament >= 0 && daysToTournament <= 3) {
    return {
      id: `tournament-${nextTournament.id}-${nextTournament.start_date}`,
      type: 'tournament',
      tone: 'info',
      eyebrow: daysToTournament === 0 ? 'Dia de competição' : 'Semana de competição',
      title: daysToTournament === 0 ? `${nextTournament.name} começa hoje` : `${nextTournament.name} está chegando`,
      description: daysToTournament === 0
        ? 'Revise sua condição, tática e dupla antes de entrar em quadra.'
        : `Faltam ${daysToTournament} dia${daysToTournament === 1 ? '' : 's'}. Priorize recuperação, confiança e um plano claro de jogo.`,
      primaryAction: { label: 'Ver torneio', route: '/tournaments' },
      secondaryAction: { label: 'Revisar tática', route: '/game/training' },
    };
  }

  const recent = matches.slice(0, 6);
  const recentWins = recent.filter((match) => playerWon(match, profile.id)).length;
  if (recent.length >= 4 && recentWins >= 4) {
    return {
      id: `streak-${recentWins}-${matchDate(recent[0])}`,
      type: 'form',
      tone: 'success',
      eyebrow: 'Grande fase',
      title: `${recentWins} vitórias nas últimas ${recent.length} partidas`,
      description: 'A dupla vive um momento de confiança. Mantenha o equilíbrio entre competição, treino e recuperação para prolongar a sequência.',
      primaryAction: { label: 'Ver estatísticas', route: '/stats' },
      secondaryAction: { label: 'Conversar com a dupla', route: '/partnership' },
    };
  }

  const partnerMatches = Number(profile.partner_matches || profile.partnership_matches || profile.matches_with_partner || 0);
  const partnershipTrust = Number(profile.partner_trust || profile.partnership_trust || 0);
  if (profile.partner_id && partnerMatches >= 25 && partnershipTrust >= 70) {
    return {
      id: `partnership-${Math.floor(partnerMatches / 25) * 25}`,
      type: 'partnership',
      tone: 'info',
      eyebrow: 'Dupla consolidada',
      title: `${partnerMatches} partidas construindo uma identidade`,
      description: 'A continuidade está transformando química em entendimento real de quadra. Esse vínculo pode se tornar um diferencial difícil de substituir.',
      primaryAction: { label: 'Ver dupla', route: '/partnership' },
      secondaryAction: { label: 'Ver treinador', route: '/coaches' },
    };
  }

  return null;
}

export function careerMomentTheme(moment) {
  if (!moment) return 'neutral';
  return moment.tone || 'neutral';
}
