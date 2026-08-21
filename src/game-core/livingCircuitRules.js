const DAY_MS = 86_400_000;

export const WORLD_RANKING_LADDER = Object.freeze([1, 3, 5, 10, 20, 30, 50, 100, 250, 500]);
export const PARTNERSHIP_WARNING_DAYS = Object.freeze([15, 7, 3, 1]);

export function clampNumber(value, min = 0, max = 100, fallback = 0) {
  const parsed = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

export function seededHash(value = '') {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededInteger(seed, min, max) {
  return min + (seededHash(seed) % Math.max(1, max - min + 1));
}

export function seededChance(seed, percentage) {
  return (seededHash(seed) % 10_000) < Math.round(clampNumber(percentage, 0, 100) * 100);
}

export function careerDaysBetween(from, to) {
  const start = new Date(`${String(from || '').slice(0, 10)}T00:00:00Z`).getTime();
  const end = new Date(`${String(to || '').slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / DAY_MS) : 0;
}

export function athleteAgeAt(athlete = {}, currentDate = '2026-01-01') {
  const birth = athlete.birth_date || athlete.date_of_birth;
  if (!birth) return Math.max(16, Math.round(Number(athlete.age) || 24));
  const born = new Date(`${birth}T00:00:00Z`);
  const current = new Date(`${currentDate}T00:00:00Z`);
  if (Number.isNaN(born.getTime()) || Number.isNaN(current.getTime())) return Math.max(16, Math.round(Number(athlete.age) || 24));
  let age = current.getUTCFullYear() - born.getUTCFullYear();
  if (current.getUTCMonth() < born.getUTCMonth() || (current.getUTCMonth() === born.getUTCMonth() && current.getUTCDate() < born.getUTCDate())) age -= 1;
  return Math.max(16, age);
}

export function deriveAthleteCareerState(athlete = {}, currentDate = '2026-01-01') {
  const age = athleteAgeAt(athlete, currentDate);
  const peakAge = clampNumber(athlete.peak_age, 24, 34, 28);
  const ranking = Math.max(1, Number(athlete.ranking_position || athlete.world_ranking || 9999));
  const overall = clampNumber(athlete.overall_rating ?? athlete.overall, 1, 99, 50);
  let stage;
  if (age <= 20 && ranking > 100) stage = 'prospect';
  else if (age < peakAge - 2) stage = 'rising';
  else if (age <= peakAge + 2) stage = 'prime';
  else if (age <= peakAge + 4 && (ranking <= 100 || overall >= 72)) stage = 'established';
  else if (age < Math.max(35, peakAge + 7)) stage = 'declining';
  else stage = 'veteran';
  const labels = {
    prospect: 'Promessa', rising: 'Em ascensão', prime: 'No auge',
    established: 'Consolidado', declining: 'Em declínio', veteran: 'Veterano',
  };
  const legacyLabels = {
    prospect: 'Ascensão', rising: 'Ascensão', prime: 'Auge',
    established: 'Auge', declining: 'Declínio', veteran: 'Veterano',
  };
  return { age, peakAge, stage, label: labels[stage], legacyLabel: legacyLabels[stage] };
}

const FINISH_FORM = Object.freeze({ champion: 100, final: 88, semifinal: 78, quarterfinal: 68, r16: 56, r32: 45, entry: 35 });

export function deriveRecentForm(athlete = {}) {
  const results = Array.isArray(athlete.recent_results) ? athlete.recent_results.slice(-8) : [];
  if (!results.length) {
    const score = clampNumber(athlete.form ?? athlete.current_form, 0, 100, 60);
    return { score: Math.round(score), label: score >= 78 ? 'Excelente' : score >= 64 ? 'Boa' : score >= 45 ? 'Regular' : 'Ruim', source: 'fallback' };
  }
  let weight = 0;
  let total = 0;
  results.forEach((result, index) => {
    const recency = index + 1;
    const finish = String(result.finish || result.placement || 'entry').toLowerCase();
    const base = FINISH_FORM[finish] ?? clampNumber(result.performance, 0, 100, result.won ? 72 : 42);
    total += base * recency;
    weight += recency;
  });
  const score = Math.round(total / Math.max(1, weight));
  return { score, label: score >= 78 ? 'Excelente' : score >= 64 ? 'Boa' : score >= 45 ? 'Regular' : 'Ruim', source: 'results' };
}

export function evolveAthleteCareerMonth(athlete = {}, currentDate = '2026-01-01', { isYearBoundary = false } = {}) {
  const month = String(currentDate).slice(0, 7);
  if (athlete.last_career_evolution_month === month) return { changed: false, patch: {}, state: deriveAthleteCareerState(athlete, currentDate) };
  const baseAge = athleteAgeAt(athlete, currentDate);
  const age = athlete.birth_date || athlete.date_of_birth ? baseAge : Math.max(16, baseAge + (isYearBoundary ? 1 : 0));
  const projected = { ...athlete, age };
  const state = deriveAthleteCareerState(projected, currentDate);
  const overall = clampNumber(athlete.overall_rating ?? athlete.overall, 1, 99, 50);
  const potential = clampNumber(athlete.potential ?? athlete.potential_rating, overall, 99, Math.min(99, overall + 8));
  const gap = Math.max(0, potential - overall);
  const rate = clampNumber(athlete.growth_rate, 0.25, 2.5, 1);
  const declineRate = clampNumber(athlete.decline_rate, 0.25, 2.5, 1);
  let delta = 0;
  if (['prospect', 'rising'].includes(state.stage) && gap > 0) {
    const chance = Math.min(55, 10 + gap * 1.6 + rate * 7);
    if (seededChance(`${athlete.id}:${month}:career-growth`, chance)) delta = 1;
  } else if (state.stage === 'prime' && gap > 0 && seededChance(`${athlete.id}:${month}:prime-growth`, 5 + gap)) {
    delta = 1;
  } else if (state.stage === 'declining' && seededChance(`${athlete.id}:${month}:career-decline`, 10 + declineRate * 5)) {
    delta = -1;
  } else if (state.stage === 'veteran' && seededChance(`${athlete.id}:${month}:career-decline`, 20 + declineRate * 7)) {
    delta = -1;
  }

  const nextOverall = clampNumber(overall + delta, 1, 99, overall);
  const attributes = { ...(athlete.attributes || {}) };
  const keys = Object.keys(attributes);
  if (delta !== 0 && keys.length) {
    const start = seededHash(`${athlete.id}:${month}:attribute`) % keys.length;
    const touched = Math.min(keys.length, 3);
    for (let index = 0; index < touched; index += 1) {
      const key = keys[(start + index) % keys.length];
      attributes[key] = clampNumber(Number(attributes[key]) + delta * 0.35, 1, 100, Number(attributes[key]) || 1);
    }
  }
  const form = deriveRecentForm(athlete);
  return {
    changed: true,
    state,
    delta,
    patch: {
      age,
      career_stage: state.stage,
      career_phase: state.legacyLabel,
      overall: nextOverall,
      overall_rating: nextOverall,
      max_overall_rating: Math.max(Number(athlete.max_overall_rating) || overall, nextOverall),
      best_ranking_position: Math.min(Number(athlete.best_ranking_position) || Number(athlete.ranking_position) || 9999, Number(athlete.ranking_position) || 9999),
      attributes,
      form: form.score,
      current_form: form.score,
      form_label: form.label,
      last_career_evolution_month: month,
      last_updated_date: currentDate,
    },
  };
}

export function calculateRenewalInterest(partnership = {}, player = {}, partner = {}, opportunity = null) {
  const chemistry = clampNumber(partnership.chemistry ?? player.partner_chemistry, 0, 100, 50);
  const matches = Math.max(0, Number(partnership.shared_matches) || 0);
  const wins = Math.max(0, Number(partnership.shared_wins) || 0);
  const winRate = matches ? wins / matches : 0.5;
  const morale = clampNumber(partnership.partner_morale ?? partner.morale, 0, 100, 70);
  const stabilityDays = Math.max(0, careerDaysBetween(partnership.started_career_date || partnership.contract_started_date, player.career_date));
  const stability = clampNumber(stabilityDays / 1.8, 0, 100, 0);
  const playerRank = Math.max(1, Number(player.ranking_position) || 1500);
  const partnerRank = Math.max(1, Number(partner.ranking_position || partner.world_ranking) || 500);
  const rankingFit = clampNumber(100 - Math.abs(playerRank - partnerRank) / 8, 0, 100, 45);
  const trajectory = String(player.ranking_trend || '').toLowerCase() === 'subindo' ? 78 : String(player.ranking_trend || '').toLowerCase() === 'caindo' ? 35 : 55;
  const opportunityPenalty = opportunity ? clampNumber(18 + Math.max(0, playerRank - Number(opportunity.ranking_position || opportunity.world_rank || playerRank)) / 20, 12, 36, 22) : 0;
  const score = Math.round(clampNumber(chemistry * 0.28 + winRate * 100 * 0.22 + morale * 0.16 + stability * 0.12 + rankingFit * 0.12 + trajectory * 0.10 - opportunityPenalty, 0, 100));
  const factors = [];
  if (chemistry >= 70) factors.push('ótima química'); else if (chemistry < 40) factors.push('química baixa');
  if (matches >= 5 && winRate >= 0.55) factors.push('bons resultados recentes'); else if (matches >= 5 && winRate < 0.35) factors.push('resultados recentes ruins');
  if (stability >= 65) factors.push('parceria estável');
  if (String(player.ranking_trend || '').toLowerCase() === 'subindo') factors.push('ranking em ascensão');
  if (opportunity) factors.push(`interesse de ${opportunity.name || 'outro atleta'} em uma oportunidade esportiva melhor`);
  return { score, level: score >= 68 ? 'alto' : score >= 43 ? 'medio' : 'baixo', factors };
}

export function decideRenewal(partnership, player, partner, terms = {}, currentDate = player?.career_date, opportunity = null) {
  const interest = calculateRenewalInterest(partnership, player, partner, opportunity);
  const requestedSplit = clampNumber(terms.prizeSplit ?? partnership.prize_split_pct, 35, 70, 50);
  const salary = Math.max(0, Number(terms.monthlySalary ?? partnership.monthly_salary) || 0);
  const expectedSalary = Math.max(80, Number(partner.expected_salary) || Number(partnership.monthly_salary) || 100);
  const conditionsPenalty = requestedSplit > 62 ? (requestedSplit - 62) * 2 : 0;
  const salaryBonus = clampNumber((salary - expectedSalary) / Math.max(1, expectedSalary) * 20, -12, 12, 0);
  const adjusted = clampNumber(interest.score - conditionsPenalty + salaryBonus, 0, 100);
  const roll = seededInteger(`${partnership.id}:${currentDate}:${Math.round(requestedSplit)}:${Math.round(salary)}:renewal`, 0, 99);
  let outcome = 'refused';
  if (adjusted >= 70 || roll < Math.max(8, adjusted - 18)) outcome = 'accepted';
  else if (adjusted >= 48 && roll < adjusted + 18) outcome = 'conditional';
  else if (adjusted >= 35 && roll < 82) outcome = 'wait';
  return {
    outcome,
    interest: { ...interest, score: Math.round(adjusted) },
    conditions: outcome === 'conditional' ? { minimumSalary: Math.max(expectedSalary, salary), maximumPlayerPrizeSplit: Math.min(60, requestedSplit) } : null,
  };
}

export function partnershipRecordId(athleteAId, athleteBId, startDate) {
  const pair = [athleteAId, athleteBId].map(String).sort().join('-');
  return `partnership-${pair}-${String(startDate).slice(0, 10)}`;
}

export function getPartnershipContractTransition(partnership = {}, previousDate, currentDate) {
  const endDate = partnership.contract_end_date || partnership.scheduled_end_date || null;
  if (!endDate) return { endDate: null, warningDays: [], daysRemaining: null, state: partnership.contract_status || 'ativo', shouldEnd: false };
  const warningDays = PARTNERSHIP_WARNING_DAYS.filter((days) => {
    const threshold = new Date(`${endDate}T00:00:00Z`);
    threshold.setUTCDate(threshold.getUTCDate() - days);
    const thresholdDate = threshold.toISOString().slice(0, 10);
    return previousDate < thresholdDate && currentDate >= thresholdDate;
  });
  const daysRemaining = careerDaysBetween(currentDate, endDate);
  const planned = ['encerrar_ao_final', 'nao_renovara'].includes(partnership.contract_status);
  const shouldEnd = planned ? currentDate > endDate : currentDate > addDaysPure(endDate, 7);
  const state = shouldEnd ? 'encerrado' : planned ? partnership.contract_status : daysRemaining <= 0 ? 'vencido' : daysRemaining <= 15 ? 'renovacao_proxima' : partnership.contract_status || 'ativo';
  return { endDate, warningDays, daysRemaining, state, planned, shouldEnd };
}

function addDaysPure(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function crossedRankingMilestone(previousPosition, currentPosition) {
  const previous = Number.isFinite(Number(previousPosition)) ? Number(previousPosition) : Infinity;
  const current = Number(currentPosition);
  if (!Number.isFinite(current) || current <= 0) return null;
  const crossed = WORLD_RANKING_LADDER.filter((threshold) => current <= threshold && previous > threshold);
  return crossed.length ? Math.min(...crossed) : null;
}
