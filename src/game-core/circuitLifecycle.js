import { localGame } from '@/api/localGameClient.js';
// Fase 15 (Parte 0/1/4/10): auditoria achou 2 fórmulas de career_phase
// conflitantes escrevendo no MESMO campo em cadências diferentes — esta
// (semanal, só idade + peak_age-1) e a de athleteBehavior.js (mensal,
// peak_age ± janela). Consolidado numa só fonte (a de athleteBehavior.js,
// já exportada e mais nuançada por depender de peak_age por atleta, não
// só um corte fixo de idade — Parte 11: "não fazer todos seguirem
// exatamente a mesma curva"); esta função só computa e escreve, nunca
// mais reimplementa a regra.
import { getCareerPhase } from '@/lib/athleteBehavior.js';

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
  // Cada par de dupla gerava seu próprio create/update individual. Acumula
  // as operações e grava tudo em uma única transação via localGame.batch.
  const operations = [];

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
    if (current?.id && localGame.entities.TeamRanking.update) {
      operations.push({ type: 'update', entityName: 'TeamRanking', id: current.id, data: payload });
    } else {
      operations.push({ type: 'create', entityName: 'TeamRanking', data: payload });
    }
  }
  if (operations.length) await localGame.batch(operations);
  return { processed: operations.length };
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

  // Uma gravação individual por atleta classificado gerava até 160 escritas
  // completas do save toda semana. Acumula os patches e grava tudo em uma
  // única bulkUpdate ao final do laço.
  const athleteUpdates = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const entry = ordered[index];
    const athlete = entry.athlete;
    const oldPosition = safeNumber(athlete.ranking_position, index + 1);
    const newPosition = index + 1;
    const age = safeNumber(athlete.age, 24);
    const careerPhase = getCareerPhase(age, safeNumber(athlete.peak_age, 28));

    athleteUpdates.push({
      id: athlete.id,
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
  if (athleteUpdates.length) {
    await localGame.entities.AthleteProfile.bulkUpdate(athleteUpdates);
  }

  // Fase 15 (Parte 24/28/37): marcos de ranking dos bots — MESMA escada
  // unificada já usada pelo jogador (careerStory.js/achievementsData.js),
  // nunca uma nova. Reaproveita oldPosition/newPosition JÁ calculados no
  // laço acima (nenhuma consulta extra). Detector de transição real
  // (cruzou agora, não "já está"), mesmo princípio de
  // rankingMilestoneCrossed (gameStateLifecycle.js) — só o degrau mais
  // exclusivo cruzado gera história, e no máximo 3 histórias de marco por
  // semana (Parte 37: não temos garantia de quantos atletas cruzam ao
  // mesmo tempo com ~1000 no circuito).
  const RANKING_LADDER = [1, 3, 5, 10, 20, 30, 50, 100, 250, 500];
  const MAX_MILESTONE_STORIES_PER_WEEK = 3;
  let milestoneStories = 0;
  // athleteUpdates e ordered têm o MESMO comprimento e ordem (o laço acima
  // gera 1 update por entry, na mesma sequência) — zipar por índice evita
  // qualquer busca O(n) por atleta (Parte 37: nada de O(n²) com ~1000
  // atletas).
  const milestoneCandidates = athleteUpdates
    .map((update, idx) => {
      const crossed = RANKING_LADDER.filter((tier) => update.ranking_position <= tier && update.ranking_previous_position > tier);
      return crossed.length ? { athlete: ordered[idx]?.athlete, milestone: Math.min(...crossed), position: update.ranking_position } : null;
    })
    .filter((item) => item?.athlete)
    .sort((a, b) => a.milestone - b.milestone); // mais exclusivo primeiro
  for (const { athlete, milestone, position } of milestoneCandidates) {
    if (milestoneStories >= MAX_MILESTONE_STORIES_PER_WEEK) break;
    const age = safeNumber(athlete.age, 24);
    const title = milestone === 1
      ? `${athlete.name} é o novo número 1 do mundo`
      : `${age <= 22 ? `Aos ${age} anos, ` : ''}${athlete.name} entra no Top ${milestone} do ranking mundial${age <= 22 ? ' pela primeira vez' : ''}`;
    const event = await createWorldEvent({
      event_type: 'ranking',
      title,
      content: `Com a posição #${position}, ${athlete.name} consolida sua ascensão no circuito profissional.`,
      related_players: [athlete.name],
      tier: milestone <= 10 ? 'destaque' : 'normal',
      event_date: currentDate,
      tags: ['ranking', 'marco', athlete.country || athlete.nationality || 'internacional'],
    });
    if (event) milestoneStories += 1;
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
