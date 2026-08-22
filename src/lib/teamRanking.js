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


export async function applyTeamRankingSeasonCarryover(profile, partner, carryoverRate = 0.65, bonusPoints = 0) {
  if (!profile?.id || !partner?.id) return null;
  const key = teamKey(profile.id, partner.id);
  try {
    const existing = await localGame.entities.TeamRanking.filter({ team_key: key });
    if (!existing?.length) return null;
    const team = existing[0];
    const carried = Math.max(0, Math.round((Number(team.ranking_points) || 0) * carryoverRate));
    return await localGame.entities.TeamRanking.update(team.id, {
      ranking_points: carried + Math.max(0, Number(bonusPoints) || 0),
      previous_season_points: Number(team.ranking_points) || 0,
      ranking_carryover_rate: carryoverRate,
    });
  } catch (error) {
    console.error('applyTeamRankingSeasonCarryover', error);
    return null;
  }
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
  // Fase 15: a classificação profissional não recebe mais partidas
  // invisíveis semanais. WorldTourLifecycle concede pontos a partir dos
  // torneios reais do calendário e circuitLifecycle projeta esses pontos na
  // tabela de duplas. Mantemos a exportação apenas para compatibilidade.
  return { skipped: true, reason: 'world-tour-is-canonical' };
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
    const [tournaments, registrations, calendarEvents] = await Promise.all([
      localGame.entities.Tournament.list('-created_date', 200),
      localGame.entities.TournamentRegistration.list('-created_date', 300).catch(() => []),
      localGame.entities.CalendarEvent.filter({ status: 'scheduled', event_type: 'tournament' }).catch(() => []),
    ]);
    const activeTournamentIds = new Set([
      ...(registrations || []).filter((item) => ['pending', 'confirmed'].includes(item.status)).map((item) => item.tournament_id),
      ...(calendarEvents || []).filter((event) => {
        const status = event.metadata?.tournament_run?.status;
        return !status || !['eliminated', 'champion', 'finished'].includes(status);
      }).map((event) => event.related_id),
    ].filter(Boolean));
    const needsSimulation = tournaments.filter(t => {
      if (activeTournamentIds.has(t.id)) return false;
      // Eventos do circuito mundial pertencem exclusivamente ao
      // WorldTourLifecycle. O simulador legado fica restrito a calendários
      // antigos sem essa marca e não pode sobrescrever campeão nem pontos.
      if (t.world_tour_event) return false;
      if (t.champion) return false;
      if (t.status === 'finalizado') return false;
      // A data canônica vence o fallback legado de mês. Sem isso, uma
      // edição de janeiro do ano seguinte podia ser simulada em junho.
      if (t.start_date) return t.start_date < careerDate;
      if ((t.month || 0) < currentMonth) return true;
      return false;
    });

    if (needsSimulation.length === 0) return;

    // Antes, cada torneio pendente disparava seu próprio Tournament.update
    // MAIS dois addTeamRankingPoints e um addTeamTitle individuais (cada um
    // com sua própria leitura + escrita) — em meses com vários torneios
    // acumulados isso chegava a dezenas de escritas completas do save.
    // Acumula tudo (torneios e patches de dupla) e grava em no máximo duas
    // transações ao final.
    const existingTeams = (await localGame.entities.TeamRanking.list('-ranking_points', 500)) || [];
    const teamsByKey = new Map(existingTeams.map((team) => [team.team_key, team]));
    const teamPatches = new Map(); // team_key -> operação acumulada

    const applyTeamPoints = (teamA, teamB, points) => {
      if (!teamA?.id || !teamB?.id) return;
      const key = teamKey(teamA.id, teamB.id);
      const pending = teamPatches.get(key);
      if (pending) {
        pending.data.ranking_points = (pending.data.ranking_points || 0) + points;
        return;
      }
      const existing = teamsByKey.get(key);
      if (existing?.id) {
        teamPatches.set(key, { type: 'update', entityName: 'TeamRanking', id: existing.id, data: { ranking_points: (existing.ranking_points || 0) + points } });
      } else {
        const [p1, p2] = [teamA, teamB].sort((a, b) => a.id.localeCompare(b.id));
        teamPatches.set(key, {
          type: 'create',
          entityName: 'TeamRanking',
          data: {
            team_key: key, player1_id: p1.id, player1_name: p1.sport_name || p1.name,
            player2_id: p2.id, player2_name: p2.sport_name || p2.name,
            ranking_points: points, matches_played: 0, wins: 0, losses: 0, titles: [],
          },
        });
      }
    };
    const applyTeamTitle = (teamA, teamB, title) => {
      if (!teamA?.id || !teamB?.id) return;
      const key = teamKey(teamA.id, teamB.id);
      const pending = teamPatches.get(key);
      if (pending) {
        pending.data.titles = [...(pending.data.titles || teamsByKey.get(key)?.titles || []), title];
        return;
      }
      const existing = teamsByKey.get(key);
      if (existing?.id) {
        teamPatches.set(key, { type: 'update', entityName: 'TeamRanking', id: existing.id, data: { titles: [...(existing.titles || []), title] } });
      }
    };

    const tournamentUpdates = [];
    for (const t of needsSimulation) {
      const { champion: champTeam, runnerUp, history } = simulateTournamentBracket(PRO_TEAMS);

      const champName = `${champTeam[0].name} & ${champTeam[1].name}`;
      const mult = TIER_MULT[t.tier] || 1;

      tournamentUpdates.push({
        id: t.id,
        status: 'finalizado',
        champion: champName,
        runner_up: teamName(runnerUp),
        bracket_history: history,
        current_phase: 'concluido',
      });

      applyTeamPoints(champTeam[0], champTeam[1], Math.round(CHAMP_RANK_POINTS * mult));
      applyTeamPoints(runnerUp[0], runnerUp[1], Math.round(RUNNER_RANK_POINTS * mult));
      applyTeamTitle(champTeam[0], champTeam[1], t.name);
    }
    if (tournamentUpdates.length) {
      await localGame.entities.Tournament.bulkUpdate(tournamentUpdates);
    }
    if (teamPatches.size) {
      await localGame.batch([...teamPatches.values()]);
    }
  } catch (e) { console.error('simulatePastTournaments', e); }
}
