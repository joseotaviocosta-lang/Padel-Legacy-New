import { localGame } from '@/api/localGameClient.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hash(text) {
  let value = 2166136261;
  for (const char of String(text || '')) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function integer(seed, min, max) {
  return min + (hash(seed) % (max - min + 1));
}

function weekKey(date) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(date || '');
  const first = new Date(parsed.getFullYear(), 0, 1);
  const days = Math.floor((parsed - first) / 86400000);
  return `${parsed.getFullYear()}-W${String(Math.ceil((days + first.getDay() + 1) / 7)).padStart(2, '0')}`;
}

function athleteOverall(athlete) {
  return clamp(athlete?.overall_rating ?? athlete?.overall ?? 55, 1, 99);
}

function isRetired(athlete) {
  const status = String(athlete?.status || athlete?.market_status || '').toLowerCase();
  return athlete?.retired === true || status === 'aposentado' || status === 'retired';
}

function categoryFor(points, overall) {
  if (points >= 9000 || overall >= 92) return 'Crown';
  if (points >= 5000 || overall >= 86) return 'Elite';
  if (points >= 2500 || overall >= 80) return 'Masters';
  if (points >= 1100 || overall >= 72) return 'Platinum';
  if (points >= 400 || overall >= 64) return 'Gold';
  return 'Silver';
}

function weeklyResult(athlete, currentDate) {
  const overall = athleteOverall(athlete);
  const form = clamp(athlete?.form ?? athlete?.current_form ?? 60, 0, 100);
  const fatigue = clamp(athlete?.fatigue ?? 15, 0, 100);
  const seed = `${athlete.id}:${currentDate}:circuit`;
  const performance = overall * 0.62 + form * 0.28 - fatigue * 0.12 + integer(`${seed}:variance`, -12, 12);
  const wonEvent = performance >= 83 && integer(`${seed}:title`, 0, 99) < Math.max(4, performance - 72);
  const reachedFinal = wonEvent || performance >= 76;
  const reachedSemi = reachedFinal || performance >= 68;
  const wonMatches = wonEvent ? integer(`${seed}:wins`, 4, 6) : reachedFinal ? integer(`${seed}:wins`, 3, 5) : reachedSemi ? integer(`${seed}:wins`, 2, 4) : integer(`${seed}:wins`, 0, 2);
  const lostMatches = wonEvent ? 0 : 1;
  const pointsGain = wonEvent
    ? integer(`${seed}:points`, 500, 1000)
    : reachedFinal
      ? integer(`${seed}:points`, 260, 520)
      : reachedSemi
        ? integer(`${seed}:points`, 120, 300)
        : integer(`${seed}:points`, 15, 110);
  const prizeMoney = wonEvent
    ? integer(`${seed}:prize`, 18000, 55000)
    : reachedFinal
      ? integer(`${seed}:prize`, 8000, 22000)
      : reachedSemi
        ? integer(`${seed}:prize`, 3000, 10000)
        : integer(`${seed}:prize`, 250, 3500);
  return { performance, wonEvent, reachedFinal, reachedSemi, wonMatches, lostMatches, pointsGain, prizeMoney };
}

async function createWorldEvent(payload) {
  try {
    if (!localGame.entities?.WorldEvent?.create) return null;
    return await localGame.entities.WorldEvent.create({
      author_name: 'Padel Legacy News',
      related_players: [],
      tier: 'normal',
      likes: 0,
      tags: ['circuito'],
      ...payload,
    });
  } catch (error) {
    console.warn('[Game Core 2.4] Evento mundial não criado:', error?.message || error);
    return null;
  }
}

async function updateTeamRankings(athletes, currentDate) {
  if (!localGame.entities?.TeamRanking?.list || !localGame.entities?.TeamRanking?.create) return { processed: 0 };
  const byId = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  const existing = (await localGame.entities.TeamRanking.list('-ranking_points', 500)) || [];
  const byKey = new Map(existing.map((team) => [team.team_key, team]));
  const processed = new Set();
  let count = 0;

  for (const athlete of athletes) {
    const partnerId = athlete.ai_partner_id;
    if (!partnerId || !byId.has(partnerId)) continue;
    const key = [athlete.id, partnerId].sort().join('_');
    if (processed.has(key)) continue;
    processed.add(key);
    const partner = byId.get(partnerId);
    const points = Math.round((safeNumber(athlete.world_ranking_points, 0) + safeNumber(partner.world_ranking_points, 0)) / 2);
    const payload = {
      team_key: key,
      player1_id: athlete.id,
      player1_name: athlete.name,
      player2_id: partner.id,
      player2_name: partner.name,
      ranking_points: points,
      matches_played: safeNumber(athlete.career_wins, 0) + safeNumber(athlete.career_losses, 0),
      wins: Math.min(safeNumber(athlete.career_wins, 0), safeNumber(partner.career_wins, 0)),
      losses: Math.max(safeNumber(athlete.career_losses, 0), safeNumber(partner.career_losses, 0)),
      titles: Array.from({ length: Math.min(safeNumber(athlete.career_titles, 0), safeNumber(partner.career_titles, 0)) }, (_, index) => `Título ${index + 1}`),
      season_id: currentDate.slice(0, 4),
    };
    const current = byKey.get(key);
    if (current?.id && localGame.entities.TeamRanking.update) await localGame.entities.TeamRanking.update(current.id, payload);
    else await localGame.entities.TeamRanking.create(payload);
    count += 1;
  }
  return { processed: count };
}

export async function processWorldCircuit(profile, previousDate, currentDate) {
  const currentWeek = weekKey(currentDate);
  if (!currentWeek || profile?.last_circuit_week === currentWeek) {
    return { profile, skipped: true, week: currentWeek, athletesProcessed: 0, events: [] };
  }

  const athletes = ((await localGame.entities.AthleteProfile.list('ranking_position', 500)) || [])
    .filter((athlete) => athlete?.id && !isRetired(athlete));

  const selected = athletes
    .sort((a, b) => athleteOverall(b) - athleteOverall(a))
    .slice(0, 160);

  const results = [];
  for (const athlete of selected) {
    const result = weeklyResult(athlete, currentDate);
    const oldGeneral = Math.max(0, safeNumber(athlete.world_ranking_points ?? athlete.ranking_points, athleteOverall(athlete) * 25));
    const oldRace = Math.max(0, safeNumber(athlete.race_points, 0));
    const decay = Math.round(oldGeneral * 0.012);
    const generalPoints = Math.max(0, oldGeneral - decay + result.pointsGain);
    const racePoints = oldRace + result.pointsGain;
    const history = Array.isArray(athlete.ranking_history) ? athlete.ranking_history.slice(-51) : [];
    history.push({ date: currentDate, week: currentWeek, points: generalPoints, race_points: racePoints, gained: result.pointsGain, decayed: decay });
    results.push({ athlete, result, generalPoints, racePoints, history });
  }

  const ordered = [...results].sort((a, b) => b.generalPoints - a.generalPoints);
  const raceOrdered = [...results].sort((a, b) => b.racePoints - a.racePoints);
  const racePositions = new Map(raceOrdered.map((entry, index) => [entry.athlete.id, index + 1]));

  for (let index = 0; index < ordered.length; index += 1) {
    const entry = ordered[index];
    const athlete = entry.athlete;
    const oldPosition = safeNumber(athlete.ranking_position, index + 1);
    const newPosition = index + 1;
    const age = safeNumber(athlete.age, 24);
    let careerPhase = athlete.career_phase || 'Ascensão';
    if (age >= 35) careerPhase = 'Veterano';
    else if (age >= 31) careerPhase = 'Declínio';
    else if (age >= safeNumber(athlete.peak_age, 28) - 1) careerPhase = 'Auge';

    await localGame.entities.AthleteProfile.update(athlete.id, {
      world_ranking_points: entry.generalPoints,
      ranking_points: entry.generalPoints,
      race_points: entry.racePoints,
      ranking_position: newPosition,
      race_position: racePositions.get(athlete.id),
      ranking_previous_position: oldPosition,
      ranking_trend: newPosition < oldPosition ? 'subindo' : newPosition > oldPosition ? 'caindo' : 'estavel',
      circuit_category: categoryFor(entry.generalPoints, athleteOverall(athlete)),
      ranking_history: entry.history,
      career_wins: safeNumber(athlete.career_wins, 0) + entry.result.wonMatches,
      career_losses: safeNumber(athlete.career_losses, 0) + entry.result.lostMatches,
      career_titles: safeNumber(athlete.career_titles, 0) + (entry.result.wonEvent ? 1 : 0),
      prize_money_total: safeNumber(athlete.prize_money_total, 0) + entry.result.prizeMoney,
      wealth: safeNumber(athlete.wealth, 0) + entry.result.prizeMoney,
      career_phase: careerPhase,
      last_circuit_update: currentDate,
    });
  }

  const events = [];
  const champion = results.filter((entry) => entry.result.wonEvent).sort((a, b) => b.result.performance - a.result.performance)[0];
  if (champion) {
    const event = await createWorldEvent({
      event_type: 'noticia',
      title: `${champion.athlete.name} conquista título no circuito`,
      content: `${champion.athlete.name} venceu o principal torneio da semana e somou ${champion.result.pointsGain.toLocaleString('pt-BR')} pontos no ranking mundial.`,
      related_players: [champion.athlete.name],
      tier: athleteOverall(champion.athlete) >= 88 ? 'destaque' : 'normal',
      event_date: currentDate,
      tags: ['circuito', 'campeão', champion.athlete.country || champion.athlete.nationality || 'internacional'],
    });
    if (event) events.push(event);
  }

  const newNumberOne = ordered[0];
  if (newNumberOne && safeNumber(newNumberOne.athlete.ranking_position, 99) !== 1) {
    const event = await createWorldEvent({
      event_type: 'ranking',
      title: `${newNumberOne.athlete.name} assume o número 1 do mundo`,
      content: `Com ${newNumberOne.generalPoints.toLocaleString('pt-BR')} pontos, ${newNumberOne.athlete.name} chegou ao topo do ranking mundial.`,
      related_players: [newNumberOne.athlete.name],
      tier: 'breaking',
      event_date: currentDate,
      tags: ['ranking', 'número 1'],
    });
    if (event) events.push(event);
  }

  const upset = results
    .filter((entry) => athleteOverall(entry.athlete) <= 72 && entry.result.reachedFinal)
    .sort((a, b) => b.result.performance - a.result.performance)[0];
  if (upset) {
    const event = await createWorldEvent({
      event_type: 'promessa',
      title: `Grande surpresa: ${upset.athlete.name} brilha no circuito`,
      content: `${upset.athlete.name} superou as expectativas, chegou às fases decisivas e ganhou ${upset.result.pointsGain} pontos.`,
      related_players: [upset.athlete.name],
      tier: 'destaque',
      event_date: currentDate,
      tags: ['zebra', 'promessa', 'circuito'],
    });
    if (event) events.push(event);
  }

  const teamRanking = await updateTeamRankings(ordered.map((entry) => ({ ...entry.athlete, world_ranking_points: entry.generalPoints })), currentDate);

  const summary = {
    week: currentWeek,
    athletesProcessed: ordered.length,
    numberOne: ordered[0]?.athlete?.name || null,
    raceLeader: raceOrdered[0]?.athlete?.name || null,
    events: events.length,
    teamsUpdated: teamRanking.processed,
  };

  let updatedProfile = profile;
  if (profile?.id) {
    updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, {
      last_circuit_week: currentWeek,
      last_circuit_update: currentDate,
      last_circuit_summary: summary,
      game_state_version: '2.4.0',
    });
  }

  return { profile: updatedProfile, skipped: false, ...summary, events };
}

export async function getCircuitSnapshot() {
  const athletes = (await localGame.entities.AthleteProfile.list('ranking_position', 200)) || [];
  const active = athletes.filter((athlete) => !isRetired(athlete));
  return {
    general: [...active].sort((a, b) => safeNumber(b.world_ranking_points ?? b.ranking_points, 0) - safeNumber(a.world_ranking_points ?? a.ranking_points, 0)),
    race: [...active].sort((a, b) => safeNumber(b.race_points, 0) - safeNumber(a.race_points, 0)),
  };
}
