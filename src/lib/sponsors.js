import { base44 } from '@/api/base44Client';

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
    id: 'red_bull',
    name: 'Red Bull Padel',
    tier: 'Ouro',
    industry: 'Bebidas',
    country: 'Áustria',
    logo_emoji: '🐂',
    description: 'Gigante de bebidas energéticas com forte presença no padel',
    reputation: 88,
    monthly_budget: 55000,
    base_monthly_value: 5500,
    base_sign_bonus: 2200,
    preferred_styles: ['Agressivo', 'Potência'],
    preferred_levels: ['Avançado', 'Elite', 'Lenda'],
    preferred_positions: ['esquerda'],
    min_age: 18, max_age: 35,
    min_xp: 2500, min_titles: 1, min_fan_appeal: 60,
    marketing_requirements: ['equipment_usage', 'social_posts', 'interviews', 'events', 'photo_shoots', 'logo_visibility'],
    commercial_goals: [
      { type: 'win_matches', target: 10, period: 'monthly', reward: 1300, penalty: -400 },
      { type: 'win_tournament', target: 1, period: 'seasonal', reward: 6000, penalty: -1200 },
      { type: 'social_posts', target: 10, period: 'monthly', reward: 700, penalty: -250 },
    ],
    performance_clauses: { min_win_rate: 55, tournament_participation: 3, termination_threshold: 40 },
    contract_duration_months: 18,
    renewal_bonus_pct: 20,
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
  },,
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
    if (sponsor.preferred_positions.includes(profile?.position)) {
      score += 10;
      reasons.push(`Posição ${profile.position} é procurada`);
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

function calculateAge(profile) {
  if (!profile?.birth_date) return 20;
  const birth = new Date(profile.birth_date + 'T00:00:00');
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

// ─── Negotiation ────────────────────────────────────────────────────────────

export function negotiateOffer(sponsor, profile) {
  const match = calculateProfileMatch(sponsor, profile);
  const matchMultiplier = 0.7 + (match.score / 100) * 0.6; // 0.7x to 1.3x

  const monthlySalary = Math.round(sponsor.base_monthly_value * matchMultiplier);
  const signBonus = Math.round(sponsor.base_sign_bonus * matchMultiplier);

  return {
    monthly_salary: monthlySalary,
    sign_bonus: signBonus,
    duration_months: sponsor.contract_duration_months,
    match_score: match.score,
    match_reasons: match.reasons,
    match_multiplier: matchMultiplier,
  };
}

export function canSign(sponsor, profile) {
  if (!sponsor.is_available) return { ok: false, reason: 'Patrocinador não aceita novos contratos' };
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

export async function signSponsorContract(profile, sponsor) {
  const check = canSign(sponsor, profile);
  if (!check.ok) throw new Error(check.reason);

  const offer = negotiateOffer(sponsor, profile);
  const careerDate = profile.career_date || '2026-01-01';
  const d = new Date(careerDate + 'T00:00:00');
  d.setMonth(d.getMonth() + offer.duration_months);

  await base44.entities.PlayerContract.create({
    profile_id: profile.id,
    sponsor_id: sponsor.id,
    sponsor_name: sponsor.name,
    sponsor_tier: sponsor.tier,
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
  });

  return await base44.entities.PlayerProfile.update(profile.id, {
    coins: (profile.coins || 0) + offer.sign_bonus,
  });
}

export async function renewContract(contract, sponsor, profile) {
  if (!contract.is_renewable) throw new Error('Contrato não é renovável');

  const offer = negotiateOffer(sponsor, profile);
  const renewalBonus = Math.round(offer.sign_bonus * (1 + (sponsor.renewal_bonus_pct || 10) / 100));
  const careerDate = profile.career_date || '2026-01-01';
  const d = new Date(careerDate + 'T00:00:00');
  d.setMonth(d.getMonth() + offer.duration_months);

  // Deactivate old contract
  await base44.entities.PlayerContract.update(contract.id, {
    is_active: false,
    termination_reason: 'Renovado',
  });

  // Create renewed contract
  await base44.entities.PlayerContract.create({
    profile_id: profile.id,
    sponsor_id: sponsor.id,
    sponsor_name: sponsor.name,
    sponsor_tier: sponsor.tier,
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
  });

  return await base44.entities.PlayerProfile.update(profile.id, {
    coins: (profile.coins || 0) + renewalBonus,
  });
}

export async function terminateSponsorContract(contract, reason = 'Rescisão voluntária') {
  await base44.entities.PlayerContract.update(contract.id, {
    is_active: false,
    termination_reason: reason,
  });
}