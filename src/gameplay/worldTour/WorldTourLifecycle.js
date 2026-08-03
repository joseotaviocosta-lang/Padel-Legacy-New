import { localGame } from '@/api/localGameClient.js';
import { resolveWorldTourWeek } from './SeasonScheduler.js';
import { chooseTournament } from './TournamentSelectionAI.js';

const FINISH_POINTS = Object.freeze({
  champion: 1,
  final: 0.72,
  semifinal: 0.52,
  quarterfinal: 0.34,
  r16: 0.20,
  r32: 0.12,
  entry: 0.04,
});

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
  const form = Number(athlete.form || 50);
  const energy = Number(athlete.energy || 80);
  const noise = hash(`${athlete.id}:${tournament.id}`) % 2400 / 100;
  return rating * 1.8 + form * 0.25 + energy * 0.12 + noise;
}

function finishForIndex(index, total) {
  if (index === 0) return 'champion';
  if (index === 1) return 'final';
  if (index < 4) return 'semifinal';
  if (index < 8) return 'quarterfinal';
  if (index < 16) return 'r16';
  if (index < 32) return 'r32';
  return 'entry';
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
    ranking: Number(athlete.world_ranking || athlete.ranking || 999),
    energy: Number(athlete.energy || 80),
    careerStrategy: athlete.career_strategy || athlete.careerStrategy || 'balanced',
    currentRegion: athlete.current_region || athlete.currentRegion || 'global',
  };
}

export async function resolveCompletedWorldTourEvents(careerDate) {
  const [allTournaments, rawAthletes] = await Promise.all([
    localGame.entities.Tournament.list('-start_date', 300),
    localGame.entities.AthleteProfile.list('-world_ranking_points', 300),
  ]);

  const pending = (allTournaments || []).filter((t) => {
    const end = tournamentEndDate(t);
    return end && end < careerDate && t.status !== 'finalizado' && !t.world_tour_resolved;
  });
  if (!pending.length) return { resolved: 0, tournaments: [], rankingUpdates: 0, news: 0 };

  const athletes = (rawAthletes || []).map(normalizeAthlete);
  const tournamentsByWeek = new Map();
  pending.forEach((t) => {
    const key = `${t.year || t.start_date?.slice(0, 4)}:${t.week || t.start_date}`;
    if (!tournamentsByWeek.has(key)) tournamentsByWeek.set(key, []);
    tournamentsByWeek.get(key).push(t);
  });

  const athletePoints = new Map();
  const tournamentUpdates = [];
  const news = [];

  for (const weekTournaments of tournamentsByWeek.values()) {
    const assignments = new Map(weekTournaments.map((t) => [t.id, []]));
    athletes.forEach((athlete) => {
      const choice = chooseTournament(weekTournaments, athlete, {
        strategy: athlete.careerStrategy,
        currentRegion: athlete.currentRegion,
      });
      if (choice?.decision === 'play' && choice.tournament?.id && assignments.has(choice.tournament.id)) {
        assignments.get(choice.tournament.id).push(athlete);
      }
    });

    for (const tournament of weekTournaments) {
      let entrants = assignments.get(tournament.id) || [];
      if (entrants.length < 8) {
        entrants = [...athletes]
          .sort((a, b) => athleteScore(b, tournament) - athleteScore(a, tournament))
          .slice(0, Math.min(Number(tournament.draw_size || 32), 32));
      }
      const ordered = [...entrants].sort((a, b) => athleteScore(b, tournament) - athleteScore(a, tournament));
      const champion = ordered[0];
      const runnerUp = ordered[1] || ordered[0];

      ordered.forEach((athlete, index) => {
        const finish = finishForIndex(index, ordered.length);
        athletePoints.set(athlete.id, (athletePoints.get(athlete.id) || 0) + pointsFor(tournament, finish));
      });

      tournamentUpdates.push({
        id: tournament.id,
        status: 'finalizado',
        current_phase: 'concluido',
        world_tour_resolved: true,
        resolved_at: careerDate,
        champion: champion?.name || 'Dupla não definida',
        runner_up: runnerUp?.name || 'Dupla não definida',
        simulated_entrants: ordered.length,
      });

      news.push({
        event_type: 'tournament_result',
        title: `${champion?.name || 'Uma nova estrela'} conquista o ${tournament.name}`,
        content: `${champion?.name || 'A dupla campeã'} venceu ${runnerUp?.name || 'a finalista'} e levantou o troféu do ${tournament.name}, em ${tournament.location || tournament.city || 'uma etapa do World Tour'}.`,
        author_name: 'Redação Padel Legacy World Tour',
        related_players: [champion?.name, runnerUp?.name].filter(Boolean),
        tier: String(tournament.tier || 'normal').toLowerCase(),
        event_date: tournamentEndDate(tournament),
        likes: 150 + (hash(tournament.id) % 4850),
        tags: ['world-tour', 'resultado', String(tournament.tier || '').toLowerCase()],
        related_tournament_id: tournament.id,
      });

      ordered.slice(0, 8).forEach((athlete) => { athlete.currentRegion = eventRegion(tournament); });
    }
  }

  const athleteUpdates = athletes
    .filter((athlete) => athletePoints.has(athlete.id))
    .map((athlete) => ({
      id: athlete.id,
      world_ranking_points: Number(athlete.world_ranking_points || 0) + athletePoints.get(athlete.id),
      current_region: athlete.currentRegion,
      tournaments_played: Number(athlete.tournaments_played || 0) + 1,
    }));

  if (tournamentUpdates.length) await localGame.entities.Tournament.bulkUpdate(tournamentUpdates);
  if (athleteUpdates.length) await localGame.entities.AthleteProfile.bulkUpdate(athleteUpdates);
  if (news.length) await localGame.entities.WorldEvent.bulkCreate(news);

  const reranked = [...athletes]
    .map((athlete) => ({ ...athlete, points: Number(athlete.world_ranking_points || 0) + (athletePoints.get(athlete.id) || 0) }))
    .sort((a, b) => b.points - a.points)
    .map((athlete, index) => ({ id: athlete.id, world_ranking: index + 1 }));
  if (reranked.length) await localGame.entities.AthleteProfile.bulkUpdate(reranked);

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
