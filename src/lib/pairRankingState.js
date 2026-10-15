// Playthrough 5.18-F, Parte B — UNRANKED vs LOWEST_RANKED.
//
// O problema que isto resolve: até aqui o jogo tinha UMA convenção de "sem
// ranking" (`teamRanking.js:rankForTeamKey`), derivada de
// `points <= 0 || matches_played <= 0`. Esse OU colapsa dois estados que são
// esportivamente diferentes:
//
//   UNRANKED  — a dupla nunca competiu e não tem posição de largada. Não tem
//               ranking porque não há nada para ordenar. É o estado de toda
//               dupla recém-formada pelo mercado.
//   RANKED    — a dupla tem posição no circuito. Se ela tem 0 pontos, isso é
//               um RESULTADO (o pior do circuito), não ausência de dados.
//
// A 5.18-E mediu a consequência: um atleta OVR 64 recém-pareado era
// classificado em #1001, a MESMA posição de quem tinha um histórico inteiro
// de derrotas. As duas leituras levam a decisões diferentes — "ainda não
// mediu" pede uma porta de entrada, "mediu e é ruim" não pede nada.
//
// FONTE DO ESTADO (documentada, sem mudança de schema). A 1ª versão desta
// autoridade derivava história de `matches_played` e `tournaments_played`.
// Estava errada por DOIS motivos, os dois medidos contra um mundo recém
// semeado:
//   - `tournaments_played` NÃO EXISTE na entidade TeamRanking. Os campos
//     reais são: ranking_points, race_points, matches_played, wins, losses,
//     titles, season_id, origin.
//   - as 500 linhas do seed nascem com `ranking_points > 0` e
//     `matches_played: 0`. Elas são a posição de largada do mundo — standing
//     legítimo, não ponto inventado. A regra antiga classificaria a dupla #1
//     do mundo (13000 pontos) como "sem ranking".
//
// A evidência de standing é, então, qualquer uma destas, nesta ordem:
//   1. resultados oficiais já atribuídos à dupla (fonte canônica);
//   2. `matches_played > 0` (só o settlement de um torneio real incrementa);
//   3. `origin` de seed — a linha faz parte do ranking inicial do mundo.
// `ranking_points` sozinho NUNCA decide: é exatamente a leitura que produzia
// o colapso entre "nunca competiu" e "competiu e é o pior".
export const RANKING_STATES = Object.freeze({
  UNRANKED: 'UNRANKED',
  RANKED: 'RANKED',
});

/** Linhas plantadas pela fundação do mundo têm standing por construção. */
export function isSeededTeamRow(teamRow) {
  const origin = String(teamRow?.origin || '');
  return origin.startsWith('seed');
}

/**
 * @param {object|null} teamRow  linha de TeamRanking da dupla (pode ser null).
 * @param {Array} rankingResults resultados oficiais já atribuídos à dupla.
 * @returns {'UNRANKED'|'RANKED'}
 */
export function classifyPairRankingState(teamRow, rankingResults = []) {
  if (Array.isArray(rankingResults) && rankingResults.length > 0) return RANKING_STATES.RANKED;
  if (!teamRow) return RANKING_STATES.UNRANKED;
  if (Math.max(0, Number(teamRow.matches_played) || 0) > 0) return RANKING_STATES.RANKED;
  if (isSeededTeamRow(teamRow)) return RANKING_STATES.RANKED;
  return RANKING_STATES.UNRANKED;
}

export function isUnrankedPair(teamRow, rankingResults = []) {
  return classifyPairRankingState(teamRow, rankingResults) === RANKING_STATES.UNRANKED;
}

/**
 * LOWEST_RANKED é o complemento útil de UNRANKED: a dupla TEM standing e
 * mesmo assim não tem pontos. Só faz sentido perguntar isso de quem já está
 * no circuito — por isso a checagem de estado vem antes.
 */
export function isLowestRankedPair(teamRow, rankingResults = []) {
  if (classifyPairRankingState(teamRow, rankingResults) !== RANKING_STATES.RANKED) return false;
  return Math.max(0, Number(teamRow?.ranking_points) || 0) <= 0;
}
