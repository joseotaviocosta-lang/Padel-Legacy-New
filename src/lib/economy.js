import { base44 } from '@/api/base44Client';

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

export const STAFF_TYPES = [
  { id: 'accountant', name: 'Contador', icon: 'Calculator', monthly_cost: 800, bonus_type: 'tax_reduction', bonus_value: 0.15, description: 'Reduz 15% de despesas mensais' },
  { id: 'manager', name: 'Empresário', icon: 'Briefcase', monthly_cost: 1500, bonus_type: 'sponsor_bonus', bonus_value: 0.25, description: 'Aumenta 25% da renda de patrocínios' },
  { id: 'physio', name: 'Fisioterapeuta', icon: 'HeartPulse', monthly_cost: 1200, bonus_type: 'injury_reduction', bonus_value: 0.50, description: 'Reduz 50% do risco de lesão' },
  { id: 'nutritionist', name: 'Nutricionista', icon: 'Apple', monthly_cost: 900, bonus_type: 'energy_bonus', bonus_value: 10, description: '+10 energia máxima' },
  { id: 'mental_coach', name: 'Treinador Mental', icon: 'Brain', monthly_cost: 1100, bonus_type: 'xp_bonus', bonus_value: 0.20, description: '+20% XP de treinos' },
];

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

export function calculateMonthlyIncome(contracts, investments, properties, hasManager) {
  let sponsorIncome = (contracts || []).reduce((sum, c) => sum + (c.monthly_salary || 0), 0);
  if (hasManager) sponsorIncome = Math.round(sponsorIncome * 1.25);

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

export function calculateMonthlyExpenses(staff, properties, hasAccountant) {
  const staffCost = (staff || []).reduce((sum, s) => sum + (s.monthly_cost || 0), 0);
  const maintenanceCost = (properties || []).reduce((sum, p) => sum + (p.monthly_maintenance || 0), 0);
  let total = staffCost + maintenanceCost;
  if (hasAccountant) total = Math.round(total * 0.85);
  return { staff: staffCost, maintenance: maintenanceCost, total };
}

// ── Monthly Processing ───────────────────────────────────────────────────

export async function processMonthlyFinances(profile) {
  const [contracts, staff, properties, investments] = await Promise.all([
    base44.entities.PlayerContract.filter({ profile_id: profile.id, is_active: true }),
    base44.entities.PlayerStaffHire.filter({ profile_id: profile.id }),
    base44.entities.PlayerProperty.filter({ profile_id: profile.id }),
    base44.entities.PlayerInvestment.filter({ profile_id: profile.id }),
  ]);

  const hasManager = hasStaff(staff, 'manager');
  const hasAccountant = hasStaff(staff, 'accountant');

  const income = calculateMonthlyIncome(contracts, investments, properties, hasManager);
  const expenses = calculateMonthlyExpenses(staff, properties, hasAccountant);
  const net = income.total - expenses.total;
  const newBalance = (profile.coins || 0) + net;

  await base44.entities.PlayerProfile.update(profile.id, { coins: newBalance });

  await base44.entities.FinancialTransaction.create({
    profile_id: profile.id,
    month: profile.career_date || new Date().toISOString().slice(0, 7),
    income: income.total,
    expenses: expenses.total,
    net,
    breakdown: {
      sponsor_income: income.sponsors,
      investment_income: income.investments,
      passive_income: income.passive,
      staff_cost: expenses.staff,
      maintenance_cost: expenses.maintenance,
    },
  });

  return { income, expenses, net, newBalance };
}

// ── Actions ──────────────────────────────────────────────────────────────

export async function signSponsor(profile, sponsor) {
  if ((profile.xp || 0) < sponsor.min_xp) throw new Error(`Requer ${sponsor.min_xp} XP`);
  if ((profile.tournaments_won || 0) < sponsor.min_titles) throw new Error(`Requer ${sponsor.min_titles} título(s)`);

  const careerDate = profile.career_date || '2026-01-01';
  const d = new Date(careerDate + 'T00:00:00');
  d.setMonth(d.getMonth() + 6);

  await base44.entities.PlayerContract.create({
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

  return await base44.entities.PlayerProfile.update(profile.id, {
    coins: (profile.coins || 0) + sponsor.sign_bonus,
  });
}

export async function terminateContract(contract) {
  await base44.entities.PlayerContract.update(contract.id, { is_active: false });
}

export async function hireStaff(profile, staffType) {
  await base44.entities.PlayerStaffHire.create({
    profile_id: profile.id,
    staff_type: staffType.id,
    staff_name: staffType.name,
    monthly_cost: staffType.monthly_cost,
    bonus_type: staffType.bonus_type,
    bonus_value: staffType.bonus_value,
  });
}

export async function fireStaff(staffRecord) {
  await base44.entities.PlayerStaffHire.delete(staffRecord.id);
}

export async function buyProperty(profile, property) {
  if ((profile.coins || 0) < property.price) throw new Error('Moedas insuficientes');

  await base44.entities.PlayerProperty.create({
    profile_id: profile.id,
    property_id: property.id,
    property_name: property.name,
    property_type: property.type,
    purchase_price: property.price,
    monthly_maintenance: property.monthly_maintenance,
    bonus_type: property.bonus_type,
    bonus_value: property.bonus_value,
  });

  return await base44.entities.PlayerProfile.update(profile.id, {
    coins: (profile.coins || 0) - property.price,
  });
}

export async function sellProperty(profile, playerProperty) {
  const refund = Math.round((playerProperty.purchase_price || 0) * 0.7);
  await base44.entities.PlayerProperty.delete(playerProperty.id);
  return await base44.entities.PlayerProfile.update(profile.id, {
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

  await base44.entities.PlayerInvestment.create({
    profile_id: profile.id,
    investment_id: investment.id,
    investment_name: investment.name,
    investment_type: investment.type,
    amount: numericAmount,
    return_rate: investment.return_rate,
    risk_level: investment.risk,
    invested_date: profile.career_date || new Date().toISOString().slice(0, 10),
  });

  return await base44.entities.PlayerProfile.update(profile.id, {
    coins: (Number(profile?.coins) || 0) - numericAmount,
  });
}

export async function withdrawInvestment(profile, playerInvestment) {
  if (!playerInvestment?.id) throw new Error('Investimento inválido');
  const normalized = normalizePlayerInvestment(playerInvestment);
  await base44.entities.PlayerInvestment.delete(playerInvestment.id);
  return await base44.entities.PlayerProfile.update(profile.id, {
    coins: (Number(profile?.coins) || 0) + normalized.amount,
  });
}
