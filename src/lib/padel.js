import { localGame } from '@/api/localGameClient.js';
import { normalizeCourtSide, sideMissionRepair } from '@/lib/tutorialSideState.js';

export const LEVELS = ['Iniciante', 'Amador', 'Competitivo', 'Avançado', 'Elite', 'Lenda'];
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
  if (!profile?.injured_until) return false;
  const careerDate = profile?.career_date || '2026-01-01';
  return profile.injured_until > careerDate;
}

export function injuryRecoveryDays(profile) {
  if (!isInjured(profile)) return 0;
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
      if (p.level !== correctLevel) updates.level = correctLevel;
      if (!p.career_date) updates.career_date = '2026-01-01';
      if (!p.created_by_id && user.id) updates.created_by_id = user.id;
      if (!p.court_side && ['direita', 'esquerda'].includes(p.position)) updates.court_side = p.position;
      if (Object.keys(updates).length > 0) {
        return await localGame.entities.PlayerProfile.update(p.id, updates);
      }
      return p;
    }

    const firstName = (user.full_name || user.email || 'Jogador').split(' ')[0];
    const created = await localGame.entities.PlayerProfile.create({
      created_by_id: user.id,
      sport_name: user.full_name || firstName,
      avatar_url: '',
      country: 'Brasil',
      city: '',
      level: 'Iniciante',
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
  if (!profile) return { rank: 0, total: 0 };
  try {
    const [athletes, teams] = await Promise.all([
      localGame.entities.AthleteProfile.list('-world_ranking_points', 500),
      localGame.entities.TeamRanking.list('-ranking_points', 300),
    ]);

    const active = (athletes || []).filter(
      athlete => !athlete.retired && athlete.career_phase !== 'Aposentado'
    );
    const playerPoints = Math.max(
      0,
      Number(profile.rank_points ?? profile.ranking_points ?? profile.world_ranking_points) || 0
    );
    const normalizeName = value =>
      String(value || '').trim().toLocaleLowerCase('pt-BR');
    const profileName = normalizeName(profile.sport_name || profile.name);

    // Usa a mesma população da página Ranking: atletas cadastrados e jogadores
    // encontrados nas duplas profissionais. Mantém a maior pontuação por nome.
    const pointsByName = new Map();

    for (const athlete of active) {
      const name = normalizeName(athlete.name || athlete.sport_name);
      if (!name || name === profileName || athlete.id === profile.id) continue;
      const points = Math.max(
        0,
        Number(athlete.world_ranking_points ?? athlete.ranking_points) || 0
      );
      pointsByName.set(name, Math.max(pointsByName.get(name) || 0, points));
    }

    for (const team of teams || []) {
      const points = Math.max(
        0,
        Number(team.ranking_points ?? team.rank_points) || 0
      );
      for (const rawName of [team.player1_name, team.player2_name]) {
        const name = normalizeName(rawName);
        if (!name || name === profileName) continue;
        pointsByName.set(name, Math.max(pointsByName.get(name) || 0, points));
      }
    }

    const competitors = [...pointsByName.values()];
    if (competitors.length === 0) {
      return { rank: 0, total: 0, points: playerPoints };
    }

    const rank = competitors.filter(points => points > playerPoints).length + 1;
    return { rank, total: competitors.length + 1, points: playerPoints };
  } catch (error) {
    console.error('getWorldRank', error);
    return { rank: 0, total: 0 };
  }
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
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

export const TUTORIAL_MISSIONS = [
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

export async function ensureTutorialMissionCatalog() {
  const existing = await localGame.entities.Mission.list('-created_date', 300);
  const titles = new Set((existing || []).map(m => m.title));
  const missing = TUTORIAL_MISSIONS.filter(m => !titles.has(m.title));
  if (missing.length) {
    try { await localGame.entities.Mission.bulkCreate(missing.map(m => ({ ...m, is_active: true }))); }
    catch { for (const mission of missing) await localGame.entities.Mission.create({ ...mission, is_active: true }); }
  }
  return localGame.entities.Mission.filter({ is_active: true });
}

function emitMissionEvent(detail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('padel:mission-completed', { detail }));
}

async function rewardMissionAutomatically(profileId, mission, progressRow) {
  if (!progressRow || progressRow.claimed) return progressRow;
  const latestRows = await localGame.entities.MissionProgress.filter({ id: progressRow.id, profile_id: profileId });
  const latest = latestRows?.[0] || progressRow;
  if (latest.claimed) return latest;
  if (latest.reward_delivered) {
    return localGame.entities.MissionProgress.update(progressRow.id, {
      completed: true,
      claimed: true,
      completed_at: latest.completed_at || new Date().toISOString(),
    });
  }
  const profiles = await localGame.entities.PlayerProfile.filter({ id: profileId });
  const profile = profiles?.[0];
  if (!profile) return progressRow;
  const medal = mission.medal_reward;
  const medals = medal && !(profile.medals || []).includes(medal) ? [...(profile.medals || []), medal] : (profile.medals || []);
  await localGame.entities.PlayerProfile.update(profile.id, {
    xp: Number(profile.xp || 0) + Number(mission.xp_reward || 0),
    coins: Number(profile.coins || 0) + Number(mission.coins_reward || 0),
    medals,
  });
  const claimed = await localGame.entities.MissionProgress.update(progressRow.id, { completed: true, claimed: true, reward_delivered: true, completed_at: new Date().toISOString() });
  emitMissionEvent({ mission, reward: { xp: Number(mission.xp_reward || 0), coins: Number(mission.coins_reward || 0), medal }, tutorial: mission.mission_type === 'tutorial' });
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
  const byMission = new Map((progressRows || []).map(row => [row.mission_id, row]));
  const synced = [];

  for (const mission of activeMissions || []) {
    const row = byMission.get(mission.id);
    if (mission.mission_type === 'tutorial') { if (row) synced.push(row); continue; }
    const periodKey = missionPeriodKey(mission.mission_type, careerDate);
    if (!row) continue;
    if (row.period_key !== periodKey) {
      const reset = await localGame.entities.MissionProgress.update(row.id, { progress: 0, completed: false, claimed: false, period_key: periodKey, period_ends_at: missionPeriodEndsAt(mission.mission_type, careerDate) });
      synced.push(reset);
    } else synced.push(row);
  }
  return synced;
}

export async function incrementMissionProgress(profileId, objectiveTypes, count = 1, careerDateOverride = null) {
  const completedNow = [];
  try {
    const careerDate = careerDateOverride || await missionCareerDate(profileId);
    const types = Array.isArray(objectiveTypes) ? objectiveTypes : [objectiveTypes];
    const allMissions = await ensureTutorialMissionCatalog();
    let progressRows = await localGame.entities.MissionProgress.filter({ profile_id: profileId });
    for (const type of types) {
      const missions = (allMissions || []).filter(m => m.is_active !== false && m.objective_type === type);
      for (const m of missions) {
        if (!(await tutorialUnlocked(m, allMissions, progressRows))) continue;
        const periodKey = m.mission_type === 'tutorial' ? 'tutorial:career' : missionPeriodKey(m.mission_type, careerDate);
        const prog = progressRows.find(p => p.mission_id === m.id);
        const isCurrentPeriod = m.mission_type === 'tutorial' || prog?.period_key === periodKey;
        const baseProgress = isCurrentPeriod ? Number(prog?.progress || 0) : 0;
        if (prog?.claimed) continue;
        const newProgress = Math.min(Number(m.target_count || 1), baseProgress + count);
        let updated;
        if (prog) updated = await localGame.entities.MissionProgress.update(prog.id, { progress: newProgress, completed: newProgress >= Number(m.target_count || 1), claimed: false, period_key: periodKey, period_ends_at: m.mission_type === 'tutorial' ? null : missionPeriodEndsAt(m.mission_type, careerDate) });
        else updated = await localGame.entities.MissionProgress.create({ mission_id: m.id, profile_id: profileId, progress: newProgress, completed: newProgress >= Number(m.target_count || 1), claimed: false, period_key: periodKey, period_ends_at: m.mission_type === 'tutorial' ? null : missionPeriodEndsAt(m.mission_type, careerDate) });
        progressRows = [...progressRows.filter(p => p.mission_id !== m.id), updated];
        if (newProgress >= Number(m.target_count || 1)) {
          const claimed = await rewardMissionAutomatically(profileId, m, updated);
          progressRows = [...progressRows.filter(p => p.mission_id !== m.id), claimed];
          completedNow.push(m);
        }
      }
    }
  } catch (e) { console.error('mission progress', e); }
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
