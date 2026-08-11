import { localGame } from '@/api/localGameClient.js';
import { normalizeFatigue } from './physicalStats.js';

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

function weekKey(date) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(date || '');
  const first = new Date(parsed.getFullYear(), 0, 1);
  const day = Math.floor((parsed - first) / 86400000);
  return `${parsed.getFullYear()}-W${String(Math.ceil((day + first.getDay() + 1) / 7)).padStart(2, '0')}`;
}

function personalityAxes(athlete) {
  const key = athlete?.bot_id || athlete?.id || athlete?.name || 'athlete';
  const personality = String(athlete?.personality || '').toLowerCase();
  const playStyle = String(athlete?.play_style || '').toLowerCase();
  const ambition = clamp(athlete?.ambition ?? 50);
  const discipline = clamp(athlete?.discipline ?? 50);

  const axes = {
    aggression: seeded(`${key}:aggression`, 35, 75),
    consistency: seeded(`${key}:consistency`, 40, 78),
    clutch: seeded(`${key}:clutch`, 35, 80),
    teamwork: seeded(`${key}:teamwork`, 38, 82),
    tactical_intelligence: seeded(`${key}:tactical`, 40, 82),
    risk_tolerance: seeded(`${key}:risk`, 30, 78),
    emotional_stability: seeded(`${key}:emotion`, 35, 82),
    training_focus: Math.round((discipline * 0.65) + (ambition * 0.35)),
  };

  if (personality === 'competitivo') { axes.clutch += 10; axes.aggression += 8; axes.teamwork -= 4; }
  if (personality === 'calmo') { axes.emotional_stability += 14; axes.consistency += 8; axes.risk_tolerance -= 5; }
  if (personality === 'impulsivo') { axes.risk_tolerance += 15; axes.aggression += 8; axes.consistency -= 12; }
  if (personality === 'lider') { axes.teamwork += 14; axes.tactical_intelligence += 8; }
  if (personality === 'perfeccionista') { axes.consistency += 12; axes.training_focus += 10; axes.emotional_stability -= 4; }
  if (personality === 'carismatico') { axes.teamwork += 8; }
  if (personality === 'reservado') { axes.consistency += 5; axes.teamwork -= 3; }

  if (playStyle.includes('agress')) { axes.aggression += 12; axes.risk_tolerance += 8; }
  if (playStyle.includes('defens')) { axes.consistency += 10; axes.aggression -= 8; }
  if (playStyle.includes('tát')) { axes.tactical_intelligence += 14; axes.risk_tolerance -= 4; }
  if (playStyle.includes('pot')) { axes.aggression += 8; axes.clutch += 4; }

  return Object.fromEntries(Object.entries(axes).map(([name, value]) => [name, clamp(Math.round(value))]));
}

function preferredSide(athlete) {
  const key = athlete?.bot_id || athlete?.id || athlete?.name || 'athlete';
  return hash(`${key}:side`) % 2 === 0 ? 'Direita' : 'Esquerda';
}

function pressureProfile(axes) {
  const score = axes.clutch * 0.45 + axes.emotional_stability * 0.35 + axes.consistency * 0.2;
  if (score >= 76) return 'Especialista em decisões';
  if (score >= 62) return 'Confiável sob pressão';
  if (score >= 48) return 'Oscila em momentos grandes';
  return 'Vulnerável sob pressão';
}

function behaviorSummary(athlete, axes) {
  const parts = [];
  if (axes.aggression >= 72) parts.push('busca definir pontos cedo');
  else if (axes.aggression <= 42) parts.push('prefere construir o ponto');
  if (axes.tactical_intelligence >= 72) parts.push('lê bem mudanças táticas');
  if (axes.teamwork >= 72) parts.push('eleva o rendimento da dupla');
  if (axes.risk_tolerance >= 72) parts.push('aceita riscos elevados');
  if (axes.consistency >= 75) parts.push('mantém nível estável');
  return parts.length ? parts.join(', ') : 'perfil equilibrado, adaptável e sem extremos marcantes';
}

async function createWorldEvent(payload) {
  try {
    if (!localGame.entities?.WorldEvent?.create) return null;
    return await localGame.entities.WorldEvent.create({
      author: 'Central Padel Legacy',
      likes: 0,
      related_players: [],
      tags: [],
      tier: 'normal',
      ...payload,
    });
  } catch (error) {
    console.warn('[Game Core 2.5] Notícia de personalidade não criada:', error?.message || error);
    return null;
  }
}

export async function ensureAthleteIntelligenceProfiles() {
  const athletes = (await localGame.entities.AthleteProfile.list('-overall_rating', 250)) || [];
  let updated = 0;
  for (const athlete of athletes) {
    const axes = personalityAxes(athlete);
    const missing = !athlete.ai_profile_version || !athlete.behavior_axes || !athlete.pressure_profile;
    if (!missing) continue;
    await localGame.entities.AthleteProfile.update(athlete.id, {
      behavior_axes: axes,
      preferred_side: athlete.preferred_side || preferredSide(athlete),
      pressure_profile: pressureProfile(axes),
      behavior_summary: behaviorSummary(athlete, axes),
      momentum: clamp(athlete.momentum ?? 50),
      form: clamp(athlete.form ?? athlete.current_form ?? 60),
      confidence: clamp(athlete.confidence ?? athlete.morale ?? 65),
      partnership_patience: clamp(athlete.partnership_patience ?? seeded(`${athlete.id}:patience`, 35, 85)),
      ai_profile_version: '2.5.0',
    });
    updated += 1;
  }
  return { athletes: athletes.length, updated };
}

export async function processAthletePersonalityWeek(profile, previousDate, currentDate) {
  const currentWeek = weekKey(currentDate);
  if (!currentWeek || profile?.last_athlete_ai_week === currentWeek) {
    return { profile, skipped: true, week: currentWeek, processed: 0, stories: 0 };
  }

  await ensureAthleteIntelligenceProfiles();
  const athletes = (await localGame.entities.AthleteProfile.list('-overall_rating', 250)) || [];
  let stories = 0;

  for (const athlete of athletes) {
    const axes = athlete.behavior_axes || personalityAxes(athlete);
    const seed = `${athlete.id}:${currentWeek}:mind`;
    const previousForm = clamp(athlete.form ?? athlete.current_form ?? 60);
    const previousConfidence = clamp(athlete.confidence ?? athlete.morale ?? 65);
    const rankingTrend = String(athlete.ranking_trend || 'estavel');
    const trendEffect = rankingTrend === 'subindo' ? 4 : rankingTrend === 'caindo' ? -4 : 0;
    const volatility = Math.max(2, Math.round((100 - axes.consistency) / 8));
    const formDelta = seeded(`${seed}:form`, -volatility, volatility) + trendEffect;
    const pressureShield = (axes.emotional_stability - 50) / 18;
    const confidenceDelta = seeded(`${seed}:confidence`, -5, 5) + trendEffect * 0.5 + pressureShield;
    const fatigue = clamp(athlete.fatigue ?? 0);
    const recovery = Math.round((axes.training_focus + axes.emotional_stability) / 45);
    const newFatigue = normalizeFatigue(fatigue - recovery + seeded(`${seed}:fatigue`, 0, 4));
    const newForm = clamp(previousForm + formDelta);
    const newConfidence = clamp(previousConfidence + confidenceDelta);
    const momentum = clamp((newForm * 0.55) + (newConfidence * 0.45));

    await localGame.entities.AthleteProfile.update(athlete.id, {
      behavior_axes: axes,
      form: Math.round(newForm),
      current_form: Math.round(newForm),
      confidence: Math.round(newConfidence),
      morale: Math.round((clamp(athlete.morale ?? 70) * 0.7) + (newConfidence * 0.3)),
      fatigue: newFatigue,
      momentum: Math.round(momentum),
      pressure_profile: pressureProfile(axes),
      behavior_summary: behaviorSummary(athlete, axes),
      last_ai_behavior_week: currentWeek,
      ai_profile_version: '2.5.0',
    });

    const breakout = newForm >= 85 && previousForm < 85;
    const crisis = newConfidence <= 28 && previousConfidence > 28;
    if (breakout && stories < 2) {
      const event = await createWorldEvent({
        event_type: 'forma',
        title: `${athlete.name} vive grande fase no circuito`,
        content: `${athlete.name} alcançou um dos melhores momentos da carreira. Seu perfil ${athlete.pressure_profile || pressureProfile(axes).toLowerCase()} e a confiança elevada estão chamando atenção dos adversários.`,
        related_players: [athlete.name],
        event_date: currentDate,
        tier: 'destaque',
        tags: ['forma', 'personalidade', 'circuito'],
      });
      if (event) stories += 1;
    } else if (crisis && stories < 2) {
      const event = await createWorldEvent({
        event_type: 'crise',
        title: `${athlete.name} enfrenta crise de confiança`,
        content: `Resultados recentes afetaram a confiança de ${athlete.name}. A reação nas próximas semanas poderá influenciar ranking, parcerias e desempenho sob pressão.`,
        related_players: [athlete.name],
        event_date: currentDate,
        tier: 'normal',
        tags: ['confiança', 'má fase', 'circuito'],
      });
      if (event) stories += 1;
    }
  }

  const summary = { week: currentWeek, processed: athletes.length, stories };
  let updatedProfile = profile;
  if (profile?.id) {
    updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, {
      last_athlete_ai_week: currentWeek,
      last_athlete_ai_summary: summary,
      game_state_version: '2.5.0',
    });
  }
  return { profile: updatedProfile, skipped: false, ...summary };
}

export async function getAthleteIntelligenceSnapshot() {
  const athletes = (await localGame.entities.AthleteProfile.list('-overall_rating', 250)) || [];
  return athletes.map((athlete) => ({
    ...athlete,
    behavior_axes: athlete.behavior_axes || personalityAxes(athlete),
  }));
}
