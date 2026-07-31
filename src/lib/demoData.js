import { base44 } from '@/api/base44Client';
import { BOTS_BY_DIFFICULTY } from '@/lib/bots';
import { COACHES_DATA } from '@/lib/coaches';
import { SPONSOR_CATALOG } from '@/lib/sponsors';

// ── Demo Data Generator ──────────────────────────────────────────────────
// Creates a moderate, coherent set of initial data for demonstration.
// Idempotent: checks for existing records before creating new ones.

function pick(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

async function exists(entityName, query) {
  try {
    const list = await base44.entities[entityName].filter(query);
    return list && list.length > 0;
  } catch {
    return false;
  }
}

// ── Season ────────────────────────────────────────────────────────────────
async function seedSeason() {
  const seasons = await base44.entities.Season.list('-start_date', 50);
  const has2026 = (seasons || []).find(s => s.season_number === 2026 || (s.name || '').includes('2026'));
  if (has2026) {
    // Ensure it's marked active
    if (!has2026.is_active) {
      await base44.entities.Season.update(has2026.id, { is_active: true });
    }
    return has2026.id;
  }
  const season = await base44.entities.Season.create({
    name: 'Temporada 2026',
    description: 'Circuito profissional de padel — Temporada inaugural',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    is_active: true,
    season_number: 2026,
  });
  return season.id;
}

// ── Coaches ──────────────────────────────────────────────────────────────
async function seedCoaches() {
  const existing = await base44.entities.Coach.list('-created_date', 100);
  const existingNames = new Set((existing || []).map(c => c.name));
  const toCreate = COACHES_DATA
    .filter(c => !existingNames.has(c.name))
    .slice(0, 12)
    .map(c => ({
      name: c.name,
      nationality: c.nationality,
      city: c.city,
      age: c.age,
      specialty: c.specialty,
      coaching_style: c.coaching_style,
      philosophy: c.philosophy,
      personality: c.personality,
      personality_traits: c.personality_traits || [],
      training_methods: c.training_methods || [],
      specializations: c.specializations || [],
      preferred_styles: c.preferred_styles || [],
      preferred_personalities: c.preferred_personalities || [],
      experience_years: c.experience_years,
      reputation: c.reputation,
      tier: c.tier,
      monthly_cost: c.monthly_cost,
      sign_on_bonus: c.sign_on_bonus,
      performance_bonus_pct: c.performance_bonus_pct || 0,
      demands: c.demands || {},
      achievements: c.achievements || [],
      career_history: c.career_history || [],
      track_record: c.track_record || {},
      training_bonus: c.training_bonus || {},
      signature_quote: c.signature_quote || '',
      bio: c.bio || c.personality,
    }));
  if (toCreate.length > 0) {
    await base44.entities.Coach.bulkCreate(toCreate);
  }
  return toCreate.length;
}

// ── Sponsors ─────────────────────────────────────────────────────────────
async function seedSponsors() {
  const existing = await base44.entities.Sponsor.list('-created_date', 100);
  const existingNames = new Set((existing || []).map(s => s.name));
  const toCreate = SPONSOR_CATALOG
    .filter(s => !existingNames.has(s.name))
    .slice(0, 8)
    .map(s => ({
      name: s.name,
      tier: s.tier,
      industry: s.industry,
      country: s.country,
      logo_emoji: s.logo_emoji,
      description: s.description,
      reputation: s.reputation,
      monthly_budget: s.monthly_budget,
      base_monthly_value: s.base_monthly_value,
      base_sign_bonus: s.base_sign_bonus,
      preferred_styles: s.preferred_styles || [],
      preferred_levels: s.preferred_levels || [],
      preferred_positions: s.preferred_positions || [],
      min_age: s.min_age || 16,
      max_age: s.max_age || 40,
      min_xp: s.min_xp || 0,
      min_titles: s.min_titles || 0,
      min_fan_appeal: s.min_fan_appeal || 0,
      marketing_requirements: s.marketing_requirements || [],
      commercial_goals: s.commercial_goals || [],
      performance_clauses: s.performance_clauses || {},
      contract_duration_months: s.contract_duration_months || 6,
      renewal_bonus_pct: s.renewal_bonus_pct || 10,
      is_available: true,
    }));
  if (toCreate.length > 0) {
    await base44.entities.Sponsor.bulkCreate(toCreate);
  }
  return toCreate.length;
}

// ── Clubs ────────────────────────────────────────────────────────────────
const DEMO_CLUBS = [
  { name: 'Padel Club Barcelona', country: 'Espanha', city: 'Barcelona', reputation: 88, member_count: 320, court_count: 8, level: 4, trophies: 12, founded_year: 2015, monthly_fee: 150, facilities: ['bar', 'loja', 'estacionamento', 'vestiario'] },
  { name: 'Buenos Aires Padel Center', country: 'Argentina', city: 'Buenos Aires', reputation: 85, member_count: 280, court_count: 7, level: 4, trophies: 10, founded_year: 2016, monthly_fee: 120, facilities: ['bar', 'academia', 'estacionamento'] },
  { name: 'Madrid Padel Arena', country: 'Espanha', city: 'Madrid', reputation: 82, member_count: 250, court_count: 6, level: 3, trophies: 7, founded_year: 2018, monthly_fee: 130, facilities: ['bar', 'loja', 'vestiario'] },
  { name: 'Lisbon Padel Club', country: 'Portugal', city: 'Lisboa', reputation: 72, member_count: 180, court_count: 5, level: 3, trophies: 4, founded_year: 2019, monthly_fee: 100, facilities: ['bar', 'estacionamento'] },
  { name: 'São Paulo Padel Academy', country: 'Brasil', city: 'São Paulo', reputation: 68, member_count: 150, court_count: 4, level: 2, trophies: 3, founded_year: 2020, monthly_fee: 90, facilities: ['bar', 'vestiario'] },
  { name: 'Stockholm Padel Hall', country: 'Suécia', city: 'Estocolmo', reputation: 65, member_count: 120, court_count: 4, level: 2, trophies: 2, founded_year: 2021, monthly_fee: 110, facilities: ['bar'] },
];

async function seedClubs() {
  const existing = await base44.entities.Club.list('-created_date', 100);
  const existingNames = new Set((existing || []).map(c => c.name));
  const toCreate = DEMO_CLUBS.filter(c => !existingNames.has(c.name));
  if (toCreate.length > 0) {
    await base44.entities.Club.bulkCreate(toCreate.map(c => ({ ...c, club_points: c.trophies * 100, description: `Clube de padel em ${c.city}, ${c.country}` })));
  }
  return toCreate.length;
}

// ── Tournaments ──────────────────────────────────────────────────────────
const TIER_REWARDS = {
  P2: { prize: 500, xp: 50, rank: 25, fee: 50, diff: -1 },
  P1: { prize: 1200, xp: 120, rank: 60, fee: 100, diff: 0 },
  Major: { prize: 3000, xp: 300, rank: 150, fee: 200, diff: 1 },
};

const TOURNAMENT_NAMES = [
  { name: 'Aberto de São Paulo', tier: 'P2', location: 'São Paulo', surface: 'vidro' },
  { name: 'Madrid Open', tier: 'P1', location: 'Madrid', surface: 'vidro' },
  { name: 'Buenos Aires Masters', tier: 'Major', location: 'Buenos Aires', surface: 'vidro' },
  { name: 'Barcelona Padel Cup', tier: 'P1', location: 'Barcelona', surface: 'cimento' },
  { name: 'Lisbon Challenger', tier: 'P2', location: 'Lisboa', surface: 'vidro' },
  { name: 'Stockholm Open', tier: 'P2', location: 'Estocolmo', surface: 'indoor' },
  { name: 'Paris Padel Major', tier: 'Major', location: 'Paris', surface: 'vidro' },
  { name: 'Rome Classic', tier: 'P1', location: 'Roma', surface: 'cimento' },
  { name: 'Rio Padel Open', tier: 'P2', location: 'Rio de Janeiro', surface: 'outdoor' },
  { name: 'Dubai World Padel', tier: 'Major', location: 'Dubai', surface: 'vidro' },
  { name: 'Amsterdam Challenger', tier: 'P2', location: 'Amsterdã', surface: 'indoor' },
  { name: 'Copenhagen Open', tier: 'P1', location: 'Copenhague', surface: 'indoor' },
];

async function seedTournaments(seasonId) {
  const existing = await base44.entities.Tournament.list('-start_date', 200);
  const has2026 = (existing || []).filter(t => (t.start_date || '').startsWith('2026-'));
  if (has2026.length >= 10) return 0; // Already seeded

  const toCreate = TOURNAMENT_NAMES.map((t, i) => {
    const rewards = TIER_REWARDS[t.tier];
    const month = i + 1;
    const day = 15; // Mid-month
    return {
      name: t.name,
      description: `${t.tier === 'Major' ? 'Torneio Major' : t.tier} em ${t.location}`,
      tier: t.tier,
      format: 'eliminacao_simples',
      status: 'inscricoes',
      start_date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      month,
      bot_difficulty_modifier: rewards.diff,
      max_participants: 16,
      prize_coins: rewards.prize,
      xp_reward: rewards.xp,
      rank_points: rewards.rank,
      season_id: seasonId,
      surface: t.surface,
      entry_fee: rewards.fee,
      min_ranking: 0,
      min_level: 'Iniciante',
      current_phase: 'inscricoes',
      location: t.location,
      year: 2026,
      participants: [],
    };
  });
  await base44.entities.Tournament.bulkCreate(toCreate);
  return toCreate.length;
}

// ── Athlete Profiles (from bot data) ──────────────────────────────────────
async function seedAthletes() {
  const existing = await base44.entities.AthleteProfile.list('-created_date', 100);
  if ((existing || []).length >= 6) return 0;

  const bots = [
    ...BOTS_BY_DIFFICULTY.lenda.slice(0, 2),
    ...BOTS_BY_DIFFICULTY.elite.slice(0, 2),
    ...BOTS_BY_DIFFICULTY.avancado.slice(0, 2),
  ];

  const toCreate = bots.map(bot => ({
    bot_id: bot.id,
    name: bot.name,
    country: bot.country,
    age: 22 + Math.floor(Math.random() * 12),
    play_style: 'Equilibrado',
    ambition: 40 + Math.floor(Math.random() * 40),
    discipline: 40 + Math.floor(Math.random() * 40),
    morale: 70,
    fatigue: 0,
    injury_prone: 20 + Math.floor(Math.random() * 20),
    peak_age: 28,
    career_phase: 'Ascensão',
    growth_rate: 1,
    decline_rate: 1,
    overall_rating: Math.round(Object.keys(bot).filter(k => ['serve','forehand','backhand','volley','bandeja','smash','defense','agility','strategy','emotional_control'].includes(k)).reduce((a, k) => a + (bot[k] || 0), 0) / 10),
    fan_appeal: 40 + Math.floor(Math.random() * 40),
    sponsor_appeal: 40 + Math.floor(Math.random() * 40),
    coach_relationship: 50,
    attributes: ['serve','forehand','backhand','volley','bandeja','smash','defense','agility','strategy','emotional_control'].reduce((acc, k) => { acc[k] = bot[k] || 5; return acc; }, {}),
  }));
  await base44.entities.AthleteProfile.bulkCreate(toCreate);
  return toCreate.length;
}

// ── Missions ──────────────────────────────────────────────────────────────
const DEMO_MISSIONS = [
  { title: 'Treinar 3 vezes', description: 'Complete 3 sessões de treino', mission_type: 'diaria', objective_type: 'complete_training', target_count: 3, xp_reward: 30, coins_reward: 20 },
  { title: 'Vencer uma partida', description: 'Vença uma partida oficial', mission_type: 'diaria', objective_type: 'win_matches', target_count: 1, xp_reward: 40, coins_reward: 30 },
  { title: 'Jogar 2 partidas', description: 'Complete 2 partidas oficiais', mission_type: 'diaria', objective_type: 'play_matches', target_count: 2, xp_reward: 25, coins_reward: 15 },
  { title: 'Inscrever-se em torneio', description: 'Inscreva-se em um torneio', mission_type: 'semanal', objective_type: 'join_tournament', target_count: 1, xp_reward: 50, coins_reward: 40 },
  { title: 'Avançar 5 dias', description: 'Avance 5 dias na carreira', mission_type: 'semanal', objective_type: 'advance_days', target_count: 5, xp_reward: 35, coins_reward: 25 },
  { title: 'Comprar um item', description: 'Adquira um item na loja', mission_type: 'semanal', objective_type: 'buy_item', target_count: 1, xp_reward: 30, coins_reward: 20 },
];

async function seedMissions() {
  const existing = await base44.entities.Mission.list('-created_date', 100);
  const existingTitles = new Set((existing || []).map(m => m.title));
  const toCreate = DEMO_MISSIONS.filter(m => !existingTitles.has(m.title));
  if (toCreate.length > 0) {
    await base44.entities.Mission.bulkCreate(toCreate.map(m => ({ ...m, is_active: true })));
  }
  return toCreate.length;
}

// ── Shop Items (basic set) ────────────────────────────────────────────────
const DEMO_ITEMS = [
  { name: 'Raquete Siux Electra', category: 'raquete', subcategory: 'power', rarity: 'raro', price: 800, manufacturer: 'Siux', icon: 'Circle', attribute_bonus: { smash: 3 }, durability: 100, balance: 'alto', shape: 'diamante', description: 'Raquete de potência para jogadores ofensivos' },
  { name: 'Raquete Bullpad Vertex', category: 'raquete', subcategory: 'control', rarity: 'epico', price: 1500, manufacturer: 'Bullpad', icon: 'Circle', attribute_bonus: { volley: 4, control: 2 }, durability: 100, balance: 'medio', shape: 'lagrima', description: 'Controle preciso e equilíbrio' },
  { name: 'Raquete Babolat Air Viper', category: 'raquete', subcategory: 'hybrid', rarity: 'epico', price: 1200, manufacturer: 'Babolat', icon: 'Circle', attribute_bonus: { agility: 3, forehand: 2 }, durability: 100, balance: 'medio', shape: 'redonda', description: 'Versatilidade para qualquer estilo' },
  { name: 'Overgrip Bullpad (x3)', category: 'grip', rarity: 'comum', price: 50, manufacturer: 'Bullpad', icon: 'Circle', attribute_bonus: {}, durability: 100, description: 'Pack de 3 overgrips absorventes' },
  { name: 'Bolas Head Padel Pro (x3)', category: 'bola', rarity: 'comum', price: 30, manufacturer: 'Head', icon: 'Circle', attribute_bonus: {}, durability: 80, description: 'Bolas oficiais de torneio' },
  { name: 'Mochila Siux Padel Bag', category: 'mochila', rarity: 'incomum', price: 200, manufacturer: 'Siux', icon: 'Circle', attribute_bonus: {}, durability: 100, description: 'Mochila térmica para 2 raquetes' },
  { name: 'Tênis Adidas Padel', category: 'tenis', rarity: 'raro', price: 350, manufacturer: 'Adidas', icon: 'Circle', attribute_bonus: { agility: 2 }, durability: 100, description: 'Calçado com solado específico para padel' },
  { name: 'Pulseira Power Band', category: 'acessorio', rarity: 'comum', price: 25, manufacturer: 'Generic', icon: 'Circle', attribute_bonus: {}, durability: 100, description: 'Pulseira absorvente de suor' },
];

async function seedShopItems() {
  const existing = await base44.entities.ShopItem.list('-created_date', 10);
  if ((existing || []).length >= 5) return 0;
  await base44.entities.ShopItem.bulkCreate(DEMO_ITEMS.map(i => ({ ...i, is_available: true })));
  return DEMO_ITEMS.length;
}

// ── Main entry point ──────────────────────────────────────────────────────
export async function generateDemoData() {
  const results = { season: 0, coaches: 0, sponsors: 0, clubs: 0, tournaments: 0, athletes: 0, missions: 0, shopItems: 0 };

  results.season = 1; // season ID returned, count as 1
  const seasonId = await seedSeason();
  results.coaches = await seedCoaches();
  results.sponsors = await seedSponsors();
  results.clubs = await seedClubs();
  results.tournaments = await seedTournaments(seasonId);
  results.athletes = await seedAthletes();
  results.missions = await seedMissions();
  results.shopItems = await seedShopItems();

  return results;
}

// ── Reset Career ──────────────────────────────────────────────────────────
// Safely resets the current player's career data. Only deletes entities owned
// by the player (profile_id matches). Does NOT touch shared universe data.
export async function resetCareer(profileId) {
  if (!profileId) throw new Error('Perfil não encontrado');

  // Delete player-owned entities
  const playerEntities = [
    'TrainingSession',
    'Match',
    'CalendarEvent',
    'PlayerContract',
    'PlayerStaffHire',
    'PlayerProperty',
    'PlayerInvestment',
    'FinancialTransaction',
    'PlayerAchievement',
    'MissionProgress',
    'Partnership',
    'CareerMessage',
    'PlayerInventory',
  ];

  for (const entity of playerEntities) {
    try {
      await base44.entities[entity].deleteMany({ profile_id: profileId });
    } catch (e) { console.error(`delete ${entity}`, e); }
  }

  // Reset PlayerProfile to initial state
  try {
    await base44.entities.PlayerProfile.update(profileId, {
      sport_name: 'Novo Jogador',
      level: 'Iniciante',
      xp: 0,
      coins: 100,
      unspent_attribute_points: 25,
      matches_played: 0,
      wins: 0,
      losses: 0,
      tournaments_won: 0,
      titles: [],
      medals: [],
      serve: 5, forehand: 5, backhand: 5, volley: 5, bandeja: 5, smash: 5,
      defense: 5, agility: 5, strategy: 5, emotional_control: 5,
      trainings_today: 0,
      practice_matches_today: 0,
      last_training_date: null,
      career_date: '2026-01-01',
      retired: false,
      partner_id: null,
      partner_name: null,
      partner_locked_until: null,
      partner_chemistry: 50,
      energy: 100,
      fatigue: 0,
      morale: 70,
      confidence: 50,
      form: 50,
      weekly_training_plan: {},
      development_goals: [],
      injured_until: null,
      did_physio_today: false,
      last_physio_date: null,
      coach_id: null,
      coach_name: null,
      club_id: null,
    });
  } catch (e) { console.error('reset profile', e); }
}