import { localGame } from '@/api/localGameClient.js';
import { STAFF_MARKET, STAFF_ROLE_DEFINITIONS, createStaffContract, getStaffSlots, normalizeStaffMember } from '@/lib/staffCatalog';
import { getDifficultyModifier } from '@/gameplay/difficulty/difficultyConfig.js';

// ── Catalogs ──────────────────────────────────────────────────────────────

export const SPONSORS = [
  { id: 'babolat', name: 'Babolat', tier: 'Bronze', monthly_salary: 1500, sign_bonus: 300, min_xp: 0, min_titles: 0 },
  { id: 'siux', name: 'Siux', tier: 'Bronze', monthly_salary: 1800, sign_bonus: 400, min_xp: 0, min_titles: 0 },
  { id: 'varlion', name: 'Varlion', tier: 'Bronze', monthly_salary: 2000, sign_bonus: 500, min_xp: 0, min_titles: 0 },
  { id: 'nox', name: 'Nox', tier: 'Prata', monthly_salary: 3000, sign_bonus: 1000, min_xp: 500, min_titles: 0 },
  { id: 'wilson', name: 'Wilson', tier: 'Prata', monthly_salary: 3500, sign_bonus: 1200, min_xp: 1000, min_titles: 0 },
  { id: 'adidas', name: 'Adidas', tier: 'Prata', monthly_salary: 3800, sign_bonus: 1500, min_xp: 1500, min_titles: 0 },
  { id: 'bullpad', name: 'Bullpad', tier: 'Ouro', monthly_salary: 5000, sign_bonus: 2000, min_xp: 3000, min_titles: 1 },
  { id: 'head', name: 'Head', tier: 'Ouro', monthly_salary: 6000, sign_bonus: 2500, min_xp: 5000, min_titles: 3 },
];

export const STAFF_TYPES = Object.values(STAFF_ROLE_DEFINITIONS).map((role) => ({
  id: role.id, name: role.name, icon: role.icon, description: role.purpose,
}));
export { STAFF_MARKET, STAFF_ROLE_DEFINITIONS, getStaffSlots };

export const PROPERTIES = [
  { id: 'apartment', name: 'Apartamento', type: 'residencial', price: 50000, monthly_maintenance: 500, bonus_type: 'morale', bonus_value: 5, description: '+5 moral' },
  { id: 'house', name: 'Casa', type: 'residencial', price: 120000, monthly_maintenance: 1000, bonus_type: 'morale', bonus_value: 10, description: '+10 moral' },
  { id: 'mansion', name: 'Mansão', type: 'residencial', price: 500000, monthly_maintenance: 3000, bonus_type: 'morale', bonus_value: 20, description: '+20 moral' },
  { id: 'gym', name: 'Academia Própria', type: 'comercial', price: 200000, monthly_maintenance: 2000, bonus_type: 'training_bonus', bonus_value: 0.30, description: '+30% ganho em treinos' },
  { id: 'training_center', name: 'Centro de Treinamento', type: 'comercial', price: 500000, monthly_maintenance: 5000, bonus_type: 'energy_reduction', bonus_value: 0.50, description: 'Reduz 50% do custo de energia' },
  { id: 'padel_academy', name: 'Academia de Padel', type: 'comercial', price: 800000, monthly_maintenance: 8000, bonus_type: 'passive_income', bonus_value: 15000, description: 'Renda passiva de 15.000/mês' },
];

export const INVESTMENTS = [
  { id: 'savings', name: 'Poupança', type: 'Renda Fixa', min_amount: 1000, risk: 'Baixo', return_rate: 0.02, description: '2% ao mês · risco baixo' },
  { id: 'cdb', name: 'CDB', type: 'Renda Fixa', min_amount: 5000, risk: 'Baixo', return_rate: 0.035, description: '3.5% ao mês · risco baixo' },
  { id: 'stocks', name: 'Ações', type: 'Renda Variável', min_amount: 10000, risk: 'Médio', return_rate: 0.06, description: '6% ao mês · risco médio' },
  { id: 'real_estate', name: 'Fundo Imobiliário', type: 'Renda Variável', min_amount: 20000, risk: 'Médio', return_rate: 0.05, description: '5% ao mês · risco médio' },
  { id: 'crypto', name: 'Criptomoedas', type: 'Alto Risco', min_amount: 5000, risk: 'Alto', return_rate: 0.12, description: '12% ao mês · risco alto' },
  { id: 'venture', name: 'Venture Capital', type: 'Alto Risco', min_amount: 100000, risk: 'Alto', return_rate: 0.15, description: '15% ao mês · risco alto' },
];

const TIER_STYLES = {
  'Ouro': { badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Ouro' },
  'Prata': { badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30', label: 'Prata' },
  'Bronze': { badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30', label: 'Bronze' },
};

export function getSponsorTierStyle(tier) {
  return TIER_STYLES[tier] || TIER_STYLES['Bronze'];
}

const RISK_STYLES = {
  'Baixo': 'text-green-400',
  'Médio': 'text-amber-400',
  'Alto': 'text-red-400',
};

export function getRiskStyle(risk) {
  return RISK_STYLES[risk] || 'text-muted-foreground';
}

export function normalizePlayerInvestment(record) {
  const source = record || {};
  const catalog = INVESTMENTS.find((item) =>
    item.id === source.investment_id ||
    item.name === source.investment_name
  );

  const amount = Number(source.amount);
  const returnRate = Number(source.return_rate);

  return {
    ...source,
    investment_id: source.investment_id || catalog?.id || '',
    investment_name: source.investment_name || catalog?.name || 'Investimento',
    investment_type: source.investment_type || catalog?.type || 'Não informado',
    amount: Number.isFinite(amount) ? amount : 0,
    return_rate: Number.isFinite(returnRate) ? returnRate : Number(catalog?.return_rate || 0),
    risk_level: source.risk_level || catalog?.risk || 'Não informado',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

export function hasStaff(staffList, staffType) {
  return (staffList || []).some(s => s.staff_type === staffType);
}

function getRiskFactor(riskLevel) {
  if (riskLevel === 'Baixo') return 1.0;
  if (riskLevel === 'Médio') return 0.7 + Math.random() * 0.6;
  if (riskLevel === 'Alto') return Math.random() * 2.5 - 0.5;
  return 1.0;
}

// ── Calculations ──────────────────────────────────────────────────────────

export function calculateMonthlyIncome(contracts, investments, properties, managerBonus = 0) {
  let sponsorIncome = (contracts || []).reduce((sum, c) => sum + (c.monthly_salary || 0), 0);
  const resolvedManagerBonus = managerBonus === true ? 0.25 : Math.max(0, Number(managerBonus) || 0);
  if (resolvedManagerBonus > 0) sponsorIncome = Math.round(sponsorIncome * (1 + resolvedManagerBonus));

  const investmentIncome = (investments || []).filter(Boolean).reduce((sum, rawInvestment) => {
    const inv = normalizePlayerInvestment(rawInvestment);
    const factor = getRiskFactor(inv.risk_level);
    return sum + Math.round(inv.amount * inv.return_rate * factor);
  }, 0);

  const passiveIncome = (properties || [])
    .filter(p => p.bonus_type === 'passive_income')
    .reduce((sum, p) => sum + (p.bonus_value || 0), 0);

  return { sponsors: sponsorIncome, investments: investmentIncome, passive: passiveIncome, total: sponsorIncome + investmentIncome + passiveIncome };
}

export function calculateMonthlyExpenses(staff, properties, accountantReduction = 0) {
  const staffCost = (staff || []).filter(s => !['terminated', 'expired'].includes(s.contract_status)).reduce((sum, s) => sum + (s.monthly_cost || 0), 0);
  const maintenanceCost = (properties || []).reduce((sum, p) => sum + (p.monthly_maintenance || 0), 0);
  let total = staffCost + maintenanceCost;
  const resolvedReduction = accountantReduction === true ? 0.15 : Math.max(0, Math.min(0.25, Number(accountantReduction) || 0));
  if (resolvedReduction > 0) total = Math.round(total * (1 - resolvedReduction));
  return { staff: staffCost, maintenance: maintenanceCost, total };
}

// ── Monthly Processing ───────────────────────────────────────────────────

export async function processMonthlyFinances(profile) {
  const month = String(profile.career_date || new Date().toISOString()).slice(0, 7);
  const prior = await localGame.entities.FinancialTransaction.filter({ profile_id: profile.id, month });
  if ((prior || []).some((entry) => entry.type === 'monthly_close')) {
    return { skipped: true, reason: 'Fechamento mensal já processado.', newBalance: profile.coins || 0 };
  }
  const [rawContracts, staff, properties, investments] = await Promise.all([
    localGame.entities.PlayerContract.filter({ profile_id: profile.id, is_active: true }),
    localGame.entities.PlayerStaffHire.filter({ profile_id: profile.id }),
    localGame.entities.PlayerProperty.filter({ profile_id: profile.id }),
    localGame.entities.PlayerInvestment.filter({ profile_id: profile.id }),
  ]);
  const contracts = [];
  for (const contract of rawContracts || []) {
    if (contract.end_date && contract.end_date < profile.career_date) {
      await localGame.entities.PlayerContract.update(contract.id, { is_active: false, termination_reason: 'Contrato expirado' });
    } else contracts.push(contract);
  }

  const managerBonus = Number(profile.staff_bonus_manager) || (hasStaff(staff, 'manager') ? 0.18 : 0);
  const accountantReduction = Number(profile.staff_bonus_accountant) || (hasStaff(staff, 'accountant') ? 0.12 : 0);

  const income = calculateMonthlyIncome(contracts, investments, properties, managerBonus);
  const expenses = calculateMonthlyExpenses(staff, properties, accountantReduction);
  const coachSalary = profile.coach_id && profile.coach_contract_status !== 'terminated' ? Math.max(0, Number(profile.coach_monthly_salary) || 0) : 0;
  const clubFee = profile.club_id ? Math.max(0, Number(profile.club_monthly_fee) || 0) : 0;
  expenses.coach = coachSalary;
  expenses.club = clubFee;
  expenses.total += coachSalary + clubFee;
  // Custos mensais (equipe técnica, treinador, clube) ficam mais leves em
  // dificuldades mais fáceis, permitindo contratar equipe cedo sem tornar a
  // economia infinita (§12 do plano de dificuldade).
  const costMultiplier = getDifficultyModifier(profile, 'costMultiplier');
  if (costMultiplier !== 1) {
    expenses.staff = Math.round(expenses.staff * costMultiplier);
    expenses.maintenance = Math.round(expenses.maintenance * costMultiplier);
    expenses.coach = Math.round(expenses.coach * costMultiplier);
    expenses.club = Math.round(expenses.club * costMultiplier);
    expenses.total = Math.round(expenses.total * costMultiplier);
  }
  const net = income.total - expenses.total;
  const newBalance = (profile.coins || 0) + net;

  await localGame.entities.PlayerProfile.update(profile.id, { coins: newBalance });

  await localGame.entities.FinancialTransaction.create({
    profile_id: profile.id,
    month,
    type: 'monthly_close',
    income: income.total,
    expenses: expenses.total,
    net,
    breakdown: {
      sponsor_income: income.sponsors,
      investment_income: income.investments,
      passive_income: income.passive,
      staff_cost: expenses.staff,
      maintenance_cost: expenses.maintenance,
      coach_salary: coachSalary,
      club_membership_fee: clubFee,
    },
  });

  for (const contract of contracts || []) {
    if (contract.last_payment_month !== month) {
      await localGame.entities.PlayerContract.update(contract.id, { last_payment_month: month });
    }
  }

  return { income, expenses, net, newBalance };
}

// ── Actions ──────────────────────────────────────────────────────────────

export async function signSponsor(profile, sponsor) {
  if ((profile.xp || 0) < sponsor.min_xp) throw new Error(`Requer ${sponsor.min_xp} XP`);
  if ((profile.tournaments_won || 0) < sponsor.min_titles) throw new Error(`Requer ${sponsor.min_titles} título(s)`);

  const careerDate = profile.career_date || '2026-01-01';
  const d = new Date(careerDate + 'T00:00:00');
  d.setMonth(d.getMonth() + 6);

  await localGame.entities.PlayerContract.create({
    profile_id: profile.id,
    sponsor_id: sponsor.id,
    sponsor_name: sponsor.name,
    sponsor_tier: sponsor.tier,
    monthly_salary: sponsor.monthly_salary,
    sign_bonus: sponsor.sign_bonus,
    started_date: careerDate,
    end_date: d.toISOString().slice(0, 10),
    is_active: true,
  });

  return await localGame.entities.PlayerProfile.update(profile.id, {
    coins: (profile.coins || 0) + sponsor.sign_bonus,
  });
}

export async function terminateContract(contract) {
  await localGame.entities.PlayerContract.update(contract.id, { is_active: false });
}

export async function hireStaff(profile, staffCandidate) {
  if (!profile?.id || !staffCandidate?.id) throw new Error('Profissional inválido.');
  const current = await localGame.entities.PlayerStaffHire.filter({ profile_id: profile.id });
  const normalized = (current || []).map(normalizeStaffMember).filter(member => !['terminated', 'expired'].includes(member.contract_status));
  // O treinador principal é um cargo obrigatório e independente.
  // Ele lidera a comissão, mas nunca consome uma vaga dos profissionais de apoio.
  const slots = getStaffSlots(profile.career_level || 1);
  if (normalized.length >= slots) throw new Error(`Todas as ${slots} vagas da comissão técnica estão ocupadas.`);
  if (normalized.some(member => member.staff_type === staffCandidate.roleId)) {
    throw new Error(`Você já possui ${STAFF_ROLE_DEFINITIONS[staffCandidate.roleId]?.name || 'um profissional'} nessa função.`);
  }
  if ((Number(profile.career_level) || 1) < (staffCandidate.minCareerLevel || 1)) {
    throw new Error(`Requer Experiência de carreira ${staffCandidate.minCareerLevel}.`);
  }
  if (staffCandidate.available === false) throw new Error(staffCandidate.unavailableReason || 'Profissional indisponível neste mês.');
  const contract = createStaffContract(staffCandidate, profile.career_date, staffCandidate.contractDurationMonths || 12);
  await localGame.entities.PlayerStaffHire.create({
    profile_id: profile.id,
    staff_id: staffCandidate.id,
    staff_type: staffCandidate.roleId,
    staff_name: staffCandidate.name,
    specialty_id: staffCandidate.specialtyId,
    specialty_name: staffCandidate.specialtyName,
    quality: staffCandidate.quality,
    potential: staffCandidate.potential,
    age: staffCandidate.age,
    personality: staffCandidate.personality,
    monthly_cost: staffCandidate.monthlyCost,
    base_monthly_cost: staffCandidate.monthlyCost,
    effects: staffCandidate.effects,
    hired_date: profile.career_date,
    ...contract,
  });
}

export async function renewStaffContract(staffRecord, profile, durationMonths = 12) {
  if (!staffRecord?.id) throw new Error('Profissional inválido.');
  const member = normalizeStaffMember(staffRecord);
  const duration = Math.max(3, Math.min(36, Number(durationMonths) || 12));
  const loyaltyDiscount = Math.min(0.08, Math.max(0, member.satisfaction - 70) / 500);
  const qualityPremium = Math.max(0, member.quality - 75) / 250;
  const newSalary = Math.max(300, Math.round(member.monthly_cost * (1 + qualityPremium - loyaltyDiscount) / 50) * 50);
  const contract = createStaffContract({ ...member, monthlyCost: newSalary }, profile?.career_date, duration);
  await localGame.entities.PlayerStaffHire.update(member.id, {
    monthly_cost: newSalary,
    contract_started_date: contract.contract_started_date,
    contract_end_date: contract.contract_end_date,
    contract_duration_months: duration,
    contract_status: 'active',
    renewal_requested: false,
    satisfaction: Math.min(100, member.satisfaction + 6),
  });
}

export async function fireStaff(staffRecord, profile) {
  if (!staffRecord?.id) throw new Error('Profissional inválido.');
  const member = normalizeStaffMember(staffRecord);
  const penalty = member.contract_end_date && member.contract_end_date > String(profile?.career_date || '').slice(0, 10)
    ? Math.round(member.monthly_cost * 0.5) : 0;
  if (penalty > 0 && Number(profile?.coins || 0) < penalty) throw new Error(`A rescisão custa ${penalty.toLocaleString('pt-BR')} moedas.`);
  await localGame.entities.PlayerStaffHire.update(staffRecord.id, {
    contract_status: 'terminated', terminated_date: profile?.career_date || new Date().toISOString().slice(0, 10),
    termination_penalty: penalty,
  });
  if (penalty > 0) return await localGame.entities.PlayerProfile.update(profile.id, { coins: Number(profile.coins || 0) - penalty });
  return profile;
}

export async function buyProperty(profile, property) {
  if ((profile.coins || 0) < property.price) throw new Error('Moedas insuficientes');

  await localGame.entities.PlayerProperty.create({
    profile_id: profile.id,
    property_id: property.id,
    property_name: property.name,
    property_type: property.type,
    purchase_price: property.price,
    monthly_maintenance: property.monthly_maintenance,
    bonus_type: property.bonus_type,
    bonus_value: property.bonus_value,
  });

  return await localGame.entities.PlayerProfile.update(profile.id, {
    coins: (profile.coins || 0) - property.price,
  });
}

export async function sellProperty(profile, playerProperty) {
  const refund = Math.round((playerProperty.purchase_price || 0) * 0.7);
  await localGame.entities.PlayerProperty.delete(playerProperty.id);
  return await localGame.entities.PlayerProfile.update(profile.id, {
    coins: (profile.coins || 0) + refund,
  });
}

export async function makeInvestment(profile, investment, amount) {
  const numericAmount = Number(amount);
  const minimum = Number(investment?.min_amount || 0);
  if (!investment?.id) throw new Error('Investimento inválido');
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error('Informe um valor válido');
  if (numericAmount < minimum) throw new Error(`Investimento mínimo: ${minimum}`);
  if ((Number(profile?.coins) || 0) < numericAmount) throw new Error('Moedas insuficientes');

  await localGame.entities.PlayerInvestment.create({
    profile_id: profile.id,
    investment_id: investment.id,
    investment_name: investment.name,
    investment_type: investment.type,
    amount: numericAmount,
    return_rate: investment.return_rate,
    risk_level: investment.risk,
    invested_date: profile.career_date || new Date().toISOString().slice(0, 10),
  });

  return await localGame.entities.PlayerProfile.update(profile.id, {
    coins: (Number(profile?.coins) || 0) - numericAmount,
  });
}

export async function withdrawInvestment(profile, playerInvestment) {
  if (!playerInvestment?.id) throw new Error('Investimento inválido');
  const normalized = normalizePlayerInvestment(playerInvestment);
  await localGame.entities.PlayerInvestment.delete(playerInvestment.id);
  return await localGame.entities.PlayerProfile.update(profile.id, {
    coins: (Number(profile?.coins) || 0) + normalized.amount,
  });
}
