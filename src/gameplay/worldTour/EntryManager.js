import { getTournamentTierConfig } from '@/lib/circuitCatalog.js';

// Fase 5.1, item 1 (agenda de tier) — achado #32 mediu que ampliar o
// calendário de Bronze/Silver não reduz a fração de duplas nunca
// escaladas (~67% travado em 3 escalas): a mesma fatia de maior
// overall_rating reenche toda vaga nova. Causa raiz aqui, não lá — Bronze
// e Silver (`minRanking:0`) nunca tiveram TETO, só piso. Só se aplica a
// quem JÁ tem ranking (rank>0) — um par recém-formado sem ranking ainda
// nunca é excluído por este teto, só por já ter subido o bastante.
//
// Fase 5.2, item 1.1 — na Fase 5.1 este teto reusava
// `TOURNAMENT_TIER_CONFIG.Gold.minRanking` (800), pensado como "não
// inventar um número novo". Efeito colateral não medido então: com 1000
// atletas, ~800 ficam ELEGÍVEIS pro Gold (rank≤800) — ou seja, quase toda
// a população perdia acesso a Bronze/Silver de uma vez, sobrando só ~200
// pra ~640 vagas (daí a razão de regime cair a 0,75×, abaixo da
// capacidade). Piso do Gold e teto do Bronze são conceitos DIFERENTES no
// circuito real (um top 300 disputa entrada sem problema; só o top 50
// não compensa a viagem) — coincidiam por config, não por desenho.
//
// Fase 5.4/5.5 — FIXADO EM 150, confirmado com o mundo corrigido. A
// dominância real de Bronze/Silver por título em regime é **6,2%** a
// teto=150 e **13,8%** a teto=100 (a Fase 5.5 fechou a brecha em que a
// elegibilidade da dupla era decidida pelo rank de um atleta só; a curva
// da Fase 5.4 que favorecia 100 media o mundo com a brecha). Teto 100
// solta ~8 duplas reais de rank 100-150 (fortes) na base — 150 é
// claramente melhor.
//
// **Não existe alvo zero para esse número, e nunca deveria ter existido.**
// A dominância residual (6,2% na Fase 5.5, ~8,8% em regime com a escada
// do Candidato B da Fase 5.6) NÃO é erro a perseguir: o elenco de 100
// reais entrou pelo ranking FIP de ago/2026, mas dentro do mundo
// simulado tem ranking próprio, e ~3-5 duplas caem pra faixa 151-450.
// Uma dupla real que caiu no ranking disputando a base é o circuito
// FUNCIONANDO — o teto de 150 diz que ela pode, e ela pode. O objetivo
// do teto sempre foi barrar a ELITE real da base (Galán/Tapia/Coello
// nunca aparecem lá), não zerar a presença real.
// Ver reports/real-athletes-audit/FASE-5.5-RELATORIO.md §1/§2 e
// FASE-5.6-RELATORIO.md §2.
export const OPEN_TIER_CEILING = 150;

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
  // Fase 5.1, item 1 — teto dos tiers de acesso livre (Bronze/Silver,
  // `directLimit===0`): antes, `directLimit===0` sozinho já bastava pra
  // aprovar QUALQUER rank, inclusive #1 — não havia teto, só piso. Uma
  // dupla no top `OPEN_TIER_CEILING` (150) não entra mais aqui; ela tem
  // lugar melhor pra estar (o corte mais baixo do topo é o Elite, 140 —
  // Fase 5.6). Só exclui quem JÁ tem ranking bom o bastante — nunca um
  // par recém-formado sem ranking, que continua caindo no
  // `directLimit===0` logo abaixo.
  //
  // Fase 5.3, item 1 — `overqualified` marca ESTE motivo de inelegibilidade
  // especificamente (barrado por já estar acima, não por estar abaixo do
  // corte). O preenchimento de reserva (`WorldTourLifecycle.js`) usa a
  // flag pra garantir que uma dupla barrada pelo teto NUNCA volte pela
  // porta dos fundos — antes, quando o pool elegível secava, o
  // preenchimento recorria a `pairScore` e reconvidava exatamente a elite
  // que o teto tinha acabado de excluir (achado da Fase 5.2, 176 eventos
  // em teto=800). `eligible` já era `false` aqui; a flag só torna o
  // motivo legível pra quem precisa distinguir "acima" de "abaixo".
  if (directLimit === 0 && hasRanking && rank <= OPEN_TIER_CEILING) {
    return result(ENTRY_PATHS.INELIGIBLE, false, `Ranking já classifica para tiers acima (Top ${OPEN_TIER_CEILING}) — não disputa mais a base.`, { overqualified: true });
  }
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

function result(path, eligible, reason, extra) { return { path, eligible, reason, ...extra }; }
