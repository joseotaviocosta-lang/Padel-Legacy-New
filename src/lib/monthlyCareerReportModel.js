export const MONTHLY_REPORT_SCHEMA_VERSION = 1;

export const MONTHLY_REPORT_ATTRIBUTES = Object.freeze([
  'serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control',
]);

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const cleanDate = (value) => String(value || '').slice(0, 10);
const normalize = (value) => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export function monthlyReportMonthKey(value) {
  return cleanDate(value).slice(0, 7);
}

export function monthlyReportId(profileId, periodKey) {
  return `monthly-career-report:${profileId}:${periodKey}`;
}

export function monthlyReportPeriod(periodKey) {
  const [year, month] = String(periodKey || '').split('-').map(Number);
  if (!year || !month) return { startDate: null, endDate: null };
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { startDate: `${year}-${String(month).padStart(2, '0')}-01`, endDate };
}

export function didCareerMonthChange(previousDate, currentDate) {
  return Boolean(previousDate && currentDate && monthlyReportMonthKey(previousDate) !== monthlyReportMonthKey(currentDate));
}

export function closedMonthKeys(previousDate, currentDate) {
  if (!didCareerMonthChange(previousDate, currentDate)) return [];
  const start = new Date(`${monthlyReportMonthKey(previousDate)}-01T00:00:00Z`);
  const end = new Date(`${monthlyReportMonthKey(currentDate)}-01T00:00:00Z`);
  const result = [];
  for (const cursor = new Date(start); cursor < end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    result.push(cursor.toISOString().slice(0, 7));
  }
  return result;
}

export function calculateReportOverall(profile = {}) {
  const total = MONTHLY_REPORT_ATTRIBUTES.reduce((sum, key) => sum + number(profile[key]), 0);
  return Math.max(1, Math.min(100, Math.round(total / MONTHLY_REPORT_ATTRIBUTES.length)));
}

export function createMonthlyCareerSnapshot(profile = {}, extra = {}) {
  const attributes = Object.fromEntries(MONTHLY_REPORT_ATTRIBUTES.map((key) => [key, number(profile[key])]));
  return {
    capturedDate: cleanDate(profile.career_date),
    rankingPosition: number(profile.ranking_position, null),
    rankingPoints: number(profile.rank_points ?? profile.world_ranking_points),
    overall: calculateReportOverall(profile),
    attributes,
    xp: number(profile.xp),
    level: profile.level || null,
    coins: number(profile.coins),
    energy: number(profile.energy),
    fatigue: number(profile.fatigue),
    condition: number(profile.condition, null),
    morale: number(profile.morale, null),
    form: number(profile.form, null),
    confidence: number(profile.confidence, null),
    fans: number(profile.followers ?? profile.fans ?? profile.total_fans),
    popularity: number(profile.popularity ?? profile.fan_appeal),
    reputation: number(profile.reputation),
    wins: number(profile.wins),
    losses: number(profile.losses),
    tournamentsWon: number(profile.tournaments_won),
    partner: profile.partner_id ? { id: profile.partner_id, name: profile.partner_name || null, chemistry: number(profile.partner_chemistry, null), trust: number(profile.partner_trust, null) } : null,
    coach: profile.coach_id ? { id: profile.coach_id, name: profile.coach_name || null, trust: number(profile.coach_trust, null) } : null,
    injury: profile.injury_status || profile.injury_type || profile.injured_until ? { status: profile.injury_status || 'em_recuperacao', type: profile.injury_type || null, until: profile.injured_until || profile.injury_return_date || null } : null,
    ...extra,
  };
}

function rowDate(row = {}) {
  return cleanDate(row.date || row.career_date || row.match_date || row.played_date || row.event_date || row.session_date || row.published_date || row.unlocked_date || row.completed_at || row.created_career_date || row.created_date);
}

function inPeriod(row, periodKey) {
  if (String(row?.month || '') === periodKey) return true;
  return monthlyReportMonthKey(rowDate(row)) === periodKey;
}

function belongsToProfile(row, profile) {
  if (!row || !profile) return false;
  if (row.profile_id) return row.profile_id === profile.id;
  const playerName = normalize(profile.sport_name || profile.name);
  const names = [...(row.team_a || []), ...(row.team_b || []), row.winner_name, row.loser_name].map(normalize);
  return Boolean(playerName && names.includes(playerName));
}

function matchWon(match, profile) {
  const result = normalize(match.profile_result || match.result);
  if (['win', 'won', 'vitoria', 'vitória'].includes(result)) return true;
  if (['loss', 'lost', 'derrota'].includes(result)) return false;
  if (match.player_won === true || match.is_winner === true || match.winner_id === profile.id || match.winner_player_id === profile.id) return true;
  const playerName = normalize(profile.sport_name || profile.name);
  if (playerName && normalize(match.winner_name) === playerName) return true;
  const playerSide = (match.team_a || []).map(normalize).includes(playerName) ? 'A' : (match.team_b || []).map(normalize).includes(playerName) ? 'B' : null;
  return Boolean(playerSide && String(match.winner || '').toUpperCase() === playerSide);
}

function delta(start, end, field) {
  const a = start?.[field];
  const b = end?.[field];
  return a === null || a === undefined || b === null || b === undefined ? null : number(b) - number(a);
}

function sum(items, getter) {
  return items.reduce((total, item) => total + number(getter(item)), 0);
}

function performanceFromMatches(matches) {
  const pick = (match, keys) => {
    const sources = [match.player_stats, match.profile_stats, match.stats, match.statistics, match.live_coach_report?.player_stats, match];
    for (const source of sources) for (const key of keys) if (source?.[key] !== undefined) return number(source[key]);
    return null;
  };
  const fields = {
    winners: ['winners', 'winner_shots'], errors: ['unforced_errors', 'errors'], aces: ['aces'],
    smashes: ['smash_winners', 'smashes'], lobs: ['successful_lobs', 'lobs'], netWon: ['net_points_won'], netPlayed: ['net_points_played', 'net_approaches'],
  };
  const totals = { winners: null, errors: null, aces: null, smashes: null, lobs: null, netWon: null, netPlayed: null };
  let available = false;
  Object.entries(fields).forEach(([field, keys]) => {
    const values = matches.map((match) => pick(match, keys)).filter((value) => value !== null);
    totals[field] = values.length ? values.reduce((acc, value) => acc + value, 0) : null;
    if (values.length) available = true;
  });
  totals.netSuccessRate = totals.netWon !== null && totals.netPlayed ? Math.round((totals.netWon / totals.netPlayed) * 100) : null;
  return { available, ...totals };
}

function buildInsights({ wins, losses, trainings, balance, rankingDelta, energyDelta, injuries, performance }) {
  const insights = [];
  const totalMatches = wins + losses;
  if (totalMatches) insights.push({ tone: wins >= losses ? 'success' : 'warning', title: wins >= losses ? 'Competitividade em alta' : 'Mês de ajustes', text: `${wins} vitória(s) em ${totalMatches} partida(s), aproveitamento de ${Math.round((wins / totalMatches) * 100)}%.` });
  if (rankingDelta !== null && rankingDelta !== 0) insights.push({ tone: rankingDelta < 0 ? 'success' : 'warning', title: 'Movimento no ranking', text: rankingDelta < 0 ? `Avanço de ${Math.abs(rankingDelta)} posição(ões).` : `Queda de ${rankingDelta} posição(ões).` });
  if (trainings.length >= 8) insights.push({ tone: 'brand', title: 'Rotina consistente', text: `${trainings.length} sessões de treino concluídas no mês.` });
  if (balance < 0) insights.push({ tone: 'warning', title: 'Atenção ao caixa', text: `O fluxo mensal fechou negativo em ${Math.abs(balance).toLocaleString('pt-BR')} moedas.` });
  if (injuries > 0 || (energyDelta !== null && energyDelta < -20)) insights.push({ tone: 'danger', title: 'Carga física relevante', text: injuries > 0 ? 'Houve ocorrência médica registrada no período.' : 'A energia encerrou o mês bem abaixo do ponto inicial.' });
  if (performance.available && performance.errors !== null && performance.winners !== null && performance.errors > performance.winners) insights.push({ tone: 'warning', title: 'Eficiência técnica', text: 'Os erros registrados superaram os winners; consistência deve entrar no próximo plano.' });
  return insights.slice(0, 4);
}

export function buildMonthlyCareerReport({ profile, periodKey, startSnapshot, endSnapshot, data = { matches: [], trainings: [], transactions: [], pressArticles: [], achievements: [], missions: [], staff: [], contracts: [] }, generatedDate }) {
  const period = monthlyReportPeriod(periodKey);
  const matches = (data.matches || []).filter((row) => belongsToProfile(row, profile) && inPeriod(row, periodKey));
  const wins = matches.filter((match) => matchWon(match, profile)).length;
  const losses = Math.max(0, matches.length - wins);
  const trainings = (data.trainings || []).filter((row) => belongsToProfile(row, profile) && inPeriod(row, periodKey));
  const transactions = (data.transactions || []).filter((row) => belongsToProfile(row, profile) && inPeriod(row, periodKey));
  const articles = (data.pressArticles || []).filter((row) => belongsToProfile(row, profile) && inPeriod(row, periodKey));
  const achievements = (data.achievements || []).filter((row) => belongsToProfile(row, profile) && inPeriod(row, periodKey) && row.unlocked !== false);
  const missions = (data.missions || []).filter((row) => belongsToProfile(row, profile) && (inPeriod(row, periodKey) || String(row.period_key || '').includes(periodKey)) && (row.completed || row.status === 'completed' || row.status === 'rewarded'));
  const income = sum(transactions.filter((row) => row.type === 'income'), (row) => row.amount);
  const expenses = sum(transactions.filter((row) => row.type === 'expense'), (row) => row.amount);
  const monthlyCloses = transactions.filter((row) => row.type === 'monthly_close');
  const closeIncome = sum(monthlyCloses, (row) => row.income);
  const closeExpenses = sum(monthlyCloses, (row) => row.expenses);
  const resolvedIncome = income + closeIncome;
  const resolvedExpenses = expenses + closeExpenses;
  const tournamentMap = new Map();
  matches.filter((match) => match.tournament_id || (match.tournament_name && normalize(match.tournament_name) !== 'partida treino')).forEach((match) => {
    const key = match.tournament_id || match.tournament_name;
    const item = tournamentMap.get(key) || { id: match.tournament_id || null, name: match.tournament_name || 'Torneio', matches: 0, wins: 0, result: null };
    item.matches += 1;
    if (matchWon(match, profile)) item.wins += 1;
    if (match.round === 'final' || match.is_final) item.result = matchWon(match, profile) ? 'champion' : 'runner_up';
    tournamentMap.set(key, item);
  });
  const tournaments = [...tournamentMap.values()];
  const performance = performanceFromMatches(matches);
  const medicalTreatments = (profile.medical_treatment_history || []).filter((row) => inPeriod(row, periodKey));
  const injuries = trainings.filter((row) => row.injured || row.injury_occurred).length + matches.filter((row) => row.injury_occurred).length;
  const rankingDelta = delta(startSnapshot, endSnapshot, 'rankingPosition');
  const energyDelta = delta(startSnapshot, endSnapshot, 'energy');
  const balance = resolvedIncome - resolvedExpenses;
  const fallbacks = [];
  if (!startSnapshot?.capturedDate || monthlyReportMonthKey(startSnapshot.capturedDate) !== periodKey) fallbacks.push('O snapshot inicial não estava disponível no primeiro dia; variações usam a primeira captura confiável do período.');
  if (!performance.available) fallbacks.push('A Match Engine não registrou estatísticas técnicas granulares neste mês; resultados e placares foram preservados.');
  if (!transactions.length) fallbacks.push('Sem lançamentos financeiros datados no período; o saldo inicial/final continua disponível nos snapshots.');
  const insights = buildInsights({ wins, losses, trainings, balance, rankingDelta, energyDelta, injuries, performance });
  const focus = [];
  if (losses > wins) focus.push('Revisar padrões das derrotas com treinador e parceiro.');
  if (performance.available && performance.errors > performance.winners) focus.push('Priorizar consistência e redução de erros não forçados.');
  if (endSnapshot.fatigue >= 55 || endSnapshot.energy <= 45) focus.push('Planejar recuperação e controlar a carga física.');
  if (balance < 0) focus.push('Reequilibrar despesas e receitas recorrentes.');
  if (!focus.length) focus.push('Manter a evolução com metas competitivas e treinos específicos.');
  const highlights = [
    ...tournaments.filter((item) => item.result === 'champion').map((item) => `Título em ${item.name}`),
    ...achievements.slice(0, 2).map((item) => `Conquista desbloqueada: ${item.achievement_name || item.title || item.achievement_id || 'novo marco'}`),
    ...(rankingDelta !== null && rankingDelta < 0 ? [`Melhorou ${Math.abs(rankingDelta)} posição(ões) no ranking`] : []),
  ].slice(0, 5);

  return {
    id: monthlyReportId(profile.id, periodKey), schemaVersion: MONTHLY_REPORT_SCHEMA_VERSION, profileId: profile.id,
    periodKey, periodStart: period.startDate, periodEnd: period.endDate, generatedDate: cleanDate(generatedDate), status: 'finalized',
    startSnapshot: clone(startSnapshot), endSnapshot: clone(endSnapshot),
    ranking: { startPosition: startSnapshot.rankingPosition, endPosition: endSnapshot.rankingPosition, positionDelta: rankingDelta, startPoints: startSnapshot.rankingPoints, endPoints: endSnapshot.rankingPoints, pointsDelta: delta(startSnapshot, endSnapshot, 'rankingPoints') },
    development: { startOverall: startSnapshot.overall, endOverall: endSnapshot.overall, overallDelta: delta(startSnapshot, endSnapshot, 'overall'), attributes: MONTHLY_REPORT_ATTRIBUTES.map((key) => ({ key, start: startSnapshot.attributes?.[key] ?? 0, end: endSnapshot.attributes?.[key] ?? 0, delta: number(endSnapshot.attributes?.[key]) - number(startSnapshot.attributes?.[key]) })), xpGained: delta(startSnapshot, endSnapshot, 'xp'), missionsCompleted: missions.length, achievementsUnlocked: achievements.length },
    competition: { matches: matches.length, wins, losses, winRate: matches.length ? Math.round((wins / matches.length) * 100) : 0, tournamentsPlayed: tournaments.length, titles: tournaments.filter((item) => item.result === 'champion').length, tournaments, matchIds: matches.map((item) => item.id).filter(Boolean) },
    training: { sessions: trainings.length, totalMinutes: sum(trainings, (row) => row.duration_min ?? row.duration_minutes), xpEarned: sum(trainings, (row) => row.xp_reward ?? row.xp_gained), energySpent: sum(trainings, (row) => row.energy_cost), attributeGains: trainings.reduce((acc, row) => { Object.entries(row.attribute_gains || {}).forEach(([key, value]) => { acc[key] = number(acc[key]) + number(value); }); if (row.attribute_target && row.attribute_gain) acc[row.attribute_target] = number(acc[row.attribute_target]) + number(row.attribute_gain); return acc; }, {}) },
    health: { startEnergy: startSnapshot.energy, endEnergy: endSnapshot.energy, energyDelta, startFatigue: startSnapshot.fatigue, endFatigue: endSnapshot.fatigue, fatigueDelta: delta(startSnapshot, endSnapshot, 'fatigue'), injuries, medicalTreatments: medicalTreatments.length, endInjury: endSnapshot.injury },
    finances: { startBalance: startSnapshot.coins, endBalance: endSnapshot.coins, balanceDelta: delta(startSnapshot, endSnapshot, 'coins'), income: resolvedIncome, expenses: resolvedExpenses, net: balance, transactions: transactions.length, categories: transactions.reduce((acc, row) => { const key = row.category || row.type || 'outros'; acc[key] = number(acc[key]) + number(row.amount ?? row.net); return acc; }, {}) },
    media: { pressArticles: articles.length, positiveArticles: articles.filter((row) => normalize(row.sentiment) === 'positivo').length, fansStart: startSnapshot.fans, fansEnd: endSnapshot.fans, fansDelta: delta(startSnapshot, endSnapshot, 'fans'), popularityDelta: delta(startSnapshot, endSnapshot, 'popularity'), reputationDelta: delta(startSnapshot, endSnapshot, 'reputation') },
    relationships: { partnerStart: startSnapshot.partner, partnerEnd: endSnapshot.partner, chemistryDelta: startSnapshot.partner && endSnapshot.partner && startSnapshot.partner.id === endSnapshot.partner.id ? number(endSnapshot.partner.chemistry) - number(startSnapshot.partner.chemistry) : null, coachStart: startSnapshot.coach, coachEnd: endSnapshot.coach, activeStaff: (data.staff || []).filter((row) => belongsToProfile(row, profile) && !['terminated', 'expired'].includes(row.contract_status)).map((row) => ({ id: row.id, name: row.staff_name || row.name, role: row.staff_type || row.role })) },
    sponsors: (data.contracts || []).filter((row) => belongsToProfile(row, profile) && normalize(row.contract_type).includes('patrocin') && (!row.start_date || row.start_date <= period.endDate) && (!row.end_date || row.end_date >= period.startDate)).map((row) => ({ id: row.id, name: row.sponsor_name || row.name, active: row.is_active !== false, monthlyValue: number(row.monthly_payment ?? row.monthly_value ?? row.monthly_salary), goals: row.goals || row.objectives || [] })),
    performance, highlights, insights, nextMonthFocus: focus.slice(0, 3), fallbacks,
  };
}
