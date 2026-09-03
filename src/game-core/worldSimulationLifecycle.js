import { localGame } from '@/api/localGameClient.js';
import { normalizeFatigue } from './physicalStats.js';
import { deriveAthleteCareerState, deriveRecentForm, isAthleteRetired } from './livingCircuitRules.js';
import { fnv1aHash } from '@/lib/hashUtils.js';
import { WORLD_RANKING_TARGET } from '@/lib/rankingPopulation.js';

// Fase 2E.2: mesmo achado dos outros dois arquivos que compartilham este
// corte (aiPartnershipLifecycle.js, circuitLifecycle.js) — 500 excluía
// permanentemente metade da população de 1000 de simulateWorldDay.
const ATHLETE_POPULATION_CAP = WORLD_RANKING_TARGET + 100;

const ACTIVE_STATUSES = new Set(['active', 'ativo', 'livre', 'contratado']);
const COUNTRIES = ['Brasil', 'Argentina', 'Espanha', 'Portugal', 'Itália', 'França', 'Suécia', 'México', 'Chile', 'Paraguai'];
const FIRST_NAMES = ['Lucas', 'Mateo', 'Thiago', 'Martín', 'Enzo', 'Rafael', 'Tomás', 'Nicolás', 'Bruno', 'Álvaro', 'Hugo', 'Gael'];
const LAST_NAMES = ['Silva', 'Costa', 'Pereira', 'García', 'López', 'Martínez', 'Santos', 'Rossi', 'Ferreira', 'Navarro', 'Mendes', 'Alonso'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function hash(text) {
  return fnv1aHash(String(text || ''));
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
  if (isAthleteRetired(athlete)) return 'retired';
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
  const overall = calculateOverall(athlete);
  const form = deriveRecentForm(athlete).score;
  const energy = clamp(safeNumber(athlete.energy, 80), 0, 100);
  const fatigue = clamp(safeNumber(athlete.fatigue, 15), 0, 100);
  const reputation = Math.max(0, safeNumber(athlete.reputation, Math.max(1, 110 - safeNumber(athlete.ranking_position, 300))));
  const wealth = Math.max(0, safeNumber(athlete.wealth ?? athlete.coins, 5000));
  const seed = `${athlete.id}:${date}:${activity}`;

  let energyDelta = 0;
  let fatigueDelta = 0;
  let reputationDelta = 0;
  let wealthDelta = 0;

  if (activity === 'technical_training' || activity === 'physical_training' || activity === 'tactical_training') {
    energyDelta = -integer(`${seed}:energy`, 5, 11);
    fatigueDelta = integer(`${seed}:fatigue`, 3, 8);
  } else if (activity === 'rest' || activity === 'recovery') {
    energyDelta = integer(`${seed}:energy`, 8, 16);
    fatigueDelta = -integer(`${seed}:fatigue`, 7, 15);
  } else if (activity === 'marketing') {
    energyDelta = -3;
    reputationDelta = integer(`${seed}:rep`, 1, 3);
    wealthDelta = integer(`${seed}:money`, 120, 500);
  } else if (activity === 'exhibition') {
    energyDelta = -integer(`${seed}:energy`, 8, 14);
    fatigueDelta = integer(`${seed}:fatigue`, 4, 9);
    reputationDelta = integer(`${seed}:rep`, 1, 4);
    wealthDelta = integer(`${seed}:money`, 250, 850);
  }

  const injuryRoll = integer(`${seed}:injury`, 0, 9999);
  const injuryRisk = Math.max(2, Math.round((fatigue + Math.max(0, 45 - energy)) / 8));
  const injured = !athlete.injured_until && injuryRoll < injuryRisk;
  const injuryDays = injured ? integer(`${seed}:injury-days`, 4, 21) : 0;

  return {
    activity,
    overall,
    form,
    energy: clamp(energy + energyDelta, 0, 100),
    fatigue: normalizeFatigue(fatigue + fatigueDelta),
    reputation: Math.max(0, reputation + reputationDelta),
    wealth: Math.max(0, wealth + wealthDelta),
    overallDelta: 0,
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

// Fase 2D.2: generateProspect gerava no máximo 1/mês (uma chamada, atrás de
// um dado de 10%) — insuficiente por uma ordem de grandeza pra repor uma
// população de 1000 com aposentadoria ativa (Fase 2D.1: carreira média
// ~15 anos numa faixa ranqueada ~1000 pede ~60-70 entradas/saídas por ano,
// ou seja, 5-6/mês). O teto de replacements>=retired já existia e agora
// finalmente compara contra uma contagem real (aposentadoria só passou a
// setar `retired` nesta mesma fase) — vira o CALIBRADOR: cada mês, gera
// até MAX_PROSPECTS_PER_MONTH, mas nunca mais do que o hiato real entre
// quem já saiu e quem já foi reposto. Sem aposentadoria medida, hiato = 0,
// e não entra ninguém — a taxa de entrada segue a taxa de saída medida,
// não um número escolhido a dedo.
const MAX_PROSPECTS_PER_MONTH = 6;

async function generateProspects(currentDate, existingAthletes) {
  const month = monthKey(currentDate);
  const alreadyGenerated = existingAthletes.some((athlete) => athlete.generated_month === month);
  if (alreadyGenerated) return [];
  const retired = existingAthletes.filter((athlete) => athleteStatus(athlete) === 'retired').length;
  const replacements = existingAthletes.filter((athlete) => athlete.generation_reason === 'retirement_replacement').length;
  const gap = Math.max(0, retired - replacements);
  const toGenerate = Math.min(MAX_PROSPECTS_PER_MONTH, gap);
  if (toGenerate <= 0) return [];

  const created = [];
  for (let index = 0; index < toGenerate; index += 1) {
    const seed = `${month}:prospect:${index}`;
    const first = FIRST_NAMES[integer(`${seed}:first`, 0, FIRST_NAMES.length - 1)];
    const last = LAST_NAMES[integer(`${seed}:last`, 0, LAST_NAMES.length - 1)];
    const country = COUNTRIES[integer(`${seed}:country`, 0, COUNTRIES.length - 1)];
    // Fase 2D.3: entram jovens (17-20, não travado em 17) com OVR baixo e
    // potencial variável — a faixa larga de potencial é o que garante que
    // ALGUNS prospects virem challengers de verdade mais adiante, não
    // todos medíocres.
    const age = integer(`${seed}:age`, 17, 20);
    const overall = integer(`${seed}:overall`, 46, 62);
    const potential = integer(`${seed}:potential`, Math.max(70, overall + 8), 96);
    // eslint-disable-next-line no-await-in-loop
    const profile = await localGame.entities.AthleteProfile.create({
      name: `${first} ${last}`,
      nationality: country,
      country,
      age,
      birth_date: `${Number(currentDate.slice(0, 4)) - age}-${currentDate.slice(5, 10)}`,
      overall,
      overall_rating: overall,
      potential,
      form: integer(`${seed}:form`, 55, 74),
      current_form: integer(`${seed}:current-form`, 55, 74),
      energy: 90,
      fatigue: 5,
      ranking_position: Math.max(200, existingAthletes.length + 120 + index),
      market_status: 'livre',
      status: 'active',
      reputation: 3,
      wealth: 1200,
      generated_month: month,
      generated_by: 'game-core-2.2',
      generation_reason: 'retirement_replacement',
      career_seasons: 0,
      career_titles: 0,
      career_wins: 0,
      career_losses: 0,
    });

    // eslint-disable-next-line no-await-in-loop
    await createWorldEvent({
      event_date: currentDate,
      date: currentDate,
      title: `Nova promessa: ${profile.name}`,
      description: `${profile.name}, de ${country}, entrou no circuito aos ${age} anos e passa a integrar a nova geração profissional.`,
      category: 'mercado',
      event_type: 'new_prospect',
      importance: potential >= 88 ? 'alta' : 'media',
      athlete_id: profile.id,
    });
    created.push(profile);
  }
  return created;
}

export async function simulateWorldDay(profile, previousDate, currentDate) {
  const lastProcessed = profile?.last_world_simulation_date;
  if (lastProcessed && lastProcessed >= currentDate) {
    return { profile, skipped: true, processed: 0, events: [], summary: null };
  }

  const athletes = (await localGame.entities.AthleteProfile.list('ranking_position', ATHLETE_POPULATION_CAP)) || [];
  const activeAthletes = athletes.filter((athlete) => athleteStatus(athlete) !== 'retired');
  const events = [];
  let processed = 0;
  let injuries = 0;
  let improvements = 0;
  let earnings = 0;

  // Divide o circuito em grupos diários para manter o avanço de dia rápido.
  const dayBucket = integer(`${currentDate}:bucket`, 0, 4);
  const selected = activeAthletes.filter((athlete, index) => (hash(athlete.id || index) % 5) === dayBucket).slice(0, 80);

  // Uma gravação por atleta selecionado gerava até 80 escritas completas do
  // save por dia. Acumula os patches e grava tudo em uma única bulkUpdate.
  const athleteUpdates = [];
  for (const athlete of selected) {
    const activity = activityFor(athlete, currentDate);
    const result = evolutionFor(athlete, activity, currentDate);
    const careerState = deriveAthleteCareerState(athlete, currentDate);
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
      career_stage: careerState.stage,
      career_phase: careerState.legacyLabel,
      market_trend: athlete.ranking_trend === 'subindo' || result.form >= 75 ? 'rising' : athlete.ranking_trend === 'caindo' || result.form <= 42 ? 'falling' : 'stable',
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
    athleteUpdates.push({ id: athlete.id, ...updates });
    processed += 1;
  }

  if (athleteUpdates.length) {
    await localGame.entities.AthleteProfile.bulkUpdate(athleteUpdates);
  }

  let prospects = [];
  if (monthKey(previousDate) !== monthKey(currentDate)) {
    prospects = await generateProspects(currentDate, athletes);
    events.push(...prospects);
  }

  const summary = {
    date: currentDate,
    processed,
    injuries,
    improvements,
    earnings,
    prospects_generated: prospects.length,
    prospect_name: prospects[0]?.name || null,
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
  const athletes = (await localGame.entities.AthleteProfile.list('ranking_position', ATHLETE_POPULATION_CAP)) || [];
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
