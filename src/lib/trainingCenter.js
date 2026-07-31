// ─── Training Center Facility Definitions ───────────────────────────────────
// 11 facilities, each with 5 upgrade levels. Every level gives visible benefits.

export const FACILITY_CATEGORIES = {
  infra: { label: 'Infraestrutura', color: 'text-primary' },
  fisico: { label: 'Físico & Saúde', color: 'text-green-400' },
  tecnologia: { label: 'Tecnologia & Ciência', color: 'text-cyan-400' },
  bemestar: { label: 'Bem-estar & Social', color: 'text-purple-400' },
};

export const FACILITIES = {
  courts: {
    name: 'Quadras',
    icon: 'Circle',
    category: 'infra',
    description: 'Mais quadras permitem mais treinos por dia',
    maxLevel: 5,
    levels: [
      { cost: 0,     desc: 'Sem quadras próprias', benefits: { daily_training_bonus: 0 } },
      { cost: 500,   desc: '1 quadra oficial', benefits: { daily_training_bonus: 0 } },
      { cost: 2000,  desc: '2 quadras — +1 treino/dia', benefits: { daily_training_bonus: 1 } },
      { cost: 6000,  desc: '3 quadras — +2 treinos/dia', benefits: { daily_training_bonus: 2 } },
      { cost: 15000, desc: '4 quadras — +3 treinos/dia', benefits: { daily_training_bonus: 3 } },
      { cost: 40000, desc: '5 quadras — +5 treinos/dia', benefits: { daily_training_bonus: 5 } },
    ],
  },
  gym: {
    name: 'Academia',
    icon: 'Dumbbell',
    category: 'fisico',
    description: 'Ganha mais atributos físicos a cada treino',
    maxLevel: 5,
    levels: [
      { cost: 0,     desc: 'Sem academia', benefits: { physical_gain_pct: 0 } },
      { cost: 800,   desc: 'Academia básica — +5% físico', benefits: { physical_gain_pct: 5 } },
      { cost: 2500,  desc: 'Academia completa — +10% físico', benefits: { physical_gain_pct: 10 } },
      { cost: 7000,  desc: 'Academia premium — +15% físico', benefits: { physical_gain_pct: 15 } },
      { cost: 18000, desc: 'Academia elite — +20% físico', benefits: { physical_gain_pct: 20 } },
      { cost: 45000, desc: 'Academia lendária — +30% físico', benefits: { physical_gain_pct: 30 } },
    ],
  },
  physio: {
    name: 'Fisioterapia',
    icon: 'Heart',
    category: 'fisico',
    description: 'Recupera mais energia por dia',
    maxLevel: 5,
    levels: [
      { cost: 0,     desc: 'Sem fisioterapeuta', benefits: { energy_recovery_bonus: 0 } },
      { cost: 600,   desc: 'Fisio básico — +3 energia/dia', benefits: { energy_recovery_bonus: 3 } },
      { cost: 2000,  desc: 'Fisio completo — +6 energia/dia', benefits: { energy_recovery_bonus: 6 } },
      { cost: 5500,  desc: 'Fisio avançado — +10 energia/dia', benefits: { energy_recovery_bonus: 10 } },
      { cost: 14000, desc: 'Fisio elite — +15 energia/dia', benefits: { energy_recovery_bonus: 15 } },
      { cost: 35000, desc: 'Fisio lendário — +25 energia/dia', benefits: { energy_recovery_bonus: 25 } },
    ],
  },
  medical: {
    name: 'Departamento Médico',
    icon: 'Stethoscope',
    category: 'fisico',
    description: 'Reduz risco e duração de lesões',
    maxLevel: 5,
    levels: [
      { cost: 0,     desc: 'Sem departamento médico', benefits: { injury_risk_reduction: 0, injury_recovery_bonus: 0 } },
      { cost: 1000,  desc: 'Médico plantonista — -10% lesão', benefits: { injury_risk_reduction: 10, injury_recovery_bonus: 0 } },
      { cost: 3000,  desc: 'Equipe médica — -20% lesão, -1d recup.', benefits: { injury_risk_reduction: 20, injury_recovery_bonus: 1 } },
      { cost: 8000,  desc: 'Centro médico — -30% lesão, -2d recup.', benefits: { injury_risk_reduction: 30, injury_recovery_bonus: 2 } },
      { cost: 20000, desc: 'Centro avançado — -40% lesão, -3d recup.', benefits: { injury_risk_reduction: 40, injury_recovery_bonus: 3 } },
      { cost: 50000, desc: 'Centro de excelência — -50% lesão, -5d recup.', benefits: { injury_risk_reduction: 50, injury_recovery_bonus: 5 } },
    ],
  },
  performance_analysis: {
    name: 'Análise de Desempenho',
    icon: 'BarChart3',
    category: 'tecnologia',
    description: 'Aumenta chance de ganho em todos os treinos',
    maxLevel: 5,
    levels: [
      { cost: 0,     desc: 'Sem análise', benefits: { training_gain_pct: 0 } },
      { cost: 1200,  desc: 'Software básico — +5% ganho', benefits: { training_gain_pct: 5 } },
      { cost: 3500,  desc: 'Análise de vídeo — +10% ganho', benefits: { training_gain_pct: 10 } },
      { cost: 9000,  desc: 'Dados avançados — +15% ganho', benefits: { training_gain_pct: 15 } },
      { cost: 22000, desc: 'IA tática — +20% ganho', benefits: { training_gain_pct: 20 } },
      { cost: 55000, desc: 'IA preditiva — +30% ganho', benefits: { training_gain_pct: 30 } },
    ],
  },
  biomechanics: {
    name: 'Biomecânica',
    icon: 'Activity',
    category: 'tecnologia',
    description: 'Ganha mais atributos técnicos por treino',
    maxLevel: 5,
    levels: [
      { cost: 0,     desc: 'Sem laboratório biomecânico', benefits: { technique_gain_pct: 0 } },
      { cost: 1500,  desc: 'Lab básico — +5% técnica', benefits: { technique_gain_pct: 5 } },
      { cost: 4000,  desc: 'Lab completo — +10% técnica', benefits: { technique_gain_pct: 10 } },
      { cost: 10000, desc: 'Lab avançado — +15% técnica', benefits: { technique_gain_pct: 15 } },
      { cost: 25000, desc: 'Lab elite — +20% técnica', benefits: { technique_gain_pct: 20 } },
      { cost: 60000, desc: 'Lab lendário — +30% técnica', benefits: { technique_gain_pct: 30 } },
    ],
  },
  nutrition: {
    name: 'Nutrição',
    icon: 'Apple',
    category: 'fisico',
    description: 'Aumenta energia máxima e recuperação',
    maxLevel: 5,
    levels: [
      { cost: 0,     desc: 'Sem nutricionista', benefits: { max_energy_bonus: 0, energy_recovery_pct: 0 } },
      { cost: 700,   desc: 'Nutrição básica — +5 energia máx', benefits: { max_energy_bonus: 5, energy_recovery_pct: 0 } },
      { cost: 2000,  desc: 'Plano alimentar — +10 máx, +5% recup.', benefits: { max_energy_bonus: 10, energy_recovery_pct: 5 } },
      { cost: 5500,  desc: 'Dieta profissional — +15 máx, +10% recup.', benefits: { max_energy_bonus: 15, energy_recovery_pct: 10 } },
      { cost: 14000, desc: 'Dieta elite — +20 máx, +15% recup.', benefits: { max_energy_bonus: 20, energy_recovery_pct: 15 } },
      { cost: 35000, desc: 'Dieta lendária — +30 máx, +25% recup.', benefits: { max_energy_bonus: 30, energy_recovery_pct: 25 } },
    ],
  },
  psychology: {
    name: 'Psicologia Esportiva',
    icon: 'Brain',
    category: 'bemestar',
    description: 'Ganha mais atributos mentais e eleva moral',
    maxLevel: 5,
    levels: [
      { cost: 0,     desc: 'Sem psicólogo', benefits: { mental_gain_pct: 0, morale_bonus: 0 } },
      { cost: 900,   desc: 'Psi básico — +5% mental', benefits: { mental_gain_pct: 5, morale_bonus: 0 } },
      { cost: 2500,  desc: 'Psi completo — +10% mental, +2 moral', benefits: { mental_gain_pct: 10, morale_bonus: 2 } },
      { cost: 6500,  desc: 'Psi avançado — +15% mental, +4 moral', benefits: { mental_gain_pct: 15, morale_bonus: 4 } },
      { cost: 16000, desc: 'Psi elite — +20% mental, +6 moral', benefits: { mental_gain_pct: 20, morale_bonus: 6 } },
      { cost: 40000, desc: 'Psi lendário — +30% mental, +10 moral', benefits: { mental_gain_pct: 30, morale_bonus: 10 } },
    ],
  },
  accommodation: {
    name: 'Alojamentos',
    icon: 'Home',
    category: 'infra',
    description: 'Recupera energia mais rápido e permite descanso extra',
    maxLevel: 5,
    levels: [
      { cost: 0,     desc: 'Sem alojamento', benefits: { energy_recovery_bonus: 0, rest_anytime: false } },
      { cost: 1000,  desc: 'Alojamento básico — +4 energia/dia', benefits: { energy_recovery_bonus: 4, rest_anytime: false } },
      { cost: 3000,  desc: 'Alojamento confortável — +8/dia', benefits: { energy_recovery_bonus: 8, rest_anytime: false } },
      { cost: 8000,  desc: 'Alojamento premium — +12/dia', benefits: { energy_recovery_bonus: 12, rest_anytime: true } },
      { cost: 20000, desc: 'Suíte — +18/dia, descanso livre', benefits: { energy_recovery_bonus: 18, rest_anytime: true } },
      { cost: 50000, desc: 'Resort — +30/dia, descanso livre', benefits: { energy_recovery_bonus: 30, rest_anytime: true } },
    ],
  },
  laboratory: {
    name: 'Laboratório de Inovação',
    icon: 'FlaskConical',
    category: 'tecnologia',
    description: 'Bônus global em todos os atributos',
    maxLevel: 5,
    levels: [
      { cost: 0,     desc: 'Sem laboratório', benefits: { overall_gain_pct: 0 } },
      { cost: 2000,  desc: 'Lab de P&D — +3% geral', benefits: { overall_gain_pct: 3 } },
      { cost: 5000,  desc: 'Lab de pesquisa — +6% geral', benefits: { overall_gain_pct: 6 } },
      { cost: 12000, desc: 'Lab avançado — +10% geral', benefits: { overall_gain_pct: 10 } },
      { cost: 30000, desc: 'Lab elite — +15% geral', benefits: { overall_gain_pct: 15 } },
      { cost: 70000, desc: 'Lab lendário — +25% geral', benefits: { overall_gain_pct: 25 } },
    ],
  },
  vip: {
    name: 'Área VIP',
    icon: 'Crown',
    category: 'bemestar',
    description: 'Gera renda, atrai patrocinadores e fãs',
    maxLevel: 5,
    levels: [
      { cost: 0,     desc: 'Sem área VIP', benefits: { coins_per_match: 0, sponsor_appeal: 0, fan_appeal: 0 } },
      { cost: 1500,  desc: 'Lounge VIP — +5 moedas/jogo', benefits: { coins_per_match: 5, sponsor_appeal: 2, fan_appeal: 2 } },
      { cost: 4000,  desc: 'Lounge premium — +15/jogo', benefits: { coins_per_match: 15, sponsor_appeal: 5, fan_appeal: 5 } },
      { cost: 10000, desc: 'Lounge elite — +30/jogo', benefits: { coins_per_match: 30, sponsor_appeal: 10, fan_appeal: 10 } },
      { cost: 25000, desc: 'Lounge executivo — +60/jogo', benefits: { coins_per_match: 60, sponsor_appeal: 15, fan_appeal: 15 } },
      { cost: 60000, desc: 'Lounge lendário — +120/jogo', benefits: { coins_per_match: 120, sponsor_appeal: 25, fan_appeal: 25 } },
    ],
  },
};

export const FACILITY_LIST = Object.entries(FACILITIES).map(([id, f]) => ({ id, ...f }));

// ─── Effects Engine ─────────────────────────────────────────────────────────

export function getFacilityLevel(center, facilityId) {
  if (!center?.facilities) return 0;
  return center.facilities[facilityId] || 0;
}

export function getFacilityBenefits(center, facilityId) {
  const facility = FACILITIES[facilityId];
  if (!facility) return null;
  const level = getFacilityLevel(center, facilityId);
  return facility.levels[level] || facility.levels[0];
}

export function getUpgradeCost(center, facilityId) {
  const facility = FACILITIES[facilityId];
  if (!facility) return null;
  const currentLevel = getFacilityLevel(center, facilityId);
  if (currentLevel >= facility.maxLevel) return null;
  return facility.levels[currentLevel + 1]?.cost || 0;
}

export function getCenterEffects(center) {
  const effects = {
    dailyTrainingBonus: 0,
    energyRecoveryBonus: 0,
    maxEnergyBonus: 0,
    energyRecoveryPct: 0,
    injuryRiskReduction: 0,
    injuryRecoveryBonus: 0,
    trainingGainPct: 0,
    physicalGainPct: 0,
    techniqueGainPct: 0,
    mentalGainPct: 0,
    overallGainPct: 0,
    moraleBonus: 0,
    coinsPerMatch: 0,
    sponsorAppeal: 0,
    fanAppeal: 0,
    restAnytime: false,
  };

  if (!center?.facilities) return effects;

  for (const [id, facility] of Object.entries(FACILITIES)) {
    const level = center.facilities[id] || 0;
    if (level === 0) continue;
    const benefits = facility.levels[level]?.benefits || {};
    if (benefits.daily_training_bonus) effects.dailyTrainingBonus += benefits.daily_training_bonus;
    if (benefits.energy_recovery_bonus) effects.energyRecoveryBonus += benefits.energy_recovery_bonus;
    if (benefits.max_energy_bonus) effects.maxEnergyBonus += benefits.max_energy_bonus;
    if (benefits.energy_recovery_pct) effects.energyRecoveryPct += benefits.energy_recovery_pct;
    if (benefits.injury_risk_reduction) effects.injuryRiskReduction += benefits.injury_risk_reduction;
    if (benefits.injury_recovery_bonus) effects.injuryRecoveryBonus += benefits.injury_recovery_bonus;
    if (benefits.training_gain_pct) effects.trainingGainPct += benefits.training_gain_pct;
    if (benefits.physical_gain_pct) effects.physicalGainPct += benefits.physical_gain_pct;
    if (benefits.technique_gain_pct) effects.techniqueGainPct += benefits.technique_gain_pct;
    if (benefits.mental_gain_pct) effects.mentalGainPct += benefits.mental_gain_pct;
    if (benefits.overall_gain_pct) effects.overallGainPct += benefits.overall_gain_pct;
    if (benefits.morale_bonus) effects.moraleBonus += benefits.morale_bonus;
    if (benefits.coins_per_match) effects.coinsPerMatch += benefits.coins_per_match;
    if (benefits.sponsor_appeal) effects.sponsorAppeal += benefits.sponsor_appeal;
    if (benefits.fan_appeal) effects.fanAppeal += benefits.fan_appeal;
    if (benefits.rest_anytime) effects.restAnytime = true;
  }

  return effects;
}

export function getCenterLevel(center) {
  if (!center?.facilities) return 1;
  const totalLevels = Object.values(center.facilities).reduce((a, b) => a + (b || 0), 0);
  const maxTotal = FACILITY_LIST.length * 5;
  return Math.max(1, Math.ceil((totalLevels / maxTotal) * 10));
}

export function getCenterReputation(center) {
  if (!center?.facilities) return 0;
  let rep = 0;
  for (const [id, level] of Object.entries(center.facilities)) {
    rep += (level || 0) * 2;
  }
  return rep;
}

export const DEFAULT_FACILITIES = {
  courts: 0, gym: 0, physio: 0, medical: 0, performance_analysis: 0,
  biomechanics: 0, nutrition: 0, psychology: 0, accommodation: 0, laboratory: 0, vip: 0,
};