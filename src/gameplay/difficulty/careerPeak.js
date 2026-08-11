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
// Calibrado por simulação: com multiplicadores de treino altos (Fácil), o
// ganho absoluto por temporada continua alto por mais tempo mesmo perto do
// teto, porque o multiplicador de dificuldade mantém o ritmo elevado durante
// a transição pelas faixas de diminishing returns. Um valor mais folgado
// ainda captura desaceleração real sem depender da dificuldade (o critério
// de auge é o mesmo para todos os modos — só o tempo para atingi-lo muda).
export const PEAK_MAX_SEASON_OVERALL_GAIN = 2.5;
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
 * Mesmos critérios de evaluateCareerPeak(), mas expondo os três eixos
 * individualmente — útil para diagnosticar qual eixo está represando o auge
 * numa dificuldade específica (ver relatório final da simulação de pacing).
 * @param {object} state
 * @param {number} state.overall - overall atual do jogador (média dos atributos).
 * @param {number} state.ceiling - teto de desenvolvimento médio do jogador (depende do potencial, não do jogo).
 * @param {number} state.overallGainLastSeason - ganho de overall na última temporada.
 * @param {number} state.rank - posição atual no ranking (1 = melhor).
 * @param {number} state.careerLevel - nível na escala de experiência de carreira (1-50).
 */
export function evaluateCareerPeakDetail({ overall, ceiling, overallGainLastSeason, rank, careerLevel }) {
  const technicalReady = Number(ceiling) > 0
    && (Number(overall) / Number(ceiling)) >= PEAK_TECHNICAL_CEILING_RATIO
    && Number(overallGainLastSeason) <= PEAK_MAX_SEASON_OVERALL_GAIN;
  const competitiveReady = Number(rank) > 0 && Number(rank) <= PEAK_RANK_THRESHOLD;
  const experienceReady = Number(careerLevel) >= PEAK_MIN_CAREER_LEVEL;
  return { technicalReady, competitiveReady, experienceReady, peak: Boolean(technicalReady && competitiveReady && experienceReady) };
}

/**
 * @returns {boolean} true se o jogador atingiu o auge de carreira nesse instante.
 * @see evaluateCareerPeakDetail
 */
export function evaluateCareerPeak(state) {
  return evaluateCareerPeakDetail(state).peak;
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

/**
 * Para cada um dos três eixos, retorna a primeira temporada em que ele
 * ficou satisfeito isoladamente (mesmo que os outros dois ainda não
 * estivessem). Diagnóstico de qual eixo está represando o auge.
 */
export function detectPeakGateSeasons(seasonSnapshots = []) {
  const gates = { technicalReady: null, competitiveReady: null, experienceReady: null };
  for (const snapshot of seasonSnapshots) {
    const detail = evaluateCareerPeakDetail({
      overall: snapshot.overall,
      ceiling: snapshot.ceiling,
      overallGainLastSeason: snapshot.overallGain,
      rank: snapshot.rank,
      careerLevel: snapshot.careerLevel,
    });
    for (const key of Object.keys(gates)) {
      if (gates[key] == null && detail[key]) gates[key] = snapshot.season;
    }
  }
  return gates;
}
