import { localGame } from '@/api/localGameClient.js';
import { publishContractEvent } from '@/lib/contractNews.js';
import { ageAtDate } from '@/lib/padel.js';
import { getBalance527, hasSponsorProof } from '@/lib/balance527.js';

// ─── Expanded Sponsor Catalog ────────────────────────────────────────────────
// Each sponsor has own objectives, budget, preferences, marketing demands,
// commercial goals, performance clauses, and contract duration.

export const SPONSOR_CATALOG = [
  {
    id: 'babolat',
    name: 'Babolat',
    tier: 'Bronze',
    industry: 'Equipamentos',
    country: 'França',
    logo_emoji: '🎾',
    description: 'Marca francesa tradicional em raquetes e strings',
    reputation: 65,
    monthly_budget: 8000,
    base_monthly_value: 1500,
    base_sign_bonus: 300,
    preferred_styles: ['Equilibrado'],
    preferred_levels: ['Iniciante', 'Amador', 'Competitivo'],
    preferred_positions: [],
    min_age: 16, max_age: 35,
    min_xp: 0, min_titles: 0, min_fan_appeal: 20,
    marketing_requirements: ['equipment_usage', 'logo_visibility'],
    commercial_goals: [
      { type: 'matches_played', target: 10, period: 'monthly', reward: 500, penalty: -200 },
      { type: 'social_posts', target: 2, period: 'monthly', reward: 300, penalty: -100 },
    ],
    performance_clauses: { min_win_rate: 40, tournament_participation: 1, termination_threshold: 25 },
    contract_duration_months: 6,
    renewal_bonus_pct: 10,
  },
  {
    id: 'siux',
    name: 'Siux',
    tier: 'Bronze',
    industry: 'Equipamentos',
    country: 'Espanha',
    logo_emoji: '⚡',
    description: 'Marca espanhola em ascensão no padel',
    reputation: 55,
    monthly_budget: 10000,
    base_monthly_value: 1800,
    base_sign_bonus: 400,
    preferred_styles: ['Agressivo', 'Potência'],
    preferred_levels: ['Iniciante', 'Amador', 'Competitivo'],
    preferred_positions: ['esquerda'],
    min_age: 16, max_age: 32,
    min_xp: 0, min_titles: 0, min_fan_appeal: 25,
    marketing_requirements: ['social_posts', 'logo_visibility'],
    commercial_goals: [
      { type: 'matches_played', target: 12, period: 'monthly', reward: 400, penalty: -150 },
    ],
    performance_clauses: { min_win_rate: 45, tournament_participation: 1, termination_threshold: 25 },
    contract_duration_months: 6,
    renewal_bonus_pct: 12,
  },
  {
    id: 'varlion',
    name: 'Varlion',
    tier: 'Bronze',
    industry: 'Equipamentos',
    country: 'Espanha',
    logo_emoji: '🦁',
    description: 'Marca premium de raquetes de padel',
    reputation: 60,
    monthly_budget: 12000,
    base_monthly_value: 2000,
    base_sign_bonus: 500,
    preferred_styles: ['Tático', 'Defensivo'],
    preferred_levels: ['Amador', 'Competitivo', 'Avançado'],
    preferred_positions: [],
    min_age: 18, max_age: 38,
    min_xp: 100, min_titles: 0, min_fan_appeal: 30,
    marketing_requirements: ['equipment_usage', 'social_posts', 'logo_visibility'],
    commercial_goals: [
      { type: 'matches_played', target: 10, period: 'monthly', reward: 500, penalty: -200 },
      { type: 'win_matches', target: 5, period: 'monthly', reward: 400, penalty: -150 },
    ],
    performance_clauses: { min_win_rate: 50, tournament_participation: 2, termination_threshold: 30 },
    contract_duration_months: 6,
    renewal_bonus_pct: 15,
  },
  {
    id: 'nox',
    name: 'Nox',
    tier: 'Prata',
    industry: 'Equipamentos',
    country: 'Espanha',
    logo_emoji: '🎯',
    description: 'Líder em raquetes de padel profissional',
    reputation: 75,
    monthly_budget: 20000,
    base_monthly_value: 3000,
    base_sign_bonus: 1000,
    preferred_styles: ['Agressivo', 'Equilibrado'],
    preferred_levels: ['Competitivo', 'Avançado', 'Elite'],
    preferred_positions: [],
    min_age: 18, max_age: 36,
    min_xp: 500, min_titles: 0, min_fan_appeal: 40,
    marketing_requirements: ['equipment_usage', 'social_posts', 'interviews', 'logo_visibility'],
    commercial_goals: [
      { type: 'matches_played', target: 15, period: 'monthly', reward: 800, penalty: -300 },
      { type: 'win_matches', target: 8, period: 'monthly', reward: 600, penalty: -200 },
      { type: 'social_posts', target: 4, period: 'monthly', reward: 400, penalty: -100 },
    ],
    performance_clauses: { min_win_rate: 50, tournament_participation: 2, termination_threshold: 35 },
    contract_duration_months: 12,
    renewal_bonus_pct: 15,
  },
  {
    id: 'wilson',
    name: 'Wilson',
    tier: 'Prata',
    industry: 'Equipamentos',
    country: 'EUA',
    logo_emoji: '🌐',
    description: 'Marca americana de renome global',
    reputation: 78,
    monthly_budget: 25000,
    base_monthly_value: 3500,
    base_sign_bonus: 1200,
    preferred_styles: ['Equilibrado', 'Tático'],
    preferred_levels: ['Competitivo', 'Avançado', 'Elite'],
    preferred_positions: [],
    min_age: 18, max_age: 37,
    min_xp: 1000, min_titles: 0, min_fan_appeal: 45,
    marketing_requirements: ['equipment_usage', 'social_posts', 'events', 'logo_visibility'],
    commercial_goals: [
      { type: 'matches_played', target: 15, period: 'monthly', reward: 700, penalty: -250 },
      { type: 'win_matches', target: 7, period: 'monthly', reward: 500, penalty: -200 },
      { type: 'social_posts', target: 3, period: 'monthly', reward: 300, penalty: -100 },
    ],
    performance_clauses: { min_win_rate: 45, tournament_participation: 2, termination_threshold: 35 },
    contract_duration_months: 12,
    renewal_bonus_pct: 12,
  },
  {
    id: 'adidas',
    name: 'Adidas',
    tier: 'Prata',
    industry: 'Vestuário',
    country: 'Alemanha',
    logo_emoji: '🔺',
    description: 'Gigante alemão do esporte com linha de padel',
    reputation: 80,
    monthly_budget: 30000,
    base_monthly_value: 3800,
    base_sign_bonus: 1500,
    preferred_styles: ['Agressivo', 'Potência'],
    preferred_levels: ['Avançado', 'Elite'],
    preferred_positions: ['direita'],
    min_age: 20, max_age: 36,
    min_xp: 1500, min_titles: 0, min_fan_appeal: 50,
    marketing_requirements: ['equipment_usage', 'social_posts', 'interviews', 'events', 'photo_shoots', 'logo_visibility'],
    commercial_goals: [
      { type: 'matches_played', target: 15, period: 'monthly', reward: 900, penalty: -350 },
      { type: 'win_matches', target: 8, period: 'monthly', reward: 700, penalty: -250 },
      { type: 'social_posts', target: 5, period: 'monthly', reward: 500, penalty: -150 },
      { type: 'join_tournament', target: 2, period: 'monthly', reward: 600, penalty: -200 },
    ],
    performance_clauses: { min_win_rate: 50, tournament_participation: 2, termination_threshold: 35 },
    contract_duration_months: 12,
    renewal_bonus_pct: 15,
  },
  {
    id: 'bullpadel',
    name: 'Bullpadel',
    tier: 'Ouro',
    industry: 'Equipamentos',
    country: 'Espanha',
    logo_emoji: '🐂',
    description: 'Marca líder absoluta no padel profissional',
    reputation: 90,
    monthly_budget: 50000,
    base_monthly_value: 5000,
    base_sign_bonus: 2000,
    preferred_styles: ['Agressivo', 'Equilibrado', 'Tático'],
    preferred_levels: ['Avançado', 'Elite', 'Lenda'],
    preferred_positions: [],
    min_age: 20, max_age: 38,
    min_xp: 3000, min_titles: 1, min_fan_appeal: 55,
    marketing_requirements: ['equipment_usage', 'social_posts', 'interviews', 'events', 'photo_shoots', 'logo_visibility'],
    commercial_goals: [
      { type: 'win_matches', target: 10, period: 'monthly', reward: 1200, penalty: -400 },
      { type: 'win_tournament', target: 1, period: 'seasonal', reward: 5000, penalty: -1000 },
      { type: 'social_posts', target: 6, period: 'monthly', reward: 600, penalty: -200 },
      { type: 'join_tournament', target: 3, period: 'monthly', reward: 800, penalty: -300 },
    ],
    performance_clauses: { min_win_rate: 55, tournament_participation: 3, termination_threshold: 40 },
    contract_duration_months: 18,
    renewal_bonus_pct: 20,
  },
  {
    id: 'head',
    name: 'Head',
    tier: 'Ouro',
    industry: 'Equipamentos',
    country: 'Áustria',
    logo_emoji: '👑',
    description: 'Marca austríaca premium, patrocinadora de lendas',
    reputation: 92,
    monthly_budget: 60000,
    base_monthly_value: 6000,
    base_sign_bonus: 2500,
    preferred_styles: ['Agressivo', 'Tático', 'Potência'],
    preferred_levels: ['Elite', 'Lenda'],
    preferred_positions: [],
    min_age: 22, max_age: 39,
    min_xp: 5000, min_titles: 3, min_fan_appeal: 65,
    marketing_requirements: ['equipment_usage', 'social_posts', 'interviews', 'events', 'photo_shoots', 'logo_visibility'],
    commercial_goals: [
      { type: 'win_matches', target: 12, period: 'monthly', reward: 1500, penalty: -500 },
      { type: 'win_tournament', target: 2, period: 'seasonal', reward: 8000, penalty: -1500 },
      { type: 'social_posts', target: 8, period: 'monthly', reward: 800, penalty: -250 },
      { type: 'join_tournament', target: 4, period: 'monthly', reward: 1000, penalty: -400 },
    ],
    performance_clauses: { min_win_rate: 60, tournament_participation: 4, termination_threshold: 45 },
    contract_duration_months: 24,
    renewal_bonus_pct: 25,
  },
  {
    id: 'joma',
    name: 'Joma',
    tier: 'Prata',
    industry: 'Vestuário',
    country: 'Espanha',
    logo_emoji: '👟',
    description: 'Marca espanhola de calçados e vestuário esportivo',
    reputation: 72,
    monthly_budget: 22000,
    base_monthly_value: 3200,
    base_sign_bonus: 1100,
    preferred_styles: ['Defensivo', 'Equilibrado'],
    preferred_levels: ['Competitivo', 'Avançado', 'Elite'],
    preferred_positions: [],
    min_age: 18, max_age: 37,
    min_xp: 800, min_titles: 0, min_fan_appeal: 40,
    marketing_requirements: ['equipment_usage', 'social_posts', 'events', 'logo_visibility'],
    commercial_goals: [
      { type: 'matches_played', target: 12, period: 'monthly', reward: 600, penalty: -200 },
      { type: 'social_posts', target: 4, period: 'monthly', reward: 350, penalty: -100 },
    ],
    performance_clauses: { min_win_rate: 45, tournament_participation: 2, termination_threshold: 35 },
    contract_duration_months: 12,
    renewal_bonus_pct: 12,
  },
  {
    id: 'asics', name: 'Asics', tier: 'Bronze', industry: 'Calçados', country: 'Japão', logo_emoji: '👟',
    description: 'Marca focada em estabilidade, velocidade e prevenção de lesões', reputation: 76,
    monthly_budget: 16000, base_monthly_value: 1800, base_sign_bonus: 2400,
    preferred_styles: ['Defensivo','Equilibrado'], preferred_levels: ['Amador','Competitivo','Avançado'], preferred_positions: ['direita'],
    min_age: 16, max_age: 35, min_xp: 300, min_titles: 0, min_fan_appeal: 20,
    marketing_requirements: ['equipment_usage','social_posts'],
    commercial_goals: [{ type: 'matches_played', target: 6, period: 'monthly', reward: 250, penalty: -80 }],
    performance_clauses: { min_win_rate: 35, tournament_participation: 1, termination_threshold: 25 }, contract_duration_months: 8, renewal_bonus_pct: 10, is_available: true,
  },
  {
    id: 'garmin', name: 'Garmin', tier: 'Prata', industry: 'Tecnologia', country: 'Estados Unidos', logo_emoji: '⌚',
    description: 'Tecnologia esportiva e monitoramento de desempenho', reputation: 84,
    monthly_budget: 30000, base_monthly_value: 4200, base_sign_bonus: 7000,
    preferred_styles: ['Tático','Equilibrado'], preferred_levels: ['Competitivo','Avançado','Elite'], preferred_positions: ['direita','esquerda'],
    min_age: 18, max_age: 38, min_xp: 1400, min_titles: 0, min_fan_appeal: 45,
    marketing_requirements: ['social_posts','interviews','logo_visibility'],
    commercial_goals: [{ type: 'social_posts', target: 6, period: 'monthly', reward: 600, penalty: -180 }, { type: 'join_tournament', target: 2, period: 'monthly', reward: 500, penalty: -150 }],
    performance_clauses: { min_win_rate: 42, tournament_participation: 2, termination_threshold: 32 }, contract_duration_months: 12, renewal_bonus_pct: 14, is_available: true,
  },
  {
    id: 'redbull', name: 'Red Bull', tier: 'Ouro', industry: 'Bebidas', country: 'Áustria', logo_emoji: '🐂',
    description: 'Marca global ligada a atletas ousados e alto desempenho', reputation: 96,
    monthly_budget: 85000, base_monthly_value: 11500, base_sign_bonus: 22000,
    preferred_styles: ['Agressivo','Potência'], preferred_levels: ['Avançado','Elite','Lenda'], preferred_positions: ['esquerda'],
    min_age: 18, max_age: 32, min_xp: 4200, min_titles: 2, min_fan_appeal: 72,
    marketing_requirements: ['social_posts','interviews','events','photo_shoots','logo_visibility'],
    commercial_goals: [{ type: 'win_matches', target: 12, period: 'monthly', reward: 1800, penalty: -600 }, { type: 'win_tournament', target: 1, period: 'seasonal', reward: 8500, penalty: -1800 }],
    performance_clauses: { min_win_rate: 60, tournament_participation: 3, termination_threshold: 45 }, contract_duration_months: 18, renewal_bonus_pct: 22, is_available: true,
  },
  {
    id: 'decathlon', name: 'Decathlon', tier: 'Bronze', industry: 'Varejo Esportivo', country: 'França', logo_emoji: '🏪',
    description: 'Rede esportiva interessada em atletas acessíveis ao público', reputation: 70,
    monthly_budget: 14000, base_monthly_value: 1500, base_sign_bonus: 1900,
    preferred_styles: ['Equilibrado','Defensivo','Tático'], preferred_levels: ['Iniciante','Amador','Competitivo'], preferred_positions: ['direita','esquerda'],
    min_age: 16, max_age: 42, min_xp: 0, min_titles: 0, min_fan_appeal: 10,
    marketing_requirements: ['events','social_posts','equipment_usage'],
    commercial_goals: [{ type: 'matches_played', target: 4, period: 'monthly', reward: 180, penalty: -50 }],
    performance_clauses: { min_win_rate: 25, tournament_participation: 1, termination_threshold: 20 }, contract_duration_months: 6, renewal_bonus_pct: 8, is_available: true,
  },
  {
    id: 'playtomic', name: 'Playtomic', tier: 'Prata', industry: 'Tecnologia', country: 'Espanha', logo_emoji: '📱',
    description: 'Plataforma digital de clubes, partidas e comunidade de padel', reputation: 86,
    monthly_budget: 34000, base_monthly_value: 4800, base_sign_bonus: 7800,
    preferred_styles: ['Tático','Equilibrado'], preferred_levels: ['Competitivo','Avançado','Elite'], preferred_positions: ['direita','esquerda'],
    min_age: 17, max_age: 38, min_xp: 1600, min_titles: 0, min_fan_appeal: 48,
    marketing_requirements: ['social_posts','events','interviews'],
    commercial_goals: [{ type: 'social_posts', target: 8, period: 'monthly', reward: 700, penalty: -220 }, { type: 'matches_played', target: 10, period: 'monthly', reward: 650, penalty: -200 }],
    performance_clauses: { min_win_rate: 40, tournament_participation: 2, termination_threshold: 30 }, contract_duration_months: 12, renewal_bonus_pct: 15, is_available: true,
  },
  {
    id: 'estrelladamm', name: 'Estrella Damm', tier: 'Ouro', industry: 'Hospitalidade', country: 'Espanha', logo_emoji: '⭐',
    description: 'Marca tradicional ligada aos grandes eventos do padel', reputation: 93,
    monthly_budget: 72000, base_monthly_value: 9800, base_sign_bonus: 18000,
    preferred_styles: ['Equilibrado','Tático','Agressivo'], preferred_levels: ['Avançado','Elite','Lenda'], preferred_positions: ['direita','esquerda'],
    min_age: 21, max_age: 38, min_xp: 3500, min_titles: 1, min_fan_appeal: 68,
    marketing_requirements: ['events','interviews','photo_shoots','logo_visibility'],
    commercial_goals: [{ type: 'join_tournament', target: 3, period: 'monthly', reward: 1200, penalty: -350 }, { type: 'win_tournament', target: 1, period: 'seasonal', reward: 7000, penalty: -1400 }],
    performance_clauses: { min_win_rate: 52, tournament_participation: 3, termination_threshold: 40 }, contract_duration_months: 18, renewal_bonus_pct: 20, is_available: true,
  },
  {
    id: 'cupra', name: 'Cupra', tier: 'Ouro', industry: 'Automotivo', country: 'Espanha', logo_emoji: '🚗',
    description: 'Marca automotiva premium com presença forte no padel', reputation: 91,
    monthly_budget: 76000, base_monthly_value: 10500, base_sign_bonus: 19500,
    preferred_styles: ['Agressivo','Potência','Tático'], preferred_levels: ['Avançado','Elite','Lenda'], preferred_positions: ['esquerda'],
    min_age: 20, max_age: 36, min_xp: 3800, min_titles: 1, min_fan_appeal: 70,
    marketing_requirements: ['events','photo_shoots','social_posts','logo_visibility'],
    commercial_goals: [{ type: 'win_matches', target: 10, period: 'monthly', reward: 1500, penalty: -450 }, { type: 'social_posts', target: 8, period: 'monthly', reward: 800, penalty: -250 }],
    performance_clauses: { min_win_rate: 55, tournament_participation: 3, termination_threshold: 42 }, contract_duration_months: 18, renewal_bonus_pct: 21, is_available: true,
  },
  {
    id: 'therabody', name: 'Therabody', tier: 'Prata', industry: 'Saúde e Recuperação', country: 'Estados Unidos', logo_emoji: '💆',
    description: 'Soluções de recuperação muscular para atletas', reputation: 82,
    monthly_budget: 28000, base_monthly_value: 3900, base_sign_bonus: 6200,
    preferred_styles: ['Defensivo','Equilibrado'], preferred_levels: ['Competitivo','Avançado','Elite'], preferred_positions: ['direita','esquerda'],
    min_age: 18, max_age: 40, min_xp: 1100, min_titles: 0, min_fan_appeal: 38,
    marketing_requirements: ['equipment_usage','social_posts','interviews'],
    commercial_goals: [{ type: 'matches_played', target: 8, period: 'monthly', reward: 450, penalty: -140 }],
    performance_clauses: { min_win_rate: 38, tournament_participation: 2, termination_threshold: 28 }, contract_duration_months: 10, renewal_bonus_pct: 13, is_available: true,
  },
  {
    id: 'paddleague', name: 'Padel League', tier: 'Bronze', industry: 'Eventos', country: 'Brasil', logo_emoji: '🏆',
    description: 'Circuito regional que apoia atletas em ascensão', reputation: 64,
    monthly_budget: 11000, base_monthly_value: 1200, base_sign_bonus: 1500,
    preferred_styles: ['Equilibrado','Tático','Defensivo','Agressivo'], preferred_levels: ['Iniciante','Amador','Competitivo'], preferred_positions: ['direita','esquerda'],
    min_age: 16, max_age: 45, min_xp: 0, min_titles: 0, min_fan_appeal: 0,
    marketing_requirements: ['events','social_posts'],
    commercial_goals: [{ type: 'join_tournament', target: 1, period: 'monthly', reward: 160, penalty: -40 }],
    performance_clauses: { min_win_rate: 20, tournament_participation: 1, termination_threshold: 18 }, contract_duration_months: 6, renewal_bonus_pct: 7, is_available: true,
  },
  {
    id: 'movistar', name: 'Movistar', tier: 'Prata', industry: 'Telecomunicações', country: 'Espanha', logo_emoji: '📡',
    description: 'Telecomunicações e conteúdo esportivo digital', reputation: 88,
    monthly_budget: 42000, base_monthly_value: 6100, base_sign_bonus: 9800,
    preferred_styles: ['Tático','Equilibrado','Agressivo'], preferred_levels: ['Competitivo','Avançado','Elite'], preferred_positions: ['direita','esquerda'],
    min_age: 18, max_age: 38, min_xp: 2200, min_titles: 0, min_fan_appeal: 55,
    marketing_requirements: ['social_posts','interviews','events','logo_visibility'],
    commercial_goals: [{ type: 'social_posts', target: 10, period: 'monthly', reward: 850, penalty: -260 }, { type: 'win_matches', target: 7, period: 'monthly', reward: 750, penalty: -230 }],
    performance_clauses: { min_win_rate: 46, tournament_participation: 2, termination_threshold: 34 }, contract_duration_months: 12, renewal_bonus_pct: 16, is_available: true,
  },
  {
    id: 'iberdrola', name: 'Iberdrola', tier: 'Ouro', industry: 'Energia', country: 'Espanha', logo_emoji: '🌱',
    description: 'Energia sustentável e apoio ao esporte de alto rendimento', reputation: 90,
    monthly_budget: 66000, base_monthly_value: 8800, base_sign_bonus: 15500,
    preferred_styles: ['Defensivo','Tático','Equilibrado'], preferred_levels: ['Avançado','Elite','Lenda'], preferred_positions: ['direita','esquerda'],
    min_age: 18, max_age: 40, min_xp: 3200, min_titles: 1, min_fan_appeal: 62,
    marketing_requirements: ['events','interviews','logo_visibility','social_posts'],
    commercial_goals: [{ type: 'matches_played', target: 10, period: 'monthly', reward: 1000, penalty: -300 }, { type: 'win_tournament', target: 1, period: 'seasonal', reward: 6200, penalty: -1200 }],
    performance_clauses: { min_win_rate: 50, tournament_participation: 3, termination_threshold: 38 }, contract_duration_months: 16, renewal_bonus_pct: 18, is_available: true,
  },
  {
    id: 'localfit', name: 'LocalFit', tier: 'Bronze', industry: 'Academia', country: 'Brasil', logo_emoji: '🏋️',
    description: 'Rede de academias focada em atletas locais e desenvolvimento físico', reputation: 58,
    monthly_budget: 9000, base_monthly_value: 900, base_sign_bonus: 1100,
    preferred_styles: ['Potência','Agressivo','Equilibrado'], preferred_levels: ['Iniciante','Amador','Competitivo'], preferred_positions: ['direita','esquerda'],
    min_age: 16, max_age: 45, min_xp: 0, min_titles: 0, min_fan_appeal: 0,
    marketing_requirements: ['social_posts','events'],
    commercial_goals: [{ type: 'matches_played', target: 3, period: 'monthly', reward: 120, penalty: -30 }],
    performance_clauses: { min_win_rate: 15, tournament_participation: 0, termination_threshold: 15 }, contract_duration_months: 4, renewal_bonus_pct: 6, is_available: true,
  }
];

// ─── Loja Fase 1: ponte marca-patrocínio ↔ marca-item ──────────────────────
// Correspondência exata (normalizada por trim+lowercase), sem substring —
// isso é o fuzzy match que já existe em marketEngine.js para o fallback.
// Nome vazio nunca corresponde a nada.

export function findSponsorIdByManufacturer(manufacturer) {
  const normalized = String(manufacturer || '').trim().toLowerCase();
  if (!normalized) return null;
  const match = SPONSOR_CATALOG.find((sponsor) => String(sponsor?.name || '').trim().toLowerCase() === normalized);
  return match ? match.id : null;
}

// ─── Marketing Requirements Labels ──────────────────────────────────────────

export const MARKETING_LABELS = {
  equipment_usage: { label: 'Usar equipamento da marca', icon: '🎾' },
  social_posts: { label: 'Postagens nas redes sociais', icon: '📱' },
  interviews: { label: 'Participar de entrevistas', icon: '🎤' },
  events: { label: 'Comparecer a eventos', icon: '🎪' },
  photo_shoots: { label: 'Ensaios fotográficos', icon: '📸' },
  logo_visibility: { label: 'Exibir logo da marca', icon: '🏷️' },
};

export const GOAL_LABELS = {
  matches_played: 'Partidas jogadas',
  win_matches: 'Vitórias',
  win_tournament: 'Títulos de torneio',
  join_tournament: 'Torneios disputados',
  social_posts: 'Postagens sociais',
};

// ─── Tier Styles ────────────────────────────────────────────────────────────

const TIER_STYLES = {
  'Ouro': { badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Ouro', color: 'text-amber-400' },
  'Prata': { badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30', label: 'Prata', color: 'text-blue-400' },
  'Bronze': { badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30', label: 'Bronze', color: 'text-purple-400' },
};

export function getSponsorTierStyle(tier) {
  return TIER_STYLES[tier] || TIER_STYLES['Bronze'];
}

export const SPONSOR_SLOT_LIMITS = { principal: 1, raquete: 1, vestuario: 1, calcado: 1, comercial: 2 };

export function getSponsorCategory(sponsor) {
  if (!sponsor || typeof sponsor !== 'object') return null;
  if (sponsor.category) return sponsor.category;
  const industry = String(sponsor.industry || '').toLocaleLowerCase('pt-BR');
  if (industry.includes('equip')) return 'raquete';
  if (industry.includes('vest') || industry.includes('moda')) return 'vestuario';
  if (industry.includes('calç') || industry.includes('calc')) return 'calcado';
  if (sponsor.tier === 'Ouro' && Number(sponsor.reputation || 0) >= 90) return 'principal';
  return 'comercial';
}

export function normalizeSponsorshipContract(contract) {
  if (!contract || typeof contract !== 'object') return null;
  const sponsorId = contract.sponsor_id || contract.brand_id || '';
  const sponsorName = String(contract.sponsor_name || contract.brand_name || '').trim();
  if (!contract.id && !sponsorId && !sponsorName) return null;
  return { ...contract, sponsor_id: sponsorId, sponsor_name: sponsorName || 'Patrocinador legado' };
}

export function validateSponsorSlot(sponsor, activeContracts = []) {
  const category = getSponsorCategory(sponsor);
  if (!sponsor || typeof sponsor !== 'object' || !sponsor.id) {
    return { ok: false, category: null, reason: 'Dados do patrocinador estão incompletos.' };
  }
  if (!category || !Object.prototype.hasOwnProperty.call(SPONSOR_SLOT_LIMITS, category)) {
    return { ok: false, category: category || null, reason: 'Categoria de patrocínio inválida.' };
  }
  const sameCategory = (Array.isArray(activeContracts) ? activeContracts : [])
    .map(normalizeSponsorshipContract)
    .filter(Boolean)
    .filter((contract) => {
    if (contract.sponsor_category) return contract.sponsor_category === category;
    const legacySponsor = SPONSOR_CATALOG.find((item) => item && (item.id === contract.sponsor_id || item.name === contract.sponsor_name));
    return legacySponsor ? getSponsorCategory(legacySponsor) === category : false;
  });
  const limit = SPONSOR_SLOT_LIMITS[category];
  if (sameCategory.length >= limit) return { ok: false, category, reason: `Slot de ${category} ocupado por ${sameCategory.map((item) => item.sponsor_name).join(', ')}.` };
  return { ok: true, category, remaining: limit - sameCategory.length };
}

// ─── Preference Matching ────────────────────────────────────────────────────

export function calculateProfileMatch(sponsor, profile) {
  let score = 50;
  const reasons = [];

  // Style preference
  if (sponsor.preferred_styles && sponsor.preferred_styles.length > 0) {
    if (sponsor.preferred_styles.includes(profile?.play_style)) {
      score += 15;
      reasons.push(`Estilo ${profile.play_style} é preferido`);
    } else {
      score -= 5;
    }
  }

  // Level preference
  if (sponsor.preferred_levels && sponsor.preferred_levels.length > 0) {
    if (sponsor.preferred_levels.includes(profile?.level)) {
      score += 15;
      reasons.push(`Nível ${profile.level} é valorizado`);
    } else {
      score -= 10;
    }
  }

  // Position preference
  if (sponsor.preferred_positions && sponsor.preferred_positions.length > 0) {
    if (sponsor.preferred_positions.includes(profile?.court_side)) {
      score += 10;
      reasons.push(`Posição ${profile.court_side} é procurada`);
    }
  }

  // Age range
  const age = calculateAge(profile);
  if (age >= sponsor.min_age && age <= sponsor.max_age) {
    score += 10;
  } else {
    score -= 15;
    reasons.push(`Fora da faixa etária (${sponsor.min_age}-${sponsor.max_age})`);
  }

  // Fan appeal
  if ((profile?.fan_appeal || 0) >= sponsor.min_fan_appeal) {
    score += 10;
    reasons.push(`Apego dos fãs atende ao mínimo`);
  } else {
    score -= 10;
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// Playthrough 5.26-B — idade pela DATA DA CARREIRA (mesma autoridade de
// padel.js:calculateAge/ageAtDate, com o limite do aniversário), não pelo
// relógio do computador. Antes, `new Date()` mantinha o atleta nascido em
// 2010 com "16 anos" durante toda a carreira (2026→2036): os patrocinadores
// Prata com idade mínima 17/18 recusavam para sempre e 100% das assinaturas
// medidas na 5.26 ficaram no Bronze. Faixas etárias NÃO foram alteradas.
function calculateAge(profile) {
  if (!profile?.birth_date) return 20;
  return ageAtDate(profile.birth_date, profile.career_date || '2026-01-01');
}

// ─── Negotiation ────────────────────────────────────────────────────────────

export function negotiateOffer(sponsor, profile) {
  const match = calculateProfileMatch(sponsor, profile);
  const matchMultiplier = 0.7 + (match.score / 100) * 0.6; // 0.7x to 1.3x
  const negotiationPower = Math.max(0, Math.min(0.45, Number(profile?.staff_negotiation_power || profile?.staff_bonus_manager || 0)));
  const negotiatedMultiplier = matchMultiplier * (1 + negotiationPower);

  // Playthrough 5.27 — patrocínio inicial reduzido (config central). Antes o
  // Bronze pagava ~1.500/mês + ~1.875 de luvas desde o dia 0 e financiava toda
  // a estrutura (86–88% da renda no Ano 1). Agora começa pequeno e cresce com
  // resultados/negociação.
  const balance = getBalance527();
  const monthlySalary = Math.round(sponsor.base_monthly_value * negotiatedMultiplier * balance.sponsor.monthlyMultiplier);
  const signBonus = Math.round(sponsor.base_sign_bonus * negotiatedMultiplier * balance.sponsor.signMultiplier);

  return {
    monthly_salary: monthlySalary,
    sign_bonus: signBonus,
    duration_months: sponsor.contract_duration_months,
    match_score: match.score,
    match_reasons: match.reasons,
    match_multiplier: matchMultiplier,
    negotiation_power: negotiationPower,
    negotiated_multiplier: negotiatedMultiplier,
  };
}

export function canSign(sponsor, profile) {
  // Playthrough 5.26-C — só um `is_available: false` EXPLÍCITO bloqueia. Os
  // 9 patrocinadores originais do catálogo (Babolat, Siux, Varlion, Nox,
  // Wilson, Adidas, Joma, Bullpadel, Head) nunca tiveram o campo: a
  // disponibilidade vinha da semeadura das entidades `Sponsor`
  // (demoData.js: `is_available: true` para as primeiras entradas do
  // catálogo). Desde que o mercado passou a ler SPONSOR_CATALOG direto
  // (sportsEconomyV26.getMonthlySponsorMarket), "campo ausente" virava
  // "não aceita novos contratos" e eles ficavam inalcançáveis para sempre.
  // Nenhum requisito (idade, XP, títulos, fãs) foi alterado.
  if (sponsor.is_available === false) return { ok: false, reason: 'Patrocinador não aceita novos contratos' };
  // Playthrough 5.27 — o primeiro patrocínio exige prova mínima de carreira
  // (torneios disputados), em vez de nascer no dia 0. Reusa contador existente.
  if (!hasSponsorProof(profile)) {
    return { ok: false, reason: `Requer prova de carreira (${getBalance527().sponsor.proofMinTournaments} torneios disputados)` };
  }
  if ((profile?.xp || 0) < (sponsor.min_xp || 0)) return { ok: false, reason: `Requer ${sponsor.min_xp} XP` };
  if ((profile?.tournaments_won || 0) < (sponsor.min_titles || 0)) return { ok: false, reason: `Requer ${sponsor.min_titles} título(s)` };
  if ((profile?.fan_appeal || 0) < (sponsor.min_fan_appeal || 0)) return { ok: false, reason: `Requer ${sponsor.min_fan_appeal} apego dos fãs` };
  const age = calculateAge(profile);
  if (age < (sponsor.min_age || 16) || age > (sponsor.max_age || 40)) return { ok: false, reason: `Fora da faixa etária (${sponsor.min_age}-${sponsor.max_age} anos)` };
  return { ok: true };
}

// ─── Contract Evaluation ───────────────────────────────────────────────────

export function evaluateContractSatisfaction(contract, profile, recentMatches) {
  const clauses = contract.performance_clauses || {};
  const matches = recentMatches || [];
  const totalMatches = matches.length;
  const wins = matches.filter(m => m.winner_team === profile?.sport_name || m.did_win).length;
  const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

  let satisfaction = 50;

  // Win rate clause
  if (clauses.min_win_rate && totalMatches > 0) {
    if (winRate >= clauses.min_win_rate) {
      satisfaction += 20;
    } else {
      satisfaction -= Math.round((clauses.min_win_rate - winRate) * 0.5);
    }
  }

  // Tournament participation
  const tournaments = matches.filter(m => m.is_tournament).length;
  if (clauses.tournament_participation) {
    if (tournaments >= clauses.tournament_participation) {
      satisfaction += 10;
    } else {
      satisfaction -= 10;
    }
  }

  // Fan appeal trend
  if ((profile?.fan_appeal || 50) >= 60) satisfaction += 5;
  if ((profile?.fan_appeal || 50) < 30) satisfaction -= 10;

  return Math.max(0, Math.min(100, satisfaction));
}

export function shouldTerminateContract(contract, satisfaction) {
  const threshold = contract.performance_clauses?.termination_threshold || 30;
  return satisfaction < threshold;
}

// ─── Actions ────────────────────────────────────────────────────────────────

// LOCAL-9E.1-H1-R1 — E1-01b: rescindir (sem multa) e reassinar o mesmo
// patrocinador pagava as luvas de assinatura de novo, quantas vezes o jogador
// quisesse. Rescisão VOLUNTÁRIA grava a data da carreira
// (`voluntary_termination_on`); por SPONSOR_RESIGN_COOLDOWN_DAYS dias o mesmo
// patrocinador (id canônico do catálogo, qualquer contrato da cadeia) não
// assina de novo. Encerramentos naturais (vencimento, metas, renovação) não
// geram carência. Rescisões gravadas antes desta regra não têm data e não
// bloqueiam (não há como datá-las pela carreira).
export const SPONSOR_RESIGN_COOLDOWN_DAYS = 90;
export const VOLUNTARY_TERMINATION_REASON = 'Rescisão voluntária';

/** Regra pura da carência: { blocked, reason, terminatedOn, availableOn }. */
export function getSponsorResignCooldown(sponsorId, contracts = [], careerDate) {
  const today = isoDay(careerDate);
  const last = (Array.isArray(contracts) ? contracts : [])
    .filter((contract) => contract && isoDay(contract.voluntary_termination_on))
    .filter((contract) => findContractSponsor(contract)?.id === sponsorId)
    .map((contract) => isoDay(contract.voluntary_termination_on))
    .sort()
    .at(-1) || null;
  if (!last || !today) return { blocked: false, reason: null, terminatedOn: last, availableOn: last ? addIsoDays(last, SPONSOR_RESIGN_COOLDOWN_DAYS) : null };
  const availableOn = addIsoDays(last, SPONSOR_RESIGN_COOLDOWN_DAYS);
  if (today >= availableOn) return { blocked: false, reason: null, terminatedOn: last, availableOn };
  return { blocked: true, reason: `Contrato rescindido em ${brDate(last)}: nova assinatura com este patrocinador a partir de ${brDate(availableOn)}.`, terminatedOn: last, availableOn };
}

const refusal = (message, code) => Object.assign(new Error(message), { code });

export async function signSponsorContract(profile, sponsor) {
  // Relê o perfil: requisitos, data e saldo vêm do save, não do objeto da tela.
  const current = await localGame.entities.PlayerProfile.get(profile?.id);
  const check = canSign(sponsor, current);
  if (!check.ok) throw refusal(check.reason, 'not-eligible');
  const history = (await localGame.entities.PlayerContract.filter({ profile_id: current.id })) || [];
  const activeContracts = history.filter((contract) => contract?.is_active === true);
  if (activeContracts.some((contract) => contract.sponsor_id === sponsor.id)) throw refusal('Este patrocinador já possui contrato ativo.', 'already-active');
  const careerDate = current.career_date || '2026-01-01';
  const cooldown = getSponsorResignCooldown(sponsor.id, history, careerDate);
  if (cooldown.blocked) throw refusal(cooldown.reason, 'resign-cooldown');
  const slot = validateSponsorSlot(sponsor, activeContracts);
  if (!slot.ok) throw refusal(slot.reason, 'slot');

  const offer = negotiateOffer(sponsor, current);
  const d = new Date(careerDate + 'T00:00:00');
  d.setMonth(d.getMonth() + offer.duration_months);
  // Identidade da assinatura: n-ésimo contrato deste patrocinador na carreira.
  // Chamadas que leram o mesmo histórico disputam a MESMA chave; só a primeira grava.
  const sequence = history.filter((contract) => findContractSponsor(contract)?.id === sponsor.id).length + 1;
  const ledgerId = `sponsor-signing-${current.id}-${sponsor.id}-${careerDate}${sequence > 1 ? `-${sequence}` : ''}`;

  const batch = await localGame.batch([
    { type: 'create', entityName: 'PlayerContract', data: {
      profile_id: current.id,
      sponsor_id: sponsor.id,
      sponsor_name: sponsor.name,
      sponsor_tier: sponsor.tier,
      sponsor_category: slot.category,
      monthly_salary: offer.monthly_salary,
      sign_bonus: offer.sign_bonus,
      started_date: careerDate,
      end_date: d.toISOString().slice(0, 10),
      is_active: true,
      duration_months: offer.duration_months,
      marketing_requirements: sponsor.marketing_requirements || [],
      commercial_goals: sponsor.commercial_goals || [],
      performance_clauses: sponsor.performance_clauses || {},
      goals_progress: {},
      satisfaction_score: 50,
      is_renewable: true,
      signing_bonus_paid: true,
      signing_bonus_paid_at: new Date().toISOString(),
      last_payment_month: null,
    } },
    { type: 'playerIncrement', id: current.id, data: { coins: offer.sign_bonus } },
    { type: 'upsert', entityName: 'FinancialTransaction', id: ledgerId, data: { profile_id: current.id, date: careerDate, type: 'income', category: 'patrocinio', description: `Luvas de patrocínio — ${sponsor.name}`, amount: offer.sign_bonus } },
  ], { idempotencyKey: `sponsor-signing:${sponsor.id}:${sequence}`, caller: 'sponsors.signSponsorContract' });
  if (batch?.skipped) throw refusal('Esta assinatura já foi processada.', 'duplicate');

  const signed = batch?.player ? { ...current, ...batch.player } : current;
  notifyBalance(signed);
  await publishContractEvent({
    profileId: current.id, playerName: current.sport_name || current.name,
    kind: 'sponsor', partyName: sponsor.name, careerDate, months: offer.duration_months,
  });
  return signed;
}

// Mesmo aviso que PlayerAdapter.update dispara quando o saldo muda (header).
function notifyBalance(profile) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent('padel:profile-updated', { detail: { profile, profileId: profile.id, careerDate: profile.career_date, source: 'player-adapter-balance' } }));
}

// ─── Renewal (LOCAL-9E.1-H1) ────────────────────────────────────────────────
// E1-01: renovar a qualquer momento encerrava o contrato, criava outro com id
// novo e pagava as luvas de renovação de novo — dinheiro ilimitado repetindo o
// clique. Regras (docs/LOCAL_9E1_H1_SPONSORSHIP_RENEWAL_INTEGRITY.md):
//   - só um contrato ativo, do próprio atleta, renovável, do catálogo, com
//     data de fim, e só nos últimos SPONSOR_RENEWAL_WINDOW_DAYS dias até o fim
//     (inclusive); vencido não renova;
//   - cada contrato renova no máximo uma vez (`renewed_to_contract_id`); o
//     contrato novo tem id determinístico (raiz + sequência);
//   - contrato novo, encerramento do antigo, saldo e extrato vão num único
//     lote (uma gravação do save) com chave de idempotência por contrato.
export const SPONSOR_RENEWAL_WINDOW_DAYS = 30;

const RENEWAL_REFUSALS = {
  'missing-contract': 'Contrato não encontrado.',
  'wrong-profile': 'Contrato não pertence a este atleta.',
  'already-renewed': 'Este contrato já foi renovado.',
  inactive: 'Contrato encerrado não pode ser renovado.',
  'not-renewable': 'Contrato não é renovável',
  'unknown-sponsor': 'Patrocinador fora do catálogo atual.',
  'no-end-date': 'Contrato sem data de término.',
  'invalid-date': 'Data da carreira inválida.',
};

function isoDay(value) {
  const day = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}
function addIsoDays(day, days) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const brDate = (day) => day.split('-').reverse().join('/');

function findContractSponsor(contract) {
  if (contract.sponsor_id) return SPONSOR_CATALOG.find((s) => s?.id === contract.sponsor_id) || null;
  // Contrato legado sem id de patrocinador: mesmo fallback por nome da tela.
  const name = String(contract.sponsor_name || '').toLowerCase();
  return name ? SPONSOR_CATALOG.find((s) => String(s?.name || '').toLowerCase() === name) || null : null;
}

/** Regra pura de elegibilidade. `careerDate` é a data da carreira (YYYY-MM-DD). */
export function getSponsorRenewalEligibility(contract, careerDate, { profileId = null } = {}) {
  const refuse = (code, extra = {}) => ({ ok: false, code, reason: RENEWAL_REFUSALS[code], ...extra });
  if (!contract || typeof contract !== 'object' || !contract.id) return refuse('missing-contract');
  if (profileId && contract.profile_id !== profileId) return refuse('wrong-profile');
  if (contract.renewed_to_contract_id || contract.termination_reason === 'Renovado') return refuse('already-renewed');
  if (!contract.is_active) return refuse('inactive');
  if (!contract.is_renewable) return refuse('not-renewable');
  const sponsor = findContractSponsor(contract);
  if (!sponsor) return refuse('unknown-sponsor');
  const endDate = isoDay(contract.end_date);
  if (!endDate) return refuse('no-end-date');
  const today = isoDay(careerDate);
  if (!today) return refuse('invalid-date');
  const opensOn = addIsoDays(endDate, -SPONSOR_RENEWAL_WINDOW_DAYS);
  const term = { endDate, opensOn };
  if (today > endDate) return { ...refuse('expired', term), reason: `Contrato venceu em ${brDate(endDate)}.` };
  if (today < opensOn) return { ...refuse('too-early', term), reason: `Renovação disponível a partir de ${brDate(opensOn)} (últimos ${SPONSOR_RENEWAL_WINDOW_DAYS} dias do contrato).` };
  const daysLeft = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return { ok: true, code: 'eligible', reason: null, sponsor, daysLeft, ...term };
}

/**
 * Renovação de domínio. Relê perfil e contrato da carreira (nunca confia no
 * objeto da tela) e devolve { ok, status: 'renewed'|'duplicate'|'refused', code, reason, profile, contract, bonus }.
 */
export async function renewSponsorContract(profileId, contractId) {
  const duplicate = (profile) => ({ ok: false, status: 'duplicate', code: 'already-renewed', reason: RENEWAL_REFUSALS['already-renewed'], profile });
  const profile = await localGame.entities.PlayerProfile.get(profileId).catch(() => null);
  if (!profile) return { ok: false, status: 'refused', code: 'wrong-profile', reason: RENEWAL_REFUSALS['wrong-profile'], profile: null };
  const contract = contractId ? await localGame.entities.PlayerContract.get(contractId).catch(() => null) : null;
  const careerDate = profile.career_date || '2026-01-01';
  const eligibility = getSponsorRenewalEligibility(contract, careerDate, { profileId: profile.id });
  if (!eligibility.ok) {
    if (eligibility.code === 'already-renewed') return duplicate(profile);
    return { ok: false, status: 'refused', code: eligibility.code, reason: eligibility.reason, profile, eligibility };
  }

  const { sponsor } = eligibility;
  const offer = negotiateOffer(sponsor, profile);
  const renewalBonus = Math.round(offer.sign_bonus * (1 + (sponsor.renewal_bonus_pct || 10) / 100));
  const d = new Date(careerDate + 'T00:00:00');
  d.setMonth(d.getMonth() + offer.duration_months);
  const rootId = contract.renewal_root_id || contract.id;
  const sequence = (Number(contract.renewal_sequence) || 0) + 1;
  const renewedId = `${rootId}-renewal-${sequence}`;
  const renewedData = {
    profile_id: profile.id,
    sponsor_id: sponsor.id,
    sponsor_name: sponsor.name,
    sponsor_tier: sponsor.tier,
    sponsor_category: contract.sponsor_category || getSponsorCategory(sponsor),
    monthly_salary: offer.monthly_salary,
    sign_bonus: renewalBonus,
    started_date: careerDate,
    end_date: d.toISOString().slice(0, 10),
    is_active: true,
    duration_months: offer.duration_months,
    marketing_requirements: sponsor.marketing_requirements || [],
    commercial_goals: sponsor.commercial_goals || [],
    performance_clauses: sponsor.performance_clauses || {},
    goals_progress: {},
    satisfaction_score: Math.max(50, contract.satisfaction_score || 50),
    is_renewable: true,
    renewed_from_contract_id: contract.id,
    renewal_root_id: rootId,
    renewal_sequence: sequence,
  };

  let batch;
  try {
    batch = await localGame.batch([
      { type: 'create', entityName: 'PlayerContract', id: renewedId, data: renewedData },
      { type: 'update', entityName: 'PlayerContract', id: contract.id, data: { is_active: false, termination_reason: 'Renovado', renewed_to_contract_id: renewedId } },
      { type: 'playerIncrement', id: profile.id, data: { coins: renewalBonus } },
      { type: 'upsert', entityName: 'FinancialTransaction', id: `sponsor-renewal-${contract.id}-${careerDate}`, data: { profile_id: profile.id, date: careerDate, type: 'income', category: 'patrocinio', description: `Renovação de patrocínio — ${sponsor.name}`, amount: renewalBonus } },
    ], { idempotencyKey: `sponsor-renewal:${contract.id}`, caller: 'sponsors.renewSponsorContract' });
  } catch (error) {
    // Id determinístico já gravado: outra chamada concluiu este mesmo ciclo.
    if (/já existe/.test(String(error?.message))) return duplicate(await localGame.entities.PlayerProfile.get(profile.id).catch(() => profile));
    throw error;
  }
  if (batch?.skipped) return duplicate(batch.player ? { ...profile, ...batch.player } : profile);

  const updated = batch?.player ? { ...profile, ...batch.player } : profile;
  notifyBalance(updated);
  await publishContractEvent({
    profileId: profile.id, playerName: profile.sport_name || profile.name,
    kind: 'sponsor', partyName: sponsor.name, careerDate, months: offer.duration_months, renewal: true,
  });
  return { ok: true, status: 'renewed', code: 'renewed', reason: null, profile: updated, contract: { ...renewedData, id: renewedId }, bonus: renewalBonus };
}

/** Porta usada pela tela e pelo simulador: lança com o motivo quando recusa. */
export async function renewContract(contract, sponsor, profile) {
  if (sponsor?.id && contract?.sponsor_id && sponsor.id !== contract.sponsor_id) {
    throw Object.assign(new Error('Patrocinador não corresponde ao contrato.'), { code: 'sponsor-mismatch' });
  }
  const result = await renewSponsorContract(profile?.id, contract?.id);
  if (!result.ok) throw Object.assign(new Error(result.reason), { code: result.code, renewal: result });
  return result.profile;
}

export async function terminateSponsorContract(contract, reason = VOLUNTARY_TERMINATION_REASON) {
  // LOCAL-9E.1-H1-R1: relê o contrato; só um contrato ATIVO é rescindido (repetir
  // não move a data da carreira nem reescreve "Renovado"/"Contrato expirado").
  const current = contract?.id ? await localGame.entities.PlayerContract.get(contract.id).catch(() => null) : null;
  if (!current) throw refusal('Contrato não encontrado.', 'missing-contract');
  if (!current.is_active) return current;
  const owner = await localGame.entities.PlayerProfile.get(current.profile_id).catch(() => null);
  const terminatedOn = isoDay(owner?.career_date);
  return localGame.entities.PlayerContract.update(current.id, {
    is_active: false,
    termination_reason: reason,
    ...(terminatedOn ? { voluntary_termination_on: terminatedOn } : {}),
  });
}
