// LOCAL-9E.1 — POLÍTICAS DE DECISÃO ECONÔMICA E ESPORTIVA (só harness).
//
// Três perfis de jogador — econômico, equilibrado e competitivo — que decidem
// SÓ com informação visível na tela (caixa, preço, bônus declarado, salário,
// tier, ranking). Cada decisão é uma função PURA e determinística: mesma
// entrada → mesma escolha; empates resolvidos pelo id. Nenhum sorteio.
//
// Nada aqui é regra de jogo: preços, bônus, contratos, custos de treino e
// elegibilidade vêm das funções reais (v526Actions → src/). O ganho de um
// equipamento é medido pela fonte canônica da LOCAL-9B
// (src/lib/equipmentModifiers.js), recebida por injeção (`eq`) para que este
// módulo continue puro e testável sem o runtime do jogo.

export const PROFILE_IDS = Object.freeze(['economico', 'equilibrado', 'competitivo']);

// Parâmetros só de COMPORTAMENTO (quanto guardar, quanto arriscar, quando
// trocar), nunca de balanceamento.
export const POLICY_PROFILES = Object.freeze({
  economico: Object.freeze({
    id: 'economico',
    // Reserva = meses de custo fixo + piso. O econômico protege o caixa.
    reserveMonths: 4, reserveFloor: 400,
    // Treino: 1 sessão leve por dia, só com energia folgada.
    sessionsPerDay: 1, minEnergyTrain: 50, intensity: () => 'leve', trainReserve: 150,
    // Equipamento: só compra com ROI alto (pontos efetivos por 1.000 moedas),
    // até 20% do caixa livre por item: ≥ 1 ponto efetivo por 100 moedas.
    shopMaxShareOfFree: 0.2, shopMinGain: 1, shopMinRoiPer1000: 10, shopPick: 'roi',
    // Patrocínio: maior valor total do contrato (luvas + salário × meses).
    sponsorPick: 'total-value', sponsorRenewWindowDays: 30, sponsorRenewIfBetterTierAvailable: false,
    // Folha: treinador só se o salário couber em 20% da receita recorrente; sem staff.
    coachIncomeShare: 0.2, coachReserveMonths: 4, coachUpgradeMinOverall: 12,
    staffIncomeShare: 0, staffReserveMonths: 4, staffPriority: Object.freeze(['accountant', 'manager']),
    // Torneio: inscrição até 10% do caixa; prefere o encaixe de ranking e a taxa menor.
    entryMaxCashShare: 0.1, tierPick: 'fit-cheapest',
    // Parceiro: pontuação equilibrada com peso de custo (salário sustentável).
    partnerPick: 'affordable', partnerRenew: 'affordable',
    // Investimento: aplica 50% do excedente acima de 2× a reserva em CDB (risco baixo, visível na tela).
    investSurplusShare: 0.5, investAboveReserveMultiple: 2, investMin: 1000,
    taperDays: 3, pressStyle: 'appeal',
  }),
  equilibrado: Object.freeze({
    id: 'equilibrado',
    reserveMonths: 2, reserveFloor: 250,
    sessionsPerDay: 2, minEnergyTrain: 45, intensity: (p) => ((Number(p.energy) || 0) > 70 ? 'moderado' : 'leve'), trainReserve: 100,
    shopMaxShareOfFree: 0.4, shopMinGain: 1, shopMinRoiPer1000: 3, shopPick: 'roi',
    sponsorPick: 'total-value', sponsorRenewWindowDays: 30, sponsorRenewIfBetterTierAvailable: false,
    coachIncomeShare: 0.4, coachReserveMonths: 3, coachUpgradeMinOverall: 8,
    staffIncomeShare: 0.3, staffReserveMonths: 3, staffPriority: Object.freeze(['physio', 'physical_trainer', 'manager', 'analyst', 'nutritionist', 'psychologist', 'accountant']),
    entryMaxCashShare: 0.25, tierPick: 'fit-highest',
    partnerPick: 'balanced', partnerRenew: 'balanced',
    investSurplusShare: 0.3, investAboveReserveMultiple: 4, investMin: 2000,
    taperDays: 3, pressStyle: 'appeal',
  }),
  competitivo: Object.freeze({
    id: 'competitivo',
    reserveMonths: 1, reserveFloor: 100,
    sessionsPerDay: 3, minEnergyTrain: 55, intensity: (p) => ((Number(p.energy) || 0) > 75 && (Number(p.fatigue) || 0) < 50 ? 'intenso' : 'moderado'), trainReserve: 50,
    shopMaxShareOfFree: 0.8, shopMinGain: 1, shopMinRoiPer1000: 0, shopPick: 'gain',
    sponsorPick: 'tier-then-monthly', sponsorRenewWindowDays: 30, sponsorRenewIfBetterTierAvailable: true,
    coachIncomeShare: 0.6, coachReserveMonths: 2, coachUpgradeMinOverall: 8,
    staffIncomeShare: 0.45, staffReserveMonths: 2, staffPriority: Object.freeze(['physio', 'physical_trainer', 'analyst', 'manager', 'psychologist', 'nutritionist', 'accountant']),
    entryMaxCashShare: 0.5, tierPick: 'highest',
    partnerPick: 'strongest-affordable', partnerRenew: 'strongest-affordable',
    investSurplusShare: 0, investAboveReserveMultiple: Infinity, investMin: Infinity,
    taperDays: 4, pressStyle: 'appeal',
  }),
});

export function getPolicy(id) {
  const policy = POLICY_PROFILES[id];
  if (!policy) throw new Error(`Perfil de política desconhecido: ${id} (use ${PROFILE_IDS.join(', ')})`);
  return policy;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const byId = (a, b) => String(a ?? '').localeCompare(String(b ?? ''));

// ── Orçamento ───────────────────────────────────────────────────────────────
// fixedMonthly = folha recorrente (treinador + staff + parceiro), lida do
// estado do jogo; o caixa livre é o que sobra acima da reserva.
export function planBudget({ coins, fixedMonthly = 0 }, policy) {
  const reserve = Math.max(policy.reserveFloor, Math.round(num(fixedMonthly) * policy.reserveMonths));
  return { coins: num(coins), reserve, free: Math.max(0, num(coins) - reserve) };
}

// ── Equipamento ─────────────────────────────────────────────────────────────
// Ganho REAL de um item = pontos efetivos (pós-limite de 100) que o kit passa
// a acrescentar, trocando o item da mesma categoria. Usa as funções da 9B:
// eq.computeEquipmentModifiers + eq.totalAppliedModifier.
export function equipmentGain({ profile, inventory, shopItems, item }, eq) {
  const current = eq.totalAppliedModifier(profile, eq.computeEquipmentModifiers(inventory, shopItems));
  const lookup = new Map((shopItems || []).map((s) => [s.id, s]));
  const hypothetical = (inventory || [])
    .map((row) => (row.equipped && (lookup.get(row.item_id)?.category === item.category) ? { ...row, equipped: false } : row))
    .concat([{ id: `__candidate__${item.id}`, item_id: item.id, equipped: true }]);
  const next = eq.totalAppliedModifier(profile, eq.computeEquipmentModifiers(hypothetical, shopItems));
  return Math.round((next - current) * 1000) / 1000;
}

/**
 * Escolhe UMA compra (ou nenhuma). rows: saída de act.shopOptions (preço real
 * do mercado, liberação e disponibilidade reais). Devolve { row, gain, roi } ou null.
 */
export function pickEquipmentPurchase({ rows, profile, inventory, shopItems, budget }, policy, eq) {
  const cap = budget.free * policy.shopMaxShareOfFree;
  const scored = (rows || [])
    .filter((r) => r.unlocked && r.available && !r.owned && r.price > 0 && r.price <= cap)
    .map((r) => {
      const gain = equipmentGain({ profile, inventory, shopItems, item: r.item }, eq);
      return { row: r, gain, roi: (gain * 1000) / r.price };
    })
    .filter((x) => x.gain >= policy.shopMinGain && x.roi >= policy.shopMinRoiPer1000);
  if (!scored.length) return null;
  const order = policy.shopPick === 'gain'
    ? (a, b) => b.gain - a.gain || a.row.price - b.row.price || byId(a.row.item.id, b.row.item.id)
    : (a, b) => b.roi - a.roi || b.gain - a.gain || byId(a.row.item.id, b.row.item.id);
  return scored.sort(order)[0];
}

// ── Patrocínio ──────────────────────────────────────────────────────────────
const TIER_RANK = { Bronze: 1, Prata: 2, Ouro: 3 };
export const sponsorTotalValue = (offer) => num(offer?.sign_bonus) + num(offer?.monthly_salary) * num(offer?.duration_months);

/** Ordena as propostas assináveis (act.sponsorOptions().signable). */
export function rankSponsorOffers(rows, policy) {
  const order = policy.sponsorPick === 'tier-then-monthly'
    ? (a, b) => (TIER_RANK[b.sponsor.tier] || 0) - (TIER_RANK[a.sponsor.tier] || 0) || num(b.offer.monthly_salary) - num(a.offer.monthly_salary) || byId(a.sponsor.id, b.sponsor.id)
    : (a, b) => sponsorTotalValue(b.offer) - sponsorTotalValue(a.offer) || byId(a.sponsor.id, b.sponsor.id);
  return [...(rows || [])].sort(order);
}

/**
 * Renovar um contrato que vence em `daysLeft` dias? A tela (SponsorPanel)
 * deixa renovar a qualquer momento; o jogador só renova perto do fim.
 * `betterTierInSlot`: há proposta assinável de tier maior para o mesmo slot.
 */
export function shouldRenewSponsor({ contract, daysLeft, betterTierInSlot }, policy) {
  if (!contract?.is_renewable || daysLeft == null) return { renew: false, reason: 'nao-renovavel' };
  if (daysLeft > policy.sponsorRenewWindowDays) return { renew: false, reason: 'fora-da-janela' };
  if (daysLeft < 0) return { renew: false, reason: 'vencido' };
  if (policy.sponsorRenewIfBetterTierAvailable && betterTierInSlot) return { renew: false, reason: 'tier-melhor-disponivel' };
  return { renew: true, reason: 'janela' };
}

// ── Treinador e staff ───────────────────────────────────────────────────────
/** coaches: [{ coach, salary, signing }] já com o salário canônico do jogo. */
export function pickCoach({ coaches, currentOverall, recurringIncome, coins }, policy) {
  const hasCoach = currentOverall != null;
  const ok = (coaches || []).filter((c) => {
    if (!(c.salary > 0)) return false;
    if (hasCoach && num(c.coach.overall) < currentOverall + policy.coachUpgradeMinOverall) return false;
    if (!(recurringIncome > 0) || c.salary > recurringIncome * policy.coachIncomeShare) return false;
    return num(coins) >= c.signing + c.salary * policy.coachReserveMonths;
  });
  return ok.sort((a, b) => num(b.coach.overall) - num(a.coach.overall) || a.salary - b.salary || byId(a.coach.id, b.coach.id))[0] || null;
}

export function pickStaff({ candidates, payroll, recurringIncome, coins }, policy) {
  if (!(policy.staffIncomeShare > 0) || !(recurringIncome > 0)) return null;
  const prio = (roleId) => { const i = policy.staffPriority.indexOf(roleId); return i < 0 ? 99 : i; };
  const ok = (candidates || []).filter((c) => {
    const cost = num(c.monthlyCost);
    return prio(c.roleId) < 99 && payroll + cost <= recurringIncome * policy.staffIncomeShare && num(coins) >= cost * policy.staffReserveMonths;
  });
  return ok.sort((a, b) => prio(a.roleId) - prio(b.roleId) || num(b.quality) - num(a.quality) || byId(a.id, b.id))[0] || null;
}

// ── Torneios ────────────────────────────────────────────────────────────────
/** cands: torneios abertos e elegíveis (regra real); fit(t) e order(t) vêm do jogo. */
export function rankTournaments({ cands, coins, fit, order }, policy) {
  const affordable = (cands || []).filter((t) => num(t.entry_fee) <= num(coins) * policy.entryMaxCashShare);
  const cmp = {
    'fit-cheapest': (a, b) => fit(b) - fit(a) || num(a.entry_fee) - num(b.entry_fee) || order(b) - order(a),
    'fit-highest': (a, b) => fit(b) - fit(a) || order(b) - order(a) || num(a.entry_fee) - num(b.entry_fee),
    highest: (a, b) => order(b) - order(a) || fit(b) - fit(a) || num(a.entry_fee) - num(b.entry_fee),
  }[policy.tierPick];
  return affordable.sort((a, b) => cmp(a, b) || String(a.start_date || '').localeCompare(String(b.start_date || '')) || byId(a.id, b.id));
}

// ── Investimento ────────────────────────────────────────────────────────────
export function planInvestment({ coins, reserve }, policy) {
  const surplus = num(coins) - reserve * policy.investAboveReserveMultiple;
  const amount = Math.floor(Math.max(0, surplus) * policy.investSurplusShare);
  return amount >= policy.investMin ? amount : 0;
}

// ── Imprensa ────────────────────────────────────────────────────────────────
export function chooseInterviewAnswer(question) {
  const score = (a) => num(a.effects?.fan_appeal) + num(a.effects?.sponsor_appeal);
  return [...(question.answers || [])].sort((x, y) => score(y) - score(x) || byId(x.id, y.id))[0];
}
