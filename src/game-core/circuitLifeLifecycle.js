import { localGame } from '@/api/localGameClient.js';
import { deriveAthleteCareerState, isAthleteRetired } from './livingCircuitRules.js';

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
    const entity = localGame.entities?.[entityName];
    if (!entity?.list) return [];
    return (await entity.list(sort, limit)) || [];
  } catch (error) {
    console.warn(`[Game Core 3.5] Falha ao listar ${entityName}:`, error?.message || error);
    return [];
  }
}

async function safeUpdate(entityName, id, payload) {
  try {
    const entity = localGame.entities?.[entityName];
    if (!id || !entity?.update) return null;
    return await entity.update(id, payload);
  } catch (error) {
    console.warn(`[Game Core 3.5] Falha ao atualizar ${entityName}:`, error?.message || error);
    return null;
  }
}

async function createWorldEvent(payload) {
  try {
    const entity = localGame.entities?.WorldEvent;
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

// Fase 15 (Parte 0/1/26): bug real encontrado na auditoria —
// `.includes('aposent')` também batia em 'aposentadoria_anunciada' (só o
// ANÚNCIO, Parte 26 explicitamente pede pra preservar esse estágio
// intermediário), excluindo o atleta do circuito/ranking/IA de carreira
// antes de realmente se aposentar. Match exato — só 'aposentado'/'retired'
// (aposentadoria de fato) conta.
function isRetired(athlete) {
  return isAthleteRetired(athlete);
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
  // Cada atleta com mudança gerava sua própria escrita completa do save.
  // Acumula os patches esparsos e grava tudo em uma única bulkUpdate.
  const athleteUpdates = [];

  for (let index = 0; index < athletes.length; index += 1) {
    const athlete = athletes[index];
    const name = athleteName(athlete);
    const seed = `${athlete.id || name}:${currentWeek}:circuit-life`;
    const updates = {};

    // A evolução técnica passou a ter uma única cadência mensal em
    // evolveAthletesMonthly/livingCircuitRules. Este lifecycle semanal só
    // projeta fase/tendência e produz narrativa; não concede OVR de novo.
    const careerState = deriveAthleteCareerState(athlete, currentDate);
    if (athlete.career_stage !== careerState.stage || athlete.career_phase !== careerState.legacyLabel) {
      updates.career_stage = careerState.stage;
      updates.career_phase = careerState.legacyLabel;
      updates.development_trend = ['prospect', 'rising'].includes(careerState.stage) ? 'subindo' : careerState.stage === 'declining' ? 'caindo' : 'estavel';
      changes += 1;
    }

    const age = ageOf(athlete, currentDate);
    // Fase 15 (Parte 0/1/26/39): 2 bugs reais corrigidos aqui —
    // (1) faltava `!athlete.retirement_announced` na condição: um atleta já
    // anunciado podia "anunciar" de novo toda semana (evento duplicado,
    // quebra de idempotência real, Parte 39).
    // (2) o anúncio nunca tinha um SEGUIMENTO automático — a aposentadoria
    // de fato só existia atrás de um botão manual em WorldMarket.jsx,
    // nunca no pipeline automático de avanço de dia. Corrigido: na
    // primeira virada de ano depois do anúncio, o atleta se aposenta de
    // verdade (career_status:'aposentado', sai da população competitiva
    // via isRetired() já usado pelo resto do arquivo) — título, melhor
    // ranking e histórico permanecem intactos no AthleteProfile, nada é
    // apagado (Parte 26).
    if (!athlete.retirement_announced && age >= 36 && chance(`${seed}:retirement`, Math.min(18, 3 + (age - 35) * 2))) {
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
    } else if (athlete.retirement_announced && !isRetired(athlete) && Number(String(currentDate).slice(0, 4)) > Number(athlete.retirement_season || 0)) {
      updates.career_status = 'aposentado';
      updates.market_status = 'aposentado';
      updates.retired = true;
      updates.retired_career_date = currentDate;
      changes += 1;
      if (stories < MAX_STORIES_PER_WEEK) {
        const bestRank = athlete.best_ranking_position || athlete.ranking_position;
        const rankNote = bestRank ? ` Encerra a carreira tendo alcançado a posição #${bestRank} do ranking mundial.` : '';
        const event = await createWorldEvent({
          event_type: 'aposentadoria',
          event_date: currentDate,
          tier: 'destaque',
          related_players: [name],
          tags: ['aposentadoria', 'veterano', 'circuito', 'encerramento'],
          content: `${name} encerrou oficialmente a carreira competitiva.${rankNote}`,
        });
        if (event) { stories += 1; highlights.push(`${name} encerrou a carreira`); }
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
      athleteUpdates.push({ id: athlete.id, ...updates });
    }
  }
  if (athleteUpdates.length) {
    try { await localGame.entities.AthleteProfile.bulkUpdate(athleteUpdates); }
    catch (error) { console.warn('[Game Core 3.5] Falha ao atualizar AthleteProfile em lote:', error?.message || error); }
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
