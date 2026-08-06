const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

function rankingGoal(rank) {
  const current = Number(rank) || 1001;
  if (current > 500) return { title: 'Entrar no Top 500', target: 500, progress: clamp(((1001 - current) / 501) * 100), route: '/ranking', category: 'competicao' };
  if (current > 100) return { title: 'Entrar no Top 100', target: 100, progress: clamp(((500 - current) / 400) * 100), route: '/ranking', category: 'competicao' };
  if (current > 20) return { title: 'Entrar no Top 20', target: 20, progress: clamp(((100 - current) / 80) * 100), route: '/ranking', category: 'competicao' };
  if (current > 10) return { title: 'Entrar no Top 10', target: 10, progress: clamp(((20 - current) / 10) * 100), route: '/ranking', category: 'competicao' };
  if (current > 1) return { title: 'Chegar ao nº 1', target: 1, progress: clamp(((10 - current) / 9) * 100), route: '/ranking', category: 'competicao' };
  return { title: 'Defender a liderança mundial', target: 1, progress: 100, route: '/ranking', category: 'competicao' };
}

function developmentGoal(profile, trainings = []) {
  const season = String(profile?.career_date || '').slice(0, 4);
  const completed = trainings.filter((row) => String(row?.date || row?.training_date || row?.created_date || '').startsWith(season)).length;
  const target = 48;
  return {
    title: 'Construir uma temporada de evolução',
    description: `${completed}/${target} sessões realizadas na temporada`,
    progress: clamp((completed / target) * 100),
    route: '/game/training',
    category: 'desenvolvimento',
  };
}

function partnershipGoal(profile, matches = []) {
  if (!profile?.partner_id) {
    return { title: 'Formar uma dupla estável', description: 'Escolha um parceiro compatível para competir.', progress: 0, route: '/partners', category: 'relacao' };
  }
  const chemistry = Number(profile?.partnership_chemistry ?? profile?.chemistry ?? 50);
  const trust = Number(profile?.partnership_trust ?? profile?.partner_trust ?? 50);
  const together = matches.filter((row) => row?.partner_id === profile.partner_id || row?.team_partner_id === profile.partner_id).length;
  return {
    title: 'Fortalecer a identidade da dupla',
    description: `${together} partidas juntos • confiança ${Math.round(trust)}`,
    progress: clamp((chemistry * 0.45) + (trust * 0.45) + Math.min(10, together / 2)),
    route: '/partners',
    category: 'relacao',
  };
}

function structureGoal(profile) {
  const hasCoach = Boolean(profile?.head_coach_id || profile?.coach_id || profile?.coach?.id);
  const staffCount = Array.isArray(profile?.staff) ? profile.staff.filter((member) => member?.active !== false).length : Number(profile?.staff_count || 0);
  const progress = clamp((hasCoach ? 45 : 0) + Math.min(55, staffCount * 18));
  return {
    title: 'Montar uma equipe de alto desempenho',
    description: hasCoach ? `${staffCount} profissional${staffCount === 1 ? '' : 'is'} de apoio ativo${staffCount === 1 ? '' : 's'}` : 'Defina seu treinador principal.',
    progress,
    route: hasCoach ? '/staff' : '/coaches',
    category: 'estrutura',
  };
}

export function buildSeasonCareerPlan(profile, context = {}) {
  const rank = context?.worldRank?.rank || profile?.world_rank || profile?.ranking || 1001;
  const ranking = rankingGoal(rank);
  ranking.description = rank > 1000 ? 'Comece a somar pontos no circuito.' : `Posição atual: #${rank}`;

  const goals = [
    ranking,
    developmentGoal(profile, context.trainings || []),
    partnershipGoal(profile, context.matches || []),
    structureGoal(profile),
  ];

  const overallProgress = Math.round(goals.reduce((sum, goal) => sum + goal.progress, 0) / goals.length);
  return {
    season: String(profile?.career_date || '2026-01-01').slice(0, 4),
    overallProgress,
    completed: goals.filter((goal) => goal.progress >= 100).length,
    goals,
  };
}
