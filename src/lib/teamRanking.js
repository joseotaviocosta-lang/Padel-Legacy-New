import { localGame } from '@/api/localGameClient.js';
import { BOTS_BY_DIFFICULTY, simulateMatch } from '@/lib/bots';

const PRO_TEAMS = [];
for (let i = 0; i < 10; i += 2) {
  PRO_TEAMS.push([BOTS_BY_DIFFICULTY.lenda[i], BOTS_BY_DIFFICULTY.lenda[i + 1]]);
}
for (let i = 0; i < 10; i += 2) {
  PRO_TEAMS.push([BOTS_BY_DIFFICULTY.elite[i], BOTS_BY_DIFFICULTY.elite[i + 1]]);
}
for (let i = 0; i < 10; i += 2) {
  PRO_TEAMS.push([BOTS_BY_DIFFICULTY.avancado[i], BOTS_BY_DIFFICULTY.avancado[i + 1]]);
}

export function teamKey(id1, id2) {
  return [id1, id2].sort().join('_');
}

export async function updateTeamRanking(profile, partner, won, bonusPoints = 0) {
  if (!profile?.id || !partner?.id) return;

  const key = teamKey(profile.id, partner.id);
  const basePoints = won ? 50 : 20;
  const totalPoints = basePoints + bonusPoints;

  try {
    const existing = await localGame.entities.TeamRanking.filter({ team_key: key });

    if (existing && existing.length > 0) {
      const team = existing[0];
      await localGame.entities.TeamRanking.update(team.id, {
        ranking_points: (team.ranking_points || 0) + totalPoints,
        matches_played: (team.matches_played || 0) + 1,
        wins: (team.wins || 0) + (won ? 1 : 0),
        losses: (team.losses || 0) + (won ? 0 : 1),
      });
    } else {
      const [p1, p2] = [profile, partner].sort((a, b) => a.id.localeCompare(b.id));
      await localGame.entities.TeamRanking.create({
        team_key: key,
        player1_id: p1.id,
        player1_name: p1.sport_name || p1.name,
        player2_id: p2.id,
        player2_name: p2.sport_name || p2.name,
        ranking_points: totalPoints,
        matches_played: 1,
        wins: won ? 1 : 0,
        losses: won ? 0 : 1,
        titles: [],
      });
    }
  } catch (e) { console.error('updateTeamRanking', e); }
}

export async function addTeamTitle(profile, partner, title) {
  if (!profile?.id || !partner?.id) return;

  const key = teamKey(profile.id, partner.id);
  try {
    const existing = await localGame.entities.TeamRanking.filter({ team_key: key });
    if (existing && existing.length > 0) {
      const team = existing[0];
      await localGame.entities.TeamRanking.update(team.id, {
        titles: [...(team.titles || []), title],
      });
    }
  } catch (e) { console.error('addTeamTitle', e); }
}

export async function addTeamRankingPoints(profile, partner, points) {
  if (!profile?.id || !partner?.id) return;
  const key = teamKey(profile.id, partner.id);
  try {
    const existing = await localGame.entities.TeamRanking.filter({ team_key: key });
    if (existing && existing.length > 0) {
      const team = existing[0];
      await localGame.entities.TeamRanking.update(team.id, {
        ranking_points: (team.ranking_points || 0) + points,
      });
    } else {
      const [p1, p2] = [profile, partner].sort((a, b) => a.id.localeCompare(b.id));
      await localGame.entities.TeamRanking.create({
        team_key: key,
        player1_id: p1.id,
        player1_name: p1.sport_name || p1.name,
        player2_id: p2.id,
        player2_name: p2.sport_name || p2.name,
        ranking_points: points,
        matches_played: 0,
        wins: 0,
        losses: 0,
        titles: [],
      });
    }
  } catch (e) { console.error('addTeamRankingPoints', e); }
}

export async function getTeamRankings(limit = 50) {
  try {
    return await localGame.entities.TeamRanking.list('-ranking_points', Math.max(limit, 600));
  } catch (e) { return []; }
}

export async function getTeamRank(profile, partner) {
  if (!profile?.id || !partner?.id) return { rank: 0, total: 0, points: 0, unranked: true };
  const rankings = await getTeamRankings(600);
  const key = teamKey(profile.id, partner.id);
  const own = rankings.find(t => t.team_key === key);
  const points = Math.max(0, Number(own?.ranking_points) || 0);
  const rankedCompetitors = rankings.filter(t => t.team_key !== key && Math.max(0, Number(t.ranking_points) || 0) > 0);
  const rank = rankedCompetitors.filter(t => Number(t.ranking_points || 0) > points).length + 1;
  const unranked = points <= 0 || Math.max(0, Number(own?.matches_played) || 0) <= 0;
  return { rank, total: rankedCompetitors.length + 1, points, unranked, displayRank: String(rank) };
}

export async function simulateProRankingWeek() {
  const shuffled = [...PRO_TEAMS].sort(() => Math.random() - 0.5);
  for (let i = 0; i < shuffled.length - 1; i += 2) {
    const teamA = shuffled[i];
    const teamB = shuffled[i + 1];
    const result = simulateMatch(teamA, teamB);
    const aWon = result.winner === 'A';
    await updateTeamRanking(teamA[0], teamA[1], aWon);
    await updateTeamRanking(teamB[0], teamB[1], !aWon);
  }
}

// Runs a single-elimination bracket using the match engine — stronger teams
// advance naturally via the sigmoid win probability, so favorites win often.
function teamName(team) {
  return `${team?.[0]?.name || 'Jogador 1'} & ${team?.[1]?.name || 'Jogador 2'}`;
}

function syntheticScore(result, roundIndex, matchIndex) {
  const seed = Math.abs((result?.setsA || 0) * 31 + (result?.setsB || 0) * 17 + roundIndex * 13 + matchIndex * 7);
  const close = seed % 3 === 0;
  return result?.winner === 'A'
    ? (close ? '6-4 4-6 6-3' : '6-3 6-4')
    : (close ? '4-6 6-4 3-6' : '3-6 4-6');
}

function simulateTournamentBracket(teams) {
  let bracket = [...teams].sort(() => Math.random() - 0.5);
  let runnerUp = null;
  const history = [];
  let roundIndex = 0;

  while (bracket.length > 1) {
    const nextRound = [];
    const pairs = Math.floor(bracket.length / 2);
    const hasBye = bracket.length % 2 === 1;
    const roundMatches = [];

    for (let i = 0; i < pairs; i++) {
      const teamA = bracket[i * 2];
      const teamB = bracket[i * 2 + 1];
      const result = simulateMatch(teamA, teamB);
      const winner = result.winner === 'A' ? teamA : teamB;
      const loser = result.winner === 'A' ? teamB : teamA;
      nextRound.push(winner);
      if (bracket.length === 2) runnerUp = loser;

      roundMatches.push({
        team_a: teamName(teamA),
        team_b: teamName(teamB),
        winner: teamName(winner),
        score: syntheticScore(result, roundIndex, i),
      });
    }
    if (hasBye) nextRound.push(bracket[bracket.length - 1]);

    const roundName = bracket.length === 2
      ? 'Final'
      : bracket.length === 4
        ? 'Semifinais'
        : bracket.length === 8
          ? 'Quartas de final'
          : `Rodada de ${bracket.length}`;
    history.push({ round: roundName, matches: roundMatches });
    bracket = nextRound;
    roundIndex += 1;
  }
  return { champion: bracket[0], runnerUp: runnerUp || bracket[0], history };
}

// Simulates champions for past tournaments the player didn't win.
// Updates tournament records, team rankings, and feeds results to the journal.
const TIER_MULT = { Silver:0.28, Gold:0.65, Platinum:1.15, Masters:2.1, Elite:3.2, Crown:5 };
const CHAMP_RANK_POINTS = 200;
const RUNNER_RANK_POINTS = 85;

export async function simulatePastTournaments(careerDate) {
  if (!careerDate) return;
  const currentMonth = new Date(careerDate + 'T00:00:00').getMonth() + 1;

  try {
    const tournaments = await localGame.entities.Tournament.list('-created_date', 200);
    const needsSimulation = tournaments.filter(t => {
      if (t.champion) return false;
      if (t.status === 'finalizado') return false;
      if (t.start_date && t.start_date < careerDate) return true;
      if ((t.month || 0) < currentMonth) return true;
      return false;
    });

    if (needsSimulation.length === 0) return;

    for (const t of needsSimulation) {
      const { champion: champTeam, runnerUp, history } = simulateTournamentBracket(PRO_TEAMS);

      const champName = `${champTeam[0].name} & ${champTeam[1].name}`;
      const mult = TIER_MULT[t.tier] || 1;

      await localGame.entities.Tournament.update(t.id, {
        status: 'finalizado',
        champion: champName,
        runner_up: teamName(runnerUp),
        bracket_history: history,
        current_phase: 'concluido',
      });

      await addTeamRankingPoints(champTeam[0], champTeam[1], Math.round(CHAMP_RANK_POINTS * mult));
      await addTeamRankingPoints(runnerUp[0], runnerUp[1], Math.round(RUNNER_RANK_POINTS * mult));
      await addTeamTitle(champTeam[0], champTeam[1], t.name);
    }
  } catch (e) { console.error('simulatePastTournaments', e); }
}