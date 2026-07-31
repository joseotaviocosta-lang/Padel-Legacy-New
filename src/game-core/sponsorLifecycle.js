import { base44 } from '@/api/base44Client';

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function monthKey(dateString) {
  return String(dateString || new Date().toISOString()).slice(0, 7);
}

function isWin(match, profile) {
  return Boolean(
    match?.did_win ||
    match?.winner_profile_id === profile?.id ||
    match?.winner_team === profile?.sport_name ||
    match?.winner === profile?.sport_name
  );
}

function isTournament(match) {
  return Boolean(match?.is_tournament || match?.tournament_id || match?.match_type === 'tournament');
}

function getMonthlyStats(matches, profile, month) {
  const monthly = (matches || []).filter((match) => {
    const date = match?.played_date || match?.match_date || match?.date || match?.created_date;
    return !date || String(date).slice(0, 7) === month;
  });

  const wins = monthly.filter((match) => isWin(match, profile)).length;
  const tournaments = monthly.filter(isTournament).length;

  return {
    matches_played: monthly.length,
    win_matches: wins,
    join_tournament: tournaments,
    win_tournament: monthly.filter((match) => isTournament(match) && isWin(match, profile) && (match?.round === 'final' || match?.is_final)).length,
    social_posts: Number(profile?.monthly_social_posts || 0),
  };
}

function evaluateGoal(goal, stats) {
  const current = Number(stats?.[goal?.type] || 0);
  const target = Math.max(1, Number(goal?.target || 1));
  const completed = current >= target;
  return {
    type: goal?.type,
    target,
    current,
    completed,
    reward: completed ? Math.max(0, Number(goal?.reward || 0)) : 0,
    penalty: completed ? 0 : Math.min(0, Number(goal?.penalty || 0)),
  };
}

async function safeCreate(entityName, payload) {
  try {
    const entity = base44.entities?.[entityName];
    if (entity?.create) return await entity.create(payload);
  } catch (error) {
    console.warn(`[Game Core] Não foi possível registrar ${entityName}:`, error);
  }
  return null;
}

export async function evaluateSponsorContracts(profile) {
  if (!profile?.id) throw new Error('Perfil da carreira não encontrado.');

  const month = monthKey(profile.career_date);
  const [contracts, matches] = await Promise.all([
    base44.entities.PlayerContract.filter({ profile_id: profile.id, is_active: true }),
    base44.entities.Match.filter({ profile_id: profile.id }),
  ]);

  const stats = getMonthlyStats(matches, profile, month);
  const reports = [];
  let totalAdjustment = 0;

  for (const contract of contracts || []) {
    if (contract.last_evaluated_month === month) {
      reports.push({
        contract_id: contract.id,
        sponsor_name: contract.sponsor_name,
        skipped: true,
        reason: 'Este contrato já foi avaliado neste mês.',
      });
      continue;
    }

    const goals = (contract.commercial_goals || [])
      .filter((goal) => !goal.period || goal.period === 'monthly')
      .map((goal) => evaluateGoal(goal, stats));

    const completed = goals.filter((goal) => goal.completed).length;
    const failed = goals.length - completed;
    const goalAdjustment = goals.reduce((sum, goal) => sum + goal.reward + goal.penalty, 0);

    const totalMatches = stats.matches_played;
    const winRate = totalMatches > 0 ? (stats.win_matches / totalMatches) * 100 : 0;
    const clauses = contract.performance_clauses || {};
    let satisfactionChange = completed * 8 - failed * 6;

    if (totalMatches > 0 && clauses.min_win_rate) {
      satisfactionChange += winRate >= clauses.min_win_rate ? 8 : -8;
    }
    if (clauses.tournament_participation) {
      satisfactionChange += stats.join_tournament >= clauses.tournament_participation ? 5 : -5;
    }

    const previousSatisfaction = Number(contract.satisfaction_score ?? 50);
    const satisfaction = clamp(previousSatisfaction + satisfactionChange);
    const terminationThreshold = Number(clauses.termination_threshold || 25);
    const terminated = satisfaction < terminationThreshold;

    await base44.entities.PlayerContract.update(contract.id, {
      satisfaction_score: satisfaction,
      goals_progress: stats,
      last_evaluated_month: month,
      last_month_adjustment: goalAdjustment,
      is_active: !terminated,
      termination_reason: terminated ? 'Metas comerciais e desempenho insuficientes' : contract.termination_reason,
    });

    totalAdjustment += goalAdjustment;
    reports.push({
      contract_id: contract.id,
      sponsor_name: contract.sponsor_name,
      satisfaction,
      satisfaction_change: satisfactionChange,
      adjustment: goalAdjustment,
      goals,
      terminated,
      stats,
    });
  }

  let updatedProfile = profile;
  if (totalAdjustment !== 0) {
    updatedProfile = await base44.entities.PlayerProfile.update(profile.id, {
      coins: Number(profile.coins || 0) + totalAdjustment,
    });
  }

  if (reports.some((report) => !report.skipped)) {
    await safeCreate('FinancialTransaction', {
      profile_id: profile.id,
      month,
      income: Math.max(0, totalAdjustment),
      expenses: Math.max(0, -totalAdjustment),
      net: totalAdjustment,
      type: 'sponsor_evaluation',
      description: 'Avaliação mensal dos contratos de patrocínio',
      breakdown: { sponsor_goal_adjustment: totalAdjustment },
    });

    const terminatedNames = reports.filter((report) => report.terminated).map((report) => report.sponsor_name);
    await safeCreate('CareerMessage', {
      profile_id: profile.id,
      sender: 'Departamento Comercial',
      subject: 'Avaliação mensal dos patrocinadores',
      body: terminatedNames.length
        ? `A avaliação foi concluída. Contratos encerrados: ${terminatedNames.join(', ')}.`
        : `A avaliação foi concluída. Ajuste financeiro: ${totalAdjustment >= 0 ? '+' : ''}${totalAdjustment.toLocaleString('pt-BR')} moedas.`,
      message_type: 'sponsor',
      is_read: false,
      sent_date: profile.career_date || new Date().toISOString().slice(0, 10),
    });
  }

  return { month, stats, reports, totalAdjustment, profile: updatedProfile };
}

export function getSponsorEvaluationStatus(contracts, careerDate) {
  const month = monthKey(careerDate);
  const active = (contracts || []).filter((contract) => contract.is_active);
  const pending = active.filter((contract) => contract.last_evaluated_month !== month);
  return {
    month,
    activeCount: active.length,
    pendingCount: pending.length,
    isComplete: active.length > 0 && pending.length === 0,
  };
}
