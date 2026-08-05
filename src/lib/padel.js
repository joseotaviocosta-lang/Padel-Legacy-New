import { localGame } from '@/api/localGameClient.js';
import { normalizeCourtSide, sideMissionRepair } from '@/lib/tutorialSideState.js';
import { deterministicMissionSelection, missionRuntime, missionStatus, requirementsMet, validateMissionReward } from '@/missions/missionSystem.js';
import { TUTORIAL_MISSION_CATALOG } from '@/onboarding/tutorialSteps.js';
import { PERIODIC_MISSIONS } from '@/missions/periodicMissionCatalog.js';

export const LEVELS = ['Iniciante', 'Amador', 'Competitivo', 'Avançado', 'Elite', 'Lenda'];

// Experiência de carreira é uma progressão de longo prazo separada da força do atleta.
// A habilidade esportiva continua sendo representada pelos atributos e pelo Overall.
export const CAREER_EXPERIENCE_MAX_LEVEL = 50;
export const CAREER_EXPERIENCE_MAX_XP = 180000;
export const CAREER_EXPERIENCE_CURVE = 1.85;

export const CAREER_EXPERIENCE_TITLES = Object.freeze([
  { level: 1, title: 'Novato' },
  { level: 5, title: 'Aprendiz' },
  { level: 10, title: 'Competidor' },
  { level: 20, title: 'Profissional' },
  { level: 30, title: 'Destaque do circuito' },
  { level: 40, title: 'Elite' },
  { level: 50, title: 'Auge profissional' },
]);

export function careerExperienceXpForLevel(level) {
  const safeLevel = Math.max(1, Math.min(CAREER_EXPERIENCE_MAX_LEVEL, Math.floor(Number(level) || 1)));
  if (safeLevel <= 1) return 0;
  const ratio = (safeLevel - 1) / (CAREER_EXPERIENCE_MAX_LEVEL - 1);
  return Math.round(CAREER_EXPERIENCE_MAX_XP * Math.pow(ratio, CAREER_EXPERIENCE_CURVE));
}

export function careerExperienceLevel(xp) {
  const safeXp = Math.max(0, Number(xp) || 0);
  if (safeXp >= CAREER_EXPERIENCE_MAX_XP) return CAREER_EXPERIENCE_MAX_LEVEL;
  let low = 1;
  let high = CAREER_EXPERIENCE_MAX_LEVEL;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (careerExperienceXpForLevel(mid) <= safeXp) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function careerExperienceTitle(levelOrXp, isXp = false) {
  const level = isXp ? careerExperienceLevel(levelOrXp) : Math.max(1, Number(levelOrXp) || 1);
  return [...CAREER_EXPERIENCE_TITLES].reverse().find(item => level >= item.level)?.title || 'Novato';
}

export function nextCareerExperienceXp(xp) {
  const level = careerExperienceLevel(xp);
  if (level >= CAREER_EXPERIENCE_MAX_LEVEL) return CAREER_EXPERIENCE_MAX_XP;
  return careerExperienceXpForLevel(level + 1);
}

export function previousCareerExperienceXp(xp) {
  return careerExperienceXpForLevel(careerExperienceLevel(xp));
}

export function careerExperienceProgress(xp) {
  const safeXp = Math.max(0, Number(xp) || 0);
  const level = careerExperienceLevel(safeXp);
  if (level >= CAREER_EXPERIENCE_MAX_LEVEL) return 100;
  const previous = careerExperienceXpForLevel(level);
  const next = careerExperienceXpForLevel(level + 1);
  return Math.max(0, Math.min(100, Math.round(((safeXp - previous) / Math.max(1, next - previous)) * 100)));
}

export function careerExperienceSummary(xp) {
  const level = careerExperienceLevel(xp);
  return {
    level,
    title: careerExperienceTitle(level),
    xp: Math.max(0, Number(xp) || 0),
    previousXp: previousCareerExperienceXp(xp),
    nextXp: nextCareerExperienceXp(xp),
    progress: careerExperienceProgress(xp),
    maxLevel: CAREER_EXPERIENCE_MAX_LEVEL,
    isMax: level >= CAREER_EXPERIENCE_MAX_LEVEL,
  };
}

export const CAREER_EXPERIENCE_UNLOCKS = Object.freeze([
  { level: 1, title: 'Base da carreira', description: 'Painel, treinos, dupla, calendário e competições essenciais.' },
  { level: 3, title: 'Oportunidades locais', description: 'Aulas, exibições e atividades extras de início de carreira.' },
  { level: 5, title: 'Relatórios de evolução', description: 'Leitura mais clara do progresso e dos pontos a desenvolver.' },
  { level: 10, title: 'Análise de parceiros', description: 'Comparações mais completas para decisões de dupla.' },
  { level: 15, title: 'Planejamento avançado', description: 'Mais contexto para calendário, carga de treinos e objetivos.' },
  { level: 20, title: 'Carreira profissional', description: 'Oportunidades profissionais e análises competitivas ampliadas.' },
  { level: 30, title: 'Influência no circuito', description: 'Mais peso em negociações, eventos e decisões de carreira.' },
  { level: 40, title: 'Recursos de elite', description: 'Relatórios e oportunidades reservados a atletas experientes.' },
  { level: 50, title: 'Auge profissional', description: 'Marco de maturidade competitiva. Títulos, recordes e legado continuam evoluindo depois dele.' },
]);

export function careerExperienceUnlocks(levelOrXp, isXp = false) {
  const level = isXp ? careerExperienceLevel(levelOrXp) : Math.max(1, Number(levelOrXp) || 1);
  const unlocked = CAREER_EXPERIENCE_UNLOCKS.filter(item => item.level <= level);
  const next = CAREER_EXPERIENCE_UNLOCKS.find(item => item.level > level) || null;
  return { unlocked, next, latest: unlocked[unlocked.length - 1] || CAREER_EXPERIENCE_UNLOCKS[0] };
}
export const PLAY_STYLES = ['Agressivo', 'Defensivo', 'Equilibrado', 'Tático', 'Potência'];

export const ATTRIBUTES = [
  { key: 'serve', label: 'Saque', icon: 'Zap' },
  { key: 'forehand', label: 'Forehand', icon: 'ArrowUpRight' },
  { key: 'backhand', label: 'Backhand', icon: 'ArrowUpLeft' },
  { key: 'volley', label: 'Voleio', icon: 'Waves' },
  { key: 'bandeja', label: 'Bandeja', icon: 'Circle' },
  { key: 'smash', label: 'Smash', icon: 'Hammer' },
  { key: 'defense', label: 'Defesa', icon: 'Shield' },
  { key: 'agility', label: 'Agilidade', icon: 'Gauge' },
  { key: 'strategy', label: 'Estratégia', icon: 'Brain' },
  { key: 'emotional_control', label: 'Controle Emoc.', icon: 'Flame' },
];

export const ATTRIBUTE_KEYS = ATTRIBUTES.map(a => a.key);

export const TRAINING_TYPES = [
  { id: 'serve', label: 'Treino de Saque', attribute: 'serve', icon: 'Zap', xp: 15, coins: 10, gain: 2 },
  { id: 'forehand', label: 'Treino de Forehand', attribute: 'forehand', icon: 'ArrowUpRight', xp: 15, coins: 10, gain: 2 },
  { id: 'backhand', label: 'Treino de Backhand', attribute: 'backhand', icon: 'ArrowUpLeft', xp: 15, coins: 10, gain: 2 },
  { id: 'volley', label: 'Treino de Voleio', attribute: 'volley', icon: 'Waves', xp: 15, coins: 10, gain: 2 },
  { id: 'bandeja', label: 'Treino de Bandeja', attribute: 'bandeja', icon: 'Circle', xp: 15, coins: 10, gain: 2 },
  { id: 'smash', label: 'Treino de Smash', attribute: 'smash', icon: 'Hammer', xp: 15, coins: 10, gain: 2 },
  { id: 'defense', label: 'Treino de Defesa', attribute: 'defense', icon: 'Shield', xp: 15, coins: 10, gain: 2 },
  { id: 'physical', label: 'Treino Físico', attribute: 'agility', icon: 'Gauge', xp: 20, coins: 15, gain: 2 },
  { id: 'tactical', label: 'Treino Tático', attribute: 'strategy', icon: 'Brain', xp: 20, coins: 15, gain: 2 },
  { id: 'mental', label: 'Treino Mental', attribute: 'emotional_control', icon: 'Flame', xp: 20, coins: 15, gain: 2 },
];

export const DAILY_TRAINING_LIMIT = 3;
export const DAILY_MATCH_LIMIT = 1;

export const MAX_ENERGY = 100;
export const TRAINING_ENERGY_COST = 10;
export const MATCH_ENERGY_COST = 15;
export const TOURNAMENT_ENERGY_COST = 20;
export const ENERGY_RECOVERY_PER_DAY = 12;
export const ENERGY_RECOVERY_FATIGUED = 6;

export const PHYSIO_WEEKLY_COOLDOWN = 7;

export const RECOVERY_TYPES = [
  { id: 'physio', label: 'Fisioterapia', icon: 'Heart', energyGain: 15, isTrainingSlot: true, description: '+15 energia · conta como treino do dia' },
  { id: 'rest', label: 'Descanso Total', icon: 'Moon', energyGain: 50, advanceDays: 1, description: '+50 energia · avança 1 dia · bloqueado se já treinou ou jogou hoje' },
];

export function levelForXp(xp) {
  if (xp >= 50000) return 'Lenda';
  if (xp >= 25000) return 'Elite';
  if (xp >= 10000) return 'Avançado';
  if (xp >= 3000) return 'Competitivo';
  if (xp >= 500) return 'Amador';
  return 'Iniciante';
}

export function levelIndex(xp) {
  return LEVELS.indexOf(levelForXp(xp));
}

export function nextLevelXp(xp) {
  const thresholds = [500, 3000, 10000, 25000, 50000];
  for (const t of thresholds) {
    if (xp < t) return t;
  }
  return xp;
}

export function prevLevelXp(xp) {
  const thresholds = [0, 500, 3000, 10000, 25000, 50000];
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) return thresholds[i];
  }
  return 0;
}

export function levelProgress(xp) {
  const prev = prevLevelXp(xp);
  const next = nextLevelXp(xp);
  if (next === prev) return 100;
  return Math.round(((xp - prev) / (next - prev)) * 100);
}

export function winRate(profile) {
  const total = (profile?.wins || 0) + (profile?.losses || 0);
  if (!total) return 0;
  return Math.round((profile.wins / total) * 100);
}

export function overallRating(profile) {
  if (!profile) return 0;
  const sum = ATTRIBUTE_KEYS.reduce((a, k) => a + (Number(profile[k]) || 0), 0);
  let rating = Math.round(sum / ATTRIBUTE_KEYS.length);
  if (profile._chemistryBonus) rating += profile._chemistryBonus;
  if (profile._energyPenalty) rating += profile._energyPenalty;
  return Math.max(1, Math.min(100, rating));
}

export function topAttributes(profile) {
  if (!profile) return [];
  return [...ATTRIBUTES]
    .map(a => ({ ...a, value: Number(profile[a.key]) || 0 }))
    .sort((a, b) => b.value - a.value);
}

export function canTrainToday(profile) {
  const done = profile?.trainings_today || 0;
  return { allowed: done < DAILY_TRAINING_LIMIT, remaining: Math.max(0, DAILY_TRAINING_LIMIT - done) };
}

export function daysSincePhysio(profile) {
  const last = profile?.last_physio_date;
  if (!last) return Infinity;
  const careerDate = profile?.career_date || '2026-01-01';
  const d1 = new Date(last + 'T00:00:00');
  const d2 = new Date(careerDate + 'T00:00:00');
  return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
}

export function canDoPhysio(profile) {
  const done = profile?.trainings_today || 0;
  const dailyOk = done < DAILY_TRAINING_LIMIT;
  return {
    allowed: dailyOk,
    dailyOk,
  };
}

export function canPlayMatchToday(profile) {
  const done = profile?.practice_matches_today || 0;
  return { allowed: done < DAILY_MATCH_LIMIT, remaining: Math.max(0, DAILY_MATCH_LIMIT - done) };
}

export function calculateTrainingGain(currentValue) {
  if (currentValue >= 95) return Math.random() < 0.08 ? 1 : 0;
  if (currentValue >= 90) return Math.random() < 0.15 ? 1 : 0;
  if (currentValue >= 80) return Math.random() < 0.25 ? 1 : 0;
  if (currentValue >= 70) return Math.random() < 0.40 ? 1 : 0;
  if (currentValue >= 60) return Math.random() < 0.55 ? 1 : 0;
  if (currentValue >= 50) return Math.random() < 0.70 ? 1 : 0;
  if (currentValue >= 40) return Math.random() < 0.85 ? 1 : 0;
  if (currentValue >= 25) return 1;
  if (currentValue >= 10) return Math.random() < 0.7 ? 2 : 1;
  return 2;
}

export function trainingGainChance(currentValue) {
  if (currentValue >= 95) return 8;
  if (currentValue >= 90) return 15;
  if (currentValue >= 80) return 25;
  if (currentValue >= 70) return 40;
  if (currentValue >= 60) return 55;
  if (currentValue >= 50) return 70;
  if (currentValue >= 40) return 85;
  return 100;
}

export function getChemistryBonus(chemistry) {
  if (chemistry >= 70) return 5;
  if (chemistry < 30) return -5;
  return 0;
}

export function chemistryLabel(chemistry) {
  if (chemistry >= 70) return { label: 'Excelente', color: 'text-green-400' };
  if (chemistry >= 50) return { label: 'Boa', color: 'text-primary' };
  if (chemistry >= 30) return { label: 'Razoável', color: 'text-amber-400' };
  return { label: 'Baixa', color: 'text-red-400' };
}

export function getEnergyPenalty(energy) {
  if (energy >= 70) return 0;
  if (energy >= 50) return -2;
  if (energy >= 30) return -5;
  return -10;
}

export function rollInjury(energy, age = 16) {
  let chance = energy < 30 ? 0.12 : 0.02;
  if (age > 30) chance += (age - 30) * 0.03;
  return Math.random() < chance;
}

export function isInjured(profile) {
  if (profile?.injury_status === 'lesionado' && Number(profile?.injury_days_remaining) > 0) return true;
  if (!profile?.injured_until) return false;
  const careerDate = profile?.career_date || '2026-01-01';
  return profile.injured_until > careerDate;
}

export function injuryRecoveryDays(profile) {
  if (!isInjured(profile)) return 0;
  if (profile?.injury_status === 'lesionado' && Number(profile?.injury_days_remaining) > 0) {
    return Number(profile.injury_days_remaining);
  }
  const careerDate = new Date((profile?.career_date || '2026-01-01') + 'T00:00:00');
  const injuredUntil = new Date(profile.injured_until + 'T00:00:00');
  return Math.max(0, Math.ceil((injuredUntil - careerDate) / (1000 * 60 * 60 * 24)));
}

export const RETIREMENT_AGE = 40;
export const STARTING_AGE = 16;

export function ageAtDate(birthDate, dateStr) {
  if (!birthDate || !dateStr) return STARTING_AGE;
  const birth = new Date(birthDate + 'T00:00:00');
  const d = new Date(dateStr + 'T00:00:00');
  let age = d.getFullYear() - birth.getFullYear();
  const m = d.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

export function calculateAge(profile) {
  if (!profile?.birth_date) return STARTING_AGE;
  return ageAtDate(profile.birth_date, profile.career_date || '2026-01-01');
}

export function isRetired(profile) {
  return !!profile?.retired;
}

export async function ensureMyProfile(user) {
  if (!user) return null;
  try {
    // Saves antigos podem não possuir created_by_id. No sistema offline há
    // somente um PlayerProfile por carreira, então tentamos primeiro pelo
    // proprietário e, se necessário, reutilizamos o perfil da carreira ativa.
    let existing = await localGame.entities.PlayerProfile.filter({ created_by_id: user.id });
    if (!existing || existing.length === 0) {
      existing = await localGame.entities.PlayerProfile.list(null, 1);
    }

    if (existing && existing.length > 0) {
      const p = existing[0];
      const updates = {};
      const correctLevel = levelForXp(p.xp || 0);
      const correctCareerLevel = careerExperienceLevel(p.xp || 0);
      if (p.level !== correctLevel) updates.level = correctLevel;
      if (Number(p.career_level) !== correctCareerLevel) updates.career_level = correctCareerLevel;
      if (!p.career_date) updates.career_date = '2026-01-01';
      if (!p.created_by_id && user.id) updates.created_by_id = user.id;
      if (!p.court_side && ['direita', 'esquerda'].includes(p.position)) updates.court_side = p.position;
      if (Object.keys(updates).length > 0) {
        return await localGame.entities.PlayerProfile.update(p.id, updates);
      }
      return p;
    }

    const created = await localGame.entities.PlayerProfile.create({
      created_by_id: user.id,
      sport_name: 'Novo Atleta',
      avatar_url: '',
      country: 'Brasil',
      city: '',
      level: 'Iniciante',
      career_level: 1,
      play_style: 'Equilibrado',
      xp: 0,
      coins: 100,
      career_date: '2026-01-01',
      birth_date: '2010-01-01',
      serve: 10, forehand: 10, backhand: 10, volley: 10, bandeja: 10, smash: 10,
      defense: 10, agility: 10, strategy: 10, emotional_control: 10,
      court_side: null,
      play_style: null,
      onboarding_completed: false,
      onboarding_stage: 'welcome',
      unspent_attribute_points: 0,
      trainings_today: 0,
      practice_matches_today: 0,
      partner_chemistry: 50,
      energy: 100,
      fatigue: 0,
      morale: 70,
      confidence: 50,
      form: 50,
      weekly_training_plan: {},
      development_goals: [],
      did_physio_today: false,
    });
    return created;
  } catch (e) {
    console.error('ensureMyProfile', e);
    return null;
  }
}

export async function getWorldRank(profile) {
  if (!profile) return { rank: 0, total: 0, points: 0, unranked: true, displayRank: '1000+' };
  try {
    const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1500);
    const active = (athletes || []).filter(
      athlete => !athlete.retired && athlete.career_phase !== 'Aposentado'
    );
    const playerPoints = Math.max(0, Number(profile.rank_points ?? profile.ranking_points ?? profile.world_ranking_points) || 0);
    const officialMatches = Math.max(0, Number(profile.matches_played) || 0);
    const officialTournaments = Math.max(0, Number(profile.tournaments_played) || 0);
    const normalizeName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
    const profileName = normalizeName(profile.sport_name || profile.name);
    const pointsByName = new Map();

    for (const athlete of active) {
      const name = normalizeName(athlete.name || athlete.sport_name);
      if (!name || name === profileName || athlete.id === profile.id) continue;
      const points = Math.max(0, Number(athlete.world_ranking_points ?? athlete.ranking_points) || 0);
      pointsByName.set(name, Math.max(pointsByName.get(name) || 0, points));
    }

    const competitors = [...pointsByName.values()];
    const total = competitors.length + 1;
    const unranked = playerPoints <= 0 || (officialMatches <= 0 && officialTournaments <= 0);
    const rank = competitors.filter(points => points > playerPoints).length + 1;
    return {
      rank,
      total,
      points: playerPoints,
      unranked,
      displayRank: unranked && rank > 1000 ? '1000+' : String(rank),
    };
  } catch (error) {
    console.error('getWorldRank', error);
    return { rank: 0, total: 0, points: 0, unranked: true, displayRank: '1000+' };
  }
}

export function formatDate(dateStr) {
  if (!dateStr) return 'Data não disponível';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr)) ? `${dateStr}T00:00:00` : dateStr;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? 'Data não disponível' : date.toLocaleDateString('pt-BR');
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function missionPeriodKey(missionType, careerDate = todayStr()) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(careerDate || '') ? careerDate : todayStr();
  const date = new Date(`${safeDate}T12:00:00`);
  const type = String(missionType || 'sazonal').toLowerCase();

  if (type === 'diaria') return `day:${safeDate}`;
  if (type === 'mensal') return `month:${safeDate.slice(0, 7)}`;
  if (type === 'sazonal') return `season:${safeDate.slice(0, 4)}`;

  // Semana da carreira: segunda-feira a domingo.
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return `week:${date.toISOString().slice(0, 10)}`;
}

export function missionPeriodEndsAt(missionType, careerDate = todayStr()) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(careerDate || '') ? careerDate : todayStr();
  const date = new Date(`${safeDate}T12:00:00`);
  const type = String(missionType || 'sazonal').toLowerCase();

  if (type === 'diaria') return safeDate;
  if (type === 'semanal') {
    const day = date.getDay();
    const sundayOffset = day === 0 ? 0 : 7 - day;
    date.setDate(date.getDate() + sundayOffset);
    return date.toISOString().slice(0, 10);
  }
  if (type === 'mensal') {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).toISOString().slice(0, 10);
  }
  return `${date.getFullYear()}-12-31`;
}

async function missionCareerDate(profileId, fallback = todayStr()) {
  try {
    const profiles = await localGame.entities.PlayerProfile.filter({ id: profileId });
    return profiles?.[0]?.career_date || fallback;
  } catch {
    return fallback;
  }
}

const LEGACY_TUTORIAL_MISSIONS = [
  { title: 'Bem-vindo ao Padel Legacy', description: 'Abra a página Carreira e conheça o painel principal.', mission_type: 'tutorial', objective_type: 'visit_career', target_count: 1, xp_reward: 20, coins_reward: 50, tutorial_order: 1, tutorial_route: '/game' },
  { title: 'Crie sua identidade', description: 'Defina o nome e a identidade visual do seu atleta.', mission_type: 'tutorial', objective_type: 'visit_character', target_count: 1, xp_reward: 25, coins_reward: 50, tutorial_order: 2, tutorial_route: '/character' },
  { title: 'Escolha seu lado', description: 'Defina se você jogará prioritariamente pela direita ou pela esquerda.', mission_type: 'tutorial', objective_type: 'choose_court_side', target_count: 1, xp_reward: 30, coins_reward: 50, tutorial_order: 3, tutorial_route: '/game/missions' },
  { title: 'Defina seu estilo', description: 'Escolha sua identidade tática e receba automaticamente seus atributos iniciais.', mission_type: 'tutorial', objective_type: 'choose_play_style', target_count: 1, xp_reward: 40, coins_reward: 75, tutorial_order: 4, tutorial_route: '/game/missions' },
  { title: 'Primeiro treino', description: 'Complete uma sessão de treino para desenvolver um atributo.', mission_type: 'tutorial', objective_type: 'complete_training', target_count: 1, xp_reward: 50, coins_reward: 75, tutorial_order: 5, tutorial_route: '/game/training' },
  { title: 'Estrutura de evolução', description: 'Visite o Centro de Treinamento e conheça suas instalações.', mission_type: 'tutorial', objective_type: 'visit_training_center', target_count: 1, xp_reward: 30, coins_reward: 60, tutorial_order: 6, tutorial_route: '/training-center' },
  { title: 'Encontre sua dupla', description: 'Abra a área de parceiros e conheça as opções de dupla.', mission_type: 'tutorial', objective_type: 'visit_partners', target_count: 1, xp_reward: 40, coins_reward: 75, tutorial_order: 7, tutorial_route: '/partners' },
  { title: 'Conheça o mercado', description: 'Visite a Loja e veja os equipamentos disponíveis.', mission_type: 'tutorial', objective_type: 'visit_shop', target_count: 1, xp_reward: 25, coins_reward: 75, tutorial_order: 8, tutorial_route: '/game/shop' },
  { title: 'Primeira compra', description: 'Compre um item na Loja.', mission_type: 'tutorial', objective_type: 'buy_item', target_count: 1, xp_reward: 50, coins_reward: 100, tutorial_order: 9, tutorial_route: '/game/shop' },
  { title: 'Prepare seu equipamento', description: 'Equipe um item do Inventário.', mission_type: 'tutorial', objective_type: 'equip_item', target_count: 1, xp_reward: 50, coins_reward: 100, tutorial_order: 10, tutorial_route: '/game/inventory' },
  { title: 'Planeje sua semana', description: 'Abra o Calendário da carreira.', mission_type: 'tutorial', objective_type: 'visit_calendar', target_count: 1, xp_reward: 30, coins_reward: 60, tutorial_order: 11, tutorial_route: '/game/calendar' },
  { title: 'O tempo avança', description: 'Avance um dia no calendário da carreira.', mission_type: 'tutorial', objective_type: 'advance_days', target_count: 1, xp_reward: 50, coins_reward: 100, tutorial_order: 12, tutorial_route: '/game/calendar' },
  { title: 'Entre no circuito', description: 'Visite a página de Torneios.', mission_type: 'tutorial', objective_type: 'visit_tournaments', target_count: 1, xp_reward: 35, coins_reward: 75, tutorial_order: 13, tutorial_route: '/tournaments' },
  { title: 'Primeiro torneio', description: 'Participe de um torneio oficial.', mission_type: 'tutorial', objective_type: 'join_tournament', target_count: 1, xp_reward: 100, coins_reward: 150, tutorial_order: 14, tutorial_route: '/tournaments' },
  { title: 'Meça sua evolução', description: 'Visite o Ranking mundial.', mission_type: 'tutorial', objective_type: 'visit_ranking', target_count: 1, xp_reward: 35, coins_reward: 75, tutorial_order: 15, tutorial_route: '/ranking' },
  { title: 'Acompanhe as notícias', description: 'Abra o Jornal e conheça os acontecimentos do circuito.', mission_type: 'tutorial', objective_type: 'visit_journal', target_count: 1, xp_reward: 35, coins_reward: 75, tutorial_order: 16, tutorial_route: '/journal' },
  { title: 'Fale com a imprensa', description: 'Visite a área de Imprensa e conheça as entrevistas.', mission_type: 'tutorial', objective_type: 'visit_press', target_count: 1, xp_reward: 40, coins_reward: 80, tutorial_order: 17, tutorial_route: '/press' },
  { title: 'Administre sua carreira', description: 'Abra a Economia e conheça receitas, despesas e equipe.', mission_type: 'tutorial', objective_type: 'visit_economy', target_count: 1, xp_reward: 50, coins_reward: 100, tutorial_order: 18, tutorial_route: '/game/economy', medal_reward: 'Primeiros Passos' },
];

// Catálogo curto e orientado ao ciclo principal. O legado acima permanece no
// arquivo apenas para reconhecer títulos antigos e desativá-los sem apagar o
// progresso ou as recompensas já persistidas.
const SHORT_TUTORIAL_MISSIONS = [
  { title: 'Bem-vindo ao Padel Legacy', description: 'Conheça o painel e o ciclo da carreira.', why_it_matters: 'O painel mostra o que fazer agora e como acompanhar sua evolução.', action_label: 'Ver painel', mission_type: 'tutorial', objective_type: 'visit_career', target_count: 1, xp_reward: 20, coins_reward: 50, tutorial_order: 1, tutorial_route: '/game' },
  { title: 'Nome do atleta', description: 'Defina como seu atleta será chamado em partidas e notícias.', why_it_matters: 'O nome do atleta é separado do nome usado para identificar o save.', action_label: 'Definir nome', mission_type: 'tutorial', objective_type: 'set_player_name', target_count: 1, xp_reward: 25, coins_reward: 50, tutorial_order: 2, tutorial_route: '/game/missions' },
  { title: 'Escolha mão e lado', description: 'Defina sua mão dominante e o lado preferencial de forma independente.', why_it_matters: 'Esses eixos influenciam ângulos e posicionamento sem proibir estilos.', action_label: 'Escolher mão e lado', mission_type: 'tutorial', objective_type: 'choose_court_side', target_count: 1, xp_reward: 30, coins_reward: 50, tutorial_order: 3, tutorial_route: '/game/missions' },
  { title: 'Revise seu atleta', description: 'Confira nome, mão dominante, lado, estilo, arquétipo, atributos, pontos fortes e pontos a desenvolver; conclua em Confirmar perfil.', why_it_matters: 'Essas escolhas definem seu ponto de partida e orientam treinos e parcerias.', action_label: 'Revisar atleta', mission_type: 'tutorial', objective_type: 'choose_play_style', target_count: 1, xp_reward: 40, coins_reward: 75, tutorial_order: 4, tutorial_route: '/game/missions' },
  { title: 'Primeiro treino de quadra', description: 'Escolha Golpes de fundo para desenvolver forehand e backhand com um orçamento compartilhado. Confira intensidade, energia e fadiga antes de confirmar.', why_it_matters: 'Grupos organizam a preparação; foco e intensidade definem onde o progresso será distribuído e quanto desgaste será gerado.', action_label: 'Ir para Treinos', mission_type: 'tutorial', objective_type: 'complete_training', target_count: 1, xp_reward: 50, coins_reward: 75, tutorial_order: 5, tutorial_route: '/game/training' },
  { title: 'Entenda sua energia', description: 'Observe a energia consumida pelo treino e como recuperá-la.', why_it_matters: 'Energia baixa reduz desempenho e aumenta o risco físico.', action_label: 'Ver energia', mission_type: 'tutorial', objective_type: 'understand_energy', target_count: 1, xp_reward: 20, coins_reward: 40, tutorial_order: 6, tutorial_route: '/game/training' },
  { title: 'Encontre sua dupla', description: 'Forme uma parceria compatível com seu lado e estilo.', why_it_matters: 'Entrosamento e complementaridade afetam o desempenho competitivo.', action_label: 'Buscar parceiro', mission_type: 'tutorial', objective_type: 'select_partner', target_count: 1, xp_reward: 60, coins_reward: 100, tutorial_order: 7, tutorial_route: '/partners' },
  { title: 'Primeiro torneio', description: 'Encontre um torneio aberto, confira prazo e parceiro e confirme a inscrição. Depois, aguarde a data para jogar.', why_it_matters: 'Somente uma inscrição confirmada garante sua vaga; eventos sobrepostos exigem escolher uma única competição.', action_label: 'Ver torneios', mission_type: 'tutorial', objective_type: 'join_tournament', target_count: 1, xp_reward: 100, coins_reward: 150, tutorial_order: 8, tutorial_route: '/tournaments' },
  { title: 'Primeiro resultado', description: 'Conclua uma partida e analise recompensas, energia e evolução.', why_it_matters: 'O resultado mostra o que funcionou e qual deve ser seu próximo ajuste.', action_label: 'Jogar partida', mission_type: 'tutorial', objective_type: 'play_matches', target_count: 1, xp_reward: 100, coins_reward: 150, tutorial_order: 9, tutorial_route: '/matches' },
  { title: 'Conclua seus primeiros passos', description: 'Você conheceu os principais sistemas. Volte ao painel, veja suas recomendações e confirme o início da carreira livre.', why_it_matters: 'O painel reúne sua situação, compromissos e ações recomendadas.', action_label: 'Ir para o painel', mission_type: 'tutorial', objective_type: 'finish_tutorial', target_count: 1, xp_reward: 50, coins_reward: 100, tutorial_order: 10, tutorial_route: '/game', medal_reward: 'Primeiros Passos' },
];

export const TUTORIAL_MISSIONS = TUTORIAL_MISSION_CATALOG;

export async function ensureTutorialMissionCatalog() {
  const existing = await localGame.entities.Mission.list('-created_date', 500);
  const fullCatalog = [...TUTORIAL_MISSIONS, ...PERIODIC_MISSIONS];

  const canonicalKey = mission => mission.catalog_key
    || (mission.mission_type === 'tutorial' ? `tutorial:${mission.objective_type}:${Number(mission.tutorial_order || 0)}` : `${mission.mission_type}:${mission.id || mission.objective_type}`);

  const existingByKey = new Map();
  for (const mission of existing || []) {
    const key = canonicalKey(mission);
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push(mission);
  }

  const missing = fullCatalog.filter(mission => !(existingByKey.get(canonicalKey(mission)) || []).length);
  if (missing.length) {
    const rows = missing.map(mission => ({ ...mission, catalog_key: mission.catalog_key || canonicalKey(mission), is_active: true }));
    try {
      await localGame.entities.Mission.bulkCreate(rows);
    } catch {
      for (const mission of rows) await localGame.entities.Mission.create(mission);
    }
  }

  const refreshed = await localGame.entities.Mission.list('-created_date', 500);
  const canonicalCatalog = new Map(fullCatalog.map(mission => [canonicalKey(mission), mission]));
  const seenCanonical = new Set();
  const updates = [];

  for (const mission of refreshed || []) {
    if (!mission?.id) continue;
    const key = canonicalKey(mission);
    const canonical = canonicalCatalog.get(key);

    if (canonical && !seenCanonical.has(key)) {
      seenCanonical.add(key);
      updates.push({
        ...mission,
        ...canonical,
        catalog_key: canonical.catalog_key || key,
        id: mission.id,
        is_active: true,
      });
      continue;
    }

    if (mission.mission_type === 'tutorial') {
      // Tutoriais antigos ou linhas duplicadas permanecem no histórico, mas
      // não aparecem nem recebem novos eventos/recompensas.
      updates.push({ ...mission, is_active: false, superseded_by_catalog: true });
    }
  }

  if (updates.length) await localGame.entities.Mission.bulkUpdate(updates);
  return localGame.entities.Mission.filter({ is_active: true });
}

function emitMissionEvent(detail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('padel:mission-completed', { detail }));
}

const missionRewardLocks = new Map();

async function rewardMissionAutomatically(profileId, mission, progressRow) {
  const lockKey = `${profileId}:${mission?.id}:${progressRow?.period_key || 'career'}`;
  if (missionRewardLocks.has(lockKey)) return missionRewardLocks.get(lockKey);
  const operation = rewardMissionAutomaticallyUnlocked(profileId, mission, progressRow)
    .finally(() => missionRewardLocks.delete(lockKey));
  missionRewardLocks.set(lockKey, operation);
  return operation;
}

async function rewardMissionAutomaticallyUnlocked(profileId, mission, progressRow) {
  if (!progressRow || progressRow.claimed) return progressRow;
  const latestRows = await localGame.entities.MissionProgress.filter({ id: progressRow.id, profile_id: profileId });
  const latest = latestRows?.[0] || progressRow;
  if (latest.claimed) return latest;
  if (latest.reward_delivered) {
    return localGame.entities.MissionProgress.update(progressRow.id, {
      completed: true,
      claimed: true,
      completed_at: latest.completed_at || new Date().toISOString(),
      completion_notified_at: latest.completion_notified_at || latest.completed_at || new Date().toISOString(),
    });
  }
  const profiles = await localGame.entities.PlayerProfile.filter({ id: profileId });
  const profile = profiles?.[0];
  if (!profile) return progressRow;
  const rewardValidation = validateMissionReward(mission);
  if (!rewardValidation.valid) throw new Error(rewardValidation.errors.join('; '));
  const medal = mission.medal_reward;
  const medals = medal && !(profile.medals || []).includes(medal) ? [...(profile.medals || []), medal] : (profile.medals || []);
  await localGame.entities.PlayerProfile.update(profile.id, {
    xp: Number(profile.xp || 0) + Number(mission.xp_reward || 0),
    coins: Number(profile.coins || 0) + Number(mission.coins_reward || 0),
    medals,
  });
  const completedAt = new Date().toISOString();
  const claimed = await localGame.entities.MissionProgress.update(progressRow.id, { status: 'rewarded', completed: true, claimed: true, reward_delivered: true, completed_at: completedAt, reward_claimed_at: completedAt, completion_notified_at: completedAt });
  const cycleId = progressRow.period_key || 'tutorial:career';
  emitMissionEvent({ mission, reward: { xp: Number(mission.xp_reward || 0), coins: Number(mission.coins_reward || 0), medal }, tutorial: mission.mission_type === 'tutorial', cycleId, completedAt, notificationKey: `mission-completed:${profileId}:${mission.id}:${cycleId}` });
  return claimed;
}

async function tutorialUnlocked(mission, allMissions, progressRows) {
  if (mission.mission_type !== 'tutorial') return true;
  const order = Number(mission.tutorial_order || 0);
  if (order <= 1) return true;
  const previous = (allMissions || []).find(m => m.mission_type === 'tutorial' && Number(m.tutorial_order || 0) === order - 1);
  if (!previous) return true;
  return Boolean((progressRows || []).find(p => p.mission_id === previous.id)?.claimed);
}

export async function syncMissionProgressPeriods(profile, missions = null, rows = null) {
  if (!profile?.id) return [];
  const careerDate = profile.career_date || todayStr();
  const activeMissions = missions || await localGame.entities.Mission.filter({ is_active: true });
  const progressRows = rows || await localGame.entities.MissionProgress.filter({ profile_id: profile.id });
  const synced = [];

  for (const mission of activeMissions || []) {
    const rowsForMission = progressRows.filter(row => row.mission_id === mission.id);
    if (mission.mission_type === 'tutorial') { synced.push(...rowsForMission); continue; }
    const periodKey = missionPeriodKey(mission.mission_type, careerDate);
    for (const row of rowsForMission) {
      if (row.period_key !== periodKey && !row.claimed && !row.completed) synced.push(await localGame.entities.MissionProgress.update(row.id, { status: 'expired', expired_at: new Date().toISOString() }));
      else synced.push(row);
    }
  }
  return synced;
}

export async function incrementMissionProgress(profileId, objectiveTypes, count = 1, careerDateOverride = null, options = {}) {
  const completedNow = [];
  try {
    if (!options.allowDuringHydration && !missionRuntime.canProcessEvents()) return completedNow;
    const careerDate = careerDateOverride || await missionCareerDate(profileId);
    const types = Array.isArray(objectiveTypes) ? objectiveTypes : [objectiveTypes];
    const allMissions = await ensureTutorialMissionCatalog();
    const profilesForSelection = await localGame.entities.PlayerProfile.filter({ id: profileId });
    const selectionProfile = profilesForSelection?.[0] || {};
    const selectedPeriodicIds = new Set();
    for (const category of ['diaria','semanal','mensal','sazonal']) {
      const pool = allMissions.filter(m => m.mission_type === category && requirementsMet(m, selectionProfile, { tournamentsUnlocked:true, hasReplay:false, sponsorsUnlocked:false }));
      const limit = category === 'diaria' || category === 'semanal' ? 3 : 20;
      deterministicMissionSelection(pool,{careerId:profileId,cycleId:missionPeriodKey(category,careerDate),category,limit}).forEach(m => selectedPeriodicIds.add(m.id));
    }
    let progressRows = await localGame.entities.MissionProgress.filter({ profile_id: profileId });
    for (const type of types) {
      const excludedMissionTypes = new Set(options.excludeMissionTypes || []);
      const allowedMissionTypes = options.onlyMissionTypes ? new Set(options.onlyMissionTypes) : null;
      const missions = (allMissions || []).filter(m =>
        m.is_active !== false
        && m.objective_type === type
        && (!options.missionId || m.id === options.missionId)
        && !excludedMissionTypes.has(m.mission_type)
        && (!allowedMissionTypes || allowedMissionTypes.has(m.mission_type))
      );
      for (const m of missions) {
        if (m.mission_type !== 'tutorial' && !selectedPeriodicIds.has(m.id)) continue;
        if (!(await tutorialUnlocked(m, allMissions, progressRows))) continue;
        const periodKey = m.mission_type === 'tutorial' ? 'tutorial:career' : missionPeriodKey(m.mission_type, careerDate);
        const prog = progressRows.find(p => p.mission_id === m.id && (m.mission_type === 'tutorial' || p.period_key === periodKey));
        const baseProgress = Number(prog?.progress || 0);
        if (prog?.claimed || prog?.reward_delivered || missionStatus(prog) === 'expired') continue;
        if (options.triggerEventId && prog?.last_trigger_event_id === options.triggerEventId) continue;
        const newProgress = Math.min(Number(m.target_count || 1), baseProgress + count);
        let updated;
        const completed = newProgress >= Number(m.target_count || 1); const status = completed ? 'completed' : 'in_progress';
        if (prog) updated = await localGame.entities.MissionProgress.update(prog.id, { status, progress: newProgress, completed, claimed: false, period_key: periodKey, period_ends_at: m.mission_type === 'tutorial' ? null : missionPeriodEndsAt(m.mission_type, careerDate), last_trigger_event_id: options.triggerEventId || null });
        else updated = await localGame.entities.MissionProgress.create({ mission_id: m.id, profile_id: profileId, status, progress: newProgress, completed, claimed: false, reward_delivered: false, period_key: periodKey, period_ends_at: m.mission_type === 'tutorial' ? null : missionPeriodEndsAt(m.mission_type, careerDate), last_trigger_event_id: options.triggerEventId || null });
        progressRows = [...progressRows.filter(p => p.id !== updated.id), updated];
        if (newProgress >= Number(m.target_count || 1)) {
          const claimed = options.silent || options.noReward ? await localGame.entities.MissionProgress.update(updated.id, { status: 'rewarded', claimed: true, reward_delivered: true, completed: true, completed_at: new Date().toISOString(), reward_claimed_at: new Date().toISOString(), completion_notified_at: new Date().toISOString(), migration_recognized: true }) : await rewardMissionAutomatically(profileId, m, updated);
          progressRows = [...progressRows.filter(p => p.mission_id !== m.id), claimed];
          completedNow.push(m);
        }
      }
    }
  } catch (e) {
    console.error('mission progress', e);
    if (options.throwOnError) throw e;
  }
  return completedNow;
}

export async function reconcileCourtSideTutorial(profile, missions = null, rows = null) {
  if (!profile?.id) return { profile, changed: false };
  const allMissions = missions || await ensureTutorialMissionCatalog();
  const mission = (allMissions || []).find(item => item.objective_type === 'choose_court_side');
  if (!mission) return { profile, changed: false };
  const progressRows = rows || await localGame.entities.MissionProgress.filter({ profile_id: profile.id });
  const row = (progressRows || []).find(item => item.mission_id === mission.id);
  const side = normalizeCourtSide(profile.court_side);
  const repair = sideMissionRepair(profile, row);

  if (repair === 'reopen') {
    if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      console.warn('[career-migration] Missão de lado concluída sem court_side; missão reaberta sem remover recompensa.', { profileId: profile.id });
    }
    await localGame.entities.MissionProgress.update(row.id, {
      progress: 0,
      completed: false,
      claimed: false,
      reward_delivered: Boolean(row.reward_delivered || row.claimed),
    });
    const updated = await localGame.entities.PlayerProfile.update(profile.id, {
      play_style: null,
      onboarding_completed: false,
      onboarding_stage: 'side',
    });
    return { profile: updated, changed: true };
  }

  if (repair === 'complete' && await tutorialUnlocked(mission, allMissions, progressRows)) {
    await incrementMissionProgress(profile.id, 'choose_court_side', 1, profile.career_date);
    const updated = await localGame.entities.PlayerProfile.update(profile.id, { onboarding_stage: 'style' });
    return { profile: updated, changed: true };
  }
  return { profile, changed: false };
}

export async function applyMatchRewards(profile, won, options = {}) {
  const xpGain = won ? 50 : 20;
  const coinsGain = won ? 30 : 10;
  const newXp = (profile.xp || 0) + xpGain;
  const updates = {
    matches_played: (profile.matches_played || 0) + 1,
    wins: (profile.wins || 0) + (won ? 1 : 0),
    losses: (profile.losses || 0) + (won ? 0 : 1),
    xp: newXp,
    coins: (profile.coins || 0) + coinsGain,
    level: levelForXp(newXp),
  };
  if (won) {
    const randomAttr = ATTRIBUTE_KEYS[Math.floor(Math.random() * ATTRIBUTE_KEYS.length)];
    const currentVal = Number(profile[randomAttr]) || 0;
    const gain = calculateTrainingGain(currentVal);
    if (gain > 0) {
      updates[randomAttr] = Math.min(100, currentVal + gain);
    }
  }
  if (profile.partner_id) {
    updates.partner_chemistry = Math.max(0, Math.min(100, (profile.partner_chemistry || 50) + (won ? 10 : -5)));
  }
  if (!options.skipPhysical) {
    updates.energy = Math.max(0, (profile.energy || 100) - TOURNAMENT_ENERGY_COST);
  }
  if (!options.skipPhysical && rollInjury(profile.energy || 100, calculateAge(profile))) {
    const careerD = new Date((profile.career_date || '2026-01-01') + 'T00:00:00');
    const recoveryDays = 7 + Math.floor(Math.random() * 8);
    const recoveryDate = new Date(careerD);
    recoveryDate.setDate(recoveryDate.getDate() + recoveryDays);
    updates.injured_until = recoveryDate.toISOString().slice(0, 10);
    updates.energy = 0;
  }
  const updated = await localGame.entities.PlayerProfile.update(profile.id, updates);
  await incrementMissionProgress(profile.id, won ? ['win_matches', 'play_matches'] : ['play_matches']);
  return updated;
}

export async function applyPracticeRewards(profile, won) {
  const xpGain = won ? 10 : 5;
  const coinsGain = won ? 8 : 3;
  const newXp = (profile.xp || 0) + xpGain;
  const updates = {
    matches_played: (profile.matches_played || 0) + 1,
    xp: newXp,
    coins: (profile.coins || 0) + coinsGain,
    level: levelForXp(newXp),
    practice_matches_today: (profile.practice_matches_today || 0) + 1,
    energy: Math.max(0, (profile.energy || 100) - MATCH_ENERGY_COST),
  };
  if (rollInjury(profile.energy || 100, calculateAge(profile))) {
    const careerD = new Date((profile.career_date || '2026-01-01') + 'T00:00:00');
    const recoveryDays = 7 + Math.floor(Math.random() * 8);
    const recoveryDate = new Date(careerD);
    recoveryDate.setDate(recoveryDate.getDate() + recoveryDays);
    updates.injured_until = recoveryDate.toISOString().slice(0, 10);
    updates.energy = 0;
  }
  const updated = await localGame.entities.PlayerProfile.update(profile.id, updates);
  await incrementMissionProgress(profile.id, won ? ['play_matches', 'win_matches'] : ['play_matches']);
  return updated;
}

export async function applyRecovery(profile, recoveryType) {
  // Physio: counts as a training slot, limited to 1x per week
  if (recoveryType.isTrainingSlot) {
    const physioCheck = canDoPhysio(profile);
    if (!physioCheck.allowed) return null;
  }

  // Rest: blocked if already trained or played a match today
  if (recoveryType.advanceDays) {
    const hasActivity = (profile.trainings_today || 0) > 0 || (profile.practice_matches_today || 0) > 0;
    if (hasActivity) return null;
  }

  const newEnergy = Math.min(MAX_ENERGY, (profile.energy || 0) + recoveryType.energyGain);
  const updates = { energy: newEnergy };

  // Physio: counts as a training slot for the day
  if (recoveryType.isTrainingSlot) {
    updates.trainings_today = (profile.trainings_today || 0) + 1;
    updates.did_physio_today = true;
  }

  // Rest: advance day, block match on new day, reset counters, clear injury
  if (recoveryType.advanceDays) {
    const careerD = new Date((profile.career_date || '2026-01-01') + 'T00:00:00');
    careerD.setDate(careerD.getDate() + recoveryType.advanceDays);
    const newCareerDate = careerD.toISOString().slice(0, 10);
    updates.career_date = newCareerDate;
    updates.trainings_today = 0;
    updates.did_physio_today = false;
    updates.practice_matches_today = 1; // Block match (Descanso Total consumes match slot)
    if (profile.injured_until && profile.injured_until <= newCareerDate) {
      updates.injured_until = null;
    }
  }

  const updated = await localGame.entities.PlayerProfile.update(profile.id, updates);
  incrementMissionProgress(profile.id, 'use_recovery').catch(() => {});
  return updated;
}

export function getPlayStyleSummary(profile) {
  if (!profile) return null;

  const groupAvg = (keys) => {
    const sum = keys.reduce((acc, k) => acc + (Number(profile[k]) || 0), 0);
    return sum / keys.length;
  };

  const offensive = groupAvg(['volley', 'smash', 'forehand', 'serve']);
  const defensive = groupAvg(['defense', 'backhand', 'agility']);
  const tactical = groupAvg(['strategy', 'emotional_control']);
  const power = groupAvg(['serve', 'smash']);
  const overallAvg = (offensive + defensive + tactical) / 3;
  const threshold = overallAvg + 5;

  let label, description;

  if (power > threshold && power > 60) {
    label = 'Potência';
    description = 'Especialista em golpes explosivos. Saque e smash devastadores que definem pontos.';
  } else if (offensive > threshold && offensive > defensive) {
    label = 'Ofensivo';
    description = 'Vive na rede. Voleios e smashes são suas armas principais para pressionar adversários.';
  } else if (defensive > threshold && defensive > offensive) {
    label = 'Defensivo';
    description = 'Sólido no fundo da quadra. Defesa e agilidade para contragolpear com eficiência.';
  } else if (tactical > threshold && tactical > 60) {
    label = 'Tático';
    description = 'Joga com inteligência. Estratégia e controle emocional acima da média.';
  } else {
    label = 'Equilibrado';
    description = 'Atributos bem distribuídos. Adapta-se a qualquer situação de jogo.';
  }

  const shots = ATTRIBUTES
    .filter(a => ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash'].includes(a.key))
    .map(a => ({ ...a, value: Number(profile[a.key]) || 0 }))
    .sort((a, b) => b.value - a.value);

  return {
    label,
    description,
    best: shots[0],
    secondBest: shots[1],
    worst: shots[shots.length - 1],
    secondWorst: shots[shots.length - 2],
  };
}
