import { getTournamentTierConfig } from '@/lib/circuitCatalog.js';

export const ENTRY_PATHS = Object.freeze({
  DIRECT: 'direct', QUALIFYING: 'qualifying', WILDCARD: 'wildcard',
  PROTECTED: 'protected_ranking', SPECIAL_EXEMPT: 'special_exempt',
  JUNIOR: 'junior_invite', NATIONAL: 'national_invite', INELIGIBLE: 'ineligible',
});


export const ENTRY_PATH_LABELS = Object.freeze({
  [ENTRY_PATHS.DIRECT]: 'Chave principal',
  [ENTRY_PATHS.QUALIFYING]: 'Qualifying',
  [ENTRY_PATHS.WILDCARD]: 'Wildcard',
  [ENTRY_PATHS.PROTECTED]: 'Ranking protegido',
  [ENTRY_PATHS.SPECIAL_EXEMPT]: 'Special Exempt',
  [ENTRY_PATHS.JUNIOR]: 'Junior Invite',
  [ENTRY_PATHS.NATIONAL]: 'National Invite',
  [ENTRY_PATHS.INELIGIBLE]: 'Não elegível',
});

export function getEntryPathLabel(path) {
  return ENTRY_PATH_LABELS[path] || ENTRY_PATH_LABELS[ENTRY_PATHS.INELIGIBLE];
}

export function buildAthleteEntryContext(profile = {}, teamRank = 0, tournament = {}) {
  const country = profile.nationality || profile.country;
  return {
    rank: Number(teamRank || profile.team_rank || profile.world_ranking || 0),
    teamRank: Number(teamRank || profile.team_rank || 0),
    age: Number(profile.age || 25),
    nationality: country,
    country,
    wildcard: Boolean(profile.wildcard_tokens > 0 || tournament.player_wildcard),
    protectedRanking: Number(profile.protected_ranking || 0) || null,
    specialExempt: Boolean(profile.special_exempt_until && tournament.start_date && profile.special_exempt_until >= tournament.start_date),
    juniorInvite: Boolean((profile.age || 25) <= 20 && (profile.junior_reputation || 0) >= 50),
    nationalInvite: Boolean(country && tournament.country && country === tournament.country && (profile.national_reputation || 0) >= 40),
  };
}

export function evaluateTournamentEntry(tournament, athlete = {}) {
  const config = getTournamentTierConfig(tournament?.tier);
  const rank = Number(athlete.rank || athlete.teamRank || 0);
  const age = Number(athlete.age || 25);
  const nationality = athlete.nationality || athlete.country;
  const tournamentCountry = tournament?.country;
  const hasRanking = rank > 0;
  const directLimit = Number(tournament?.min_ranking || config.minRanking || 0);
  const qualifyingLimit = directLimit > 0 ? Math.max(directLimit * 2, directLimit + 80) : 800;

  if (athlete.specialExempt) return result(ENTRY_PATHS.SPECIAL_EXEMPT, true, 'Entrada por Special Exempt.');
  if (athlete.protectedRanking && Number(athlete.protectedRanking) <= directLimit) return result(ENTRY_PATHS.PROTECTED, true, 'Entrada por ranking protegido.');
  if (athlete.wildcard) return result(ENTRY_PATHS.WILDCARD, true, 'Entrada por wildcard.');
  if (age <= 20 && athlete.juniorInvite) return result(ENTRY_PATHS.JUNIOR, true, 'Convite destinado a jovem promessa.');
  if (nationality && tournamentCountry && nationality === tournamentCountry && athlete.nationalInvite) return result(ENTRY_PATHS.NATIONAL, true, 'Convite nacional do torneio.');
  if (!hasRanking && tournament?.tier === 'Silver') return result(ENTRY_PATHS.DIRECT, true, 'Legacy Silver aberto a atletas sem ranking.');
  if (directLimit === 0 || (hasRanking && rank <= directLimit)) return result(ENTRY_PATHS.DIRECT, true, 'Classificado diretamente pela posição no ranking.');
  if (Number(tournament?.qualifying_size || config.qualifyingSize || 0) > 0 && hasRanking && rank <= qualifyingLimit) {
    return result(ENTRY_PATHS.QUALIFYING, true, 'Elegível para disputar o qualifying.');
  }
  return result(ENTRY_PATHS.INELIGIBLE, false, `Ranking necessário: Top ${qualifyingLimit} ou convite.`);
}

export function buildSeedings(entries = [], drawSize = 32) {
  const seedCount = drawSize >= 64 ? 16 : drawSize >= 32 ? 8 : 4;
  return [...entries]
    .filter((entry) => Number(entry.rank) > 0)
    .sort((a, b) => a.rank - b.rank)
    .map((entry, index) => ({ ...entry, seed: index < seedCount ? index + 1 : null }));
}

function result(path, eligible, reason) { return { path, eligible, reason }; }
