import { COACH_TIERS, COACH_SPECIALTY_INFO } from '@/lib/coaches.js';
import { fnv1aHash } from '@/lib/hashUtils.js';

// LOCAL-8F (8F-06) — FONTE ÚNICA do mercado mensal de treinadores.
//
// Antes: o Mercado Mundial exibia esta projeção mensal (disponibilidade por
// sorteio do mês, salário com oscilação, mínimo de iniciantes), mas a tela
// Treinadores e a contratação liam `market_available`/`market_salary`
// PERSISTIDOS — que só eram gravados quando alguém abria o Mercado (até a
// LOCAL-8E) ou apertava "Processar mês". O valor exibido num lugar podia
// divergir do valor cobrado no outro.
//
// Agora a disponibilidade e os termos do mês são uma função PURA de
// (catálogo do treinador, mês da carreira): mesma entrada, mesmo resultado,
// sem gravar nada. Mercado, Treinadores e hirePrimaryCoach usam esta
// projeção; a contratação recalcula na data da confirmação. Contratos já
// assinados guardam o salário da assinatura (profile.coach_monthly_salary)
// e não são afetados. A regra (chances por tier, oscilação 0,92–1,09,
// mínimos por tier) é a mesma que já existia em globalMarketLifecycle.js.

export const TIER_MINIMUMS = Object.freeze({ iniciante: 6, regional: 5, profissional: 4, elite: 2, lendario: 1 });

function monthKey(date) { return String(date || '2026-01-01').slice(0, 7); }
function hash(text) { return Math.abs(fnv1aHash(String(text))); }
function chance(seed, pct) { return (hash(seed) % 10000) < pct * 100; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }

// Semente estável entre carreiras: a chave do catálogo (ou o nome). O id do
// registro não serve — versões antigas criavam treinadores com id aleatório.
function coachSeed(coach) { return coach?.catalog_key || coach?.name || coach?.id; }

export function normalizeCoachMarket(coach, date) {
  const month = monthKey(date);
  const seed = coachSeed(coach);
  const tier = COACH_TIERS[coach.tier] ? coach.tier : 'regional';
  const reputation = clamp(coach.reputation, 1, 100);
  const age = clamp(coach.age || 40, 22, 80);
  const demand = reputation >= 90 ? 'muito_alta' : reputation >= 75 ? 'alta' : reputation >= 55 ? 'media' : 'baixa';
  const available = coach.coach_contract_status === 'active'
    ? false
    : chance(`${seed}:${month}:available`, tier === 'iniciante' ? 88 : tier === 'regional' ? 75 : tier === 'profissional' ? 58 : tier === 'elite' ? 38 : 24);
  const salarySwing = 0.92 + ((hash(`${seed}:${month}:salary`) % 1700) / 10000);
  // Base salarial do CATÁLOGO (monthly_cost). Linhas sem ela (seed legado,
  // fora do catálogo) não recebem termos de mercado inventados — o salário
  // segue resolveCoachCanonicalSalary (monthly_salary legado, catálogo por
  // nome ou recusa), a regra da Tutorial 4.1. O market_salary persistido de
  // saves antigos é descartado: não é mais fonte de verdade.
  const base = Number(coach.monthly_cost);
  const projected = {
    ...coach,
    tier,
    age,
    market_available: available,
    market_month: month,
    market_demand: demand,
    market_signing_bonus: Math.max(0, Math.round((Number(coach.sign_on_bonus) || 0) * salarySwing / 50) * 50),
    specialty_label: COACH_SPECIALTY_INFO[coach.specialty]?.label || coach.specialty || 'Treinador',
  };
  if (Number.isFinite(base) && base > 0) projected.market_salary = Math.max(100, Math.round(base * salarySwing / 50) * 50);
  else delete projected.market_salary;
  return projected;
}

export function guaranteeCoachAvailability(coaches) {
  const result = coaches.map((coach) => ({ ...coach }));
  for (const [tier, minimum] of Object.entries(TIER_MINIMUMS)) {
    const group = result.filter((coach) => coach.tier === tier && coach.coach_contract_status !== 'active');
    let availableCount = group.filter((coach) => coach.market_available).length;
    if (availableCount >= minimum) continue;
    const candidates = group.filter((coach) => !coach.market_available).sort((a, b) => (a.reputation || 0) - (b.reputation || 0) || String(coachSeed(a)).localeCompare(String(coachSeed(b))));
    for (const candidate of candidates) {
      candidate.market_available = true;
      availableCount += 1;
      if (availableCount >= minimum) break;
    }
  }
  return result;
}

/** Mercado do mês: disponibilidade e termos de TODOS os treinadores (puro). */
export function projectCoachMarket(coaches, date) {
  return guaranteeCoachAvailability((coaches || []).filter(Boolean).map((coach) => normalizeCoachMarket(coach, date)));
}

/** Termos do mês para UM treinador, calculados sobre o catálogo inteiro (os mínimos por tier dependem do conjunto). */
export function resolveCoachMarketTerms(coach, allCoaches, date) {
  const key = coachSeed(coach);
  const projected = projectCoachMarket(allCoaches, date);
  const found = projected.find((row) => (coach?.id && row.id === coach.id) || coachSeed(row) === key);
  // Fora do catálogo do mercado (linha legada ou sintética): sem termos
  // mensais — vale o próprio registro e a regra canônica de salário
  // (resolveCoachCanonicalSalary), exatamente como antes da LOCAL-8F. Para os
  // treinadores do catálogo, a projeção acima sempre sobrescreve os market_*
  // persistidos.
  return found || coach;
}
