import { base44 } from '@/api/base44Client';

const MAX_STORIES_PER_WEEK = 4;

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

function seeded(seed, min, max) {
  return min + (hash(seed) % (max - min + 1));
}

function chance(seed, percentage) {
  return (hash(seed) % 100) < percentage;
}

function weekKey(date) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(date || '');
  const thursday = new Date(parsed);
  thursday.setDate(parsed.getDate() + 3 - ((parsed.getDay() + 6) % 7));
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const week = 1 + Math.round(((thursday - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function safeList(entityName, sort = '-overall_rating', limit = 250) {
  try {
    const entity = base44.entities?.[entityName];
    if (!entity?.list) return [];
    return (await entity.list(sort, limit)) || [];
  } catch (error) {
    console.warn(`[Game Core 3.5] Falha ao listar ${entityName}:`, error?.message || error);
    return [];
  }
}

async function safeUpdate(entityName, id, payload) {
  try {
    const entity = base44.entities?.[entityName];
    if (!id || !entity?.update) return null;
    return await entity.update(id, payload);
  } catch (error) {
    console.warn(`[Game Core 3.5] Falha ao atualizar ${entityName}:`, error?.message || error);
    return null;
  }
}

async function createWorldEvent(payload) {
  try {
    const entity = base44.entities?.WorldEvent;
    if (!entity?.create) return null;
    return await entity.create({
      author_name: 'Central do Circuito',
      content: payload.content,
      event_type: payload.event_type || 'circuito',
      tier: payload.tier || 'normal',
      related_players: payload.related_players || [],
      tags: payload.tags || ['circuito'],
      likes: 0,
      event_date: payload.event_date,
    });
  } catch (error) {
    console.warn('[Game Core 3.5] Notícia não criada:', error?.message || error);
    return null;
  }
}

function athleteName(athlete) {
  return athlete?.name || athlete?.full_name || 'Atleta do circuito';
}

function isRetired(athlete) {
  const status = String(athlete?.status || athlete?.career_status || '').toLowerCase();
  return Boolean(athlete?.retired || status.includes('aposent'));
}

function ageOf(athlete, currentDate) {
  const explicit = Number(athlete?.age);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const birth = athlete?.birth_date || athlete?.date_of_birth;
  if (!birth) return 25;
  const now = new Date(`${currentDate}T00:00:00`);
  const born = new Date(`${birth}T00:00:00`);
  if (Number.isNaN(now.getTime()) || Number.isNaN(born.getTime())) return 25;
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday = now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function getProspectGrowth(athlete, seed) {
  const age = Number(athlete?.age) || 25;
  const potential = clamp(athlete?.potential ?? athlete?.potential_rating ?? 65);
  const overall = clamp(athlete?.overall_rating ?? athlete?.overall ?? 50);
  if (age > 24 || potential <= overall) return 0;
  const maxGain = potential >= 85 ? 2 : 1;
  return seeded(`${seed}:growth`, 0, maxGain);
}

export async function processCircuitLifeWeek(profile, previousDate, currentDate) {
  const currentWeek = weekKey(currentDate);
  if (!currentWeek || profile?.last_circuit_life_week === currentWeek) {
    return { profile, skipped: true, week: currentWeek, stories: 0, changes: 0 };
  }

  const athletes = (await safeList('AthleteProfile', '-world_ranking_points', 300)).filter((athlete) => !isRetired(athlete));
  const ranked = [...athletes].sort((a, b) => (Number(b.world_ranking_points) || 0) - (Number(a.world_ranking_points) || 0));
  let stories = 0;
  let changes = 0;
  const highlights = [];

  for (let index = 0; index < athletes.length; index += 1) {
    const athlete = athletes[index];
    const name = athleteName(athlete);
    const seed = `${athlete.id || name}:${currentWeek}:circuit-life`;
    const updates = {};

    const growth = getProspectGrowth(athlete, seed);
    if (growth > 0) {
      const previousOverall = clamp(athlete.overall_rating ?? athlete.overall ?? 50);
      updates.overall_rating = clamp(previousOverall + growth);
      updates.development_trend = 'subindo';
      changes += 1;
      if (stories < MAX_STORIES_PER_WEEK && previousOverall < 78 && updates.overall_rating >= 70 && chance(`${seed}:breakout`, 35)) {
        const event = await createWorldEvent({
          event_type: 'promessa',
          event_date: currentDate,
          tier: 'destaque',
          related_players: [name],
          tags: ['promessa', 'evolução', 'circuito'],
          content: `${name} aparece como uma das promessas em ascensão. A evolução técnica nas últimas semanas já começa a chamar atenção de treinadores, patrocinadores e duplas mais bem ranqueadas.`,
        });
        if (event) { stories += 1; highlights.push(`${name} entrou em ascensão`); }
      }
    }

    const age = ageOf(athlete, currentDate);
    if (age >= 36 && chance(`${seed}:retirement`, Math.min(18, 3 + (age - 35) * 2))) {
      updates.retirement_announced = true;
      updates.retirement_season = Number(String(currentDate).slice(0, 4));
      updates.career_status = 'aposentadoria_anunciada';
      changes += 1;
      if (stories < MAX_STORIES_PER_WEEK) {
        const event = await createWorldEvent({
          event_type: 'aposentadoria',
          event_date: currentDate,
          tier: 'destaque',
          related_players: [name],
          tags: ['aposentadoria', 'veterano', 'circuito'],
          content: `${name} anunciou que esta será uma de suas últimas temporadas no circuito. O veterano pretende encerrar a carreira competitiva após cumprir os compromissos atuais.`,
        });
        if (event) { stories += 1; highlights.push(`${name} anunciou despedida`); }
      }
    }

    if (!athlete.sponsor_name && chance(`${seed}:sponsor`, index < 25 ? 14 : 4)) {
      const sponsors = ['Bullpadel', 'Adidas', 'Head', 'Wilson', 'Nox', 'Babolat', 'Siux', 'Joma'];
      const sponsor = sponsors[hash(`${seed}:sponsor-name`) % sponsors.length];
      updates.sponsor_name = sponsor;
      updates.sponsor_since = currentDate;
      changes += 1;
      if (stories < MAX_STORIES_PER_WEEK && index < 20) {
        const event = await createWorldEvent({
          event_type: 'patrocinio',
          event_date: currentDate,
          related_players: [name],
          tags: ['patrocínio', sponsor, 'mercado'],
          content: `${name} fechou um novo acordo de patrocínio com ${sponsor}. A parceria reforça o crescimento comercial do atleta dentro do circuito.`,
        });
        if (event) { stories += 1; highlights.push(`${name} assinou com ${sponsor}`); }
      }
    }

    const form = clamp(athlete.form ?? athlete.current_form ?? 60);
    const confidence = clamp(athlete.confidence ?? athlete.morale ?? 60);
    if (form <= 32 && confidence <= 38 && chance(`${seed}:coach`, 20)) {
      updates.coach_status = 'avaliando_mudanca';
      updates.coach_rumor_week = currentWeek;
      changes += 1;
      if (stories < MAX_STORIES_PER_WEEK) {
        const event = await createWorldEvent({
          event_type: 'rumor',
          event_date: currentDate,
          related_players: [name],
          tags: ['treinador', 'rumor', 'má fase'],
          content: `A sequência de resultados abaixo do esperado aumentou os rumores de mudança na equipe técnica de ${name}. Pessoas próximas ao atleta indicam que novas opções já estão sendo analisadas.`,
        });
        if (event) { stories += 1; highlights.push(`${name} avalia mudanças`); }
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.last_circuit_life_week = currentWeek;
      await safeUpdate('AthleteProfile', athlete.id, updates);
    }
  }

  if (stories === 0 && ranked.length > 0) {
    const leader = ranked[0];
    const challenger = ranked[1];
    const leaderName = athleteName(leader);
    const challengerName = challenger ? athleteName(challenger) : null;
    const event = await createWorldEvent({
      event_type: 'circuito',
      event_date: currentDate,
      related_players: challengerName ? [leaderName, challengerName] : [leaderName],
      tags: ['ranking', 'semana', 'circuito'],
      content: challengerName
        ? `${leaderName} inicia mais uma semana na liderança, enquanto ${challengerName} mantém a pressão no topo. A disputa por pontos promete movimentar os próximos torneios.`
        : `${leaderName} segue como principal referência do circuito nesta semana.`,
    });
    if (event) { stories += 1; highlights.push('Disputa pelo topo atualizada'); }
  }

  const summary = {
    week: currentWeek,
    athletesProcessed: athletes.length,
    stories,
    changes,
    highlights: highlights.slice(0, 4),
  };

  let updatedProfile = profile;
  if (profile?.id) {
    updatedProfile = await safeUpdate('PlayerProfile', profile.id, {
      last_circuit_life_week: currentWeek,
      last_circuit_life_summary: summary,
      game_state_version: '3.5.0',
    }) || profile;
  }

  return { profile: updatedProfile, skipped: false, ...summary };
}

export async function getCircuitLifeSnapshot() {
  const athletes = await safeList('AthleteProfile', '-world_ranking_points', 300);
  return {
    activeAthletes: athletes.filter((athlete) => !isRetired(athlete)).length,
    retirementAnnouncements: athletes.filter((athlete) => athlete.retirement_announced).length,
    risingProspects: athletes.filter((athlete) => String(athlete.development_trend) === 'subindo').length,
    sponsoredAthletes: athletes.filter((athlete) => athlete.sponsor_name).length,
  };
}
