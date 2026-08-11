import { localGame } from '@/api/localGameClient.js';

const COACH_POOL = [
  'Álvaro Serrano', 'Bruno Cardoso', 'Carlos Méndez', 'Diego Valdés',
  'Enrique Soler', 'Fabio Conti', 'Gonzalo Rivas', 'Hugo Ferreira',
];

function clamp(value, min = 0, max = 100) {
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

function monthKey(date) {
  return String(date || '').slice(0, 7);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function athleteName(athlete) {
  return athlete?.sport_name || athlete?.name || athlete?.full_name || 'Atleta do circuito';
}

function isRetired(athlete) {
  const status = String(athlete?.career_status || athlete?.status || '').toLowerCase();
  return Boolean(athlete?.retired) || status.includes('aposent');
}

function isInjured(athlete, date) {
  return Boolean(athlete?.current_injury || (athlete?.injured_until && athlete.injured_until >= date));
}

export function deriveAiCareerArchetype(athlete = {}) {
  if (athlete.ai_career_archetype) return athlete.ai_career_archetype;
  const axes = athlete.behavior_axes || {};
  const aggression = safeNumber(axes.aggression, 50);
  const teamwork = safeNumber(axes.teamwork, 50);
  const tactics = safeNumber(axes.tactical_intelligence, 50);
  const focus = safeNumber(axes.training_focus, safeNumber(athlete.discipline, 50));
  const reputation = safeNumber(athlete.reputation, 0);

  if (reputation >= 65 && teamwork >= 58) return 'showman';
  if (tactics >= 70) return 'tactician';
  if (focus >= 72) return 'worker';
  if (aggression >= 68 || safeNumber(athlete.ambition, 50) >= 72) return 'competitor';
  return ['balanced', 'worker', 'competitor', 'tactician'][hash(athlete.id || athleteName(athlete)) % 4];
}

export function decideAiCareerStrategy(athlete = {}, currentDate = '2026-01-01') {
  const archetype = deriveAiCareerArchetype(athlete);
  const form = clamp(athlete.form ?? athlete.current_form ?? 60);
  const confidence = clamp(athlete.confidence ?? athlete.morale ?? 60);
  const fatigue = clamp(athlete.fatigue ?? 15);
  const energy = clamp(athlete.energy ?? 80);
  const injured = isInjured(athlete, currentDate);
  const ranking = Math.max(1, safeNumber(athlete.ranking_position, 1000));
  const poorRun = form <= 38 || confidence <= 35;
  const hotRun = form >= 78 && confidence >= 72;

  let calendarIntensity = 'balanced';
  if (injured || fatigue >= 72 || energy <= 32) calendarIntensity = 'recovery';
  else if (poorRun) calendarIntensity = archetype === 'competitor' ? 'selective' : 'development';
  else if (hotRun && ['competitor', 'showman'].includes(archetype)) calendarIntensity = 'aggressive';
  else if (archetype === 'worker') calendarIntensity = 'development';
  else if (archetype === 'tactician') calendarIntensity = 'selective';

  const wantsCoachChange = !injured
    && (String(athlete.coach_status || '') === 'avaliando_mudanca'
      || (poorRun && safeNumber(athlete.coach_months, 12) >= 6))
    && ((hash(`${athlete.id}:${monthKey(currentDate)}:coach-change`) % 100) < (poorRun ? 48 : 22));

  let commercialStrategy = 'stable';
  if (archetype === 'showman' || reputationThreshold(athlete) >= 60) commercialStrategy = 'visibility';
  if (ranking <= 50 && hotRun) commercialStrategy = 'premium';
  if (poorRun) commercialStrategy = 'protect-image';

  const partnershipStrategy = poorRun
    ? (safeNumber(athlete.partnership_patience, 55) < 45 ? 'evaluate-change' : 'rebuild')
    : hotRun ? 'stability' : 'monitor';

  return {
    archetype,
    calendarIntensity,
    wantsCoachChange,
    commercialStrategy,
    partnershipStrategy,
    reasons: [
      injured ? 'lesão ativa' : null,
      fatigue >= 72 ? 'fadiga elevada' : null,
      energy <= 32 ? 'energia baixa' : null,
      poorRun ? 'má fase esportiva' : null,
      hotRun ? 'ótima fase esportiva' : null,
      ranking <= 50 ? 'posição de elite' : null,
    ].filter(Boolean),
  };
}

function reputationThreshold(athlete) {
  return clamp(athlete.reputation ?? Math.max(0, 105 - safeNumber(athlete.ranking_position, 500)));
}

async function safeList(entityName, sort = 'ranking_position', limit = 300) {
  try {
    return (await localGame.entities?.[entityName]?.list?.(sort, limit)) || [];
  } catch (error) {
    console.warn(`[RC World AI] Falha ao listar ${entityName}:`, error?.message || error);
    return [];
  }
}

async function safeUpdate(entityName, id, payload) {
  try {
    if (!id) return null;
    return await localGame.entities?.[entityName]?.update?.(id, payload);
  } catch (error) {
    console.warn(`[RC World AI] Falha ao atualizar ${entityName}:`, error?.message || error);
    return null;
  }
}

async function createEvent(payload) {
  try {
    return await localGame.entities?.WorldEvent?.create?.({
      author_name: 'Radar do Circuito',
      tier: 'normal',
      likes: 0,
      tags: ['ia', 'circuito'],
      ...payload,
    });
  } catch (error) {
    console.warn('[RC World AI] Evento não criado:', error?.message || error);
    return null;
  }
}

function selectNewCoach(athlete, month) {
  const current = String(athlete.coach_name || '');
  const candidates = COACH_POOL.filter(name => name !== current);
  return candidates[hash(`${athlete.id}:${month}:new-coach`) % candidates.length];
}

/**
 * Processa decisões estratégicas mensais dos atletas controlados pela IA.
 * Não altera o atleta humano nem contratos ligados ao perfil do jogador.
 */
export async function processAiCareerStrategyMonth(profile, previousDate, currentDate) {
  const previousMonth = monthKey(previousDate);
  const currentMonth = monthKey(currentDate);
  if (!currentMonth || previousMonth === currentMonth || profile?.last_ai_career_strategy_month === currentMonth) {
    return { profile, skipped: true, month: currentMonth, processed: 0, coachChanges: 0, strategyChanges: 0, stories: 0 };
  }

  const athletes = (await safeList('AthleteProfile', 'ranking_position', 350))
    .filter(athlete => athlete?.id && !isRetired(athlete) && !athlete.current_partner_profile_id && !athlete.contracted_to_profile_id);

  let processed = 0;
  let coachChanges = 0;
  let strategyChanges = 0;
  let stories = 0;
  const highlights = [];
  // Cada atleta processado gerava sua própria escrita completa do save
  // mensalmente. Acumula os patches e grava tudo em uma única bulkUpdate.
  const athleteUpdates = [];

  for (const athlete of athletes) {
    const strategy = decideAiCareerStrategy(athlete, currentDate);
    const updates = {
      ai_career_archetype: strategy.archetype,
      ai_calendar_intensity: strategy.calendarIntensity,
      ai_commercial_strategy: strategy.commercialStrategy,
      ai_partnership_strategy: strategy.partnershipStrategy,
      ai_strategy_reasons: strategy.reasons,
      last_ai_strategy_month: currentMonth,
      ai_strategy_version: '36.6.0',
    };

    const changed = strategy.calendarIntensity !== athlete.ai_calendar_intensity
      || strategy.commercialStrategy !== athlete.ai_commercial_strategy
      || strategy.partnershipStrategy !== athlete.ai_partnership_strategy;
    if (changed) strategyChanges += 1;

    if (strategy.wantsCoachChange) {
      const newCoach = selectNewCoach(athlete, currentMonth);
      updates.coach_name = newCoach;
      updates.coach_status = 'estavel';
      updates.coach_since = currentDate;
      updates.coach_months = 0;
      updates.last_coach_change_date = currentDate;
      coachChanges += 1;
      if (stories < 4) {
        const name = athleteName(athlete);
        const event = await createEvent({
          event_date: currentDate,
          event_type: 'mudanca_treinador',
          title: `${name} muda o comando técnico`,
          content: `${name} contratou ${newCoach} após reavaliar a fase esportiva. A nova equipe deverá trabalhar com calendário ${strategy.calendarIntensity}.`,
          related_players: [name],
          related_id: athlete.id,
          tags: ['treinador', 'mercado', strategy.archetype],
          tier: safeNumber(athlete.ranking_position, 999) <= 30 ? 'destaque' : 'normal',
        });
        if (event) { stories += 1; highlights.push(`${name} trocou de treinador`); }
      }
    } else {
      updates.coach_months = safeNumber(athlete.coach_months, 0) + 1;
    }

    athleteUpdates.push({ id: athlete.id, ...updates });
    processed += 1;
  }
  if (athleteUpdates.length) {
    try { await localGame.entities.AthleteProfile.bulkUpdate(athleteUpdates); }
    catch (error) { console.warn('[Game Core 36.6] Falha ao atualizar AthleteProfile em lote:', error?.message || error); }
  }

  const summary = { month: currentMonth, processed, coachChanges, strategyChanges, stories, highlights };
  const updatedProfile = profile?.id
    ? (await safeUpdate('PlayerProfile', profile.id, {
      last_ai_career_strategy_month: currentMonth,
      last_ai_career_strategy_summary: summary,
    })) || profile
    : profile;

  return { profile: updatedProfile, skipped: false, ...summary };
}

export async function getAiCareerStrategySnapshot(limit = 300) {
  const athletes = await safeList('AthleteProfile', 'ranking_position', limit);
  const active = athletes.filter(athlete => !isRetired(athlete));
  const countBy = (key) => active.reduce((acc, athlete) => {
    const value = athlete[key] || 'não definido';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  return {
    activeAthletes: active.length,
    archetypes: countBy('ai_career_archetype'),
    calendarStrategies: countBy('ai_calendar_intensity'),
    commercialStrategies: countBy('ai_commercial_strategy'),
    partnershipStrategies: countBy('ai_partnership_strategy'),
  };
}
