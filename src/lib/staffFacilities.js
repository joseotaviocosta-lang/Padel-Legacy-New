import { localGame } from '@/api/localGameClient.js';
export const STAFF_FACILITIES = {
  courts: {
    id: 'courts', name: 'Quadras de treinamento', icon: 'PanelsTopLeft', maxLevel: 5,
    description: 'Melhora a qualidade dos treinos técnicos de quadra e reduz limitações da estrutura.',
    baseCost: 4500, costGrowth: 1.75, minCareerLevel: 1,
    effectsPerLevel: { courtTraining: 0.035 },
  },
  gym: {
    id: 'gym', name: 'Academia de performance', icon: 'Dumbbell', maxLevel: 5,
    description: 'Potencializa preparação física e reduz parte do custo energético das sessões.',
    baseCost: 5500, costGrowth: 1.8, minCareerLevel: 3,
    effectsPerLevel: { physicalTraining: 0.035, trainingEnergyReduction: 0.012 },
  },
  recovery: {
    id: 'recovery', name: 'Centro de recuperação', icon: 'HeartPulse', maxLevel: 5,
    description: 'Amplia o trabalho de fisioterapia, nutrição e recuperação entre compromissos.',
    baseCost: 7000, costGrowth: 1.85, minCareerLevel: 6,
    effectsPerLevel: { dailyEnergy: 0.8, dailyFatigue: 0.8, injuryReduction: 0.025 },
  },
  analysis: {
    id: 'analysis', name: 'Laboratório de análise', icon: 'ChartNoAxesCombined', maxLevel: 5,
    description: 'Aumenta a profundidade dos relatórios e a eficiência dos treinos táticos.',
    baseCost: 8000, costGrowth: 1.9, minCareerLevel: 10,
    effectsPerLevel: { analysisLevel: 0.7, tacticalTraining: 0.025 },
  },
  office: {
    id: 'office', name: 'Escritório de carreira', icon: 'Building2', maxLevel: 5,
    description: 'Melhora negociações comerciais, scouting e organização financeira.',
    baseCost: 9000, costGrowth: 1.95, minCareerLevel: 12,
    effectsPerLevel: { sponsorBonus: 0.025, expenseReduction: 0.012, scoutLevel: 0.35 },
  },
};

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeFacilityLevels(profile = {}) {
  const source = profile.staff_facilities && typeof profile.staff_facilities === 'object'
    ? profile.staff_facilities
    : {};
  return Object.fromEntries(Object.keys(STAFF_FACILITIES).map((id) => [
    id,
    Math.max(0, Math.min(STAFF_FACILITIES[id].maxLevel, Math.floor(number(source[id], 0)))),
  ]));
}

export function getFacilityUpgradeCost(facilityId, currentLevel = 0) {
  const facility = STAFF_FACILITIES[facilityId];
  if (!facility || currentLevel >= facility.maxLevel) return null;
  return Math.round((facility.baseCost * Math.pow(facility.costGrowth, currentLevel)) / 100) * 100;
}

export function getFacilityEffects(profile = {}) {
  const levels = normalizeFacilityLevels(profile);
  const effects = {};
  for (const [facilityId, level] of Object.entries(levels)) {
    const facility = STAFF_FACILITIES[facilityId];
    for (const [key, value] of Object.entries(facility.effectsPerLevel || {})) {
      effects[key] = (effects[key] || 0) + Number(value || 0) * level;
    }
  }
  return effects;
}

export function getFacilitySummary(profile = {}) {
  const levels = normalizeFacilityLevels(profile);
  return Object.values(STAFF_FACILITIES).map((facility) => ({
    ...facility,
    level: levels[facility.id] || 0,
    upgradeCost: getFacilityUpgradeCost(facility.id, levels[facility.id] || 0),
    unlocked: Number(profile.career_level || 1) >= facility.minCareerLevel,
  }));
}

const SYNERGY_DEFINITIONS = [
  {
    id: 'offensive_lab', name: 'Laboratório ofensivo', tier: 'performance',
    description: 'Explosão física, nutrição de performance e quadras de qualidade trabalham juntas.',
    roles: ['physical_trainer', 'nutritionist'], specialties: ['power', 'performance'], facility: ['courts', 2],
    effects: { courtTraining: 0.06, physicalTraining: 0.05 },
  },
  {
    id: 'durable_body', name: 'Corpo resistente', tier: 'medical',
    description: 'Preparação, fisioterapia e recuperação reduzem o desgaste de calendários pesados.',
    roles: ['physical_trainer', 'physio'], specialtyAny: ['recovery', 'preventive', 'sports', 'endurance'], facility: ['recovery', 2],
    effects: { dailyFatigue: 2, injuryReduction: 0.08, trainingEnergyReduction: 0.035 },
  },
  {
    id: 'intelligence_unit', name: 'Unidade de inteligência', tier: 'analysis',
    description: 'Analista e psicólogo transformam dados em decisões e preparação mental.',
    roles: ['performance_analyst', 'psychologist'], facility: ['analysis', 2],
    effects: { analysisLevel: 2, tacticalTraining: 0.07, mentalTraining: 0.05 },
  },
  {
    id: 'career_business', name: 'Gestão profissional', tier: 'management',
    description: 'Empresário e contador trabalham com estrutura comercial para melhorar contratos.',
    roles: ['manager', 'accountant'], facility: ['office', 2],
    effects: { sponsorBonus: 0.06, expenseReduction: 0.035 },
  },
  {
    id: 'global_network', name: 'Rede internacional', tier: 'analysis',
    description: 'Scout, analista e escritório estruturado ampliam oportunidades no circuito.',
    roles: ['scout', 'performance_analyst'], facility: ['office', 3],
    effects: { scoutLevel: 2, analysisLevel: 1, sponsorBonus: 0.025 },
  },
];

export function getActiveStaffSynergies(profile = {}, staff = []) {
  const roleSet = new Set((staff || []).map((member) => member.staff_type));
  const specialties = new Set((staff || []).map((member) => member.specialty_id));
  const levels = normalizeFacilityLevels(profile);
  return SYNERGY_DEFINITIONS.map((synergy) => {
    const rolesReady = (synergy.roles || []).every((role) => roleSet.has(role));
    const specialtiesReady = !(synergy.specialties || []).length || synergy.specialties.every((id) => specialties.has(id));
    const anySpecialtyReady = !(synergy.specialtyAny || []).length || synergy.specialtyAny.some((id) => specialties.has(id));
    const facilityReady = !synergy.facility || (levels[synergy.facility[0]] || 0) >= synergy.facility[1];
    return {
      ...synergy,
      active: rolesReady && specialtiesReady && anySpecialtyReady && facilityReady,
      missing: [
        ...((synergy.roles || []).filter((role) => !roleSet.has(role)).map((role) => `Cargo: ${role}`)),
        ...(facilityReady || !synergy.facility ? [] : [`${STAFF_FACILITIES[synergy.facility[0]].name} nível ${synergy.facility[1]}`]),
      ],
    };
  });
}

export function getSynergyEffects(profile = {}, staff = []) {
  const effects = {};
  for (const synergy of getActiveStaffSynergies(profile, staff).filter((item) => item.active)) {
    for (const [key, value] of Object.entries(synergy.effects || {})) {
      effects[key] = (effects[key] || 0) + Number(value || 0);
    }
  }
  return effects;
}


export async function upgradeStaffFacility(profile, facilityId) {
  const facility = STAFF_FACILITIES[facilityId];
  if (!profile?.id || !facility) throw new Error('Instalação inválida.');
  const careerLevel = Number(profile.career_level || 1);
  if (careerLevel < facility.minCareerLevel) throw new Error(`Requer Experiência de carreira ${facility.minCareerLevel}.`);
  const levels = normalizeFacilityLevels(profile);
  const currentLevel = levels[facilityId] || 0;
  if (currentLevel >= facility.maxLevel) throw new Error('Esta instalação já está no nível máximo.');
  const cost = getFacilityUpgradeCost(facilityId, currentLevel);
  if (Number(profile.coins || 0) < cost) throw new Error(`Saldo insuficiente. Necessário: ${cost.toLocaleString('pt-BR')} moedas.`);
  const nextFacilities = { ...levels, [facilityId]: currentLevel + 1 };
  return localGame.entities.PlayerProfile.update(profile.id, {
    coins: Number(profile.coins || 0) - cost,
    staff_facilities: nextFacilities,
  });
}
