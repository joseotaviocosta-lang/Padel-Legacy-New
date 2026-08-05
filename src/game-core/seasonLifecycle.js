import { localGame } from '@/api/localGameClient.js';
import { ensureFutureTournaments } from '@/lib/career';
import { levelForXp } from '@/lib/padel';
import { applyTeamRankingSeasonCarryover } from '@/lib/teamRanking';
import { safeName } from './utils';

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const dateYear = (value) => Number(String(value || '').slice(0, 4)) || 0;
const money = (items, type) => (items || [])
  .filter((item) => item.type === type)
  .reduce((sum, item) => sum + number(item.amount), 0);

function matchBelongsToProfile(match, profile) {
  if (match.profile_id && match.profile_id === profile.id) return true;
  const name = safeName(profile);
  return [...(match.team_a || []), ...(match.team_b || [])].includes(name);
}

function matchYear(match) {
  return dateYear(match.match_date || match.date || match.event_date || match.created_date);
}

function transactionYear(item) {
  return dateYear(item.date || item.created_date);
}

export function calculateSeasonAwards(snapshot) {
  const awards = [];
  if (snapshot.titles >= 3) awards.push({ id: 'dominante', label: 'Dupla dominante', coins: 500, xp: 350, rankPoints: 120 });
  else if (snapshot.titles >= 1) awards.push({ id: 'campeao', label: 'Campeão da temporada', coins: 250, xp: 200, rankPoints: 70 });

  if (snapshot.matches >= 10 && snapshot.winRate >= 70) {
    awards.push({ id: 'elite', label: 'Excelência competitiva', coins: 180, xp: 150, rankPoints: 45 });
  }
  if (snapshot.matches >= 20) {
    awards.push({ id: 'regularidade', label: 'Atleta mais dedicado', coins: 120, xp: 120, rankPoints: 25 });
  }
  if (snapshot.balance > 0) {
    awards.push({ id: 'gestao', label: 'Gestão financeira positiva', coins: 80, xp: 60, rankPoints: 0 });
  }
  if (!awards.length) {
    awards.push({ id: 'estreante', label: 'Temporada concluída', coins: 60, xp: 50, rankPoints: 10 });
  }
  return awards;
}

export async function getSeasonSnapshot(profile, requestedYear = null) {
  const year = requestedYear || dateYear(profile?.career_date) || new Date().getFullYear();
  const [matches, transactions, tournaments, rankings, results] = await Promise.all([
    localGame.entities.Match.list('-created_date', 1000),
    localGame.entities.FinancialTransaction.filter({ profile_id: profile.id }),
    localGame.entities.Tournament.list('-start_date', 500),
    localGame.entities.TeamRanking.list('-ranking_points', 500),
    localGame.entities.SeasonResult.filter({ profile_id: profile.id, season_year: year }),
  ]);

  const playerMatches = (matches || []).filter((match) => {
    if (!matchBelongsToProfile(match, profile)) return false;
    const y = matchYear(match);
    return y === 0 || y === year;
  });
  const wins = playerMatches.filter((match) => {
    if (match.profile_result) return match.profile_result === 'win';
    const name = safeName(profile);
    const playerSide = (match.team_a || []).includes(name) ? 'A' : 'B';
    return match.winner === playerSide;
  }).length;
  const seasonTransactions = (transactions || []).filter((item) => {
    const y = transactionYear(item);
    return y === 0 || y === year;
  });
  const seasonTournaments = (tournaments || []).filter((item) => dateYear(item.start_date) === year);
  const titles = seasonTournaments.filter((item) => String(item.champion || '').includes(safeName(profile))).length;
  const teamKey = profile.partner_id ? [profile.id, profile.partner_id].sort().join('_') : null;
  const rankingIndex = teamKey ? (rankings || []).findIndex((item) => item.team_key === teamKey) : -1;
  const income = money(seasonTransactions, 'income');
  const expenses = money(seasonTransactions, 'expense');
  const snapshot = {
    year,
    matches: playerMatches.length,
    wins,
    losses: Math.max(0, playerMatches.length - wins),
    winRate: playerMatches.length ? Math.round((wins / playerMatches.length) * 100) : 0,
    income,
    expenses,
    balance: income - expenses,
    titles,
    tournamentsPlayed: number(profile.tournaments_played),
    upcomingTournaments: seasonTournaments.filter((item) => item.start_date >= profile.career_date).length,
    teamRank: rankingIndex >= 0 ? rankingIndex + 1 : null,
    teamCount: (rankings || []).length,
    completed: Boolean(results?.length),
    result: results?.[0] || null,
  };
  return { ...snapshot, awards: calculateSeasonAwards(snapshot) };
}

export async function getSeasonHistory(profile) {
  const results = await localGame.entities.SeasonResult.filter({ profile_id: profile.id }, '-season_year', 50);
  return results || [];
}

export async function finalizeSeason({ profile, partner, force = false }) {
  const year = dateYear(profile?.career_date) || new Date().getFullYear();
  const monthDay = String(profile?.career_date || '').slice(5);
  if (!force && monthDay && monthDay < '12-15') {
    throw new Error('O encerramento normal fica disponível a partir de 15 de dezembro.');
  }

  const existing = await localGame.entities.SeasonResult.filter({ profile_id: profile.id, season_year: year });
  if (existing?.length) return { alreadyCompleted: true, result: existing[0], updatedProfile: profile };

  const snapshot = await getSeasonSnapshot(profile, year);
  const totals = snapshot.awards.reduce((acc, award) => ({
    coins: acc.coins + number(award.coins),
    xp: acc.xp + number(award.xp),
    rankPoints: acc.rankPoints + number(award.rankPoints),
  }), { coins: 0, xp: 0, rankPoints: 0 });
  const nextYear = year + 1;
  const newXp = number(profile.xp) + totals.xp;
  const nextDate = `${nextYear}-01-01`;

  const result = await localGame.entities.SeasonResult.create({
    profile_id: profile.id,
    season_year: year,
    completed_date: profile.career_date || `${year}-12-31`,
    matches: snapshot.matches,
    wins: snapshot.wins,
    losses: snapshot.losses,
    win_rate: snapshot.winRate,
    titles: snapshot.titles,
    income: snapshot.income,
    expenses: snapshot.expenses,
    balance: snapshot.balance,
    final_team_rank: snapshot.teamRank,
    awards: snapshot.awards,
    bonus_coins: totals.coins,
    bonus_xp: totals.xp,
    bonus_rank_points: totals.rankPoints,
  });

  const previousRankPoints = number(profile.rank_points ?? profile.world_ranking_points, 0);
  const carriedRankPoints = Math.max(0, Math.round(previousRankPoints * 0.80));
  const nextRankPoints = carriedRankPoints + totals.rankPoints;

  const updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, {
    career_date: nextDate,
    coins: number(profile.coins) + totals.coins,
    xp: newXp,
    level: levelForXp(newXp),
    rank_points: nextRankPoints,
    world_ranking_points: nextRankPoints,
    previous_season_rank_points: previousRankPoints,
    ranking_carryover_rate: 0.80,
    season_year: nextYear,
    seasons_completed: number(profile.seasons_completed) + 1,
    season_awards: [...(profile.season_awards || []), ...snapshot.awards.map((award) => `${year}: ${award.label}`)],
    energy: 100,
    fatigue: 0,
    morale: Math.max(70, number(profile.morale, 70)),
  });

  if (partner) {
    await applyTeamRankingSeasonCarryover(profile, partner, 0.80, totals.rankPoints);
  }

  const seasons = await localGame.entities.Season.list('-start_date', 100);
  const currentSeason = (seasons || []).find((item) => item.season_number === year || dateYear(item.start_date) === year);
  if (currentSeason) await localGame.entities.Season.update(currentSeason.id, { is_active: false, status: 'completed' });
  let nextSeason = (seasons || []).find((item) => item.season_number === nextYear || dateYear(item.start_date) === nextYear);
  if (!nextSeason) {
    nextSeason = await localGame.entities.Season.create({
      name: `Temporada ${nextYear}`,
      description: `Circuito profissional de padel ${nextYear}`,
      start_date: `${nextYear}-01-01`,
      end_date: `${nextYear}-12-31`,
      is_active: true,
      status: 'active',
      season_number: nextYear,
    });
  } else {
    await localGame.entities.Season.update(nextSeason.id, { is_active: true, status: 'active' });
  }

  await ensureFutureTournaments(nextDate);
  const summary = `${safeName(profile)} encerrou ${year} com ${snapshot.wins} vitórias, ${snapshot.titles} título(s) e ${snapshot.winRate}% de aproveitamento.`;
  await Promise.allSettled([
    localGame.entities.FinancialTransaction.create({ profile_id: profile.id, date: nextDate, type: 'income', category: 'premiacao_anual', description: `Premiação anual ${year}`, amount: totals.coins }),
    localGame.entities.HistoryEntry.create({ profile_id: profile.id, year, event_date: `${year}-12-31`, title: `Encerramento da temporada ${year}`, description: summary, category: 'temporada' }),
    localGame.entities.CareerMessage.create({ profile_id: profile.id, sender_name: 'Circuito Padel Legacy', subject: `Relatório final de ${year}`, body: `${summary} Bônus: ${totals.coins} moedas, ${totals.xp} XP e ${totals.rankPoints} pontos de ranking.`, status: 'nao_lida', message_type: 'season_report' }),
    localGame.entities.PressArticle.create({ profile_id: profile.id, title: `${safeName(profile)} fecha a temporada ${year}`, content: summary, sentiment: snapshot.winRate >= 60 ? 'positivo' : 'neutro', outlet: 'Padel Legacy News', journalist_name: 'Redação PL', published_date: `${year}-12-31` }),
    localGame.entities.Post.create({ author_name: 'Padel Legacy News', author_type: 'media', content: `📊 ${summary}`, likes: 60 + snapshot.wins * 3, comments_count: 8 + snapshot.titles * 5, created_date: new Date().toISOString() }),
  ]);

  return { snapshot, result, updatedProfile, totals, nextSeason, alreadyCompleted: false };
}
