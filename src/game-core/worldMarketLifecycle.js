import { localGame } from '@/api/localGameClient.js';
import { getAllBotsAsProfiles } from '@/lib/bots';
import { overallRating } from '@/lib/padel';
import { createKeyedInitializer } from '@/lib/keyedInitialization.js';

const COUNTRIES = ['Brasil', 'Argentina', 'Espanha', 'Portugal', 'Itália', 'França', 'Chile', 'Uruguai'];
const FIRST_NAMES = ['Lucas', 'Mateo', 'Thiago', 'Nicolás', 'Martín', 'Alejandro', 'João', 'Bruno', 'Enzo', 'Tomás'];
const LAST_NAMES = ['Silva', 'Costa', 'Navarro', 'Romero', 'Ferreira', 'García', 'López', 'Pereira', 'Ramos', 'Almeida'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function monthKey(date) {
  return String(date || new Date().toISOString().slice(0, 10)).slice(0, 7);
}

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value >>> 0);
}

function seededValue(seed, min, max) {
  const ratio = (hash(seed) % 10000) / 10000;
  return Math.round(min + ratio * (max - min));
}

function marketValue(overall, potential, age, form) {
  const ageFactor = age <= 25 ? 1.18 : age <= 30 ? 1 : age <= 34 ? 0.78 : 0.52;
  const base = (overall * overall * 80) + (potential * 1300) + (form * 500);
  return Math.max(15000, Math.round(base * ageFactor / 1000) * 1000);
}

function expectedSalary(value, overall) {
  return Math.max(1200, Math.round(((value / 60) + overall * 45) / 100) * 100);
}

function normalizeAthlete(athlete, index, careerDate) {
  const overall = clamp(athlete.overall_rating || overallRating(athlete) || 50, 1, 100);
  const age = clamp(athlete.age || seededValue(`${athlete.bot_id || athlete.id}:age`, 18, 37), 16, 45);
  const potential = clamp(athlete.potential || Math.max(overall, seededValue(`${athlete.bot_id || athlete.id}:potential`, overall, 99)), overall, 100);
  const form = clamp(athlete.current_form || seededValue(`${athlete.bot_id || athlete.id}:form`, 45, 85), 1, 100);
  const value = Number(athlete.market_value) || marketValue(overall, potential, age, form);
  return {
    ...athlete,
    age,
    potential,
    current_form: form,
    market_value: value,
    expected_salary: Number(athlete.expected_salary) || expectedSalary(value, overall),
    world_rank: Number(athlete.world_rank) || index + 1,
    market_status: athlete.market_status || (athlete.current_injury ? 'lesionado' : 'livre'),
    career_status: athlete.career_status || 'ativo',
    market_trend: athlete.market_trend || 'estável',
    last_market_month: athlete.last_market_month || monthKey(careerDate),
    market_months_elapsed: Number(athlete.market_months_elapsed) || 0,
  };
}

async function createWorldEvent(data) {
  try {
    return await localGame.entities.WorldEvent.create(data);
  } catch (error) {
    console.warn('Não foi possível registrar notícia do mercado:', error);
    return null;
  }
}

async function initializeWorldMarket(careerDate) {
  let athletes = await localGame.entities.AthleteProfile.list('-overall_rating', 200);
  if (!athletes || athletes.length === 0) {
    const bots = getAllBotsAsProfiles();
    const records = [];
    for (let index = 0; index < bots.length; index += 1) {
      const bot = bots[index];
      const normalized = normalizeAthlete({
        bot_id: bot.id,
        name: bot.sport_name || bot.name,
        country: bot.country,
        age: seededValue(`${bot.id}:age`, 19, 37),
        play_style: bot.play_style || 'Equilibrado',
        attributes: bot,
        overall_rating: overallRating(bot),
        morale: 70,
        fatigue: 0,
        peak_age: seededValue(`${bot.id}:peak`, 26, 30),
      }, index, careerDate);
      records.push(normalized);
    }
    if (records.length) await localGame.entities.AthleteProfile.bulkCreate(records);
    athletes = await localGame.entities.AthleteProfile.list('-overall_rating', 200);
  }

  const sorted = [...(athletes || [])].sort((a, b) => {
    const scoreA = (Number(a.overall_rating) || overallRating(a)) * 2 + (Number(a.current_form) || 60);
    const scoreB = (Number(b.overall_rating) || overallRating(b)) * 2 + (Number(b.current_form) || 60);
    return scoreB - scoreA;
  });

  const updates = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const athlete = sorted[index];
    const normalized = normalizeAthlete(athlete, index, careerDate);
    const needsUpdate = !athlete.market_value || !athlete.expected_salary || !athlete.world_rank || !athlete.market_status;
    if (needsUpdate) {
      updates.push({ ...normalized, id: athlete.id });
    }
  }
  if (updates.length) await localGame.entities.AthleteProfile.bulkUpdate(updates);
  return localGame.entities.AthleteProfile.list('-market_value', 200);
}

const initializeWorldMarketOnce = createKeyedInitializer(initializeWorldMarket);

export function ensureWorldMarket(careerDate) {
  const key = monthKey(careerDate);
  return initializeWorldMarketOnce(key, careerDate);
}

function createProspect(careerDate, sequence) {
  const seed = `${careerDate}:${sequence}`;
  const firstName = FIRST_NAMES[seededValue(`${seed}:first`, 0, FIRST_NAMES.length - 1)];
  const lastName = LAST_NAMES[seededValue(`${seed}:last`, 0, LAST_NAMES.length - 1)];
  const country = COUNTRIES[seededValue(`${seed}:country`, 0, COUNTRIES.length - 1)];
  const overall = seededValue(`${seed}:overall`, 38, 58);
  const potential = seededValue(`${seed}:potential`, 76, 96);
  const form = seededValue(`${seed}:form`, 48, 72);
  const value = marketValue(overall, potential, 17, form);
  return {
    bot_id: `prospect_${monthKey(careerDate).replace('-', '_')}_${sequence}`,
    name: `${firstName} ${lastName}`,
    country,
    age: 17,
    play_style: ['Agressivo', 'Defensivo', 'Equilibrado', 'Tático'][sequence % 4],
    attributes: {},
    overall_rating: overall,
    potential,
    current_form: form,
    market_value: value,
    expected_salary: expectedSalary(value, overall),
    world_rank: 999,
    market_status: 'livre',
    career_status: 'ativo',
    market_trend: 'subindo',
    morale: 75,
    fatigue: 0,
    peak_age: seededValue(`${seed}:peak`, 26, 30),
    last_market_month: monthKey(careerDate),
    market_months_elapsed: 0,
  };
}

export async function evolveWorldMarket(careerDate) {
  const targetMonth = monthKey(careerDate);
  const athletes = await ensureWorldMarket(careerDate);
  if (athletes.length > 0 && athletes.every(a => a.last_market_month === targetMonth)) {
    return { skipped: true, month: targetMonth, athletes, events: [], prospects: [] };
  }

  const reports = [];
  const rankingCandidates = [];
  const marketUpdates = [];
  for (const athlete of athletes) {
    if (athlete.career_status === 'aposentado') continue;
    const months = (Number(athlete.market_months_elapsed) || 0) + 1;
    const age = clamp((Number(athlete.age) || 20) + (months % 12 === 0 ? 1 : 0), 16, 50);
    const oldOverall = clamp(athlete.overall_rating || overallRating(athlete), 1, 100);
    const potential = clamp(athlete.potential || oldOverall, oldOverall, 100);
    const monthlySwing = seededValue(`${athlete.id}:${targetMonth}:swing`, -5, 5);
    const development = age <= 24 && oldOverall < potential ? seededValue(`${athlete.id}:${targetMonth}:growth`, 0, 2) : 0;
    const decline = age >= 34 ? seededValue(`${athlete.id}:${targetMonth}:decline`, 0, 2) : 0;
    const overall = clamp(oldOverall + development - decline, 1, 100);
    const form = clamp((Number(athlete.current_form) || 60) + monthlySwing, 25, 99);
    const value = marketValue(overall, potential, age, form);
    const oldValue = Number(athlete.market_value) || value;
    const trend = value > oldValue * 1.03 ? 'subindo' : value < oldValue * 0.97 ? 'caindo' : 'estável';
    const retirementRoll = seededValue(`${athlete.id}:${targetMonth}:retire`, 1, 100);
    const retired = age >= 40 || (age >= 36 && retirementRoll <= Math.max(2, (age - 35) * 4));
    const injuryDays = Math.max(0, (Number(athlete.injury_recovery_days) || 0) - 30);
    const injury = injuryDays > 0 ? athlete.current_injury : null;
    const status = retired ? 'aposentado' : injury ? 'lesionado' : athlete.market_status === 'aposentado' ? 'livre' : (athlete.market_status || 'livre');

    const updated = {
      age,
      overall_rating: overall,
      current_form: form,
      market_value: value,
      expected_salary: expectedSalary(value, overall),
      market_trend: trend,
      market_status: status,
      career_status: retired ? 'aposentado' : 'ativo',
      current_injury: injury,
      injury_recovery_days: injuryDays,
      last_market_month: targetMonth,
      market_months_elapsed: months,
      last_updated_date: careerDate,
    };
    marketUpdates.push({ ...updated, id: athlete.id });
    rankingCandidates.push({ ...athlete, ...updated });
    reports.push({ id: athlete.id, name: athlete.name, oldValue, value, trend, retired });

    if (retired) {
      await createWorldEvent({
        event_type: 'aposentadoria',
        title: `${athlete.name} anuncia aposentadoria`,
        content: `Aos ${age} anos, ${athlete.name} encerra sua trajetória profissional no circuito mundial.`,
        author_name: 'Central do Padel',
        related_players: [athlete.name],
        tier: oldOverall >= 80 ? 'breaking' : 'destaque',
        event_date: careerDate,
        tags: ['mercado', 'aposentadoria'],
      });
    }
  }

  rankingCandidates.sort((a, b) => ((b.overall_rating || 0) * 2 + (b.current_form || 0)) - ((a.overall_rating || 0) * 2 + (a.current_form || 0)));
  const rankById = new Map(rankingCandidates.map((athlete, index) => [athlete.id, index + 1]));
  if (marketUpdates.length) {
    await localGame.entities.AthleteProfile.bulkUpdate(
      marketUpdates.map(update => ({ ...update, world_rank: rankById.get(update.id) || update.world_rank })),
    );
  }

  const prospects = [];
  const prospectCount = seededValue(`${targetMonth}:prospects`, 1, 3);
  for (let index = 0; index < prospectCount; index += 1) {
    const prospect = createProspect(careerDate, index + 1);
    const created = await localGame.entities.AthleteProfile.create(prospect);
    prospects.push(created);
    await createWorldEvent({
      event_type: 'promessa',
      title: `Nova promessa: ${prospect.name}`,
      content: `${prospect.name}, de ${prospect.country}, estreia aos 17 anos com potencial estimado em ${prospect.potential}.`,
      author_name: 'Observatório de Talentos',
      related_players: [prospect.name],
      tier: prospect.potential >= 90 ? 'destaque' : 'normal',
      event_date: careerDate,
      tags: ['mercado', 'promessa'],
    });
  }

  const leader = rankingCandidates[0];
  if (leader) {
    await createWorldEvent({
      event_type: 'ranking',
      title: `${leader.name} lidera o mercado mundial`,
      content: `Com overall ${leader.overall_rating} e forma ${leader.current_form}, ${leader.name} termina o mês no topo da avaliação mundial.`,
      author_name: 'Ranking Padel Legacy',
      related_players: [leader.name],
      tier: 'destaque',
      event_date: careerDate,
      tags: ['mercado', 'ranking'],
    });
  }

  return {
    skipped: false,
    month: targetMonth,
    athletes: await localGame.entities.AthleteProfile.list('-market_value', 200),
    events: reports,
    prospects,
  };
}

export async function getWorldMarketSnapshot(careerDate) {
  const athletes = await ensureWorldMarket(careerDate);
  const active = athletes.filter(a => a.career_status !== 'aposentado');
  return {
    month: monthKey(careerDate),
    athletes,
    active,
    freeAgents: active.filter(a => a.market_status === 'livre'),
    injured: active.filter(a => a.market_status === 'lesionado'),
    retired: athletes.filter(a => a.career_status === 'aposentado'),
    totalValue: active.reduce((sum, athlete) => sum + (Number(athlete.market_value) || 0), 0),
    processed: active.length > 0 && active.every(a => a.last_market_month === monthKey(careerDate)),
  };
}
