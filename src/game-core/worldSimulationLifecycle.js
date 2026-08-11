import { localGame } from '@/api/localGameClient.js';
import { normalizeFatigue } from './physicalStats.js';

const ACTIVE_STATUSES = new Set(['active', 'ativo', 'livre', 'contratado']);
const COUNTRIES = ['Brasil', 'Argentina', 'Espanha', 'Portugal', 'Itália', 'França', 'Suécia', 'México', 'Chile', 'Paraguai'];
const FIRST_NAMES = ['Lucas', 'Mateo', 'Thiago', 'Martín', 'Enzo', 'Rafael', 'Tomás', 'Nicolás', 'Bruno', 'Álvaro', 'Hugo', 'Gael'];
const LAST_NAMES = ['Silva', 'Costa', 'Pereira', 'García', 'López', 'Martínez', 'Santos', 'Rossi', 'Ferreira', 'Navarro', 'Mendes', 'Alonso'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function hash(text) {
  let value = 2166136261;
  for (const char of String(text || '')) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function roll(seed, min = 0, max = 1) {
  const normalized = (hash(seed) % 100000) / 100000;
  return min + normalized * (max - min);
}

function integer(seed, min, max) {
  return Math.floor(roll(seed, min, max + 1));
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function monthKey(date) {
  return String(date || '').slice(0, 7);
}

function ageFor(athlete, currentDate) {
  if (Number.isFinite(Number(athlete.age))) return Number(athlete.age);
  if (!athlete.birth_date) return 24;
  const birth = new Date(`${athlete.birth_date}T00:00:00`);
  const current = new Date(`${currentDate}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(current.getTime())) return 24;
  let age = current.getFullYear() - birth.getFullYear();
  const birthdayPassed = current.getMonth() > birth.getMonth()
    || (current.getMonth() === birth.getMonth() && current.getDate() >= birth.getDate());
  if (!birthdayPassed) age -= 1;
  return Math.max(16, age);
}

function calculateOverall(athlete) {
  const explicit = safeNumber(athlete.overall ?? athlete.overall_rating, NaN);
  if (Number.isFinite(explicit)) return clamp(explicit, 1, 99);
  const keys = ['forehand', 'backhand', 'serve', 'volley', 'lob', 'smash', 'bandeja', 'speed', 'stamina', 'tactics', 'positioning'];
  const values = keys.map((key) => safeNumber(athlete[key], NaN)).filter(Number.isFinite);
  if (!values.length) return 55;
  return clamp(Math.round(values.reduce((sum, value) => sum + value, 0) / values.length), 1, 99);
}

function athleteStatus(athlete) {
  const status = String(athlete.market_status || athlete.status || 'active').toLowerCase();
  if (athlete.retired || status === 'retired' || status === 'aposentado') return 'retired';
  return ACTIVE_STATUSES.has(status) ? status : 'active';
}

function activityFor(athlete, date) {
  const age = ageFor(athlete, date);
  const seed = `${athlete.id}:${date}:activity`;
  const value = integer(seed, 0, 99);
  if (athlete.injured_until && athlete.injured_until >= date) return 'recovery';
  if (age >= 34 && value < 32) return 'rest';
  if (age <= 21 && value < 48) return 'technical_training';
  if (value < 28) return 'physical_training';
  if (value < 56) return 'technical_training';
  if (value < 72) return 'tactical_training';
  if (value < 84) return 'marketing';
  if (value < 94) return 'rest';
  return 'exhibition';
}

function evolutionFor(athlete, activity, date) {
  const age = ageFor(athlete, date);
  const overall = calculateOverall(athlete);
  const potential = clamp(safeNumber(athlete.potential, Math.min(99, overall + 8)), overall, 99);
  const form = clamp(safeNumber(athlete.form ?? athlete.current_form, 65), 0, 100);
  const energy = clamp(safeNumber(athlete.energy, 80), 0, 100);
  const fatigue = clamp(safeNumber(athlete.fatigue, 15), 0, 100);
  const reputation = Math.max(0, safeNumber(athlete.reputation, Math.max(1, 110 - safeNumber(athlete.ranking_position, 300))));
  const wealth = Math.max(0, safeNumber(athlete.wealth ?? athlete.coins, 5000));
  const seed = `${athlete.id}:${date}:${activity}`;

  let overallDelta = 0;
  let formDelta = integer(`${seed}:form`, -2, 2);
  let energyDelta = 0;
  let fatigueDelta = 0;
  let reputationDelta = 0;
  let wealthDelta = 0;

  if (activity === 'technical_training' || activity === 'physical_training' || activity === 'tactical_training') {
    energyDelta = -integer(`${seed}:energy`, 5, 11);
    fatigueDelta = integer(`${seed}:fatigue`, 3, 8);
    formDelta += 1;
    const growthChance = age <= 23 ? 24 : age <= 29 ? 10 : 3;
    if (overall < potential && integer(`${seed}:growth`, 0, 99) < growthChance) overallDelta = 1;
  } else if (activity === 'rest' || activity === 'recovery') {
    energyDelta = integer(`${seed}:energy`, 8, 16);
    fatigueDelta = -integer(`${seed}:fatigue`, 7, 15);
    formDelta += activity === 'recovery' ? 1 : 0;
  } else if (activity === 'marketing') {
    energyDelta = -3;
    reputationDelta = integer(`${seed}:rep`, 1, 3);
    wealthDelta = integer(`${seed}:money`, 120, 500);
  } else if (activity === 'exhibition') {
    energyDelta = -integer(`${seed}:energy`, 8, 14);
    fatigueDelta = integer(`${seed}:fatigue`, 4, 9);
    reputationDelta = integer(`${seed}:rep`, 1, 4);
    wealthDelta = integer(`${seed}:money`, 250, 850);
    formDelta += integer(`${seed}:result`, -1, 2);
  }

  if (age >= 35 && integer(`${seed}:decline`, 0, 999) < 8) overallDelta = -1;

  const injuryRoll = integer(`${seed}:injury`, 0, 9999);
  const injuryRisk = Math.max(2, Math.round((fatigue + Math.max(0, 45 - energy)) / 8));
  const injured = !athlete.injured_until && injuryRoll < injuryRisk;
  const injuryDays = injured ? integer(`${seed}:injury-days`, 4, 21) : 0;

  return {
    activity,
    overall: clamp(overall + overallDelta, 1, 99),
    form: clamp(form + formDelta, 0, 100),
    energy: clamp(energy + energyDelta, 0, 100),
    fatigue: normalizeFatigue(fatigue + fatigueDelta),
    reputation: Math.max(0, reputation + reputationDelta),
    wealth: Math.max(0, wealth + wealthDelta),
    overallDelta,
    reputationDelta,
    wealthDelta,
    injured,
    injuryDays,
  };
}

function addDays(date, days) {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString().slice(0, 10);
}

async function createWorldEvent(payload) {
  try {
    return await localGame.entities.WorldEvent.create(payload);
  } catch (error) {
    console.warn('[Game Core] WorldEvent não disponível:', error?.message || error);
    return null;
  }
}

async function generateProspect(currentDate, existingAthletes) {
  const month = monthKey(currentDate);
  const alreadyGenerated = existingAthletes.some((athlete) => athlete.generated_month === month);
  if (alreadyGenerated) return null;
  if (integer(`${month}:prospect-roll`, 0, 99) >= 42) return null;

  const first = FIRST_NAMES[integer(`${month}:first`, 0, FIRST_NAMES.length - 1)];
  const last = LAST_NAMES[integer(`${month}:last`, 0, LAST_NAMES.length - 1)];
  const country = COUNTRIES[integer(`${month}:country`, 0, COUNTRIES.length - 1)];
  const overall = integer(`${month}:overall`, 48, 61);
  const potential = integer(`${month}:potential`, Math.max(72, overall + 12), 94);
  const profile = await localGame.entities.AthleteProfile.create({
    name: `${first} ${last}`,
    nationality: country,
    age: 17,
    birth_date: `${Number(currentDate.slice(0, 4)) - 17}-${currentDate.slice(5, 10)}`,
    overall,
    overall_rating: overall,
    potential,
    form: integer(`${month}:form`, 55, 74),
    current_form: integer(`${month}:current-form`, 55, 74),
    energy: 90,
    fatigue: 5,
    ranking_position: Math.max(200, existingAthletes.length + 120),
    market_status: 'livre',
    status: 'active',
    reputation: 3,
    wealth: 1200,
    generated_month: month,
    generated_by: 'game-core-2.2',
    career_seasons: 0,
    career_titles: 0,
    career_wins: 0,
    career_losses: 0,
  });

  await createWorldEvent({
    event_date: currentDate,
    date: currentDate,
    title: `Nova promessa: ${profile.name}`,
    description: `${profile.name}, de ${country}, entrou no circuito aos 17 anos com potencial ${potential}.`,
    category: 'mercado',
    event_type: 'new_prospect',
    importance: potential >= 88 ? 'alta' : 'media',
    athlete_id: profile.id,
  });
  return profile;
}

export async function simulateWorldDay(profile, previousDate, currentDate) {
  const lastProcessed = profile?.last_world_simulation_date;
  if (lastProcessed && lastProcessed >= currentDate) {
    return { profile, skipped: true, processed: 0, events: [], summary: null };
  }

  const athletes = (await localGame.entities.AthleteProfile.list('ranking_position', 500)) || [];
  const activeAthletes = athletes.filter((athlete) => athleteStatus(athlete) !== 'retired');
  const events = [];
  let processed = 0;
  let injuries = 0;
  let improvements = 0;
  let earnings = 0;

  // Divide o circuito em grupos diários para manter o avanço de dia rápido.
  const dayBucket = integer(`${currentDate}:bucket`, 0, 4);
  const selected = activeAthletes.filter((athlete, index) => (hash(athlete.id || index) % 5) === dayBucket).slice(0, 80);

  for (const athlete of selected) {
    const activity = activityFor(athlete, currentDate);
    const result = evolutionFor(athlete, activity, currentDate);
    const updates = {
      last_ai_activity: activity,
      last_ai_activity_date: currentDate,
      overall: result.overall,
      overall_rating: result.overall,
      form: result.form,
      current_form: result.form,
      energy: result.energy,
      fatigue: result.fatigue,
      reputation: result.reputation,
      wealth: result.wealth,
      market_value: Math.max(500, Math.round((result.overall ** 2) * (0.7 + result.form / 200) * 18)),
      expected_salary: Math.max(80, Math.round((result.overall ** 2) / 16)),
      market_trend: result.overallDelta > 0 || result.form >= 75 ? 'rising' : result.form <= 42 ? 'falling' : 'stable',
    };

    if (result.injured) {
      updates.injured_until = addDays(currentDate, result.injuryDays);
      updates.market_status = 'lesionado';
      injuries += 1;
      const event = await createWorldEvent({
        event_date: currentDate,
        date: currentDate,
        title: `${athlete.name || 'Atleta'} sofre lesão`,
        description: `${athlete.name || 'Um atleta do circuito'} ficará afastado por aproximadamente ${result.injuryDays} dias.`,
        category: 'lesao',
        event_type: 'athlete_injury',
        importance: result.injuryDays >= 14 ? 'alta' : 'media',
        athlete_id: athlete.id,
      });
      if (event) events.push(event);
    } else if (athlete.injured_until && athlete.injured_until < currentDate) {
      updates.injured_until = null;
      updates.market_status = athlete.partner_id ? 'contratado' : 'livre';
    }

    if (result.overallDelta > 0) improvements += 1;
    earnings += result.wealthDelta;
    await localGame.entities.AthleteProfile.update(athlete.id, updates);
    processed += 1;
  }

  let prospect = null;
  if (monthKey(previousDate) !== monthKey(currentDate)) {
    prospect = await generateProspect(currentDate, athletes);
    if (prospect) events.push(prospect);
  }

  const summary = {
    date: currentDate,
    processed,
    injuries,
    improvements,
    earnings,
    prospect_name: prospect?.name || null,
  };

  let updatedProfile = profile;
  if (profile?.id) {
    updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, {
      last_world_simulation_date: currentDate,
      last_world_simulation_summary: summary,
    });
  }

  return { profile: updatedProfile, skipped: false, processed, events, summary };
}

export async function getWorldSimulationStatus(profile) {
  const date = profile?.career_date || new Date().toISOString().slice(0, 10);
  const athletes = (await localGame.entities.AthleteProfile.list('ranking_position', 500)) || [];
  const active = athletes.filter((athlete) => athleteStatus(athlete) !== 'retired');
  return {
    date,
    totalAthletes: athletes.length,
    activeAthletes: active.length,
    injuredAthletes: active.filter((athlete) => athlete.injured_until && athlete.injured_until >= date).length,
    risingAthletes: active.filter((athlete) => athlete.market_trend === 'rising').length,
    lastProcessedDate: profile?.last_world_simulation_date || null,
    lastSummary: profile?.last_world_simulation_summary || null,
  };
}
