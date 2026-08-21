import { localGame } from '@/api/localGameClient.js';
import { normalizeFatigue } from '@/game-core/physicalStats.js';
import { getAllBotsAsProfiles } from '@/lib/bots';
import { overallRating, ATTRIBUTE_KEYS } from '@/lib/padel';
import { assignTraits, computeTraitEffects } from '@/lib/personalityTraits';

// ── Catalogs ────────────────────────────────────────────────────────────────

export const PERSONALITIES = [
  { id: 'carismatico', label: 'Carismático', desc: 'Líder natural que inspira parceiros e fascina torcidas', color: 'text-amber-400', icon: 'Star' },
  { id: 'reservado', label: 'Reservado', desc: 'Focado e discreto, fala pouco mas entrega na quadra', color: 'text-slate-400', icon: 'Eye' },
  { id: 'competitivo', label: 'Competitivo', desc: 'Não aceita perder, pressiona oponentes a cada ponto', color: 'text-red-400', icon: 'Flame' },
  { id: 'calmo', label: 'Calmo', desc: 'Mantém controle sob pressão, frio nos momentos decisivos', color: 'text-cyan-400', icon: 'Waves' },
  { id: 'impulsivo', label: 'Impulsivo', desc: 'Joga com emoção, oscila entre gênios e falhas', color: 'text-orange-400', icon: 'Zap' },
  { id: 'lider', label: 'Líder', desc: 'Assume comando da dupla, organiza jogadas e motiva', color: 'text-primary', icon: 'Crown' },
  { id: 'perfeccionista', label: 'Perfeccionista', desc: 'Treina obsessivamente, cobra excelência de todos', color: 'text-purple-400', icon: 'Target' },
];

export const COACH_TYPES = [
  { id: 'tecnico', label: 'Técnico', desc: 'Foco em fundamentos e mecânica de golpes' },
  { id: 'motivacional', label: 'Motivacional', desc: 'Especialista em mentalidade e confiança' },
  { id: 'estratega', label: 'Estratega', desc: 'Mestre tático, estuda adversários' },
  { id: 'fisico', label: 'Físico', desc: 'Preparador de resistência e explosão' },
  { id: 'mental', label: 'Mental', desc: 'Treinador de controle emocional e foco' },
];

export const CAREER_PHASES = {
  Ascensão: { label: 'Ascensão', desc: 'Jovem em crescimento', color: 'text-green-400', icon: 'TrendingUp' },
  Auge: { label: 'Auge', desc: 'No auge da carreira', color: 'text-amber-400', icon: 'Star' },
  Declínio: { label: 'Declínio', desc: 'Em declínio natural', color: 'text-orange-400', icon: 'TrendingDown' },
  Veterano: { label: 'Veterano', desc: 'Veterano de guerra', color: 'text-slate-400', icon: 'Clock' },
};

const PLAY_STYLES = ['Agressivo', 'Defensivo', 'Equilibrado', 'Tático', 'Potência'];

const INJURIES = [
  'lesão no cotovelo', 'fisura no pulso', 'estiramento na panturrilha',
  'inflamação no ombro', 'torção no tornozelo', 'tendinite no braço',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashName(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) {
    h = ((h << 5) - h) + name.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h);
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

export function getCareerPhase(age, peakAge) {
  const peak = peakAge || 28;
  if (age < peak - 2) return 'Ascensão';
  if (age <= peak + 2) return 'Auge';
  if (age <= peak + 5) return 'Declínio';
  return 'Veterano';
}

function generatePersonality(name) {
  const hash = hashName(name);
  return {
    personality: PERSONALITIES[hash % PERSONALITIES.length],
    playStyle: PLAY_STYLES[hash % PLAY_STYLES.length],
    ambition: 30 + (hash % 70),
    discipline: 30 + ((hash >> 3) % 70),
    coachPref: COACH_TYPES[hash % COACH_TYPES.length],
    injuryProne: 10 + (hash % 60),
    peakAge: 26 + (hash % 6),
    growthRate: 0.5 + (hash % 15) / 10,
    declineRate: 0.5 + (hash % 10) / 10,
    age: 16 + (hash % 24),
  };
}

// ── Seeding ──────────────────────────────────────────────────────────────────

export async function ensureAthleteProfiles() {
  let existing = [];
  try {
    // Hotfix pré-beta (docs/PAGE_HIERARCHY_ATHLETES_HOTFIX.md): esta leitura
    // decide quais bots já existem antes de criar os que faltam. Com um
    // limite (o antigo `500`), um catálogo que cresça além dele faz o
    // conjunto `existingIds` ficar incompleto — os bots "fora da amostra"
    // voltam a parecer ausentes e `bulkCreate` tenta recriá-los.
    // `CareerEntityRepository.bulkCreate` lança no primeiro id duplicado e
    // aborta o lote INTEIRO (não só o duplicado), deixando `ensureAthleteProfiles`
    // rejeitada e a página Atletas com a lista vazia. Sem limite aqui: a
    // checagem de existência precisa ver o catálogo completo, sempre.
    existing = await localGame.entities.AthleteProfile.list('-overall_rating');
  } catch {}

  const existingIds = new Set((existing || []).flatMap(a => [a.id, a.bot_id, a.template_id].filter(Boolean)));

  const bots = getAllBotsAsProfiles();
  const toCreate = [];

  for (const bot of bots) {
    if (existingIds.has(bot.id) || existingIds.has(bot.template_id)) continue;
    const p = generatePersonality(bot.name);
    const attrs = {};
    ATTRIBUTE_KEYS.forEach(k => { attrs[k] = bot[k] || 5; });

    const traitIds = assignTraits(bot.name, p.personality.id);
    const traitEffects = computeTraitEffects(traitIds);

    toCreate.push({
      id: bot.id,
      bot_id: bot.template_id,
      template_id: bot.template_id,
      athlete_schema_version: bot.athlete_schema_version,
      source_type: bot.source_type,
      licensing_mode: bot.licensing_mode,
      name: bot.name,
      country: bot.country || '—',
      nationality_code: bot.nationality_code,
      handedness: bot.handedness,
      preferred_side: bot.preferred_side,
      secondary_side: bot.secondary_side,
      side_flexibility: bot.side_flexibility,
      side_experience: bot.side_experience,
      position: bot.position,
      age: p.age,
      personality: p.personality.id,
      personality_label: p.personality.label,
      personality_traits: traitIds,
      play_style: p.playStyle,
      ambition: p.ambition,
      discipline: p.discipline,
      coach_preference: p.coachPref.id,
      morale: 70,
      fatigue: 0,
      injury_prone: Math.round(p.injuryProne * (traitEffects.injuryModifier || 1)),
      peak_age: p.peakAge,
      career_phase: getCareerPhase(p.age, p.peakAge),
      growth_rate: p.growthRate * (traitEffects.growthModifier || 1),
      decline_rate: p.declineRate,
      relationships: [],
      attributes: attrs,
      overall_rating: overallRating(bot),
      fan_appeal: Math.max(0, Math.min(100, 50 + Math.round(traitEffects.fanModifier * 100))),
      sponsor_appeal: Math.max(0, Math.min(100, 50 + Math.round(traitEffects.sponsorModifier * 100))),
      coach_relationship: Math.max(0, Math.min(100, 50 + Math.round(traitEffects.coachModifier * 100))),
    });
  }

  if (toCreate.length > 0) {
    await localGame.entities.AthleteProfile.bulkCreate(toCreate);
    existing = await localGame.entities.AthleteProfile.list('-overall_rating', 500);
  }

  return existing;
}

// ── Relationships ───────────────────────────────────────────────────────────

export async function generateRelationships() {
  const profiles = await localGame.entities.AthleteProfile.list('-overall_rating', 200);
  if (!profiles || profiles.length === 0) return;

  const updates = [];
  for (const p of profiles) {
    const others = profiles.filter(o => o.id !== p.id);
    const rels = [];

    // Rivals: closest in rating
    const byRating = [...others].sort((a, b) => Math.abs((a.overall_rating||0) - (p.overall_rating||0)) - Math.abs((b.overall_rating||0) - (p.overall_rating||0)));
    for (let i = 0; i < Math.min(2, byRating.length); i++) {
      rels.push({ target_name: byRating[i].name, type: 'rival', score: -(20 + Math.random() * 50) });
    }

    // Friends: same personality
    const same = others.filter(o => o.personality === p.personality);
    for (let i = 0; i < Math.min(2, same.length); i++) {
      const friend = same[i];
      if (!rels.find(r => r.target_name === friend.name)) {
        rels.push({ target_name: friend.name, type: 'amigo', score: 20 + Math.random() * 50 });
      }
    }

    // Mentor: older with higher rating
    const mentors = others.filter(o => (o.age||0) > (p.age||0) + 5 && (o.overall_rating||0) > (p.overall_rating||0));
    if (mentors.length > 0 && p.career_phase === 'Ascensão') {
      const mentor = pick(mentors);
      if (!rels.find(r => r.target_name === mentor.name)) {
        rels.push({ target_name: mentor.name, type: 'mentor', score: 40 + Math.random() * 30 });
      }
    }

    updates.push({ id: p.id, relationships: rels });
  }

  if (updates.length > 0) {
    await localGame.entities.AthleteProfile.bulkUpdate(updates);
  }
}

export async function updateRelationshipAfterMatch(winnerName, loserName) {
  try {
    const winner = await localGame.entities.AthleteProfile.filter({ name: winnerName }, null, 1);
    const loser = await localGame.entities.AthleteProfile.filter({ name: loserName }, null, 1);
    if (!winner?.[0] || !loser?.[0]) return;

    const wRels = [...(winner[0].relationships || [])];
    const lRels = [...(loser[0].relationships || [])];

    let wRel = wRels.find(r => r.target_name === loserName);
    if (!wRel) {
      wRel = { target_name: loserName, type: 'rival', score: -10 };
      wRels.push(wRel);
    }
    wRel.score = Math.max(-100, (wRel.score || 0) - 5);

    let lRel = lRels.find(r => r.target_name === winnerName);
    if (!lRel) {
      lRel = { target_name: winnerName, type: 'rival', score: -10 };
      lRels.push(lRel);
    }
    lRel.score = Math.max(-100, (lRel.score || 0) - 8);

    await localGame.entities.AthleteProfile.bulkUpdate([
      { id: winner[0].id, relationships: wRels, morale: Math.min(100, (winner[0].morale||70) + 3) },
      { id: loser[0].id, relationships: lRels, morale: Math.max(20, (loser[0].morale||70) - 5) },
    ]);
  } catch (e) { console.error('updateRelationshipAfterMatch', e); }
}

// ── Monthly Evolution ───────────────────────────────────────────────────────

export async function evolveAthletesMonthly(date, { isYearBoundary = false } = {}) {
  let profiles = [];
  try {
    profiles = await localGame.entities.AthleteProfile.list('-overall_rating', 200);
  } catch {}

  if (!profiles || profiles.length === 0) {
    await ensureAthleteProfiles();
    await generateRelationships();
    profiles = await localGame.entities.AthleteProfile.list('-overall_rating', 200);
    if (!profiles || profiles.length === 0) return;
  }

  const updates = [];
  for (const p of profiles) {
    // Fase 15 (Parte 0/1/11): idade só avança na virada de ANO real da
    // carreira (isYearBoundary) — esta função continua rodando toda
    // virada de MÊS pra tudo o mais (atributos/lesão/moral/apelo), mas
    // incrementar `age` a cada mês fazia um atleta envelhecer 12 anos por
    // ano de carreira. Ver career.js pro call site que calcula o flag.
    const newAge = isYearBoundary ? (p.age || 20) + 1 : (p.age || 20);
    const newPhase = getCareerPhase(newAge, p.peak_age || 28);
    const u = { id: p.id, age: newAge, career_phase: newPhase, last_updated_date: date };

    // Trait effects
    const traitEffects = computeTraitEffects(p.personality_traits || []);

    // Attribute evolution — traits modify growth rate
    const attrs = { ...(p.attributes || {}) };
    if (newPhase === 'Ascensão') {
      const growth = ((p.ambition || 50) / 100) * ((p.discipline || 50) / 100) * (p.growth_rate || 1) * (traitEffects.growthModifier || 1);
      ATTRIBUTE_KEYS.forEach(k => { attrs[k] = Math.min(100, (attrs[k] || 5) + growth); });
    } else if (newPhase === 'Declínio' || newPhase === 'Veterano') {
      const decline = (p.decline_rate || 1);
      ATTRIBUTE_KEYS.forEach(k => { attrs[k] = Math.max(5, (attrs[k] || 5) - decline); });
    }
    u.attributes = attrs;
    u.overall_rating = Math.round(Object.values(attrs).reduce((a, b) => a + b, 0) / ATTRIBUTE_KEYS.length);

    // Injury check — traits modify injury risk
    if (!p.current_injury) {
      const injuryChance = ((p.injury_prone || 30) / 100) * (newAge > 30 ? 1.5 : 1) * 0.08 * (traitEffects.injuryModifier || 1);
      if (Math.random() < injuryChance) {
        u.current_injury = pick(INJURIES);
        u.injury_recovery_days = randInt(7, 30);
        u.fatigue = 80;
      } else {
        u.fatigue = normalizeFatigue((p.fatigue || 0) - 20);
      }
    } else {
      const remaining = Math.max(0, (p.injury_recovery_days || 0) - 30);
      u.injury_recovery_days = remaining;
      if (remaining === 0) u.current_injury = null;
    }

    // Morale drift — traits modify volatility
    const moraleDrift = (Math.random() - 0.5) * 15 * (traitEffects.moraleVolatility || 1);
    u.morale = Math.max(20, Math.min(100, (p.morale || 70) + moraleDrift));

    // Fan/sponsor/coach appeal drifts toward trait-modified baseline
    const fanBaseline = 50 + (traitEffects.fanModifier || 0) * 100;
    u.fan_appeal = Math.max(0, Math.min(100, (p.fan_appeal || 50) + (fanBaseline - (p.fan_appeal || 50)) * 0.1 + (Math.random() - 0.5) * 4));
    const sponsorBaseline = 50 + (traitEffects.sponsorModifier || 0) * 100;
    u.sponsor_appeal = Math.max(0, Math.min(100, (p.sponsor_appeal || 50) + (sponsorBaseline - (p.sponsor_appeal || 50)) * 0.1 + (Math.random() - 0.5) * 4));
    const coachBaseline = 50 + (traitEffects.coachModifier || 0) * 100;
    u.coach_relationship = Math.max(0, Math.min(100, (p.coach_relationship || 50) + (coachBaseline - (p.coach_relationship || 50)) * 0.1 + (Math.random() - 0.5) * 4));

    updates.push(u);
  }

  if (updates.length > 0) {
    await localGame.entities.AthleteProfile.bulkUpdate(updates);
  }
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function getAthletes(filters = {}) {
  try {
    let list = await localGame.entities.AthleteProfile.list('-overall_rating', 200);
    if (!list) return [];
    if (filters.phase) list = list.filter(a => a.career_phase === filters.phase);
    if (filters.personality) list = list.filter(a => a.personality === filters.personality);
    return list;
  } catch (e) {
    console.error('getAthletes', e);
    return [];
  }
}

export function getPersonalityMeta(id) {
  return PERSONALITIES.find(p => p.id === id) || PERSONALITIES[0];
}

export function getCoachMeta(id) {
  return COACH_TYPES.find(c => c.id === id) || COACH_TYPES[0];
}

export function getPhaseMeta(phase) {
  return CAREER_PHASES[phase] || CAREER_PHASES.Ascensão;
}
