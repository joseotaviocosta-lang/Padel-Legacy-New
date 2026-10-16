// Fase 5.30 — composição da Home (Centro da carreira).
//
// Funções PURAS: recebem o que CareerHub.jsx já calcula (heroStep,
// prioridades, decisões, revisão semanal, plano da temporada) e devolvem a
// forma de exibição da nova hierarquia. Nenhuma regra de jogo nova, nenhuma
// leitura de storage: a autoridade de cada dado continua onde estava.

const PRIORITY_RANK = { danger: 0, critical: 0, warning: 1, high: 1, premium: 2, info: 3, neutral: 4, success: 5 };
const basePath = (route) => String(route || '').split('?')[0];

function shortDate(iso) {
  if (!iso) return null;
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

export function daysBetweenIso(from, to) {
  if (!from || !to) return null;
  const a = new Date(`${String(from).slice(0, 10)}T00:00:00`);
  const b = new Date(`${String(to).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

function whenLabel(careerDate, iso) {
  const days = daysBetweenIso(careerDate, iso);
  const date = shortDate(iso);
  if (days == null) return date;
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days > 1) return `em ${days} dias · ${date}`;
  return date;
}

/**
 * "O que vem agora?" — o compromisso que a Home destaca.
 *
 * Prioridade: (1) compromisso de torneio já assumido (inscrição/campanha,
 * `weeklyCommitment` = isPlayerParticipating); (2) sem compromisso, o
 * próximo torneio onde a inscrição É possível (`suggestableTournament`,
 * a mesma checagem de evaluateTournamentRegistration da Home); (3) nada —
 * agenda livre, com o próximo evento do calendário se existir.
 *
 * A AÇÃO primária é sempre o `heroStep` (tutorial ou getCareerNextAction):
 * a Home não inventa um segundo "o que fazer". O link do torneio vira ação
 * secundária quando o herói aponta para outro lugar.
 */
export function buildHomeCommitment({ weeklyCommitment = null, suggestableTournament = null, nextTournament = null, careerDate = null, heroStep = null } = {}) {
  if (weeklyCommitment) {
    const statusParts = [];
    if (weeklyCommitment.drawn) statusParts.push('Chave sorteada');
    else if (weeklyCommitment.drawDate) statusParts.push(`Sorteio ${whenLabel(careerDate, weeklyCommitment.drawDate)}`);
    else statusParts.push('Inscrição confirmada');
    return {
      kind: 'tournament',
      eyebrow: 'Seu próximo torneio',
      title: weeklyCommitment.name,
      meta: [weeklyCommitment.tier, weeklyCommitment.startDate ? `estreia ${whenLabel(careerDate, weeklyCommitment.startDate)}` : null].filter(Boolean).join(' · '),
      status: statusParts.join(' · '),
      statusTone: 'success',
      tournamentId: weeklyCommitment.id,
      secondaryRoute: `/tournaments?tournament=${encodeURIComponent(weeklyCommitment.id)}&mode=details`,
      secondaryLabel: 'Ver torneio',
      heroPointsToTournament: basePath(heroStep?.to) === '/tournaments',
    };
  }
  if (suggestableTournament) {
    return {
      kind: 'opportunity',
      eyebrow: 'Próxima oportunidade',
      title: suggestableTournament.name,
      meta: [suggestableTournament.tier, suggestableTournament.start_date ? whenLabel(careerDate, suggestableTournament.start_date) : null].filter(Boolean).join(' · '),
      status: 'Inscrições abertas',
      statusTone: 'info',
      tournamentId: suggestableTournament.id,
      secondaryRoute: `/tournaments?tournament=${encodeURIComponent(suggestableTournament.id)}&mode=details`,
      secondaryLabel: 'Ver torneio',
      heroPointsToTournament: basePath(heroStep?.to) === '/tournaments',
    };
  }
  return {
    kind: 'free',
    eyebrow: 'Agenda livre',
    title: 'Nenhum torneio imediato',
    meta: nextTournament?.start_date ? `Próximo no calendário: ${nextTournament.name} · ${whenLabel(careerDate, nextTournament.start_date)}` : 'Nenhum evento no horizonte do calendário.',
    status: null,
    statusTone: 'neutral',
    tournamentId: null,
    secondaryRoute: '/tournaments',
    secondaryLabel: 'Ver calendário',
    heroPointsToTournament: basePath(heroStep?.to) === '/tournaments',
  };
}

/**
 * Prioridades curtas: junta as listas que a Home antiga espalhava em dois
 * painéis ("O que fazer agora" + "Atenção e oportunidades") numa só,
 * ordenada por impacto (bloqueio/crítico → prazo/alto → resto), sem
 * repetir destino (mesma rota) e sem repetir a ação do herói.
 * `visibleLimit` itens visíveis; o resto fica atrás de "ver mais".
 */
export function buildHomePriorities({ priorityActions = [], attentionItems = [], pendingOffersCount = 0, hasPartner = true, heroRoute = null, visibleLimit = 3 } = {}) {
  const items = [];
  const seen = new Set(heroRoute ? [basePath(heroRoute)] : []);
  const push = (item) => {
    const key = item.route ? basePath(item.route) : item.id;
    if (item.route && seen.has(key)) return;
    if (item.route) seen.add(key);
    items.push(item);
  };
  if (pendingOffersCount > 0) {
    push({ id: 'partner-offers', tone: hasPartner ? 'info' : 'danger', label: 'Dupla', title: `${pendingOffersCount} proposta${pendingOffersCount === 1 ? '' : 's'} de parceria`, description: hasPartner ? 'Avalie antes que expirem.' : 'Você ainda joga sem parceiro.', route: null, partnerAction: true });
  }
  for (const action of priorityActions) push({ id: action.id, tone: action.tone || 'info', label: action.title, title: action.title, description: action.description, route: action.route, icon: action.icon || null });
  for (const decision of attentionItems) push({ id: `decision-${decision.id}`, tone: decision.priority === 'critical' ? 'danger' : decision.priority === 'high' ? 'warning' : 'neutral', label: decision.category || 'Decisão', title: decision.title, description: decision.description, route: decision.route });
  items.sort((a, b) => (PRIORITY_RANK[a.tone] ?? 9) - (PRIORITY_RANK[b.tone] ?? 9));
  return { items, visible: items.slice(0, visibleLimit), hiddenCount: Math.max(0, items.length - visibleLimit) };
}

/**
 * Agenda imediata: só os torneios que a revisão semanal JÁ lista (fonte
 * real: buildUpcomingTournamentPlanning), no máximo `limit`, sem o torneio
 * que já está em destaque no bloco de compromisso. Nada inventado.
 */
export function buildHomeAgenda({ weeklyReview = null, careerDate = null, excludeId = null, limit = 4 } = {}) {
  const source = (weeklyReview?.upcomingTournaments || []).filter((item) => item.id !== excludeId);
  return source.slice(0, limit).map((item) => ({
    id: item.id,
    name: item.name,
    tier: item.tier,
    when: item.startDate ? whenLabel(careerDate, item.startDate) : null,
    status: item.conflictWith ? 'Conflito de agenda' : (item.deadlineInfo?.label || null),
    statusTone: item.conflictWith ? 'danger' : item.deadlineInfo?.tone === 'urgent' ? 'danger' : item.deadlineInfo?.tone === 'attention' ? 'warning' : item.deadlineInfo?.tone === 'resolved' ? 'success' : 'neutral',
    recommended: Boolean(item.isRecommended),
    action: item.action || null,
  }));
}

/**
 * Manchete do mundo para a Home (5.30): a MESMA prioridade do antigo
 * WorldHighlights — boletim/urgente do Universo Vivo, depois eventos com
 * atleta real (`categories.reais`), depois posts — mas só 1 linha.
 */
export function selectWorldHeadline(snapshot = null, posts = []) {
  const featured = snapshot?.bulletin || snapshot?.breaking || null;
  const real = (snapshot?.categories?.reais || []).find((event) => event.id !== featured?.id) || null;
  const item = featured || real || (posts || [])[0] || null;
  return item ? { id: item.id, title: item.title || 'Notícia do circuito' } : null;
}

/**
 * Progresso: métricas da semana (as mesmas 4 da revisão semanal) + metas
 * da temporada (buildSeasonCareerPlan). O objetivo de ranking vira uma
 * barra "atual → alvo" — a única tendência que já existe sem cálculo novo.
 */
export function buildHomeProgress({ weeklyReview = null, seasonPlan = null, worldRank = null } = {}) {
  const rankingGoal = seasonPlan?.goals?.[0] || null;
  const currentRank = worldRank?.rank ? `#${worldRank.displayRank || worldRank.rank}` : '#1000+';
  return {
    periodLabel: weeklyReview?.periodLabel || null,
    metrics: (weeklyReview?.metrics || []).filter((metric) => metric.id !== 'communications').slice(0, 3),
    rankingGoal: rankingGoal ? { title: rankingGoal.title, from: currentRank, to: `#${rankingGoal.target}`, progress: Math.round(Number(rankingGoal.progress) || 0), route: rankingGoal.route } : null,
    seasonProgress: seasonPlan?.overallProgress ?? null,
    seasonGoals: (seasonPlan?.goals || []).slice(1, 4).map((goal) => ({ id: goal.category, title: goal.title, progress: Math.round(Number(goal.progress) || 0), route: goal.route })),
  };
}
