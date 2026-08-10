const TIER_ROUNDS = Object.freeze({
  Silver: Object.freeze([
    { label: 'Oitavas de Final', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' },
    { label: 'Semifinal', short: 'SF' },
    { label: 'Final', short: 'F' },
  ]),
  Gold: Object.freeze([
    { label: 'R32', short: 'R32' }, { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' },
  ]),
  Platinum: Object.freeze([
    { label: 'R32', short: 'R32' }, { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' },
  ]),
  Masters: Object.freeze([
    { label: 'R64', short: 'R64' }, { label: 'R32', short: 'R32' }, { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' },
  ]),
  Elite: Object.freeze([
    { label: 'R64', short: 'R64' }, { label: 'R32', short: 'R32' }, { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' },
  ]),
  Crown: Object.freeze([
    { label: 'R64', short: 'R64' }, { label: 'R32', short: 'R32' }, { label: 'R16', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' },
  ]),
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeTournamentDate(value) {
  const day = String(value || '').slice(0, 10);
  return ISO_DAY.test(day) ? day : null;
}

export function addTournamentDays(value, amount) {
  const day = normalizeTournamentDate(value);
  if (!day) return null;
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + Number(amount || 0))).toISOString().slice(0, 10);
}

export function getTournamentRoundsForTier(tier) {
  return (TIER_ROUNDS[tier] || TIER_ROUNDS.Silver).map((round) => ({ ...round }));
}

export function getTournamentMainRoundCount(tournament = {}) {
  return getTournamentRoundsForTier(tournament.tier).length;
}

export function getTournamentQualifyingRoundCount(tournament = {}) {
  const size = Math.max(0, Number(tournament.qualifying_size || 0));
  if (size <= 0) return 0;
  if (size <= 4) return 1;
  if (size <= 8) return 2;
  if (size <= 16) return 3;
  return 4;
}

export function getTournamentCampaignDates(tournament = {}, { qualifyingRequired = false } = {}) {
  const start = normalizeTournamentDate(
    qualifyingRequired
      ? tournament.qualifying_start_date || tournament.qualifyingStartDate || tournament.start_date || tournament.startDate
      : tournament.start_date || tournament.startDate,
  );
  if (!start) return { start: null, end: null, days: 0 };
  const days = getTournamentMainRoundCount(tournament)
    + (qualifyingRequired ? getTournamentQualifyingRoundCount(tournament) : 0);
  const inferredEnd = addTournamentDays(start, Math.max(0, days - 1));
  const explicitEnd = normalizeTournamentDate(tournament.end_date || tournament.endDate);
  return {
    start,
    end: explicitEnd && explicitEnd > inferredEnd ? explicitEnd : inferredEnd,
    days,
  };
}

export { TIER_ROUNDS as TOURNAMENT_ROUNDS };
