import { APP_ROUTES } from '@/navigation/routes.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

function daysBetween(from, to) {
  if (!from || !to) return null;
  return Math.ceil((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000);
}

function recentForm(matches = [], profile = {}) {
  const rows = matches.slice(0, 8);
  if (!rows.length) return { wins: 0, losses: 0, rate: 0, label: 'Sem amostra' };
  const wins = rows.filter((match) => match.player_won === true || match.is_winner === true || match.winner_id === profile.id || match.winner_player_id === profile.id || match.winner === 'A').length;
  const rate = Math.round((wins / rows.length) * 100);
  return { wins, losses: rows.length - wins, rate, label: rate >= 75 ? 'Excelente' : rate >= 55 ? 'Crescendo' : rate >= 40 ? 'Instável' : 'Em revisão' };
}

export function buildStrategicWeeklyPlan(profile, context = {}) {
  const energy = clamp(profile?.energy);
  const fatigue = clamp(profile?.fatigue);
  const tournamentDays = daysBetween(profile?.career_date, context.nextTournament?.start_date);
  const recoveryMode = profile?.is_injured || profile?.injury_status === 'injured' || fatigue >= 72 || energy <= 28;
  const preTournament = tournamentDays != null && tournamentDays >= 0 && tournamentDays <= 5;
  const style = String(profile?.play_style || profile?.style || '').toLowerCase();
  const offensive = /ofens|ataque|pot[eê]ncia|finalizador/.test(style);
  const defensive = /defens|controle|consist/.test(style);

  if (recoveryMode) {
    return {
      id: 'recovery', label: 'Recuperação inteligente', reason: `Energia ${Math.round(energy)}% e fadiga ${Math.round(fatigue)}%.`,
      plan: { ter: { activity_id: 'mental-concentration', intensity: 'leve' }, qui: { activity_id: 'tactical-strategy', intensity: 'leve' }, sab: { activity_id: 'court-groundstrokes', intensity: 'leve' } },
    };
  }
  if (preTournament) {
    return {
      id: 'pre-tournament', label: 'Preparação para competição', reason: `Torneio em ${tournamentDays} dia${tournamentDays === 1 ? '' : 's'}; prioridade para qualidade e frescor.`,
      plan: { seg: { activity_id: 'court-groundstrokes', intensity: 'moderado' }, ter: { activity_id: 'tactical-strategy', intensity: 'moderado' }, qua: { activity_id: 'court-net-control', intensity: 'leve' }, sex: { activity_id: 'mental-pressure', intensity: 'leve' } },
    };
  }
  return {
    id: offensive ? 'offensive' : defensive ? 'control' : 'balanced',
    label: offensive ? 'Evolução ofensiva' : defensive ? 'Controle e consistência' : 'Desenvolvimento equilibrado',
    reason: `Plano alinhado ao estilo ${profile?.play_style || profile?.style || 'equilibrado'} e à condição atual.`,
    plan: offensive
      ? { seg: { activity_id: 'court-aerials', intensity: 'moderado' }, ter: { activity_id: 'physical-agility', intensity: 'moderado' }, qui: { activity_id: 'court-net-control', intensity: 'moderado' }, sab: { activity_id: 'mental-pressure', intensity: 'leve' } }
      : defensive
        ? { seg: { activity_id: 'court-groundstrokes', intensity: 'moderado' }, ter: { activity_id: 'physical-conditioning', intensity: 'moderado' }, qui: { activity_id: 'court-defense-transition', intensity: 'moderado' }, sab: { activity_id: 'tactical-strategy', intensity: 'leve' } }
        : { seg: { activity_id: 'court-groundstrokes', intensity: 'moderado' }, ter: { activity_id: 'physical-conditioning', intensity: 'moderado' }, qui: { activity_id: 'court-net-control', intensity: 'moderado' }, sex: { activity_id: 'tactical-strategy', intensity: 'leve' } },
  };
}

export function buildStrategicCareerState(profile, context = {}) {
  const form = recentForm(context.matches, profile);
  const energy = clamp(profile?.energy);
  const fatigue = clamp(profile?.fatigue);
  const partnerTrust = clamp(profile?.partner_trust ?? profile?.partnership_trust ?? 50);
  const coachTrust = clamp(profile?.coach_trust ?? 55);
  const staffSynergy = clamp(profile?.staff_synergy ?? profile?.team_synergy ?? 0);
  const fanMood = clamp(profile?.fan_morale ?? profile?.fan_engagement ?? profile?.popularity ?? 40);
  const press = form.rate >= 70 ? 'Favorável' : form.rate >= 45 ? 'Neutra' : 'Cautelosa';
  const momentScore = clamp(form.rate * 0.35 + energy * 0.2 + (100 - fatigue) * 0.2 + partnerTrust * 0.15 + coachTrust * 0.1);
  const nextDays = daysBetween(profile?.career_date, context.nextTournament?.start_date);
  const weeklyPlan = buildStrategicWeeklyPlan(profile, context);

  const recommendations = /** @type {any[]} */ ([
    {
      id: 'coach-plan', source: 'Treinador', title: weeklyPlan.label, body: weeklyPlan.reason,
      route: APP_ROUTES.TRAINING, priority: fatigue >= 70 || energy <= 30 ? 'high' : 'normal', explain: [`Energia: ${Math.round(energy)}%`, `Fadiga: ${Math.round(fatigue)}%`, nextDays != null ? `Próximo torneio: ${nextDays} dias` : 'Sem torneio iminente'],
    },
  ]);
  if (profile?.partner_id) recommendations.push({ id: 'partner', source: 'Parceiro', title: partnerTrust >= 70 ? 'Manter a estabilidade da dupla' : 'Trabalhar comunicação e confiança', body: partnerTrust >= 70 ? 'A parceria está sólida; preserve a rotina conjunta.' : 'Uma conversa ou treino em dupla pode fortalecer a relação.', route: '/partners', priority: partnerTrust < 45 ? 'high' : 'normal', explain: [`Confiança da dupla: ${Math.round(partnerTrust)}%`, `Forma recente: ${form.label}`] });
  else recommendations.push({ id: 'partner-missing', source: 'Parceiro', title: 'Defina sua dupla', body: 'Sem parceiro ativo, sua evolução competitiva e ranking de duplas ficam limitados.', route: '/partners', priority: 'high', explain: ['Nenhuma parceria ativa'] });
  recommendations.push({ id: 'agent', source: 'Empresário', title: Number(profile?.active_sponsors || 0) > 0 ? 'Preservar valor comercial' : 'Buscar primeiro contrato comercial', body: Number(profile?.active_sponsors || 0) > 0 ? 'Resultados e exposição sustentam melhores renovações.' : 'Resultados iniciais e presença no circuito aumentam o interesse de marcas.', route: APP_ROUTES.ECONOMY, priority: 'normal', explain: [`Popularidade: ${Math.round(clamp(profile?.popularity))}%`, `Ranking: ${context.worldRank?.rank ? `#${context.worldRank.rank}` : 'sem ranking'}`] });

  return {
    score: Math.round(momentScore),
    moment: momentScore >= 78 ? 'Excelente' : momentScore >= 62 ? 'Positivo' : momentScore >= 45 ? 'Em construção' : 'Atenção necessária',
    form, energy, fatigue, partnerTrust, coachTrust, staffSynergy, fanMood, press, weeklyPlan, recommendations,
    teamStatus: staffSynergy >= 75 ? 'Excelente' : staffSynergy >= 50 ? 'Boa' : 'Em formação',
    partnerStatus: profile?.partner_id ? (partnerTrust >= 75 ? 'Entrosada' : partnerTrust >= 50 ? 'Estável' : 'Precisa conversar') : 'Sem dupla',
    coachStatus: coachTrust >= 75 ? 'Muito satisfeito' : coachTrust >= 50 ? 'Confiante' : 'Preocupado',
    agentStatus: Number(profile?.active_sponsors || 0) > 0 ? 'Contratos ativos' : 'Buscando oportunidades',
    fanStatus: fanMood >= 70 ? 'Empolgada' : fanMood >= 45 ? 'Apoiando' : 'Desconfiada',
  };
}
