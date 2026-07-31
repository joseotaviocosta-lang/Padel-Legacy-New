import { base44 } from '@/api/base44Client';
import { levelForXp } from '@/lib/padel';

const CHART_COLORS = ['#a3e635', '#0ea5e9', '#f43f5e', '#f59e0b', '#8b5cf6', '#10b981'];

async function safeList(entity, sort, limit) {
  try { return await entity.list(sort, limit) || []; } catch { return []; }
}
async function safeFilter(entity, query, sort, limit) {
  try { return await entity.filter(query, sort, limit) || []; } catch { return []; }
}

function countBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item) || '—';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function sumBy(arr, keyFn) {
  return arr.reduce((acc, item) => acc + (Number(keyFn(item)) || 0), 0);
}

function toChartData(dist) {
  return Object.entries(dist).map(([name, value]) => ({ name, value }));
}

export async function fetchAdminStats() {
  const [players, athletes, matches, tournaments, clubs, contracts, staffHires, transactions, worldEvents, legacies, rankings] = await Promise.all([
    safeList(base44.entities.PlayerProfile, '-created_date', 200),
    safeList(base44.entities.AthleteProfile, '-overall_rating', 200),
    safeList(base44.entities.Match, '-created_date', 200),
    safeList(base44.entities.Tournament, '-start_date', 200),
    safeList(base44.entities.Club, '-club_points', 200),
    safeList(base44.entities.PlayerContract, '-created_date', 200),
    safeList(base44.entities.PlayerStaffHire, '-created_date', 200),
    safeList(base44.entities.FinancialTransaction, '-created_date', 200),
    safeList(base44.entities.WorldEvent, '-created_date', 200),
    safeList(base44.entities.CareerLegacy, '-created_date', 200),
    safeList(base44.entities.TeamRanking, '-ranking_points', 200),
  ]);

  // ── Totals ─────────────────────────────────────────────────────────────
  const totals = {
    players: players.length,
    athletes: athletes.length,
    matches: matches.length,
    tournaments: tournaments.length,
    clubs: clubs.length,
    events: worldEvents.length,
    legacies: legacies.length,
    rankings: rankings.length,
  };

  // ── Health Indicators ─────────────────────────────────────────────────
  const activeContracts = contracts.filter(c => c.is_active !== false);
  const finishedTournaments = tournaments.filter(t => t.status === 'finalizado');
  const injuredAthletes = athletes.filter(a => a.current_injury);
  const totalCoins = sumBy(players, p => p.coins);

  const health = {
    avgLevel: players.length ? Math.round(players.reduce((a, p) => a + (levelForXp(p.xp || 0) ? 1 : 0), 0) / players.length * 100) / 1 : 0,
    tournamentCompletion: tournaments.length ? Math.round((finishedTournaments.length / tournaments.length) * 100) : 0,
    economyBalance: sumBy(transactions, t => t.net),
    injuryRate: athletes.length ? Math.round((injuredAthletes.length / athletes.length) * 100) : 0,
    avgMorale: athletes.length ? Math.round(athletes.reduce((a, at) => a + (at.morale || 0), 0) / athletes.length) : 0,
    avgReputation: clubs.length ? Math.round(clubs.reduce((a, c) => a + (c.reputation || 0), 0) / clubs.length) : 0,
  };

  // ── Economy ────────────────────────────────────────────────────────────
  const totalIncome = sumBy(transactions, t => t.income);
  const totalExpenses = sumBy(transactions, t => t.expenses);
  const totalSalary = sumBy(activeContracts, c => c.monthly_salary);
  const totalStaffCost = sumBy(staffHires, s => s.monthly_cost);

  const incomeBySource = {};
  transactions.forEach(t => {
    const bd = t.breakdown || {};
    Object.entries(bd).forEach(([k, v]) => {
      incomeBySource[k] = (incomeBySource[k] || 0) + (Number(v) || 0);
    });
  });

  const economy = {
    totalCoins,
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
    activeContracts: activeContracts.length,
    totalSalary,
    totalStaffCost,
    incomeBySource: toChartData(incomeBySource),
    sponsorTiers: toChartData(countBy(activeContracts, c => c.sponsor_tier || 'Sem tier')),
  };

  // ── Growth ──────────────────────────────────────────────────────────────
  const levelDist = countBy(players, p => levelForXp(p.xp || 0));
  const phaseDist = countBy(athletes, a => a.career_phase || 'Ascensão');
  const personalityDist = countBy(athletes, a => a.personality_label || '—');
  const ageBuckets = { '16-20': 0, '21-25': 0, '26-30': 0, '31-35': 0, '36+': 0 };
  athletes.forEach(a => {
    const age = a.age || 20;
    if (age <= 20) ageBuckets['16-20']++;
    else if (age <= 25) ageBuckets['21-25']++;
    else if (age <= 30) ageBuckets['26-30']++;
    else if (age <= 35) ageBuckets['31-35']++;
    else ageBuckets['36+']++;
  });

  const growth = {
    levelDist: toChartData(levelDist),
    phaseDist: toChartData(phaseDist),
    personalityDist: toChartData(personalityDist),
    ageDist: toChartData(ageBuckets),
  };

  // ── Tournaments ────────────────────────────────────────────────────────
  const tierDist = countBy(tournaments, t => t.tier || 'P2');
  const statusDist = countBy(tournaments, t => t.status || 'inscricoes');
  const totalPrize = sumBy(tournaments, t => t.prize_coins);
  const recentChampions = finishedTournaments
    .filter(t => t.champion)
    .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))
    .slice(0, 8);

  const tournamentsData = {
    tierDist: toChartData(tierDist),
    statusDist: toChartData(statusDist),
    totalPrize,
    totalParticipants: sumBy(tournaments, t => (t.participants || []).length),
    recentChampions,
  };

  // ── Clubs ───────────────────────────────────────────────────────────────
  const clubLevelDist = countBy(clubs, c => `Nível ${c.level || 1}`);
  const clubsData = {
    totalClubs: clubs.length,
    totalMembers: sumBy(clubs, c => c.member_count),
    totalPoints: sumBy(clubs, c => c.club_points),
    avgReputation: health.avgReputation,
    topClubs: clubs.slice(0, 8),
    levelDist: toChartData(clubLevelDist),
  };

  // ── Personnel ──────────────────────────────────────────────────────────
  const staffByType = countBy(staffHires, s => s.staff_type || 'outro');
  const personnel = {
    staffByType: toChartData(staffByType),
    totalStaff: staffHires.length,
    totalStaffCost,
    sponsorsByTier: economy.sponsorTiers,
    activeContracts: activeContracts.length,
    totalSalary,
    topSponsors: activeContracts.sort((a, b) => (b.monthly_salary || 0) - (a.monthly_salary || 0)).slice(0, 8),
  };

  // ── Universe Health ─────────────────────────────────────────────────────
  const eventTypeDist = countBy(worldEvents, e => e.event_type || 'noticia');
  const breakingNews = worldEvents.filter(e => e.tier === 'breaking');
  const universe = {
    totalEvents: worldEvents.length,
    breakingNews: breakingNews.length,
    eventTypeDist: toChartData(eventTypeDist),
    totalLegacies: legacies.length,
    totalRankings: rankings.length,
  };

  return { totals, health, economy, growth, tournaments: tournamentsData, clubs: clubsData, personnel, universe, CHART_COLORS };
}