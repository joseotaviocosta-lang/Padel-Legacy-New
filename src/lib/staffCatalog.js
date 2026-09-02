import {
  Activity, Apple, BarChart3, Brain, Briefcase, Calculator, Dumbbell,
  HeartPulse, Search, ShieldCheck, Sparkles, Target, Users,
} from 'lucide-react';
import { fnv1aHash } from './hashUtils.js';

export const STAFF_ROLE_DEFINITIONS = {
  physical_trainer: {
    id: 'physical_trainer', name: 'Preparador físico', icon: 'Dumbbell', category: 'performance',
    purpose: 'Controla a carga física, melhora a recuperação entre sessões e torna os treinos físicos mais eficientes.',
    why: 'Permite treinar com regularidade sem transformar energia e fadiga em uma punição constante.',
    specialties: {
      endurance: { name: 'Resistência', summary: 'Menor custo de energia em treinos e partidas longas.', effects: { physicalTraining: 0.10, trainingEnergyReduction: 0.06 } },
      recovery: { name: 'Recuperação', summary: 'Maior recuperação diária e menor acúmulo de fadiga.', effects: { dailyEnergy: 3, dailyFatigue: 2 } },
      power: { name: 'Explosão', summary: 'Potencializa treinos de potência, velocidade e força.', effects: { physicalTraining: 0.16 } },
      mobility: { name: 'Mobilidade', summary: 'Aprimora agilidade, deslocamento e prevenção de sobrecarga.', effects: { physicalTraining: 0.12, injuryReduction: 0.08 } },
    },
  },
  physio: {
    id: 'physio', name: 'Fisioterapeuta', icon: 'HeartPulse', category: 'medical',
    purpose: 'Trabalha automaticamente na prevenção e recuperação do desgaste físico.',
    why: 'Reduz o risco de lesão e ajuda o atleta a atravessar sequências de torneios sem depender de uma ação diária de fisioterapia.',
    specialties: {
      preventive: { name: 'Preventivo', summary: 'Reduz de forma consistente o risco de lesão.', effects: { injuryReduction: 0.28, dailyFatigue: 2 } },
      sports: { name: 'Esportivo', summary: 'Recuperação superior depois de partidas e torneios.', effects: { dailyEnergy: 2, dailyFatigue: 4 } },
      clinical: { name: 'Clínico', summary: 'Melhora o suporte durante períodos de alto desgaste.', effects: { injuryReduction: 0.18, dailyFatigue: 5 } },
      high_performance: { name: 'Alta performance', summary: 'Combina prevenção e recuperação em nível de elite.', effects: { injuryReduction: 0.38, dailyEnergy: 2, dailyFatigue: 5 } },
    },
  },
  nutritionist: {
    id: 'nutritionist', name: 'Nutricionista', icon: 'Apple', category: 'medical',
    purpose: 'Aprimora recuperação, disponibilidade de energia e adaptação ao treino.',
    why: 'Faz a preparação render mais sem conceder atributos de forma automática.',
    specialties: {
      recovery: { name: 'Recuperação', summary: 'Recupera mais energia a cada dia.', effects: { dailyEnergy: 4 } },
      performance: { name: 'Performance', summary: 'Pequeno ganho adicional em todos os treinos.', effects: { allTraining: 0.08, dailyEnergy: 2 } },
      endurance: { name: 'Resistência', summary: 'Reduz o custo energético das sessões.', effects: { trainingEnergyReduction: 0.08, dailyEnergy: 2 } },
    },
  },
  psychologist: {
    id: 'psychologist', name: 'Psicólogo esportivo', icon: 'Brain', category: 'mental',
    purpose: 'Desenvolve confiança, foco, pressão e recuperação emocional.',
    why: 'Ajuda a manter desempenho em partidas decisivas e reduz oscilações depois de derrotas.',
    specialties: {
      confidence: { name: 'Confiança', summary: 'Melhora confiança e recuperação após resultados ruins.', effects: { dailyConfidence: 2, mentalTraining: 0.10 } },
      pressure: { name: 'Pressão', summary: 'Potencializa treino mental e estabilidade competitiva.', effects: { mentalTraining: 0.16, dailyMorale: 1 } },
      focus: { name: 'Concentração', summary: 'Melhora o aproveitamento de treinos mentais e táticos.', effects: { mentalTraining: 0.10, tacticalTraining: 0.08 } },
    },
  },
  performance_analyst: {
    id: 'performance_analyst', name: 'Analista de desempenho', icon: 'BarChart3', category: 'analysis',
    purpose: 'Transforma partidas e dados em informações úteis para treino e tática.',
    why: 'Não aumenta atributos diretamente: melhora a qualidade das decisões do jogador.',
    specialties: {
      opponents: { name: 'Adversários', summary: 'Relatórios mais claros sobre forças e fraquezas rivais.', effects: { analysisLevel: 2, tacticalTraining: 0.08 } },
      video: { name: 'Vídeo', summary: 'Aprimora leitura técnica e preparação de golpes.', effects: { analysisLevel: 1, courtTraining: 0.08 } },
      data: { name: 'Dados avançados', summary: 'Libera análises mais profundas e recomendações melhores.', effects: { analysisLevel: 3, tacticalTraining: 0.12 } },
    },
  },
  scout: {
    id: 'scout', name: 'Scout', icon: 'Search', category: 'analysis',
    purpose: 'Encontra parceiros, jovens promessas e oportunidades compatíveis com a carreira.',
    why: 'Amplia a qualidade e a variedade das opções disponíveis no mercado de jogadores.',
    specialties: {
      partners: { name: 'Parceiros', summary: 'Melhora a busca de candidatos compatíveis para a dupla.', effects: { scoutLevel: 2 } },
      prospects: { name: 'Jovens promessas', summary: 'Aumenta a descoberta de atletas com potencial.', effects: { scoutLevel: 3 } },
      international: { name: 'Mercado internacional', summary: 'Amplia o alcance da busca mundial.', effects: { scoutLevel: 3 } },
    },
  },
  manager: {
    id: 'manager', name: 'Empresário', icon: 'Briefcase', category: 'management',
    purpose: 'Cuida de contratos, patrocínios, convites e valorização comercial.',
    why: 'Converte reputação esportiva em oportunidades financeiras e profissionais.',
    specialties: {
      sponsorships: { name: 'Patrocínios', summary: 'Aumenta receitas e qualidade das propostas comerciais.', effects: { sponsorBonus: 0.18 } },
      negotiation: { name: 'Negociação', summary: 'Melhora condições financeiras e reduz perdas contratuais.', effects: { sponsorBonus: 0.12, expenseReduction: 0.04 } },
      publicity: { name: 'Imagem pública', summary: 'Fortalece oportunidades e exposição da carreira.', effects: { sponsorBonus: 0.14 } },
    },
  },
  accountant: {
    id: 'accountant', name: 'Contador', icon: 'Calculator', category: 'management',
    purpose: 'Organiza despesas, contratos e planejamento financeiro.',
    why: 'Reduz custos recorrentes e deixa o crescimento da estrutura sustentável.',
    specialties: {
      expenses: { name: 'Controle de despesas', summary: 'Reduz parte dos custos mensais.', effects: { expenseReduction: 0.12 } },
      planning: { name: 'Planejamento', summary: 'Redução moderada de despesas com visão de longo prazo.', effects: { expenseReduction: 0.09 } },
    },
  },
};

const CANDIDATES = [
  ['pf-ines', 'physical_trainer', 'Inês Carvalho', 'recovery', 58, 850, 1],
  ['pf-bruno', 'physical_trainer', 'Bruno Salvatierra', 'endurance', 70, 1450, 5],
  ['pf-diego', 'physical_trainer', 'Diego Fuentes', 'power', 82, 2600, 15],
  ['pf-lena', 'physical_trainer', 'Lena Hoffmann', 'mobility', 91, 4300, 30],
  ['fisio-marina', 'physio', 'Marina Lopes', 'preventive', 60, 1000, 1],
  ['fisio-tomas', 'physio', 'Tomás Navarro', 'sports', 73, 1750, 8],
  ['fisio-helena', 'physio', 'Helena Ricci', 'clinical', 82, 2900, 18],
  ['fisio-yago', 'physio', 'Yago Ferrer', 'high_performance', 93, 4900, 35],
  ['nutri-luiza', 'nutritionist', 'Luiza Prado', 'recovery', 57, 750, 1],
  ['nutri-mateo', 'nutritionist', 'Mateo Suárez', 'endurance', 72, 1500, 8],
  ['nutri-clara', 'nutritionist', 'Clara Benítez', 'performance', 88, 3400, 25],
  ['psi-alicia', 'psychologist', 'Alicia Ramos', 'confidence', 59, 900, 1],
  ['psi-sofia', 'psychologist', 'Sofia Castellano', 'pressure', 77, 2100, 12],
  ['psi-noah', 'psychologist', 'Noah Lindberg', 'focus', 90, 3900, 30],
  ['ana-caio', 'performance_analyst', 'Caio Menezes', 'video', 62, 1100, 5],
  ['ana-marcus', 'performance_analyst', 'Marcus Holm', 'opponents', 79, 2400, 15],
  ['ana-elena', 'performance_analyst', 'Elena Varga', 'data', 94, 5200, 35],
  ['scout-pablo', 'scout', 'Pablo Torres', 'partners', 61, 950, 5],
  ['scout-astrid', 'scout', 'Astrid Nyström', 'prospects', 78, 2300, 18],
  ['scout-omar', 'scout', 'Omar Haddad', 'international', 91, 4500, 32],
  ['emp-rene', 'manager', 'René Costa', 'negotiation', 63, 1250, 5],
  ['emp-victoria', 'manager', 'Victoria Salas', 'sponsorships', 81, 2850, 18],
  ['emp-lorenzo', 'manager', 'Lorenzo Bianchi', 'publicity', 92, 5000, 35],
  ['cont-ana', 'accountant', 'Ana Martins', 'planning', 60, 700, 1],
  ['cont-julio', 'accountant', 'Júlio Ferreira', 'expenses', 80, 1900, 15],
];

const PERSONALITIES = ['Motivador', 'Exigente', 'Calmo', 'Ambicioso', 'Metódico'];
function hashText(value = '') {
  return fnv1aHash(String(value));
}
function seeded01(value) { return (hashText(value) % 100000) / 100000; }
function monthKey(value) { return String(value || '2026-01-01').slice(0, 7); }
function addMonths(dateValue, months) {
  const date = new Date(`${String(dateValue || '2026-01-01').slice(0, 10)}T12:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

export const STAFF_MARKET = CANDIDATES.map(([id, roleId, name, specialtyId, quality, monthlyCost, minCareerLevel], index) => {
  const role = STAFF_ROLE_DEFINITIONS[roleId];
  const specialty = role.specialties[specialtyId];
  const potential = Math.min(99, quality + 4 + Math.round(seeded01(`${id}:potential`) * 12));
  const age = 27 + Math.round(seeded01(`${id}:age`) * 28);
  const personality = PERSONALITIES[hashText(`${id}:personality`) % PERSONALITIES.length];
  return {
    id, roleId, staff_type: roleId, name, specialtyId, quality, potential, age, personality,
    monthlyCost, minCareerLevel, marketOrder: index,
    roleName: role.name, specialtyName: specialty.name, summary: specialty.summary,
    effects: specialty.effects,
    tier: quality >= 90 ? 'Elite' : quality >= 80 ? 'Profissional' : quality >= 70 ? 'Regional' : 'Formação',
  };
});

export function getStaffMarketForMonth(careerDate, profile = {}) {
  const month = monthKey(careerDate);
  const careerLevel = Math.max(1, Number(profile?.career_level) || 1);
  const hiredIds = new Set(Array.isArray(profile?.staff_hired_ids) ? profile.staff_hired_ids : []);
  return STAFF_MARKET.map((candidate) => {
    const roll = seeded01(`${candidate.id}:${month}:${profile?.id || 'career'}`);
    const availabilityThreshold = candidate.tier === 'Elite' ? 0.42 : candidate.tier === 'Profissional' ? 0.62 : 0.78;
    const available = roll <= availabilityThreshold && !hiredIds.has(candidate.id);
    const demand = Math.round(seeded01(`${candidate.id}:${month}:demand`) * 100);
    const salarySwing = 0.9 + seeded01(`${candidate.id}:${month}:salary`) * 0.22;
    return {
      ...candidate,
      available,
      demand,
      marketMonth: month,
      monthlyCost: Math.max(300, Math.round(candidate.monthlyCost * salarySwing / 50) * 50),
      unavailableReason: available ? null : (demand > 68 ? 'Em negociação com outra equipe' : 'Indisponível neste mês'),
      recommended: available && candidate.minCareerLevel <= careerLevel && candidate.quality >= Math.min(88, 52 + careerLevel),
    };
  }).sort((a, b) => Number(b.available) - Number(a.available) || Number(b.recommended) - Number(a.recommended) || b.quality - a.quality);
}

export function createStaffContract(candidate, careerDate, durationMonths = 12) {
  const duration = Math.max(3, Math.min(36, Number(durationMonths) || 12));
  return {
    contract_started_date: String(careerDate || '2026-01-01').slice(0, 10),
    contract_end_date: addMonths(careerDate, duration),
    contract_duration_months: duration,
    contract_status: 'active',
    satisfaction: 70,
    staff_xp: 0,
    staff_level: 1,
    last_growth_month: null,
    renewal_requested: false,
  };
}

export const LEGACY_STAFF_DEFAULTS = {
  mental_coach: 'psi-alicia',
  physio: 'fisio-marina', nutritionist: 'nutri-luiza', manager: 'emp-rene', accountant: 'cont-ana',
};

export function getStaffSlots(careerLevel = 1) {
  const level = Math.max(1, Number(careerLevel) || 1);
  if (level >= 50) return 9;
  if (level >= 40) return 8;
  if (level >= 30) return 7;
  if (level >= 20) return 6;
  if (level >= 15) return 5;
  if (level >= 10) return 4;
  if (level >= 5) return 3;
  return 2;
}

export function normalizeStaffMember(member = {}) {
  const legacyId = LEGACY_STAFF_DEFAULTS[member.staff_type];
  const candidate = STAFF_MARKET.find(item => item.id === member.staff_id || item.id === legacyId);
  const roleId = candidate?.roleId || (member.staff_type === 'mental_coach' ? 'psychologist' : member.staff_type);
  const role = STAFF_ROLE_DEFINITIONS[roleId];
  const specialtyId = member.specialty_id || candidate?.specialtyId || Object.keys(role?.specialties || {})[0];
  const specialty = role?.specialties?.[specialtyId];
  return {
    ...member,
    staff_id: member.staff_id || candidate?.id || `${roleId}-legacy`,
    staff_type: roleId,
    staff_name: member.staff_name || candidate?.name || role?.name || 'Profissional',
    specialty_id: specialtyId,
    specialty_name: member.specialty_name || candidate?.specialtyName || specialty?.name || 'Geral',
    quality: Number(member.quality ?? candidate?.quality ?? 55),
    monthly_cost: Number(member.monthly_cost ?? candidate?.monthlyCost ?? 0),
    base_monthly_cost: Number(member.base_monthly_cost ?? candidate?.monthlyCost ?? member.monthly_cost ?? 0),
    potential: Number(member.potential ?? candidate?.potential ?? Math.min(99, Number(member.quality ?? candidate?.quality ?? 55) + 8)),
    age: Number(member.age ?? candidate?.age ?? 38),
    personality: member.personality || candidate?.personality || 'Profissional',
    satisfaction: Math.max(0, Math.min(100, Number(member.satisfaction ?? 70))),
    staff_xp: Math.max(0, Number(member.staff_xp ?? 0)),
    staff_level: Math.max(1, Number(member.staff_level ?? 1)),
    contract_started_date: member.contract_started_date || member.hired_date || null,
    contract_end_date: member.contract_end_date || null,
    contract_duration_months: Number(member.contract_duration_months ?? 12),
    contract_status: member.contract_status || 'active',
    minCareerLevel: Number(member.minCareerLevel ?? member.min_career_level ?? candidate?.minCareerLevel ?? 1),
    last_growth_month: member.last_growth_month || null,
    renewal_requested: Boolean(member.renewal_requested),
    effects: member.effects || candidate?.effects || specialty?.effects || {},
    role_name: role?.name || candidate?.roleName || roleId,
    purpose: role?.purpose || '', why: role?.why || '', summary: candidate?.summary || specialty?.summary || '',
  };
}

export function getStaffCandidate(id) { return STAFF_MARKET.find(item => item.id === id) || null; }
export function getStaffRole(roleId) { return STAFF_ROLE_DEFINITIONS[roleId] || null; }
export function getStaffIcon(iconName) {
  return { Activity, Apple, BarChart3, Brain, Briefcase, Calculator, Dumbbell, HeartPulse, Search, ShieldCheck, Sparkles, Target, Users }[iconName] || Users;
}

export function scaleStaffEffects(member) {
  const normalized = normalizeStaffMember(member);
  const qualityScale = Math.max(0.65, Math.min(1.15, normalized.quality / 80));
  return Object.fromEntries(Object.entries(normalized.effects || {}).map(([key, value]) => [key, Number(value) * qualityScale]));
}
