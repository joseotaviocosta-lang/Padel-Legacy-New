import { localGame } from '@/api/localGameClient.js';

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, safeNumber(value)));
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
  return min + (hash(seed) % Math.max(1, max - min + 1));
}

function monthKey(date) {
  return String(date || '').slice(0, 7);
}

function athleteOverall(athlete) {
  return clamp(athlete?.overall ?? athlete?.overall_rating ?? 50, 1, 99);
}

function athletePosition(athlete) {
  const raw = String(athlete?.position || athlete?.court_position || '').toLowerCase();
  if (raw.includes('direita') || raw === 'right') return 'direita';
  if (raw.includes('esquerda') || raw === 'left') return 'esquerda';
  return hash(athlete?.id || athlete?.name) % 2 === 0 ? 'direita' : 'esquerda';
}

function isRetired(athlete) {
  const status = String(athlete?.market_status || athlete?.status || athlete?.career_status || '').toLowerCase();
  return Boolean(athlete?.retired) || status === 'retired' || status === 'aposentado';
}

function isInjured(athlete, date) {
  return Boolean(
    athlete?.current_injury
    || (athlete?.injured_until && athlete.injured_until >= date)
    || String(athlete?.market_status || '').toLowerCase() === 'lesionado'
  );
}

function hasHumanContract(athlete) {
  return Boolean(athlete?.current_partner_profile_id || athlete?.contracted_to_profile_id);
}

function aiPartnerId(athlete) {
  return athlete?.ai_partner_id || athlete?.partner_athlete_id || null;
}

function compatibility(a, b) {
  const overallGap = Math.abs(athleteOverall(a) - athleteOverall(b));
  const rankingGap = Math.abs(safeNumber(a?.ranking_position, 500) - safeNumber(b?.ranking_position, 500));
  const positionScore = athletePosition(a) !== athletePosition(b) ? 30 : 8;
  const levelScore = clamp(32 - overallGap * 2, 0, 32);
  const rankingScore = clamp(22 - rankingGap / 35, 0, 22);
  const ambitionA = safeNumber(a?.ambition, 50);
  const ambitionB = safeNumber(b?.ambition, 50);
  const personalityScore = clamp(16 - Math.abs(ambitionA - ambitionB) / 6, 0, 16);
  return Math.round(positionScore + levelScore + rankingScore + personalityScore);
}

async function createWorldEvent(payload) {
  try {
    const entity = localGame.entities?.WorldEvent;
    if (!entity?.create) return null;
    return await entity.create(payload);
  } catch (error) {
    console.warn('[Game Core] Evento de parceria não criado:', error?.message || error);
    return null;
  }
}

async function updateAthlete(id, payload) {
  if (!id) return null;
  return localGame.entities.AthleteProfile.update(id, payload);
}

function availableAthletes(athletes, date) {
  return athletes.filter((athlete) => (
    athlete?.id
    && !isRetired(athlete)
    && !isInjured(athlete, date)
    && !hasHumanContract(athlete)
    && !aiPartnerId(athlete)
  ));
}

function selectPair(free, month, pairIndex) {
  if (free.length < 2) return null;
  const ordered = [...free].sort((a, b) => {
    const scoreA = hash(`${month}:${pairIndex}:${a.id}`);
    const scoreB = hash(`${month}:${pairIndex}:${b.id}`);
    return scoreA - scoreB;
  });
  const first = ordered[0];
  const candidates = ordered.slice(1)
    .map((athlete) => ({ athlete, score: compatibility(first, athlete) }))
    .sort((a, b) => b.score - a.score);
  const second = candidates[0]?.athlete;
  return second ? { first, second, compatibility: candidates[0].score } : null;
}

async function dissolvePartnerships(athletes, currentDate) {
  const month = monthKey(currentDate);
  const byId = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  const processedPairs = new Set();
  const events = [];
  let dissolved = 0;

  for (const athlete of athletes) {
    const partnerId = aiPartnerId(athlete);
    if (!partnerId || hasHumanContract(athlete)) continue;
    const pairKey = [athlete.id, partnerId].sort().join(':');
    if (processedPairs.has(pairKey)) continue;
    processedPairs.add(pairKey);

    const partner = byId.get(partnerId);
    if (!partner) {
      await updateAthlete(athlete.id, {
        ai_partner_id: null,
        ai_partner_name: null,
        market_status: 'livre',
        ai_partnership_status: 'sem_parceiro',
      });
      continue;
    }

    const chemistry = clamp(athlete.ai_partnership_chemistry ?? partner.ai_partnership_chemistry ?? 60, 0, 100);
    const monthsTogether = Math.max(0, safeNumber(athlete.ai_partnership_months, 0));
    const formAverage = (safeNumber(athlete.form ?? athlete.current_form, 60) + safeNumber(partner.form ?? partner.current_form, 60)) / 2;
    const pressure = clamp((55 - chemistry) + Math.max(0, 48 - formAverage) + Math.max(0, monthsTogether - 18), 0, 65);
    const roll = integer(`${month}:${pairKey}:breakup`, 0, 99);
    if (roll >= pressure) {
      await Promise.allSettled([
        updateAthlete(athlete.id, { ai_partnership_months: monthsTogether + 1 }),
        updateAthlete(partner.id, { ai_partnership_months: monthsTogether + 1 }),
      ]);
      continue;
    }

    const common = {
      ai_partner_id: null,
      ai_partner_name: null,
      ai_partnership_status: 'encerrada',
      ai_partnership_end_date: currentDate,
      market_status: 'livre',
      partnership_history_count: safeNumber(athlete.partnership_history_count, 0) + 1,
    };
    await Promise.allSettled([
      updateAthlete(athlete.id, common),
      updateAthlete(partner.id, {
        ...common,
        partnership_history_count: safeNumber(partner.partnership_history_count, 0) + 1,
      }),
    ]);
    dissolved += 1;
    const event = await createWorldEvent({
      event_date: currentDate,
      date: currentDate,
      title: `${athlete.name || 'Atleta'} e ${partner.name || 'parceiro'} encerram a dupla`,
      description: `A parceria terminou após ${monthsTogether} mês(es). Entrosamento final: ${chemistry}/100.`,
      category: 'mercado',
      event_type: 'ai_partnership_dissolved',
      importance: athleteOverall(athlete) >= 80 || athleteOverall(partner) >= 80 ? 'alta' : 'media',
      athlete_id: athlete.id,
      related_athlete_id: partner.id,
    });
    if (event) events.push(event);
  }

  return { dissolved, events };
}

async function formNewPartnerships(athletes, currentDate) {
  const month = monthKey(currentDate);
  const free = availableAthletes(athletes, currentDate);
  const events = [];
  let formed = 0;
  const targetPairs = Math.min(8, Math.floor(free.length / 2));

  for (let index = 0; index < targetPairs; index += 1) {
    const remaining = availableAthletes(free, currentDate);
    const pair = selectPair(remaining, month, index);
    if (!pair) break;
    if (pair.compatibility < 48 && integer(`${month}:${index}:weak-pair`, 0, 99) > 25) break;

    const chemistry = clamp(42 + Math.round(pair.compatibility * 0.45), 45, 88);
    const common = {
      ai_partnership_status: 'ativa',
      ai_partnership_start_date: currentDate,
      ai_partnership_months: 0,
      ai_partnership_chemistry: chemistry,
      market_status: 'contratado',
      last_updated_date: currentDate,
    };
    await Promise.all([
      updateAthlete(pair.first.id, {
        ...common,
        ai_partner_id: pair.second.id,
        ai_partner_name: pair.second.name,
      }),
      updateAthlete(pair.second.id, {
        ...common,
        ai_partner_id: pair.first.id,
        ai_partner_name: pair.first.name,
      }),
    ]);

    pair.first.ai_partner_id = pair.second.id;
    pair.second.ai_partner_id = pair.first.id;
    formed += 1;
    const event = await createWorldEvent({
      event_date: currentDate,
      date: currentDate,
      title: `Nova dupla: ${pair.first.name || 'Atleta'} e ${pair.second.name || 'Atleta'}`,
      description: `A dupla foi formada com compatibilidade estimada em ${pair.compatibility}/100 e entrosamento inicial ${chemistry}/100.`,
      category: 'mercado',
      event_type: 'ai_partnership_formed',
      importance: athleteOverall(pair.first) >= 82 || athleteOverall(pair.second) >= 82 ? 'alta' : 'media',
      athlete_id: pair.first.id,
      related_athlete_id: pair.second.id,
    });
    if (event) events.push(event);
  }

  return { formed, events };
}

/**
 * Atualiza as duplas controladas pela IA uma vez a cada mudança de mês.
 * Não interfere no atleta contratado pelo jogador humano.
 */
export async function processAiPartnershipMarket(profile, previousDate, currentDate) {
  const previousMonth = monthKey(previousDate);
  const currentMonth = monthKey(currentDate);
  if (!currentMonth || previousMonth === currentMonth) {
    return { skipped: true, month: currentMonth, formed: 0, dissolved: 0, events: [] };
  }

  if (profile?.last_ai_partnership_month === currentMonth) {
    return { skipped: true, month: currentMonth, formed: 0, dissolved: 0, events: [] };
  }

  const athletes = (await localGame.entities.AthleteProfile.list('ranking_position', 500)) || [];
  const dissolution = await dissolvePartnerships(athletes, currentDate);
  const refreshed = (await localGame.entities.AthleteProfile.list('ranking_position', 500)) || athletes;
  const formation = await formNewPartnerships(refreshed, currentDate);

  let updatedProfile = profile;
  const summary = {
    month: currentMonth,
    formed: formation.formed,
    dissolved: dissolution.dissolved,
    totalEvents: formation.events.length + dissolution.events.length,
  };

  if (profile?.id) {
    updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, {
      last_ai_partnership_month: currentMonth,
      last_ai_partnership_summary: summary,
    });
  }

  return {
    profile: updatedProfile,
    skipped: false,
    ...summary,
    events: [...dissolution.events, ...formation.events],
  };
}

export async function getAiPartnershipSnapshot(profile) {
  const athletes = (await localGame.entities.AthleteProfile.list('ranking_position', 500)) || [];
  const activePairs = new Set();
  let freeAgents = 0;
  for (const athlete of athletes) {
    const partnerId = aiPartnerId(athlete);
    if (partnerId) activePairs.add([athlete.id, partnerId].sort().join(':'));
    else if (!isRetired(athlete) && !hasHumanContract(athlete)) freeAgents += 1;
  }
  return {
    activeAiPartnerships: activePairs.size,
    freeAgents,
    lastProcessedMonth: profile?.last_ai_partnership_month || null,
    lastSummary: profile?.last_ai_partnership_summary || null,
  };
}
