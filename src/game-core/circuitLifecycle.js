import { localGame } from '@/api/localGameClient.js';
// Fase 15 (Parte 0/1/4/10): auditoria achou 2 fórmulas de career_phase
// conflitantes escrevendo no MESMO campo em cadências diferentes — esta
// (semanal, só idade + peak_age-1) e a de athleteBehavior.js (mensal,
// peak_age ± janela). Consolidado numa só fonte (a de athleteBehavior.js,
// já exportada e mais nuançada por depender de peak_age por atleta, não
// só um corte fixo de idade — Parte 11: "não fazer todos seguirem
// exatamente a mesma curva"); esta função só computa e escreve, nunca
// mais reimplementa a regra.
import { deriveAthleteCareerState, isAthleteRetired } from './livingCircuitRules.js';
import { teamKey } from '@/lib/teamRanking.js';
import { WORLD_RANKING_TARGET, TEAM_RANKING_TARGET } from '@/lib/rankingPopulation.js';

// Fase 2E.2/2E.4: os dois tetos abaixo cobriam só metade (ou menos) da
// população de 1000 atletas / até 500 duplas possíveis — e de forma
// PERMANENTE, não só truncada: este é o MESMO processo (processWorldCircuit)
// que LÊ pelo corte de ranking_position/ranking_points e DEPOIS escreve de
// volta só pra quem foi lido — quem cai fora nunca mais é recalculado e
// fica excluído para sempre. Confirmado ao investigar o achado #2F (a
// mesma função já precisava do teamKey canônico pra não duplicar linha de
// TeamRanking). Os tetos agora cobrem a população/duplas inteiras com folga.
const ATHLETE_POPULATION_CAP = WORLD_RANKING_TARGET + 100;
const TEAM_POPULATION_CAP = TEAM_RANKING_TARGET + 100;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  return isAthleteRetired(athlete);
}

function categoryFor(points, overall) {
  if (points >= 9000 || overall >= 92) return 'Crown';
  if (points >= 5000 || overall >= 86) return 'Elite';
  if (points >= 2500 || overall >= 80) return 'Masters';
  if (points >= 1100 || overall >= 72) return 'Platinum';
  if (points >= 400 || overall >= 64) return 'Gold';
  return 'Silver';
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
  const existing = (await localGame.entities.TeamRanking.list('-ranking_points', TEAM_POPULATION_CAP)) || [];
  const byKey = new Map(existing.map((team) => [team.team_key, team]));
  const processed = new Set();
  // Cada par de dupla gerava seu próprio create/update individual. Acumula
  // as operações e grava tudo em uma única transação via localGame.batch.
  const operations = [];

  for (const athlete of athletes) {
    const partnerId = athlete.ai_partner_id;
    if (!partnerId || !byId.has(partnerId)) continue;
    // Fase 2F: team_key precisa ser SEMPRE derivado assim (ids reais,
    // ordenados) — inclusive na semeadura das duplas históricas
    // (saveFoundation.js), senão a mesma dupla ganha uma segunda linha de
    // TeamRanking na primeira vez que este laço rodar (achado #2F).
    const key = teamKey(athlete.id, partnerId);
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

  const athletes = ((await localGame.entities.AthleteProfile.list('ranking_position', ATHLETE_POPULATION_CAP)) || [])
    .filter((athlete) => athlete?.id && !isRetired(athlete));

  // Ranking é uma ladder global: processar só os 160 maiores OVR deixava
  // posições antigas no restante da população. O patch final continua em
  // um único bulkUpdate, portanto ordenar até 500 atletas é barato.
  const selected = athletes;

  const results = [];
  for (const athlete of selected) {
    // O World Tour/Tournament é a fonte canônica de resultado e pontos. A
    // versão anterior simulava um segundo torneio invisível toda semana,
    // concedendo pontos, títulos e dinheiro em paralelo ao calendário real.
    const result = {
      performance: clamp(athlete.form ?? athlete.current_form ?? 60, 0, 100),
      wonEvent: false,
      reachedFinal: false,
      reachedSemi: false,
      wonMatches: 0,
      lostMatches: 0,
      pointsGain: 0,
      prizeMoney: 0,
    };
    const oldGeneral = Math.max(0, safeNumber(athlete.world_ranking_points ?? athlete.ranking_points, athleteOverall(athlete) * 25));
    const oldRace = Math.max(0, safeNumber(athlete.race_points, 0));
    const decay = 0;
    const generalPoints = oldGeneral;
    const racePoints = oldRace;
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
    const careerState = deriveAthleteCareerState(athlete, currentDate);

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
      career_stage: careerState.stage,
      career_phase: careerState.legacyPhase,
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
