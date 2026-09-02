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

// Correção Fase 1A (achado #16 da auditoria de atletas reais vs. bots):
// "posição de ranking" chegava até aqui com nomes de campo diferentes
// dependendo do chamador — profile.world_ranking (jogador),
// athlete.ranking_position/ranking (WorldTourLifecycle.js:normalizeAthlete),
// team_rank/teamRank (torneio do jogador). WorldTourLifecycle.js gravava em
// `ranking`, mas evaluateTournamentEntry só lia `rank`/`teamRank` — nenhuma
// dupla do World Tour em segundo plano era considerada "com ranking", e a
// elegibilidade por tier nunca filtrava nada ali (Silver e Crown sorteavam
// do mesmo pool). Corrigido com UM adaptador central — nenhum `||` disperso
// pelos chamadores: toda leitura de "rank de entrada" passa por
// resolveEntryRank, e toda escrita do contexto de elegibilidade passa por
// buildAthleteEntryContext. Nenhum consumidor precisou mudar seu próprio
// campo de origem.
const ENTRY_RANK_FIELDS = Object.freeze([
  'rank', 'teamRank', 'team_rank', 'ranking_position', 'ranking', 'world_ranking',
]);

export function resolveEntryRank(athleteLike = {}) {
  for (const field of ENTRY_RANK_FIELDS) {
    const value = Number(athleteLike?.[field]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

export function buildAthleteEntryContext(profile = {}, teamRank = null, tournament = {}) {
  const country = profile.nationality || profile.country;
  // teamRank explícito (fonte já canônica, ex.: getTeamRank do jogador)
  // sempre vence; na ausência, resolve a partir de qualquer campo de
  // ranking que o objeto de origem já carregue.
  const resolvedRank = teamRank != null && Number(teamRank) > 0 ? Number(teamRank) : resolveEntryRank(profile);
  return {
    rank: resolvedRank,
    teamRank: resolvedRank,
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
  const rank = resolveEntryRank(athlete);
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
