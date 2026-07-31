import { buildSeasonTournaments, getSeasonCircuitSummary, getTournamentTierConfig } from '@/lib/circuitCatalog.js';
import { getTournamentDifficulty, getTournamentRewards, getTournamentRounds } from '@/lib/career.js';

export function runCircuitSeasonTest() {
  const tournaments = buildSeasonTournaments(2026, 'season-test');
  const summary = getSeasonCircuitSummary(tournaments);

  const dates = tournaments.map((tournament) => tournament.start_date);
  const uniqueDates = new Set(dates);
  const sorted = [...dates].sort();

  const regional = tournaments.find((tournament) => tournament.tier === 'Regional');
  const challenger = tournaments.find((tournament) => tournament.tier === 'Challenger');
  const major = tournaments.find((tournament) => tournament.tier === 'Major');

  const beginner = { xp: 0, level: 'Iniciante' };
  const regionalOpeningDifficulty = getTournamentDifficulty(regional, beginner, 0, 0);
  const majorUnseededDifficulty = getTournamentDifficulty(major, beginner, 0, 0);
  const majorSeededDifficulty = getTournamentDifficulty(major, beginner, 0, 4);

  const regionalParticipation = getTournamentRewards('Regional', 0);
  const regionalChampion = getTournamentRewards('Regional', getTournamentRounds(regional).length);
  const challengerParticipation = getTournamentRewards('Challenger', 0);
  const p2Champion = getTournamentRewards('P2', getTournamentRounds({ tier: 'P2' }).length);

  const result = {
    success: true,
    version: '0.5.0-alpha.1',
    tournamentCount: tournaments.length,
    developmentTournamentCount: summary.development,
    professionalTournamentCount: summary.professional,
    uniqueDates: uniqueDates.size === tournaments.length,
    chronological: dates.every((date, index) => date === sorted[index]),
    regionalAccessible: getTournamentTierConfig('Regional').minRanking === 0
      && getTournamentTierConfig('Regional').entryFee === 0
      && regionalOpeningDifficulty === 'iniciante',
    challengerAccessible: getTournamentTierConfig('Challenger').minRanking === 0,
    earlyPointsAvailable: regionalParticipation.rankPoints > 0
      && challengerParticipation.rankPoints > regionalParticipation.rankPoints,
    progressionCoherent: regionalChampion.rankPoints < p2Champion.rankPoints,
    shorterEntryBrackets: getTournamentRounds(regional).length < getTournamentRounds({ tier: 'P2' }).length,
    seedingAdvantage: majorSeededDifficulty !== majorUnseededDifficulty,
    summary,
    sampleRewards: {
      regionalParticipation,
      regionalChampion,
      challengerParticipation,
      p2Champion,
    },
    difficulty: {
      regionalOpeningDifficulty,
      majorUnseededDifficulty,
      majorSeededDifficulty,
    },
  };

  result.success = [
    result.tournamentCount >= 24,
    result.developmentTournamentCount >= 12,
    result.uniqueDates,
    result.chronological,
    result.regionalAccessible,
    result.challengerAccessible,
    result.earlyPointsAvailable,
    result.progressionCoherent,
    result.shorterEntryBrackets,
    result.seedingAdvantage,
  ].every(Boolean);

  return result;
}

export function setupCircuitSeasonTest() {
  if (typeof window === 'undefined') return;
  window.PadelCircuitSeasonTest = { run: runCircuitSeasonTest };
}
