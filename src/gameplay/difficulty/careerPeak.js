// Detector de "auge" (peak) de carreira: critério composto e reproduzível,
// usado pelo simulador de pacing (scripts/test-career-difficulty-pace.mjs) e
// disponível para uso futuro no jogo real. Não depende de nenhum outro
// módulo — apenas de números já calculáveis a partir do estado do jogador.
//
// Auge não é apenas idade nem apenas ser #1 do mundo. Combinamos três eixos:
//  - técnico: o overall está perto do próprio teto (potencial) do jogador, e
//    a evolução anual já está desacelerando (diminishing returns natural);
//  - competitivo: capacidade real de disputar títulos (Top 20, não
//    necessariamente #1 — um jogador pode estar no auge sendo #5, #10 ou #15);
//  - experiência: maturidade de carreira acumulada suficiente para o auge
//    fazer sentido narrativamente (evita marcar "auge" em um iniciante que
//    por sorte estatística já está perto do teto técnico cedo demais).

// Overall/ceiling ratio a partir do qual o jogador é considerado tecnicamente
// maduro (perto do próprio potencial, não de um teto absoluto do jogo).
export const PEAK_TECHNICAL_CEILING_RATIO = 0.90;
// Ganho médio de overall na última temporada abaixo do qual consideramos que
// a evolução já desacelerou (diminishing returns natural da curva de treino).
export const PEAK_MAX_SEASON_OVERALL_GAIN = 1.2;
// Posição de ranking (Top N) a partir da qual o jogador tem capacidade real
// de disputar títulos relevantes. Calibrado por simulação: Top 20 se provou
// tão exigente quanto o próprio Top 10 (decaimento de pontos por temporada +
// necessidade de volume alto de partidas), o que tornava o auge dependente
// quase só do ranking, não da evolução técnica. Top 50 continua sendo uma
// posição de elite num circuito de 1000 atletas simulados, mas é atingível
// por builds com volume de competição moderado, não só pelos mais agressivos.
export const PEAK_RANK_THRESHOLD = 50;
// Nível mínimo na escala de experiência de carreira (1-50) para considerar
// que já existe maturidade de carreira suficiente.
export const PEAK_MIN_CAREER_LEVEL = 12;

/**
 * @param {object} state
 * @param {number} state.overall - overall atual do jogador (média dos atributos).
 * @param {number} state.ceiling - teto de desenvolvimento médio do jogador (depende do potencial, não do jogo).
 * @param {number} state.overallGainLastSeason - ganho de overall na última temporada.
 * @param {number} state.rank - posição atual no ranking (1 = melhor).
 * @param {number} state.careerLevel - nível na escala de experiência de carreira (1-50).
 * @returns {boolean} true se o jogador atingiu o auge de carreira nesse instante.
 */
export function evaluateCareerPeak({ overall, ceiling, overallGainLastSeason, rank, careerLevel }) {
  const technicalReady = Number(ceiling) > 0
    && (Number(overall) / Number(ceiling)) >= PEAK_TECHNICAL_CEILING_RATIO
    && Number(overallGainLastSeason) <= PEAK_MAX_SEASON_OVERALL_GAIN;
  const competitiveReady = Number(rank) > 0 && Number(rank) <= PEAK_RANK_THRESHOLD;
  const experienceReady = Number(careerLevel) >= PEAK_MIN_CAREER_LEVEL;
  return Boolean(technicalReady && competitiveReady && experienceReady);
}

/**
 * Varre uma sequência de snapshots por temporada (na ordem em que ocorreram)
 * e retorna o número da primeira temporada em que o auge foi atingido, ou
 * null se nunca foi atingido na janela simulada.
 * Cada snapshot deve conter: season, overall, ceiling, overallGain, rank, careerLevel.
 */
export function detectPeakSeason(seasonSnapshots = []) {
  for (const snapshot of seasonSnapshots) {
    const reached = evaluateCareerPeak({
      overall: snapshot.overall,
      ceiling: snapshot.ceiling,
      overallGainLastSeason: snapshot.overallGain,
      rank: snapshot.rank,
      careerLevel: snapshot.careerLevel,
    });
    if (reached) return snapshot.season;
  }
  return null;
}
