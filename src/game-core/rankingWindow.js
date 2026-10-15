// Fase 4 — ranking rolling de 52 semanas. Substitui o acumulador vitalício
// (Fase 3 e anteriores: pontos nunca expiravam, quem subia nunca descia) por
// uma janela móvel, como o circuito real: um resultado entra quando
// acontece e sai exatamente 52 semanas (364 dias) depois, e só os 22
// melhores resultados da janela contam — o 23º em diante não soma, o que
// premia qualidade sobre volume e evita que a IA farme torneios de tier
// baixo pra inflar pontos.
//
// Módulo central pra não duplicar a regra entre os três pontos de escrita:
// WorldTourLifecycle.js (torneios de IA/bots resolvidos, feedback imediato,
// só nos atletas tocados), circuitLifecycle.js (recálculo semanal da
// população INTEIRA — o único lugar que também PODA resultados expirados,
// porque é o único que já lê todo mundo de qualquer forma) e
// tournamentLifecycle.js (o torneio do próprio jogador). "Não toca na Race"
// (achado 4A.3): nenhuma função aqui lê ou escreve race_points — quem
// chama decide isso à parte, exatamente como antes desta fase.
import { careerDaysBetween } from './livingCircuitRules.js';

export const RANKING_WINDOW_DAYS = 364; // 52 semanas
export const RANKING_BEST_N = 22;

// Fase 4.0 (achado #18) já tinha movido `ranking_history` do documento
// quente (AthleteProfile, clonado a cada escrita) para coleção própria
// pelo mesmo motivo de volume. Resultados datados são o mesmo caso, numa
// escala maior: até ~30 eventos/ano por atleta × ~1050 atletas nunca pode
// entrar em AthleteProfile/PlayerProfile — sempre nesta coleção à parte.
export const RANKING_RESULT_ENTITY = 'AthleteRankingResult';
export const RANKING_RESULT_POPULATION_CAP = 60000;

function resultPoints(row) {
  return Number(row?.points) || 0;
}

// Um resultado expira 364 dias depois da PRÓPRIA data (não da data do
// recálculo) — careerDaysBetween(a, b) = b - a em dias, e é sempre positivo
// aqui porque um resultado nunca é datado no futuro.
export function isResultExpired(row, currentDate) {
  return careerDaysBetween(row?.date, currentDate) > RANKING_WINDOW_DAYS;
}

// Decisão de migração (Fase 4, item 3, aprovada pelo usuário): uma carreira
// salva antes desta fase não tem nenhum resultado datado — só o total
// vitalício acumulado em world_ranking_points/rank_points. Começar do zero
// seria um reset de ranking visível (rejeitado); derivar retroativamente é
// impossível (não existe registro de QUANDO cada ponto foi ganho). A âncora
// sintética resolve as duas: uma única linha, datada no momento em que a
// carreira é tocada pela primeira vez após a migração, valendo o total
// atual inteiro.
//
// Ela ocupa 1 dos 22 slots como qualquer resultado real — se o atleta
// pontuar bem no primeiro ano e acumular 22 resultados melhores que ela, a
// âncora é descartada da soma ANTES de completar as 52 semanas. Isso é
// intencional, não acidente: um atleta ativo converge para o comportamento
// real mais rápido que um inativo, que só converge quando a âncora expira
// (no máximo 52 semanas). Ninguém perde posição no dia da migração (a
// âncora vale o total cheio) e não existe nenhum código de transição além
// desta função.
export function buildLegacySeedRow(athleteId, currentPoints, migrationDate) {
  return {
    id: `${athleteId}:legacy-seed`,
    athlete_id: athleteId,
    tournament_id: null,
    tournament_name: 'Ranking anterior à Fase 4 (pré-migração)',
    tier: null,
    date: migrationDate,
    points: Math.max(0, Number(currentPoints) || 0),
    // Fase 4, item 3.2: distinguível pra sempre, não só por este enum — uma
    // tela futura que listar "resultados de torneio" de um atleta não pode
    // ter que conhecer o valor exato de `finish` pra saber que isto não foi
    // um torneio. `tournament_id: null` já é forte indício (nenhum
    // resultado real tem torneio nulo), mas a flag abaixo é explícita e é
    // o contrato que qualquer consumidor futuro deve checar primeiro.
    finish: 'legacy_seed',
    is_legacy_seed: true,
  };
}

export function needsLegacySeed(existingRows, currentLifetimePoints) {
  return (!existingRows || existingRows.length === 0) && Math.max(0, Number(currentLifetimePoints) || 0) > 0;
}

// Soma os N melhores resultados não expirados da janela — o núcleo do
// mecanismo inteiro. `existingRows` (já persistidos) e `extraRows`
// (resultados desta própria chamada, ainda não gravados) são combinados
// antes do corte, pra que um torneio que acabou de terminar já entre na
// conta na mesma chamada que o gerou — feedback imediato, mesmo padrão de
// antes desta fase.
// Playthrough 5.26-C — o PENHASCO da âncora. A âncora (`legacy_seed`) também
// é usada para os pontos INICIAIS do mundo numa carreira nova: um registro
// por atleta valendo o total inteiro, datado na primeira semana de circuito.
// Como todas têm a MESMA data, todas saíam da janela no mesmo dia (início de
// 2027): medido na 5.26-B, 884 âncoras expirando juntas, −64% dos pontos do
// mundo e o jogador subindo ~300 posições sem resultado novo. A âncora
// representa resultados espalhados pelas 52 semanas anteriores, cujas datas
// reais não existem; o equivalente fiel é ela perder valor de forma linear
// ao longo da própria janela (100% ao ser criada → 0% aos 364 dias), em vez
// de valer 100% até o último dia. Resultados reais, best-22, a janela de 364
// dias e a Race (que este módulo não toca) não mudam.
export function effectiveResultPoints(row, currentDate) {
  const points = resultPoints(row);
  if (!row?.is_legacy_seed && row?.finish !== 'legacy_seed') return points;
  const age = Math.max(0, careerDaysBetween(row?.date, currentDate) || 0);
  const remaining = Math.max(0, Math.min(1, (RANKING_WINDOW_DAYS - age) / RANKING_WINDOW_DAYS));
  return Math.round(points * remaining);
}

export function computeRollingPoints(existingRows, extraRows, currentDate) {
  const all = [...(existingRows || []), ...(extraRows || [])];
  const unexpired = all.filter((row) => !isResultExpired(row, currentDate));
  const scored = unexpired.map((row) => effectiveResultPoints(row, currentDate));
  const best = scored.sort((a, b) => b - a).slice(0, RANKING_BEST_N);
  return best.reduce((sum, value) => sum + value, 0);
}

export function groupResultsByAthlete(rows) {
  const byAthlete = new Map();
  for (const row of rows || []) {
    if (!row?.athlete_id) continue;
    if (!byAthlete.has(row.athlete_id)) byAthlete.set(row.athlete_id, []);
    byAthlete.get(row.athlete_id).push(row);
  }
  return byAthlete;
}
