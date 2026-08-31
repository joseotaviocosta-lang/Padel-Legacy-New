import { localGame } from '@/api/localGameClient.js';
import { chooseTournament } from './TournamentSelectionAI.js';

const entities = /** @type {any} */ (localGame.entities);

const FINISH_POINTS = Object.freeze({ champion: 1, final: 0.72, semifinal: 0.52, quarterfinal: 0.34, r16: 0.20, r32: 0.12, entry: 0.04 });

function hash(value = '') {
  let h = 2166136261;
  for (let i = 0; i < String(value).length; i += 1) {
    h ^= String(value).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function athleteScore(athlete, tournament) {
  const rating = Number(athlete.overall_rating || athlete.overall || 50);
  const form = Number(athlete.form || athlete.current_form || 50);
  const energy = Number(athlete.energy || 80);
  return rating * 1.8 + form * 0.25 + energy * 0.12 + (hash(`${athlete.id}:${tournament.id}`) % 2400) / 100;
}

function pairScore(pair, tournament) {
  const base = pair.athletes.reduce((sum, athlete) => sum + athleteScore(athlete, tournament), 0) / pair.athletes.length;
  return base + Number(pair.chemistry || 50) * 0.08 + (hash(`${pair.id}:${tournament.id}:pair`) % 900) / 100;
}

function finishForIndex(index) {
  if (index === 0) return 'champion';
  if (index === 1) return 'final';
  if (index < 4) return 'semifinal';
  if (index < 8) return 'quarterfinal';
  if (index < 16) return 'r16';
  if (index < 32) return 'r32';
  return 'entry';
}

function winsForFinish(finish) {
  return ({ champion: 5, final: 4, semifinal: 3, quarterfinal: 2, r16: 1, r32: 0, entry: 0 })[finish] || 0;
}

function addHeadToHead(rows, opponent, won, tournamentId, date) {
  if (!opponent?.id) return Array.isArray(rows) ? rows : [];
  const nextRows = [...(Array.isArray(rows) ? rows : [])];
  const index = nextRows.findIndex((row) => row.opponent_id === opponent.id);
  const current = index >= 0 ? nextRows[index] : { opponent_id: opponent.id, opponent_name: opponent.name, meetings: 0, wins: 0, losses: 0 };
  const next = {
    ...current,
    opponent_name: opponent.name,
    meetings: Number(current.meetings || 0) + 1,
    wins: Number(current.wins || 0) + (won ? 1 : 0),
    losses: Number(current.losses || 0) + (won ? 0 : 1),
    last_tournament_id: tournamentId,
    last_meeting_date: date,
  };
  if (index >= 0) nextRows[index] = next;
  else nextRows.push(next);
  return nextRows.sort((a, b) => Number(b.meetings || 0) - Number(a.meetings || 0)).slice(0, 16);
}

function pointsFor(tournament, finish) {
  return Math.round(Number(tournament.rank_points || tournament.ranking_points || 0) * (FINISH_POINTS[finish] || FINISH_POINTS.entry));
}

function tournamentEndDate(tournament) {
  return tournament.end_date || tournament.start_date;
}

function eventRegion(tournament) {
  return tournament.region || tournament.continent || tournament.country || tournament.location || 'global';
}

function normalizeAthlete(athlete) {
  return {
    ...athlete,
    ranking: Number(athlete.world_ranking || athlete.ranking_position || athlete.ranking || 999),
    energy: Number(athlete.energy || 80),
    careerStrategy: athlete.career_strategy || athlete.careerStrategy || 'balanced',
    currentRegion: athlete.current_region || athlete.currentRegion || 'global',
  };
}

function partnershipAthleteIds(partnership) {
  return [partnership.athlete_a_id || partnership.participant_a_id, partnership.athlete_b_id || partnership.participant_b_id].filter(Boolean);
}

function buildCanonicalPairs(partnerships, athletes) {
  const byId = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  const seen = new Set();
  const pairs = [];
  for (const partnership of partnerships || []) {
    if (partnership.status !== 'ativa') continue;
    if (partnership.partnership_type && partnership.partnership_type !== 'npc' && partnership.scope !== 'world') continue;
    const ids = partnershipAthleteIds(partnership);
    if (ids.length !== 2 || ids[0] === ids[1] || ids.some((id) => !byId.has(id) || seen.has(id))) continue;
    const members = ids.map((id) => byId.get(id));
    members.forEach((member) => seen.add(member.id));
    pairs.push({
      id: partnership.id || [...ids].sort().join(':'),
      partnershipId: partnership.id,
      athletes: members,
      name: members.map((member) => member.name).join(' & '),
      chemistry: Number(partnership.chemistry || partnership.partner_chemistry || 50),
    });
  }
  return pairs;
}

function appendFinalHeadToHead(headToHeadByAthlete, winner, loser, tournament) {
  if (!winner || !loser) return;
  const date = tournamentEndDate(tournament);
  for (const athlete of winner.athletes) {
    let rows = headToHeadByAthlete.get(athlete.id) || athlete.head_to_head || [];
    for (const opponent of loser.athletes) rows = addHeadToHead(rows, opponent, true, tournament.id, date);
    headToHeadByAthlete.set(athlete.id, rows);
  }
  for (const athlete of loser.athletes) {
    let rows = headToHeadByAthlete.get(athlete.id) || athlete.head_to_head || [];
    for (const opponent of winner.athletes) rows = addHeadToHead(rows, opponent, false, tournament.id, date);
    headToHeadByAthlete.set(athlete.id, rows);
  }
}

export async function resolveCompletedWorldTourEvents(careerDate) {
  const [allTournaments, rawAthletes, partnerships] = await Promise.all([
    entities.Tournament.list('-start_date', 300),
    entities.AthleteProfile.list('-world_ranking_points', 1000),
    entities.Partnership.list('-created_date', 1200).catch(() => []),
  ]);

  const pending = (allTournaments || []).filter((tournament) => {
    const end = tournamentEndDate(tournament);
    return tournament.world_tour_event && end && end < careerDate && tournament.status !== 'finalizado' && !tournament.world_tour_resolved;
  });
  if (!pending.length) return { resolved: 0, tournaments: [], rankingUpdates: 0, news: 0 };

  const athletes = (rawAthletes || []).map(normalizeAthlete).filter((athlete) => !athlete.retired && athlete.career_status !== 'aposentado');
  const pairs = buildCanonicalPairs(partnerships, athletes);
  if (!pairs.length) return { resolved: 0, tournaments: [], rankingUpdates: 0, news: 0, waitingForCanonicalPairs: true };

  const tournamentsByWeek = new Map();
  pending.forEach((tournament) => {
    const key = `${tournament.year || tournament.start_date?.slice(0, 4)}:${tournament.week || tournament.start_date}`;
    if (!tournamentsByWeek.has(key)) tournamentsByWeek.set(key, []);
    tournamentsByWeek.get(key).push(tournament);
  });

  const athletePoints = new Map();
  const athleteOutcomes = new Map();
  const headToHeadByAthlete = new Map();
  const tournamentUpdates = [];
  const news = [];

  for (const weekTournaments of tournamentsByWeek.values()) {
    const assignments = new Map(weekTournaments.map((tournament) => [tournament.id, []]));
    for (const pair of pairs) {
      const representative = {
        ...pair.athletes[0],
        overall_rating: pair.athletes.reduce((sum, athlete) => sum + Number(athlete.overall_rating || athlete.overall || 50), 0) / 2,
      };
      const choice = chooseTournament(weekTournaments, representative, {
        strategy: representative.careerStrategy,
        currentRegion: representative.currentRegion,
      });
      if (choice?.decision === 'play' && choice.tournament?.id && assignments.has(choice.tournament.id)) assignments.get(choice.tournament.id).push(pair);
    }

    for (const tournament of weekTournaments) {
      const drawSize = Math.max(2, Math.min(Number(tournament.draw_size || 32), 32));
      let entrants = [...(assignments.get(tournament.id) || [])];
      if (entrants.length < 2) {
        const present = new Set(entrants.map((pair) => pair.id));
        entrants = [...entrants, ...pairs.filter((pair) => !present.has(pair.id))
          .sort((a, b) => pairScore(b, tournament) - pairScore(a, tournament))
          .slice(0, 2 - entrants.length)];
      }
      const ordered = entrants
        .sort((a, b) => pairScore(b, tournament) - pairScore(a, tournament))
        .slice(0, drawSize);
      if (ordered.length < 2) continue;
      const champion = ordered[0];
      const runnerUp = ordered[1];

      ordered.forEach((pair, index) => {
        const finish = finishForIndex(index);
        const points = pointsFor(tournament, finish);
        pair.athletes.forEach((athlete) => {
          athletePoints.set(athlete.id, (athletePoints.get(athlete.id) || 0) + points);
          if (!athleteOutcomes.has(athlete.id)) athleteOutcomes.set(athlete.id, []);
          athleteOutcomes.get(athlete.id).push({
            tournament_id: tournament.id,
            tournament_name: tournament.name,
            date: tournamentEndDate(tournament),
            finish,
            points,
            won: finish === 'champion',
            partnership_id: pair.partnershipId,
            partner_id: pair.athletes.find((member) => member.id !== athlete.id)?.id,
            pair_name: pair.name,
          });
        });
      });

      appendFinalHeadToHead(headToHeadByAthlete, champion, runnerUp, tournament);
      tournamentUpdates.push({
        id: tournament.id,
        status: 'finalizado',
        current_phase: 'concluido',
        world_tour_resolved: true,
        resolved_at: careerDate,
        champion: champion.name,
        runner_up: runnerUp.name,
        champion_partnership_id: champion.partnershipId,
        runner_up_partnership_id: runnerUp.partnershipId,
        simulated_entrants: ordered.length,
      });

      news.push({
        event_type: 'tournament_result',
        title: `${champion.name} conquista o ${tournament.name}`,
        content: `${champion.name} venceu ${runnerUp.name} na final e levantou o troféu do ${tournament.name}, em ${tournament.location || tournament.city || 'uma etapa do World Tour'}.`,
        author_name: 'Redação Padel Legacy World Tour',
        related_players: [...champion.athletes, ...runnerUp.athletes].map((athlete) => athlete.name),
        tier: String(tournament.tier || 'normal').toLowerCase(),
        event_date: tournamentEndDate(tournament),
        likes: 150 + (hash(tournament.id) % 4850),
        tags: ['world-tour', 'resultado', String(tournament.tier || '').toLowerCase()],
        related_tournament_id: tournament.id,
      });

      ordered.slice(0, 8).flatMap((pair) => pair.athletes).forEach((athlete) => { athlete.currentRegion = eventRegion(tournament); });
    }
  }

  const athleteUpdates = athletes.filter((athlete) => athletePoints.has(athlete.id)).map((athlete) => {
    const outcomes = athleteOutcomes.get(athlete.id) || [];
    const points = Number(athlete.world_ranking_points || athlete.ranking_points || 0) + athletePoints.get(athlete.id);
    // Correção UI/cronologia — Fase 3: race_points é a temporada (Race) EM
    // ANDAMENTO, separada do Circuito acumulado acima. Reaproveita o mesmo
    // ganho de pontos já calculado (athletePoints) em vez de recalcular —
    // cresce junto com o Circuito conforme torneios reais são disputados,
    // mas é zerada isoladamente na virada do ano (ver annualCareerReportLifecycle.js).
    const racePoints = Math.max(0, Number(athlete.race_points) || 0) + athletePoints.get(athlete.id);
    return {
      id: athlete.id,
      world_ranking_points: points,
      ranking_points: points,
      race_points: racePoints,
      current_region: athlete.currentRegion,
      tournaments_played: Number(athlete.tournaments_played || 0) + outcomes.length,
      career_wins: Number(athlete.career_wins || 0) + outcomes.reduce((sum, item) => sum + winsForFinish(item.finish), 0),
      career_losses: Number(athlete.career_losses || 0) + outcomes.filter((item) => item.finish !== 'champion').length,
      career_titles: Number(athlete.career_titles || 0) + outcomes.filter((item) => item.finish === 'champion').length,
      recent_results: [...(Array.isArray(athlete.recent_results) ? athlete.recent_results : []), ...outcomes].slice(-12),
      ...(headToHeadByAthlete.has(athlete.id) ? { head_to_head: headToHeadByAthlete.get(athlete.id) } : {}),
    };
  });

  if (tournamentUpdates.length) await entities.Tournament.bulkUpdate(tournamentUpdates);
  if (athleteUpdates.length) await entities.AthleteProfile.bulkUpdate(athleteUpdates);
  if (news.length) await entities.WorldEvent.bulkCreate(news);

  const reranked = [...athletes]
    .map((athlete) => ({ ...athlete, points: Number(athlete.world_ranking_points || athlete.ranking_points || 0) + (athletePoints.get(athlete.id) || 0) }))
    .sort((a, b) => b.points - a.points)
    .map((athlete, index) => ({ id: athlete.id, world_ranking: index + 1, ranking_position: index + 1 }));
  if (reranked.length) await entities.AthleteProfile.bulkUpdate(reranked);

  return { resolved: tournamentUpdates.length, tournaments: tournamentUpdates, rankingUpdates: athleteUpdates.length, news: news.length };
}

export async function processWorldTourDay(careerDate) {
  try {
    return await resolveCompletedWorldTourEvents(careerDate);
  } catch (error) {
    console.error('processWorldTourDay', error);
    return { resolved: 0, tournaments: [], rankingUpdates: 0, news: 0, error: error.message };
  }
}
