// AUTORIDADE ÚNICA dos pontos de uma dupla a partir dos rolling points
// individuais dos seus dois membros.
//
// Vive em módulo próprio, sem NENHUMA dependência, porque os writers que
// precisam dela estão nos dois lados de um ciclo de import existente
// (`teamRanking.js` já importa `rankingPopulation.js`, e a semeadura em
// `rankingPopulation.js` também precisa da fórmula). `teamRanking.js`
// reexporta esta função, então todo consumidor pode continuar importando de
// lá sem saber deste arquivo.
//
// ---------------------------------------------------------------------
// Playthrough 5.22-E, Partes M/N/O/P/Q/R — REGRA ATUAL: SOMA.
//
//   TeamRankingPoints = CircuitPoints(Player A) + CircuitPoints(Player B)
//
// Exemplo: zezao = 39, Tomás = 0  ->  dupla = 39.
//          zezao = 39, Tomás = 80 ->  dupla = 119.
//
// FÓRMULA ANTERIOR (Playthrough 5.11, Parte S — SUPERADA): média geométrica,
// `Math.round(Math.sqrt(a * b))`. Ela foi escolhida na 5.11 para punir
// assimetria extrema (Top1 + 1 ponto não entrava no Top10). A decisão de
// produto da 5.22-E substitui essa regra: a dupla herda imediatamente o
// valor competitivo atual dos seus membros — uma parceria recém-formada NÃO
// começa em zero quando um dos atletas já pontuou no circuito.
//
// Consequências diretas da nova regra (todas intencionais):
//   * dupla equilibrada dobra de valor (sqrt(a*a)=a vira a+a=2a) — o valor
//     passa a ser a soma dos dois, não a média;
//   * membro forte carrega a dupla (Top1 + 1 ponto = 24901, não ~158);
//   * membro com 0 pontos não zera a dupla (0 + x = x);
//   * 0 + 0 = 0 continua sendo a convenção de "sem ranking" que
//     rankForTeamKey aplica (Parte Y) — nunca NaN, nunca negativo.
//
// PARTE T — esta função agrega APENAS os pontos individuais já existentes.
// Não altera premiação, Circuit, Race nem rewards: os pontos individuais
// continuam exatamente como estavam.
//
// PARTE R — a dupla deriva dos pontos ATUAIS dos membros, não de um snapshot
// na formação: se os individuais mudam, o próximo recálculo reflete a soma
// nova.
export function computeCanonicalTeamRankingPoints(pointsA, pointsB) {
  const a = Number(pointsA);
  const b = Number(pointsB);
  const safeA = Number.isFinite(a) && a > 0 ? a : 0;
  const safeB = Number.isFinite(b) && b > 0 ? b : 0;
  return Math.round(safeA + safeB);
}

// Playthrough 5.12 (continuação), Parte E — resolução de MEMBRO de uma
// dupla, para a reprojeção periódica do circuito.
//
// Uma dupla de IA é AthleteProfile + AthleteProfile; a dupla do JOGADOR é
// PlayerProfile + AthleteProfile. A reprojeção resolvia os dois membros
// apenas no índice de atletas, então o membro-jogador nunca resolvia e a
// linha inteira era pulada: a dupla do jogador ficava com os pontos de
// quando foi escrita até o torneio seguinte (medido: guardado 0 enquanto o
// canônico já era 6000).
//
// Este resolvedor centraliza a regra para que nenhum writer precise
// espalhar `if (id === profile.id)`. Devolve `null` quando o membro não é
// resolvível — e `null` significa "não reprojete esta linha", nunca zero.
export function resolveTeamRankingMemberPoints(memberId, { athletesById, playerId, playerPoints } = {}) {
  if (!memberId) return null;
  const athlete = athletesById?.get?.(memberId);
  if (athlete) {
    const value = Number(athlete.world_ranking_points ?? athlete.ranking_points);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  if (playerId && memberId === playerId) {
    const value = Number(playerPoints);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  return null;
}
