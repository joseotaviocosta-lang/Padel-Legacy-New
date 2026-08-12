import {
  MONTHLY_REPORT_ATTRIBUTES,
  calculateReportOverall,
  createMonthlyCareerSnapshot,
} from './monthlyCareerReportModel.js';

export const ANNUAL_REPORT_SCHEMA_VERSION = 1;
export const ANNUAL_REPORT_MIN_WIN_RATE_MATCHES = 20;

const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const date = (value) => String(value || '').slice(0, 10);
const normalized = (value) => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const sum = (rows, getter) => (rows || []).reduce((total, row) => total + n(getter(row)), 0);
const pct = (wins, matches) => matches ? Math.round((wins / matches) * 1000) / 10 : 0;
const delta = (start, end, field) => start?.[field] == null || end?.[field] == null ? null : n(end[field]) - n(start[field]);

export function annualReportYearKey(value) {
  return Number(date(value).slice(0, 4)) || null;
}

export function annualReportId(profileId, year) {
  return `annual-career-report:${profileId}:${year}`;
}

export function annualReportPeriod(year) {
  const value = Number(year);
  return value ? { startDate: `${value}-01-01`, endDate: `${value}-12-31` } : { startDate: null, endDate: null };
}

export function didCareerYearChange(previousDate, currentDate) {
  const previous = annualReportYearKey(previousDate);
  const current = annualReportYearKey(currentDate);
  return Boolean(previous && current && previous !== current);
}

function rowDate(row = {}) {
  return date(row.date || row.career_date || row.match_date || row.played_date || row.event_date || row.session_date || row.published_date || row.unlocked_date || row.completed_at || row.started_career_date || row.created_career_date || row.created_date);
}

function rowInYear(row, year) {
  if (Number(row?.year || row?.season_year) === Number(year)) return true;
  if (String(row?.month || '').slice(0, 4) === String(year)) return true;
  return annualReportYearKey(rowDate(row)) === Number(year);
}

function belongsToProfile(row, profile) {
  if (!row || !profile) return false;
  if (row.profile_id || row.player_id) return (row.profile_id || row.player_id) === profile.id;
  const playerName = normalized(profile.sport_name || profile.name);
  return Boolean(playerName && [
    ...(row.team_a || []), ...(row.team_b || []), row.winner_name, row.loser_name,
  ].map(normalized).includes(playerName));
}

function playerSide(match, profile) {
  const playerName = normalized(profile.sport_name || profile.name);
  if (match.profile_side) return String(match.profile_side).toUpperCase();
  if ((match.team_a || []).map(normalized).includes(playerName)) return 'A';
  if ((match.team_b || []).map(normalized).includes(playerName)) return 'B';
  return null;
}

function matchWon(match, profile) {
  const result = normalized(match.profile_result || match.result);
  if (['win', 'won', 'vitoria'].includes(result)) return true;
  if (['loss', 'lost', 'derrota'].includes(result)) return false;
  if (match.player_won === true || match.is_winner === true || match.winner_id === profile.id || match.winner_player_id === profile.id) return true;
  const side = playerSide(match, profile);
  return Boolean(side && String(match.winner || '').toUpperCase() === side);
}

function athleteOverall(athlete = {}) {
  if (athlete.overall_rating != null || athlete.overall != null) return n(athlete.overall_rating ?? athlete.overall);
  const values = Object.values(athlete.attributes || {}).map(Number).filter(Number.isFinite);
  return values.length ? Math.round(sum(values, (value) => value) / values.length) : 0;
}

function athletePoints(athlete = {}) {
  return Math.max(0, n(athlete.world_ranking_points ?? athlete.ranking_points ?? athlete.rank_points));
}

export function createAnnualCircuitSnapshot({ athletes = [], teamRankings = [] } = {}, capturedDate = null) {
  const orderedAthletes = [...athletes]
    .filter((item) => item?.id && !item.retired && item.career_phase !== 'Aposentado')
    .sort((a, b) => athletePoints(b) - athletePoints(a) || n(a.ranking_position, 99999) - n(b.ranking_position, 99999));
  const players = orderedAthletes.map((item, index) => ({
    id: item.id,
    name: item.sport_name || item.name || 'Atleta',
    country: item.country || item.nationality || null,
    age: n(item.age, null),
    rankingPosition: n(item.ranking_position, index + 1),
    rankingPoints: athletePoints(item),
    overall: athleteOverall(item),
    wins: n(item.career_wins ?? item.wins),
    losses: n(item.career_losses ?? item.losses),
    titles: n(item.career_titles ?? item.titles?.length),
    prizeMoney: n(item.prize_money_total ?? item.wealth),
    fans: n(item.followers ?? item.fans ?? item.fan_count),
  }));
  const pairs = [...teamRankings]
    .filter((item) => item?.team_key || item?.id)
    .sort((a, b) => n(b.ranking_points) - n(a.ranking_points))
    .map((item, index) => ({
      id: item.id || item.team_key,
      teamKey: item.team_key || item.id,
      name: `${item.player1_name || 'Jogador A'} / ${item.player2_name || 'Jogador B'}`,
      player1Id: item.player1_id || null,
      player2Id: item.player2_id || null,
      rankingPosition: index + 1,
      rankingPoints: n(item.ranking_points),
      matches: n(item.matches_played),
      wins: n(item.wins),
      losses: n(item.losses),
      titles: Array.isArray(item.titles) ? item.titles.length : n(item.titles),
    }));
  return { capturedDate: date(capturedDate), players, pairs };
}

export function createAnnualCareerSnapshot(profile = {}, circuitData = {}) {
  return {
    capturedDate: date(profile.career_date),
    player: createMonthlyCareerSnapshot(profile),
    circuit: createAnnualCircuitSnapshot(circuitData, profile.career_date),
  };
}

function cumulativeDelta(start, end, key) {
  return Math.max(0, n(end?.[key]) - n(start?.[key]));
}

function buildCircuitSummary(startCircuit = {}, endCircuit = {}, allMatches = []) {
  const startById = new Map((startCircuit.players || []).map((item) => [item.id, item]));
  const players = (endCircuit.players || []).map((end) => {
    const start = startById.get(end.id) || end;
    const wins = cumulativeDelta(start, end, 'wins');
    const losses = cumulativeDelta(start, end, 'losses');
    const titles = cumulativeDelta(start, end, 'titles');
    const positionChange = n(start.rankingPosition) - n(end.rankingPosition);
    const technicalDelta = n(end.overall) - n(start.overall);
    return {
      ...end,
      startRanking: start.rankingPosition,
      endRanking: end.rankingPosition,
      positionChange,
      startOverall: start.overall,
      endOverall: end.overall,
      technicalDelta,
      wins,
      losses,
      matches: wins + losses,
      winRate: pct(wins, wins + losses),
      titles,
      prizeMoney: Math.max(0, n(end.prizeMoney) - n(start.prizeMoney)),
      fansGained: n(end.fans) - n(start.fans),
    };
  });
  const byClimb = [...players].sort((a, b) => b.positionChange - a.positionChange || a.endRanking - b.endRanking);
  const byFall = [...players].sort((a, b) => a.positionChange - b.positionChange || a.endRanking - b.endRanking);
  const byImprovement = [...players].sort((a, b) => b.technicalDelta - a.technicalDelta || b.positionChange - a.positionChange);
  const byWins = [...players].sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);
  const byTitles = [...players].sort((a, b) => b.titles - a.titles || b.wins - a.wins);
  const eligibleWinRate = players.filter((item) => item.matches >= ANNUAL_REPORT_MIN_WIN_RATE_MATCHES);
  const bestWinRate = [...eligibleWinRate].sort((a, b) => b.winRate - a.winRate || b.matches - a.matches)[0] || null;
  const mvpCandidates = players.map((item) => ({
    ...item,
    awardScore: Math.max(0, 101 - n(item.endRanking, 101)) * 2 + item.titles * 80 + item.wins * 3 + item.winRate,
  })).sort((a, b) => b.awardScore - a.awardScore || a.endRanking - b.endRanking);
  const playerOfTheYear = mvpCandidates[0] ? {
    ...mvpCandidates[0],
    criteria: '2 pts por posição dentro do Top 100 + 80 por título + 3 por vitória + aproveitamento',
    reasons: [`#${mvpCandidates[0].endRanking} no ranking final`, `${mvpCandidates[0].titles} título(s)`, `${mvpCandidates[0].wins} vitória(s)`],
  } : null;
  const revelation = players
    .filter((item) => item.age != null && item.age <= 23 && (item.positionChange > 0 || item.technicalDelta > 0 || item.titles > 0))
    .map((item) => ({ ...item, awardScore: Math.max(0, item.positionChange) + item.technicalDelta * 25 + item.titles * 80 + item.wins * 3 }))
    .sort((a, b) => b.awardScore - a.awardScore || a.endRanking - b.endRanking)[0] || null;

  const startPairs = new Map((startCircuit.pairs || []).map((item) => [item.teamKey, item]));
  const pairs = (endCircuit.pairs || []).map((end) => {
    const start = startPairs.get(end.teamKey) || end;
    const wins = cumulativeDelta(start, end, 'wins');
    const losses = cumulativeDelta(start, end, 'losses');
    const titles = cumulativeDelta(start, end, 'titles');
    return { ...end, startRanking: start.rankingPosition, endRanking: end.rankingPosition, positionChange: n(start.rankingPosition) - n(end.rankingPosition), pointsGained: n(end.rankingPoints) - n(start.rankingPoints), wins, losses, matches: wins + losses, winRate: pct(wins, wins + losses), titles };
  });
  const bestPair = [...pairs].map((item) => ({ ...item, awardScore: item.titles * 100 + item.wins * 4 + Math.max(0, item.pointsGained) / 10 })).sort((a, b) => b.awardScore - a.awardScore)[0] || null;
  const mostImprovedPair = [...pairs].sort((a, b) => b.positionChange - a.positionChange || b.pointsGained - a.pointsGained)[0] || null;
  const countryCoverage = players.length ? players.filter((item) => item.country).length / players.length : 0;
  const countries = countryCoverage >= 0.8 ? Object.values(players.filter((item) => item.endRanking <= 100).reduce((acc, item) => {
    const key = item.country;
    acc[key] ||= { country: key, top100Players: 0, titles: 0 };
    acc[key].top100Players += 1; acc[key].titles += item.titles;
    return acc;
  }, {})).sort((a, b) => b.top100Players - a.top100Players || b.titles - a.titles) : [];
  const records = [
    byWins[0] && { label: 'Mais vitórias', holder: byWins[0].name, value: byWins[0].wins },
    byTitles[0] && { label: 'Mais títulos', holder: byTitles[0].name, value: byTitles[0].titles },
    byClimb[0] && { label: 'Maior salto no ranking', holder: byClimb[0].name, value: byClimb[0].positionChange },
    byImprovement[0] && { label: 'Maior evolução técnica', holder: byImprovement[0].name, value: byImprovement[0].technicalDelta },
    bestWinRate && { label: 'Melhor aproveitamento', holder: bestWinRate.name, value: `${bestWinRate.winRate}%` },
  ].filter(Boolean);
  const pointEvents = sum(allMatches, (match) => match.point_event_count ?? match.core_stats?.rallies);
  return {
    finalTop10: [...players].sort((a, b) => a.endRanking - b.endRanking).slice(0, 10),
    worldNumberOne: [...players].sort((a, b) => a.endRanking - b.endRanking)[0] || null,
    biggestClimbers: byClimb.filter((item) => item.positionChange > 0).slice(0, 10),
    biggestFallers: byFall.filter((item) => item.positionChange < 0).slice(0, 10),
    mostImproved: byImprovement.filter((item) => item.technicalDelta > 0).slice(0, 10),
    mostWins: byWins.slice(0, 10),
    bestWinRate,
    mostTitles: byTitles.slice(0, 10),
    playerOfTheYear,
    revelation: revelation ? { ...revelation, criteria: 'Até 23 anos: subida no ranking + 25 por OVR + 80 por título + 3 por vitória' } : null,
    bestPair,
    mostImprovedPair,
    youngBreakouts: players.filter((item) => item.age != null && item.age <= 23).sort((a, b) => (b.technicalDelta + b.positionChange / 25 + b.titles * 2) - (a.technicalDelta + a.positionChange / 25 + a.titles * 2)).slice(0, 5),
    veteranHighlights: players.filter((item) => item.age != null && item.age >= 34).sort((a, b) => a.endRanking - b.endRanking || b.wins - a.wins).slice(0, 5),
    countryRanking: countries,
    records,
    statistics: {
      activeAthletes: players.length,
      trackedMatchParticipations: sum(players, (item) => item.matches),
      trackedTournamentMatches: allMatches.length,
      pointEvents,
      pairs: pairs.length,
      titles: sum(players, (item) => item.titles),
    },
    criteria: {
      mvp: '2 pts por posição dentro do Top 100 + 80 por título + 3 por vitória + aproveitamento',
      revelation: 'Atleta de até 23 anos; subida + 25×OVR ganho + 80×títulos + 3×vitórias',
      mostImproved: 'Maior diferença absoluta de OVR entre 01/01 e 31/12',
      winRateMinimumMatches: ANNUAL_REPORT_MIN_WIN_RATE_MATCHES,
    },
    dataQuality: { countryCoverage: Math.round(countryCoverage * 100), countryRankingAvailable: countryCoverage >= 0.8 },
  };
}

function scoreSetsAndGames(match, profile) {
  const side = playerSide(match, profile) || 'A';
  let setsWon = 0; let setsLost = 0; let gamesWon = 0; let gamesLost = 0;
  if (Array.isArray(match.set_scores) && match.set_scores.length) {
    match.set_scores.forEach((set) => {
      const a = n(set.gamesA ?? set.a ?? set.score_a); const b = n(set.gamesB ?? set.b ?? set.score_b);
      const own = side === 'B' ? b : a; const other = side === 'B' ? a : b;
      gamesWon += own; gamesLost += other;
      if (own > other) setsWon += 1; else if (other > own) setsLost += 1;
    });
  } else {
    setsWon = side === 'B' ? n(match.score_b) : n(match.score_a);
    setsLost = side === 'B' ? n(match.score_a) : n(match.score_b);
  }
  return { setsWon, setsLost, gamesWon, gamesLost };
}

function streaks(matches, profile) {
  let win = 0; let loss = 0; let bestWin = 0; let worstLoss = 0;
  [...matches].sort((a, b) => rowDate(a).localeCompare(rowDate(b))).forEach((match) => {
    if (matchWon(match, profile)) { win += 1; loss = 0; bestWin = Math.max(bestWin, win); }
    else { loss += 1; win = 0; worstLoss = Math.max(worstLoss, loss); }
  });
  return { bestWin, worstLoss };
}

function matchScore(match, profile) {
  const round = normalized(match.tournament_round || match.round || match.notes);
  const phase = round.includes('final') && !round.includes('semi') ? 60 : round.includes('semi') ? 40 : round.includes('quart') || round.includes('qf') ? 25 : 5;
  const rank = n(match.opponent_ranking ?? match.opponent_rank ?? match.opponent_ranking_position, 9999);
  const ranking = rank < 9999 ? Math.max(0, 100 - rank) : 0;
  const scores = match.set_scores || [];
  const comeback = scores.length >= 3 && (scores[0]?.winner ? scores[0].winner !== playerSide(match, profile) : false);
  return (matchWon(match, profile) ? 100 : 0) + phase + ranking + (comeback ? 35 : 0) + n(match.saved_match_points) * 10;
}

function buildTournaments(matches, tournaments, profile) {
  const catalog = new Map((tournaments || []).map((item) => [item.id, item]));
  const grouped = new Map();
  matches.filter((match) => match.tournament_id || (match.tournament_name && normalized(match.tournament_name) !== 'partida treino')).forEach((match) => {
    const key = match.tournament_id || match.tournament_name;
    const source = catalog.get(match.tournament_id) || {};
    const item = grouped.get(key) || { id: match.tournament_id || key, name: match.tournament_name || source.name || 'Torneio', date: rowDate(match), category: source.tier || match.tournament_tier || match.category || null, partner: (match.team_a || [])[1] || null, matches: 0, wins: 0, result: null, prize: n(source.prize_coins ?? match.prize), rankingPoints: n(source.rank_points ?? match.ranking_points), opponent: null, score: null };
    item.matches += 1; if (matchWon(match, profile)) item.wins += 1;
    const round = normalized(match.tournament_round || match.round || match.notes);
    if ((round.includes('final') && !round.includes('semi')) || match.is_final) item.result = matchWon(match, profile) ? 'champion' : 'runner_up';
    else if (!matchWon(match, profile)) item.result = round.includes('semi') ? 'semifinal' : round.includes('quart') || round.includes('qf') ? 'quarterfinal' : round.includes('r16') || round.includes('oitav') ? 'round_of_16' : 'early_exit';
    if (!matchWon(match, profile) || item.result === 'champion') {
      const side = playerSide(match, profile); item.opponent = (side === 'B' ? match.team_a : match.team_b || []).join(' / ') || match.opponent_name || null;
      item.score = match.score || match.notes || null;
    }
    grouped.set(key, item);
  });
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function monthlyTotals(monthlyReports) {
  return (monthlyReports || []).reduce((acc, report) => ({
    matches: acc.matches + n(report.competition?.matches), wins: acc.wins + n(report.competition?.wins), losses: acc.losses + n(report.competition?.losses), titles: acc.titles + n(report.competition?.titles),
    trainingSessions: acc.trainingSessions + n(report.training?.sessions), trainingMinutes: acc.trainingMinutes + n(report.training?.totalMinutes),
    income: acc.income + n(report.finances?.income), expenses: acc.expenses + n(report.finances?.expenses),
  }), { matches: 0, wins: 0, losses: 0, titles: 0, trainingSessions: 0, trainingMinutes: 0, income: 0, expenses: 0 });
}

function rawFinances(transactions) {
  let income = 0; let expenses = 0; const incomeCategories = {}; const expenseCategories = {}; const byMonth = {};
  (transactions || []).forEach((row) => {
    const month = String(row.month || rowDate(row)).slice(0, 7);
    const rowIncome = row.type === 'income' ? n(row.amount) : row.type === 'monthly_close' ? n(row.income) : n(row.income);
    const rowExpense = row.type === 'expense' ? n(row.amount) : row.type === 'monthly_close' ? n(row.expenses) : n(row.expenses);
    income += rowIncome; expenses += rowExpense;
    const breakdown = row.breakdown || {};
    if (rowIncome) incomeCategories[row.category || (row.type === 'monthly_close' ? 'receitas_recorrentes' : 'outros')] = n(incomeCategories[row.category || 'outros']) + rowIncome;
    if (rowExpense) expenseCategories[row.category || (row.type === 'monthly_close' ? 'custos_recorrentes' : 'outros')] = n(expenseCategories[row.category || 'outros']) + rowExpense;
    Object.entries(breakdown).forEach(([key, value]) => {
      const target = /cost|fee|salary|maintenance/.test(key) ? expenseCategories : incomeCategories;
      target[key] = n(target[key]) + n(value);
    });
    byMonth[month] ||= { income: 0, expenses: 0, net: 0 }; byMonth[month].income += rowIncome; byMonth[month].expenses += rowExpense; byMonth[month].net += rowIncome - rowExpense;
  });
  return { income, expenses, net: income - expenses, incomeCategories, expenseCategories, byMonth };
}

function maxEntry(object = {}) {
  return Object.entries(object).sort((a, b) => n(b[1]) - n(a[1]))[0] || null;
}

export function buildAnnualCareerReport({ profile, year, yearStartSnapshot, yearEndSnapshot, data = { matches: [], trainings: [], transactions: [], pressArticles: [], achievements: [], missions: [], staff: [], contracts: [], partnerships: [], tournaments: [], monthlyReports: [], athletes: [], teamRankings: [] }, generatedDate, previousReport = null }) {
  const period = annualReportPeriod(year);
  const playerStart = yearStartSnapshot?.player || createMonthlyCareerSnapshot(profile);
  const playerEnd = yearEndSnapshot?.player || createMonthlyCareerSnapshot(profile);
  const matches = (data.matches || []).filter((row) => belongsToProfile(row, profile) && rowInYear(row, year));
  const allCircuitMatches = (data.matches || []).filter((row) => rowInYear(row, year));
  const trainings = (data.trainings || []).filter((row) => belongsToProfile(row, profile) && rowInYear(row, year));
  const transactions = (data.transactions || []).filter((row) => belongsToProfile(row, profile) && rowInYear(row, year));
  const press = (data.pressArticles || []).filter((row) => belongsToProfile(row, profile) && rowInYear(row, year));
  const achievements = (data.achievements || []).filter((row) => belongsToProfile(row, profile) && rowInYear(row, year) && row.unlocked !== false);
  const missions = (data.missions || []).filter((row) => belongsToProfile(row, profile) && rowInYear(row, year) && (row.completed || ['completed', 'rewarded'].includes(row.status)));
  const monthlyReports = (data.monthlyReports || []).filter((row) => Number(String(row.periodKey).slice(0, 4)) === Number(year)).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  const monthly = monthlyTotals(monthlyReports);
  const useMonthly = monthlyReports.length === 12;
  const rawWins = matches.filter((match) => matchWon(match, profile)).length;
  const wins = useMonthly ? monthly.wins : rawWins;
  const losses = useMonthly ? monthly.losses : Math.max(0, matches.length - rawWins);
  const score = matches.reduce((acc, match) => { const value = scoreSetsAndGames(match, profile); Object.keys(acc).forEach((key) => { acc[key] += value[key]; }); return acc; }, { setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 });
  const sequences = streaks(matches, profile);
  const tournamentList = buildTournaments(matches, data.tournaments || [], profile);
  const resultWeight = { champion: 5, runner_up: 4, semifinal: 3, quarterfinal: 2, round_of_16: 1, early_exit: 0 };
  const bestTournament = [...tournamentList].sort((a, b) => n(resultWeight[b.result]) - n(resultWeight[a.result]) || b.rankingPoints - a.rankingPoints || b.prize - a.prize)[0] || null;
  const bestMatch = [...matches].sort((a, b) => matchScore(b, profile) - matchScore(a, profile))[0] || null;
  const financeRaw = rawFinances(transactions);
  const income = useMonthly ? monthly.income : financeRaw.income;
  const expenses = useMonthly ? monthly.expenses : financeRaw.expenses;
  const trainingCategories = trainings.reduce((acc, row) => { const key = row.category || row.group_id || row.training_type || 'outros'; acc[key] = n(acc[key]) + 1; return acc; }, {});
  const trainedAttributes = trainings.reduce((acc, row) => { Object.entries(row.attribute_gains || {}).forEach(([key, value]) => { acc[key] = n(acc[key]) + n(value); }); const key = row.attribute_target || row.focus_attribute; if (key) acc[key] = n(acc[key]) + n(row.attribute_gain, 1); return acc; }, {});
  const attributes = MONTHLY_REPORT_ATTRIBUTES.map((key) => ({ key, start: n(playerStart.attributes?.[key]), end: n(playerEnd.attributes?.[key]), delta: n(playerEnd.attributes?.[key]) - n(playerStart.attributes?.[key]) }));
  const biggestAttributeGain = [...attributes].sort((a, b) => b.delta - a.delta)[0] || null;
  const healthSamples = trainings.flatMap((row) => [row.condition_before, row.condition_after]).filter(Boolean);
  const injuries = [...matches, ...trainings].filter((row) => row.injury_occurred || row.injured);
  const sponsors = (data.contracts || []).filter((row) => belongsToProfile(row, profile) && normalized(row.contract_type).includes('patrocin') && (!row.start_date || row.start_date <= period.endDate) && (!row.end_date || row.end_date >= period.startDate));
  const partnerships = (data.partnerships || []).filter((row) => belongsToProfile(row, profile) && (!row.started_career_date || row.started_career_date <= period.endDate) && (!row.ended_career_date || row.ended_career_date >= period.startDate));
  const staff = (data.staff || []).filter((row) => belongsToProfile(row, profile) && (!row.hired_date || row.hired_date <= period.endDate) && (!row.terminated_date || row.terminated_date >= period.startDate));
  const circuitSummary = buildCircuitSummary(yearStartSnapshot?.circuit, yearEndSnapshot?.circuit, allCircuitMatches);
  const rankingDelta = delta(playerStart, playerEnd, 'rankingPosition');
  const overallDelta = delta(playerStart, playerEnd, 'overall');
  const fanDelta = delta(playerStart, playerEnd, 'fans');
  const seasonScore = (wins + losses ? pct(wins, wins + losses) : 0) + Math.max(0, -n(rankingDelta)) / 10 + Math.max(0, n(overallDelta)) * 4 + tournamentList.filter((item) => item.result === 'champion').length * 20;
  const badge = seasonScore >= 120 ? 'TEMPORADA EXCELENTE' : seasonScore >= 75 ? 'ANO DE CONSOLIDAÇÃO' : seasonScore >= 35 ? 'TEMPORADA DE EVOLUÇÃO' : 'ANO DE APRENDIZADO';
  const monthlyTimeline = monthlyReports.map((report) => ({
    month: report.periodKey,
    ranking: report.ranking?.endPosition,
    overall: report.development?.endOverall,
    balance: report.finances?.endBalance,
    fans: report.media?.fansEnd,
    wins: n(report.competition?.wins),
    losses: n(report.competition?.losses),
    titles: n(report.competition?.titles),
    highlight: report.highlights?.[0] || (report.competition?.wins > report.competition?.losses ? `${report.competition.wins} vitórias` : 'Mês de desenvolvimento'),
  }));
  const audit = {
    monthlyReports: monthlyReports.length,
    source: useMonthly ? 'monthly-reports' : 'annual-raw-data',
    checks: [
      { metric: 'wins', annual: wins, monthly: monthly.wins, difference: wins - monthly.wins, applicable: useMonthly },
      { metric: 'losses', annual: losses, monthly: monthly.losses, difference: losses - monthly.losses, applicable: useMonthly },
      { metric: 'income', annual: income, monthly: monthly.income, difference: income - monthly.income, applicable: useMonthly },
      { metric: 'expenses', annual: expenses, monthly: monthly.expenses, difference: expenses - monthly.expenses, applicable: useMonthly },
      { metric: 'trainingSessions', annual: useMonthly ? monthly.trainingSessions : trainings.length, monthly: monthly.trainingSessions, difference: (useMonthly ? monthly.trainingSessions : trainings.length) - monthly.trainingSessions, applicable: useMonthly },
    ],
  };
  audit.consistent = audit.checks.filter((item) => item.applicable).every((item) => item.difference === 0);
  const fallbacks = [];
  if (!useMonthly) fallbacks.push(`Foram encontrados ${monthlyReports.length}/12 relatórios mensais; totais anuais usam os registros datados da temporada.`);
  if (!matches.some((item) => item.opponent_ranking || item.opponent_rank)) fallbacks.push('Ranking pré-partida dos adversários não estava disponível; a Partida do Ano prioriza fase, vitória e virada registrada.');
  if (!circuitSummary.dataQuality.countryRankingAvailable) fallbacks.push('Ranking por país ocultado porque a cobertura de nacionalidade ficou abaixo de 80%.');
  if (!healthSamples.length) fallbacks.push('Energia e fadiga médias não foram registradas por sessão; os snapshots de início e fim permanecem disponíveis.');
  const previous = previousReport ? {
    year: previousReport.year,
    ranking: { previous: previousReport.ranking?.endPosition, current: playerEnd.rankingPosition, delta: n(playerEnd.rankingPosition) - n(previousReport.ranking?.endPosition) },
    titles: { previous: n(previousReport.sportingResults?.titles), current: tournamentList.filter((item) => item.result === 'champion').length },
    wins: { previous: n(previousReport.sportingResults?.wins), current: wins },
    overall: { previous: n(previousReport.attributes?.endOverall), current: playerEnd.overall },
    fans: { previous: n(previousReport.fans?.end), current: playerEnd.fans },
    income: { previous: n(previousReport.finances?.income), current: income },
  } : null;
  const rankingValues = [playerStart.rankingPosition, playerEnd.rankingPosition, ...monthlyTimeline.map((item) => item.ranking)].filter((value) => value != null && Number.isFinite(Number(value))).map(Number);
  return {
    id: annualReportId(profile.id, year), schemaVersion: ANNUAL_REPORT_SCHEMA_VERSION, profileId: profile.id, year: Number(year),
    periodStart: period.startDate, periodEnd: period.endDate, generatedDate: date(generatedDate), generatedAt: new Date().toISOString(), status: 'finalized',
    yearStartSnapshot: clone(yearStartSnapshot), yearEndSnapshot: clone(yearEndSnapshot),
    playerSummary: { badge, seasonScore: Math.round(seasonScore), rankingStart: playerStart.rankingPosition, rankingEnd: playerEnd.rankingPosition, rankingPositionsGained: rankingDelta == null ? null : -rankingDelta, overallStart: playerStart.overall, overallEnd: playerEnd.overall, overallGained: overallDelta, titles: tournamentList.filter((item) => item.result === 'champion').length, wins, fansStart: playerStart.fans, fansEnd: playerEnd.fans, fansGained: fanDelta, balanceStart: playerStart.coins, balanceEnd: playerEnd.coins, balanceDelta: delta(playerStart, playerEnd, 'coins') },
    sportingResults: { matches: wins + losses, wins, losses, winRate: pct(wins, wins + losses), ...score, titles: tournamentList.filter((item) => item.result === 'champion').length, runnerUps: tournamentList.filter((item) => item.result === 'runner_up').length, semifinals: tournamentList.filter((item) => item.result === 'semifinal').length, quarterfinals: tournamentList.filter((item) => item.result === 'quarterfinal').length, bestWinStreak: sequences.bestWin, worstLossStreak: sequences.worstLoss },
    tournaments: tournamentList,
    bestTournament,
    bestMatch: bestMatch ? { id: bestMatch.id, date: rowDate(bestMatch), tournament: bestMatch.tournament_name || bestMatch.location, round: bestMatch.tournament_round || bestMatch.round || null, opponents: (playerSide(bestMatch, profile) === 'B' ? bestMatch.team_a : bestMatch.team_b || []).join(' / ') || bestMatch.opponent_name || null, score: bestMatch.score || bestMatch.notes || null, won: matchWon(bestMatch, profile), comeback: Boolean(bestMatch.comeback || bestMatch.recap_snapshot?.highlights?.some((item) => item.icon === 'comeback')), savedMatchPoints: n(bestMatch.saved_match_points), selectionScore: matchScore(bestMatch, profile) } : null,
    difficultMoment: sequences.worstLoss ? { type: 'loss_streak', value: sequences.worstLoss, text: `${sequences.worstLoss} derrota(s) consecutiva(s) — ponto de atenção para a próxima temporada.` } : null,
    ranking: { startPosition: playerStart.rankingPosition, endPosition: playerEnd.rankingPosition, positionDelta: rankingDelta, positionsGained: rankingDelta == null ? null : -rankingDelta, bestPosition: rankingValues.length ? Math.min(...rankingValues) : null, worstPosition: rankingValues.length ? Math.max(...rankingValues) : null, startPoints: playerStart.rankingPoints, endPoints: playerEnd.rankingPoints, pointsDelta: delta(playerStart, playerEnd, 'rankingPoints'), progression: monthlyTimeline.map((item) => ({ month: item.month, value: item.ranking })) },
    attributes: { startOverall: playerStart.overall, endOverall: playerEnd.overall, overallDelta, items: attributes, biggestGain: biggestAttributeGain, progression: monthlyTimeline.map((item) => ({ month: item.month, value: item.overall })) },
    careerExperience: { xpStart: playerStart.xp, xpEnd: playerEnd.xp, xpGained: delta(playerStart, playerEnd, 'xp'), missionsCompleted: missions.length, achievementsUnlocked: achievements.length },
    training: { sessions: useMonthly ? monthly.trainingSessions : trainings.length, totalMinutes: useMonthly ? monthly.trainingMinutes : sum(trainings, (row) => row.duration_min ?? row.duration_minutes), categories: trainingCategories, mostUsedType: maxEntry(trainingCategories), attributeGains: trainedAttributes, mostTrainedAttribute: maxEntry(trainedAttributes), monthlyAverage: Math.round(((useMonthly ? monthly.trainingSessions : trainings.length) / 12) * 10) / 10, restDays: n(profile.rest_days_year) },
    health: { energyStart: playerStart.energy, energyEnd: playerEnd.energy, averageEnergy: healthSamples.length ? Math.round(sum(healthSamples, (item) => item.energy) / healthSamples.length) : null, fatigueStart: playerStart.fatigue, fatigueEnd: playerEnd.fatigue, averageFatigue: healthSamples.length ? Math.round(sum(healthSamples, (item) => item.fatigue) / healthSamples.length) : null, peakFatigue: healthSamples.length ? Math.max(...healthSamples.map((item) => n(item.fatigue))) : null, injuries: injuries.length, daysOut: sum(injuries, (item) => item.injury_days ?? item.days_out), endInjury: playerEnd.injury },
    finances: { startBalance: playerStart.coins, endBalance: playerEnd.coins, income, expenses, net: income - expenses, balanceDelta: delta(playerStart, playerEnd, 'coins'), incomeCategories: financeRaw.incomeCategories, expenseCategories: financeRaw.expenseCategories, largestIncomeSource: maxEntry(financeRaw.incomeCategories), largestExpense: maxEntry(financeRaw.expenseCategories), mostProfitableMonth: Object.entries(financeRaw.byMonth).sort((a, b) => b[1].net - a[1].net)[0] || null, mostExpensiveMonth: Object.entries(financeRaw.byMonth).sort((a, b) => b[1].expenses - a[1].expenses)[0] || null, progression: monthlyTimeline.map((item) => ({ month: item.month, value: item.balance })) },
    sponsors: { start: sponsors.filter((item) => !item.start_date || item.start_date <= period.startDate).length, end: sponsors.filter((item) => item.is_active !== false && (!item.end_date || item.end_date >= period.endDate)).length, newSponsors: sponsors.filter((item) => rowInYear({ date: item.start_date }, year)).map((item) => item.sponsor_name || item.name), endedContracts: sponsors.filter((item) => rowInYear({ date: item.end_date }, year)).map((item) => item.sponsor_name || item.name), annualRevenue: n(financeRaw.incomeCategories.patrocinio ?? financeRaw.incomeCategories.sponsor_income), largestContract: [...sponsors].sort((a, b) => n(b.monthly_payment ?? b.monthly_value) - n(a.monthly_payment ?? a.monthly_value))[0] || null },
    fans: { start: playerStart.fans, end: playerEnd.fans, gained: fanDelta, popularityStart: playerStart.popularity, popularityEnd: playerEnd.popularity, popularityDelta: delta(playerStart, playerEnd, 'popularity'), reputationStart: playerStart.reputation, reputationEnd: playerEnd.reputation, reputationDelta: delta(playerStart, playerEnd, 'reputation'), progression: monthlyTimeline.map((item) => ({ month: item.month, value: item.fans })), biggestMonthlyGrowth: monthlyReports.map((item) => ({ month: item.periodKey, value: n(item.media?.fansDelta) })).sort((a, b) => b.value - a.value)[0] || null },
    press: { interviews: press.filter((item) => normalized(item.article_type).includes('entrevista')).length, articles: press.length, positiveImpact: press.filter((item) => normalized(item.tone || item.sentiment) === 'positivo').length, negativeImpact: press.filter((item) => normalized(item.tone || item.sentiment) === 'negativo').length, reputationChange: sum(press, (item) => item.reputation_change), biggestStory: [...press].sort((a, b) => Math.abs(n(b.reputation_change) + n(b.fan_appeal_change)) - Math.abs(n(a.reputation_change) + n(a.fan_appeal_change)))[0] || null },
    partnership: { start: playerStart.partner, end: playerEnd.partner, changes: partnerships.filter((item) => rowInYear({ date: item.started_career_date }, year)).length, partners: partnerships.map((item) => ({ id: item.partner_bot_id, name: item.partner_name, matches: n(item.shared_matches), wins: n(item.shared_wins), titles: n(item.shared_titles), chemistry: n(item.chemistry) })), best: [...partnerships].map((item) => ({ id: item.partner_bot_id, name: item.partner_name, matches: n(item.shared_matches), wins: n(item.shared_wins), titles: n(item.shared_titles), chemistry: n(item.chemistry), score: n(item.shared_titles) * 20 + n(item.shared_wins) + n(item.chemistry) / 10 })).sort((a, b) => b.score - a.score)[0] || null },
    staff: { coachesUsed: [...new Set(staff.filter((item) => normalized(item.staff_type || item.role).includes('coach') || normalized(item.staff_type || item.role).includes('trein')).map((item) => item.staff_name || item.name))], finalCoach: playerEnd.coach, members: staff.map((item) => ({ id: item.id, name: item.staff_name || item.name, role: item.staff_type || item.role, cost: n(item.monthly_cost) })), totalCost: sum(staff, (item) => item.total_cost ?? item.monthly_cost) },
    circuitSummary,
    highlights: [bestTournament?.result === 'champion' ? `Campeão do ${bestTournament.name}` : null, rankingDelta < 0 ? `Subiu ${Math.abs(rankingDelta)} posições no ranking` : null, overallDelta > 0 ? `Evoluiu ${overallDelta} pontos de OVR` : null, fanDelta > 0 ? `Conquistou ${fanDelta.toLocaleString('pt-BR')} novos fãs` : null].filter(Boolean),
    monthlyTimeline,
    yearComparison: previous,
    audit,
    fallbacks,
  };
}
