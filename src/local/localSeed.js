import { buildSeasonTournaments } from '@/lib/circuitCatalog.js';
import { ACHIEVEMENT_CATALOG } from '@/lib/achievementsData.js';

export const LOCAL_USER = {
  id: 'local-user-001',
  email: 'jose@padellegacy.local',
  full_name: 'José Costa',
  first_name: 'José',
  last_name: 'Costa',
  role: 'admin',
  is_admin: true,
  created_date: '2026-01-01T00:00:00.000Z',
};

export const LOCAL_PROFILE = {
  id: 'local-player-profile-001',
  created_by_id: LOCAL_USER.id,
  created_by: LOCAL_USER.email,
  sport_name: 'José Costa',
  avatar_url: '',
  country: 'Brasil',
  city: 'Tapejara',
  birth_date: '2005-01-01',
  level: 'Iniciante',
  play_style: 'Equilibrado',
  position: 'direita',
  xp: 120,
  coins: 5000,
  career_date: '2026-01-01',
  serve: 30,
  forehand: 32,
  backhand: 28,
  volley: 27,
  bandeja: 29,
  smash: 31,
  defense: 30,
  agility: 33,
  strategy: 28,
  emotional_control: 30,
  unspent_attribute_points: 0,
  trainings_today: 0,
  practice_matches_today: 0,
  partner_chemistry: 50,
  energy: 100,
  fatigue: 0,
  morale: 75,
  confidence: 70,
  form: 65,
  weekly_training_plan: {},
  development_goals: [],
  did_physio_today: false,
  matches_played: 3,
  wins: 2,
  losses: 1,
  tournaments_won: 0,
  rank_points: 85,
  ranking_position: 1187,
  followers: 120,
  reputation: 10,
  retired: false,
  created_date: '2026-01-01T00:00:00.000Z',
  updated_date: '2026-01-01T00:00:00.000Z',
};

const athletes = [
  ['athlete-001', 'Mateo Ruiz', 'Argentina', 'esquerda', 'Agressivo', 78],
  ['athlete-002', 'Lucas Ferraz', 'Brasil', 'direita', 'Controle', 72],
  ['athlete-003', 'Tomás Vidal', 'Espanha', 'esquerda', 'Equilibrado', 84],
  ['athlete-004', 'Enzo Moretti', 'Itália', 'direita', 'Defensivo', 69],
  ['athlete-005', 'Nicolás Silva', 'Uruguai', 'esquerda', 'Agressivo', 75],
  ['athlete-006', 'Rafael Martins', 'Brasil', 'direita', 'Equilibrado', 66],
].map(([id, name, country, position, play_style, overall], index) => ({
  id, name, country, position, play_style, overall,
  age: 21 + index,
  ranking_position: 40 + index * 37,
  rank_points: 1100 - index * 110,
  personality: index % 2 ? 'Disciplinado' : 'Competitivo',
  morale: 70 + index,
  form: 65 + index,
  is_active: true,
  created_date: `2026-01-0${index + 1}T00:00:00.000Z`,
}));

const clubs = [
  ['club-001', 'Porto Alegre Padel Club', 'Porto Alegre', 'Brasil', 4],
  ['club-002', 'Madrid Elite Padel', 'Madrid', 'Espanha', 5],
  ['club-003', 'Buenos Aires Padel Center', 'Buenos Aires', 'Argentina', 4],
].map(([id, name, city, country, stars], index) => ({
  id, name, city, country, stars,
  reputation: 60 + index * 15,
  member_count: 120 + index * 80,
  court_count: 4 + index * 2,
  staff_count: 6 + index,
  monthly_fee: 180 + index * 90,
  club_points: 500 + index * 400,
  trophies: index * 2,
  description: `Clube de padel em ${city}, ${country}.`,
  is_active: true,
}));

const tournaments = buildSeasonTournaments(2026, 'season-2026');

// Tutorial 4.0 (docs/TUTORIAL_4_0_OBJECTIVES_UNIFICATION.md, Parte 9): antes
// disto, este seed de 4 itens hardcoded (title/is_hidden) não batia com o
// schema real da entidade Achievement (name/visibility, base44/entities/
// Achievement.jsonc) nem com o que AchievementCard.jsx lê — os cards
// renderizavam com nome indefinido. Agora semeia o catálogo real
// (achievementsData.js), a mesma fonte que o motor de avaliação
// (achievementEngine.js) e a aba Conquistas usam — sem essa troca, nada
// além dos 4 itens antigos existiria para desbloquear/exibir.
const achievements = ACHIEVEMENT_CATALOG;

const missions = [
  { id: 'mission-train-1', title: 'Primeiros passos', description: 'Complete 3 treinos.', objective_type: 'complete_training', target_count: 3, reward_xp: 100, reward_coins: 80, is_active: true, points: 10 },
  { id: 'mission-play-1', title: 'Entre em quadra', description: 'Dispute sua primeira partida.', objective_type: 'play_matches', target_count: 1, reward_xp: 80, reward_coins: 60, is_active: true, points: 10 },
  { id: 'mission-days-1', title: 'Rotina profissional', description: 'Avance 7 dias na carreira.', objective_type: 'advance_days', target_count: 7, reward_xp: 120, reward_coins: 100, is_active: true, points: 15 },
];

const shopItems = [
  ['shop-001', 'Raquete Starter Control', 'raquete', 500, 'comum'],
  ['shop-002', 'Tênis Court Pro', 'tenis', 350, 'raro'],
  ['shop-003', 'Grip Performance', 'grip', 80, 'comum'],
  ['shop-004', 'Mochila Tour', 'mochila', 220, 'raro'],
].map(([id, name, category, base_price, rarity], index) => ({
  id, name, category, base_price, current_price: base_price,
  rarity, manufacturer: index === 0 ? 'Padel Legacy' : 'Court Labs',
  is_available: true, durability: 100, attribute_bonus: index === 0 ? { strategy: 1 } : {},
  created_date: `2026-01-0${index + 1}T00:00:00.000Z`,
}));

export const LOCAL_SEED = {
  User: [LOCAL_USER],
  PlayerProfile: [LOCAL_PROFILE],
  AthleteProfile: athletes,
  Match: [
    { id: 'match-001', profile_id: LOCAL_PROFILE.id, date: '2025-12-18', tournament_name: 'Amistoso de Pré-Temporada', result: 'vitória', score: '6-4 6-3', winner_name: 'José Costa', loser_name: 'Lucas Ferraz', xp_earned: 40, coins_earned: 30 },
    { id: 'match-002', profile_id: LOCAL_PROFILE.id, date: '2025-12-22', tournament_name: 'Amistoso de Pré-Temporada', result: 'derrota', score: '4-6 5-7', winner_name: 'Mateo Ruiz', loser_name: 'José Costa', xp_earned: 15, coins_earned: 10 },
    { id: 'match-003', profile_id: LOCAL_PROFILE.id, date: '2025-12-29', tournament_name: 'Amistoso de Pré-Temporada', result: 'vitória', score: '7-5 6-4', winner_name: 'José Costa', loser_name: 'Rafael Martins', xp_earned: 45, coins_earned: 35 },
  ],
  Tournament: tournaments,
  Season: [{ id: 'season-2026', name: 'Temporada 2026', description: 'Circuito profissional de padel 2026', start_date: '2026-01-01', end_date: '2026-12-31', is_active: true, season_number: 2026 }],
  CircuitSeason: [{ id: 'circuit-season-2026', year: 2026, name: 'Circuito Mundial 2026', is_active: true, total_tournaments: tournaments.length }],
  CalendarEvent: [
    { id: 'cal-001', profile_id: LOCAL_PROFILE.id, event_type: 'training', title: 'Treino técnico', event_date: '2026-01-03', status: 'agendado', is_mandatory: false },
    // Fase 15.7: este evento é puramente ilustrativo (mostrar "assim é um
    // compromisso de torneio no seu calendário" antes do jogador se inscrever
    // em qualquer coisa) — NUNCA deve apontar para um Tournament real. Antes
    // apontava para `tournaments[0]` (o 1º torneio da temporada, ex.: Miami
    // Cup): se o jogador se inscrevesse exatamente nesse torneio, duas linhas
    // de CalendarEvent passavam a compartilhar o mesmo `related_id` — uma
    // demonstrativa (sem inscrição/sorteio) e uma real —, e qualquer consumo
    // que não priorizasse explicitamente a linha com inscrição real podia
    // "ver" a demonstrativa em vez da campanha de verdade (causa raiz real
    // dos Hotfixes 15.6.1/15.6.2, que só resolviam isso lendo por preferência
    // — nunca eliminavam a ambiguidade). Usar um id sintético que nunca
    // existe no catálogo de Tournament elimina a colisão por construção,
    // para qualquer torneio que venha a ser o primeiro da temporada — sem
    // nenhum tratamento especial por nome/id de torneio.
    { id: 'cal-002', profile_id: LOCAL_PROFILE.id, event_type: 'tournament', title: 'Torneio (exemplo do calendário)', start_date: tournaments[0].start_date, end_date: tournaments[0].start_date, status: 'scheduled', related_id: 'demo-tournament-showcase', tournament_id: 'demo-tournament-showcase', is_mandatory: false },
  ],
  TrainingSession: [
    { id: 'training-001', profile_id: LOCAL_PROFILE.id, session_date: '2025-12-28', training_type: 'tecnico', focus_attribute: 'forehand', duration_minutes: 60, energy_cost: 12, xp_gained: 20, attribute_gain: 1, status: 'concluido' },
  ],
  TrainingCenter: [{ id: 'center-001', profile_id: LOCAL_PROFILE.id, name: 'Centro Inicial', level: 1, court_level: 1, gym_level: 1, physio_level: 1, psychology_level: 0, nutrition_level: 0, monthly_cost: 250 }],
  Partnership: [],
  TeamRanking: [
    { id: 'ranking-001', team_key: 'mateo-tomas', player1_name: 'Mateo Ruiz', player2_name: 'Tomás Vidal', ranking_points: 2240, ranking_position: 1, wins: 18, losses: 3 },
    { id: 'ranking-002', team_key: 'lucas-rafael', player1_name: 'Lucas Ferraz', player2_name: 'Rafael Martins', ranking_points: 1810, ranking_position: 2, wins: 14, losses: 5 },
  ],
  // Tutorial 4.1 (docs/TUTORIAL_4_1_EXPANDED_ONBOARDING_AND_COACH_CLARITY.md,
  // Parte H): removido um seed legado de 2 treinadores ("Carlos Mendes"/
  // "Javier Molina") com schema incompatível (monthly_salary em vez de
  // monthly_cost real, specialty capitalizada fora do enum real) — raiz do
  // bug "salário mensal de 1 moedas": esses nomes não batem com nenhuma
  // entrada de COACHES_DATA, então ensureCoachCatalog() (coachLifecycle.js)
  // nunca corrigia essas linhas via bulkUpdate, e monthly_cost ficava
  // undefined para sempre. ensureCoachCatalog() já semeia o catálogo real
  // (~118 treinadores) sob demanda — este array de 2 linhas era peso morto.
  Coach: [],
  Club: clubs,
  ClubMember: [
    { id: 'club-member-001', club_id: 'club-001', profile_id: 'athlete-002', member_name: 'Lucas Ferraz', role: 'atleta', status: 'ativo' },
    { id: 'club-member-002', club_id: 'club-001', profile_id: 'athlete-006', member_name: 'Rafael Martins', role: 'atleta', status: 'ativo' },
  ],
  ClubStaff: [{ id: 'club-staff-001', club_id: 'club-001', name: 'Marina Lopes', role: 'Fisioterapeuta', salary: 350, skill: 72 }],
  ClubEvent: [{ id: 'club-event-001', club_id: 'club-001', title: 'Torneio interno de verão', event_date: '2026-01-20', event_type: 'torneio', status: 'agendado' }],
  Sponsor: [
    { id: 'sponsor-001', name: 'Court Labs', category: 'equipamentos', reputation: 70, budget: 8000, preferred_profile: 'promessa', is_active: true },
    { id: 'sponsor-002', name: 'Sul Energia', category: 'regional', reputation: 55, budget: 4500, preferred_profile: 'carismático', is_active: true },
  ],
  PlayerContract: [{ id: 'contract-001', profile_id: LOCAL_PROFILE.id, sponsor_id: 'sponsor-002', sponsor_name: 'Sul Energia', contract_type: 'patrocinio', monthly_value: 300, start_date: '2026-01-01', end_date: '2026-06-30', is_active: true }],
  FinancialTransaction: [
    { id: 'finance-001', profile_id: LOCAL_PROFILE.id, date: '2026-01-01', type: 'income', category: 'patrocinio', description: 'Adiantamento Sul Energia', amount: 300 },
    { id: 'finance-002', profile_id: LOCAL_PROFILE.id, date: '2026-01-01', type: 'expense', category: 'treinamento', description: 'Mensalidade do centro', amount: 250 },
  ],
  PlayerInvestment: [{ id: 'investment-001', profile_id: LOCAL_PROFILE.id, name: 'Fundo conservador', invested_amount: 500, current_value: 510, return_rate: 0.02, status: 'ativo' }],
  PlayerProperty: [],
  PlayerStaffHire: [],
  ShopItem: shopItems,
  PlayerInventory: [{ id: 'inventory-001', profile_id: LOCAL_PROFILE.id, item_id: 'shop-003', item_name: 'Grip Performance', category: 'grip', quantity: 2, equipped: false, durability: 100 }],
  MarketEvent: [{ id: 'market-event-001', title: 'Semana de lançamento', description: 'Descontos em itens iniciais.', event_type: 'promocao', price_modifier: 0.9, discount_percent: 10, affected_item_ids: [], affected_categories: [], affected_manufacturers: [], affected_rarities: [], is_active: true, priority: 1, start_date: '2026-01-01', end_date: '2026-01-07' }],
  MarketPriceHistory: shopItems.map((item, index) => ({ id: `price-${index + 1}`, item_id: item.id, item_name: item.name, price: item.current_price, last_updated_date: '2026-01-01T00:00:00.000Z' })),
  Mission: missions,
  MissionProgress: missions.map((mission, index) => ({ id: `progress-${index + 1}`, mission_id: mission.id, profile_id: LOCAL_PROFILE.id, current_count: index === 0 ? 1 : 0, completed: false, claimed: false })),
  Achievement: achievements,
  // Tutorial 4.0: `achievement_id` aponta para o id real do catálogo
  // reseedado acima ("Primeiro Treino") — o id antigo ('achievement-001')
  // não existe mais em `achievements`, então esta linha ficaria órfã
  // (não quebraria nada, só nunca apareceria como desbloqueada).
  PlayerAchievement: [{ id: 'player-achievement-001', profile_id: LOCAL_PROFILE.id, achievement_id: 'achv-primeiro-treino', unlocked_date: '2025-12-28', career_date: '2025-12-28', is_new: false, progress: 1 }],
  Post: [
    { id: 'post-local-1', author_name: 'Padel Legacy', author_type: 'media', content: 'Bem-vindo à sua nova carreira no padel!', likes: 18, comments_count: 3, created_date: '2026-01-01T10:00:00.000Z' },
    { id: 'post-local-2', author_name: 'Circuito Mundial', author_type: 'organization', content: 'A temporada 2026 está oficialmente aberta.', likes: 42, comments_count: 7, created_date: '2026-01-01T09:00:00.000Z' },
  ],
  FanBase: [{ id: 'fanbase-001', profile_id: LOCAL_PROFILE.id, total_fans: 120, loyalty: 52, engagement: 44, expectation: 35, growth_rate: 0.05 }],
  PressJournalist: [
    { id: 'journalist-001', profile_id: LOCAL_PROFILE.id, name: 'Ana Ribeiro', outlet: 'Padel News Brasil', personality: 'Analítica', relationship_score: 10 },
    { id: 'journalist-002', profile_id: LOCAL_PROFILE.id, name: 'Diego Torres', outlet: 'Circuito Hoje', personality: 'Provocador', relationship_score: 0 },
  ],
  PressArticle: [{ id: 'article-001', profile_id: LOCAL_PROFILE.id, title: 'Nova promessa inicia carreira profissional', content: 'José Costa inicia sua trajetória no circuito.', sentiment: 'positivo', outlet: 'Padel News Brasil', journalist_name: 'Ana Ribeiro', published_date: '2026-01-01' }],
  Relationship: athletes.slice(0, 3).map((athlete, index) => ({ id: `relationship-${index + 1}`, profile_id: LOCAL_PROFILE.id, target_athlete_id: athlete.id, target_name: athlete.name, relationship_type: index === 0 ? 'rivalidade' : 'respeito', score: index === 0 ? -10 : 20 + index * 5 })),
  CareerMessage: [{ id: 'message-001', profile_id: LOCAL_PROFILE.id, sender_name: 'Carlos Mendes', sender_type: 'treinador', subject: 'Bem-vindo ao circuito', body: 'Monte uma rotina equilibrada de treinos e descanso.', title: 'Bem-vindo ao circuito', content: 'Monte uma rotina equilibrada de treinos e descanso.', status: 'nao_lida', message_type: 'advice', created_date: '2026-01-01T08:00:00.000Z' }],
  CareerLegacy: [],
  HallOfFameEntry: [{ id: 'hof-001', name: 'Alejandro Reyes', category: 'atleta', country: 'Espanha', induction_year: 2020, titles: 42, biography: 'Uma das maiores lendas do circuito.' }],
  HistoryEntry: [{ id: 'history-001', year: 1998, title: 'Fundação do Circuito Mundial', description: 'Primeira temporada organizada do universo Padel Legacy.', category: 'circuito' }],
  EncyclopediaEntry: [
    { id: 'encyclopedia-001', title: 'Bandeja', category: 'golpe', summary: 'Golpe de controle usado para manter a rede.', content: 'A bandeja combina segurança, profundidade e posicionamento.' },
    { id: 'encyclopedia-002', title: 'Ranking de duplas', category: 'regras', summary: 'Classificação baseada em resultados de torneios.', content: 'Pontos variam conforme categoria e fase alcançada.' },
  ],
  WorldEvent: [{ id: 'world-event-001', title: 'Expansão do circuito sul-americano', description: 'Novas etapas são anunciadas para 2026.', event_date: '2026-01-01', category: 'expansao', impact: 'positivo', likes: 35, is_active: true, is_macro: false }],
  CharacterCustomization: [{ id: 'customization-001', profile_id: LOCAL_PROFILE.id, hair_style: 'curto', hair_color: 'castanho', shirt_color: '#84cc16', shorts_color: '#1e293b', accessories: [], celebration: 'soco_ar' }],
};
