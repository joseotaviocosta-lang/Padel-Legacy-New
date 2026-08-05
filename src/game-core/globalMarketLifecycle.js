import { localGame } from '@/api/localGameClient.js';
import { COACHES_DATA, COACH_TIERS, COACH_SPECIALTY_INFO } from '@/lib/coaches';
import { ensureWorldMarket, evolveWorldMarket, getWorldMarketSnapshot } from './worldMarketLifecycle';

const TIER_MINIMUMS = Object.freeze({ iniciante: 6, regional: 5, profissional: 4, elite: 2, lendario: 1 });

function monthKey(date) { return String(date || new Date().toISOString().slice(0, 10)).slice(0, 7); }
function hash(text) { let value = 2166136261; for (const char of String(text)) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); } return Math.abs(value >>> 0); }
function chance(seed, pct) { return (hash(seed) % 10000) < pct * 100; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function normalizeName(value) { return String(value || '').trim().toLocaleLowerCase('pt-BR'); }

async function ensureCoachCatalog() {
  let coaches = (await localGame.entities.Coach.list('-reputation', 500)) || [];
  const existing = new Set(coaches.map((coach) => normalizeName(coach.name)));
  const missing = COACHES_DATA.filter((coach) => !existing.has(normalizeName(coach.name)));
  if (missing.length) {
    await localGame.entities.Coach.bulkCreate(missing.map((coach) => ({ ...coach })));
    coaches = (await localGame.entities.Coach.list('-reputation', 500)) || [];
  }
  return coaches;
}

function normalizeCoachMarket(coach, date) {
  const month = monthKey(date);
  const tier = COACH_TIERS[coach.tier] ? coach.tier : 'regional';
  const reputation = clamp(coach.reputation, 1, 100);
  const age = clamp(coach.age || 40, 22, 80);
  const demand = reputation >= 90 ? 'muito_alta' : reputation >= 75 ? 'alta' : reputation >= 55 ? 'media' : 'baixa';
  const available = coach.coach_contract_status === 'active'
    ? false
    : chance(`${coach.id || coach.name}:${month}:available`, tier === 'iniciante' ? 88 : tier === 'regional' ? 75 : tier === 'profissional' ? 58 : tier === 'elite' ? 38 : 24);
  const salarySwing = 0.92 + ((hash(`${coach.id || coach.name}:${month}:salary`) % 1700) / 10000);
  return {
    ...coach,
    tier,
    age,
    market_available: available,
    market_month: month,
    market_demand: demand,
    market_salary: Math.max(100, Math.round((Number(coach.monthly_cost) || 500) * salarySwing / 50) * 50),
    market_signing_bonus: Math.max(0, Math.round((Number(coach.sign_on_bonus) || 0) * salarySwing / 50) * 50),
    specialty_label: COACH_SPECIALTY_INFO[coach.specialty]?.label || coach.specialty || 'Treinador',
  };
}

function guaranteeCoachAvailability(coaches) {
  const result = coaches.map((coach) => ({ ...coach }));
  for (const [tier, minimum] of Object.entries(TIER_MINIMUMS)) {
    const group = result.filter((coach) => coach.tier === tier && coach.coach_contract_status !== 'active');
    let availableCount = group.filter((coach) => coach.market_available).length;
    if (availableCount >= minimum) continue;
    const candidates = group.filter((coach) => !coach.market_available).sort((a, b) => (a.reputation || 0) - (b.reputation || 0));
    for (const candidate of candidates) {
      candidate.market_available = true;
      availableCount += 1;
      if (availableCount >= minimum) break;
    }
  }
  return result;
}

async function updateCoachMarket(date) {
  const month = monthKey(date);
  const source = await ensureCoachCatalog();
  const normalized = guaranteeCoachAvailability(source.map((coach) => normalizeCoachMarket(coach, date)));
  const updates = normalized.filter((coach) => coach.id).map((coach) => ({
    id: coach.id,
    market_available: coach.market_available,
    market_month: month,
    market_demand: coach.market_demand,
    market_salary: coach.market_salary,
    market_signing_bonus: coach.market_signing_bonus,
  }));
  if (updates.length) await localGame.entities.Coach.bulkUpdate(updates);
  return normalized;
}

function normalizeTeam(team, index) {
  const points = Math.max(0, Number(team.ranking_points) || 0);
  const matches = Math.max(0, Number(team.matches_played) || 0);
  return {
    ...team,
    ranking_position: Number(team.ranking_position) || index + 1,
    ranking_points: points,
    matches_played: matches,
    win_rate: matches > 0 ? Math.round((Number(team.wins || 0) / matches) * 100) : 0,
    market_status: team.market_status || 'estavel',
    chemistry: clamp(team.chemistry || 65, 0, 100),
  };
}

export async function getGlobalMarketSnapshot(profile, date) {
  const careerDate = date || profile?.career_date || new Date().toISOString().slice(0, 10);
  await ensureWorldMarket(careerDate);
  const [athleteMarket, teamsRaw, coachesRaw, events] = await Promise.all([
    getWorldMarketSnapshot(careerDate),
    localGame.entities.TeamRanking.list('-ranking_points', 600).catch(() => []),
    updateCoachMarket(careerDate),
    localGame.entities.WorldEvent.list('-event_date', 100).catch(() => []),
  ]);
  const teams = (teamsRaw || []).map(normalizeTeam).sort((a, b) => b.ranking_points - a.ranking_points).map((team, index) => ({ ...team, ranking_position: index + 1 }));
  const coaches = guaranteeCoachAvailability((coachesRaw || []).map((coach) => normalizeCoachMarket(coach, careerDate)));
  const athletes = athleteMarket?.athletes || [];
  return {
    month: monthKey(careerDate),
    processed: Boolean(athleteMarket?.processed),
    athletes,
    teams,
    coaches,
    recentMovements: (events || []).filter((event) => ['mercado', 'dupla', 'treinador', 'aposentadoria'].some((tag) => (event.tags || []).includes(tag))).slice(0, 20),
    summary: {
      activeAthletes: athletes.filter((athlete) => athlete.career_status !== 'aposentado').length,
      freeAthletes: athletes.filter((athlete) => athlete.market_status === 'livre' && athlete.career_status !== 'aposentado').length,
      activeTeams: teams.length,
      availableCoaches: coaches.filter((coach) => coach.market_available).length,
      beginnerCoaches: coaches.filter((coach) => coach.market_available && coach.tier === 'iniciante').length,
    },
  };
}

export async function processGlobalMarketMonth(profile, date) {
  const careerDate = date || profile?.career_date || new Date().toISOString().slice(0, 10);
  const athleteResult = await evolveWorldMarket(careerDate);
  const coaches = await updateCoachMarket(careerDate);
  const snapshot = await getGlobalMarketSnapshot(profile, careerDate);
  return { athleteResult, coaches, snapshot, skipped: athleteResult?.skipped === true };
}

export { TIER_MINIMUMS };
