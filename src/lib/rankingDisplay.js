import { RANKING_WINDOW_DAYS, RANKING_BEST_N } from '../game-core/rankingWindow.js';

// Uma convenção de exibição, duas autoridades distintas: ranking individual
// vem do snapshot mundial; ranking de dupla vem de TeamRanking. O formatador
// nunca calcula posição — apenas traduz o estado canônico recebido.
const RANK_MILESTONES = [
  { rank: 1, label: '#1', key: 'world_no_1' },
  { rank: 10, label: 'Top 10', key: 'top_10' },
  { rank: 20, label: 'Top 20', key: 'top_20' },
  { rank: 50, label: 'Top 50', key: 'top_50' },
  { rank: 100, label: 'Top 100', key: 'top_100' },
  { rank: 250, label: 'Top 250', key: 'top_250' },
  { rank: 500, label: 'Top 500', key: 'top_500' },
  { rank: 750, label: 'Top 750', key: 'top_750' },
];

// Playthrough 5.23, Partes K/L/M — resolução da view de dois níveis
// (scope = período, type = entidade) a partir da URL, com mapeamento dos
// `tab=` legados. Puro e testável; a página só consome o resultado.
export function resolveRankingView(searchParams) {
  const get = (key) => (searchParams?.get ? searchParams.get(key) : null);
  const scopeParam = String(get('scope') || '').toLowerCase();
  const typeParam = String(get('type') || '').toLowerCase();
  const tab = String(get('tab') || '').toLowerCase();
  let scope = ['world', 'race'].includes(scopeParam) ? scopeParam : null;
  let type = ['individual', 'doubles'].includes(typeParam) ? typeParam : null;
  if ((!scope || !type) && tab) {
    if (['teams', 'duplas', 'pairs', 'doubles'].includes(tab)) { type = type || 'doubles'; scope = scope || 'world'; }
    else if (['race', 'season', 'temporada'].includes(tab)) { scope = scope || 'race'; type = type || 'individual'; }
    else if (['world', 'circuit', 'mundial', 'players', 'jogadores'].includes(tab)) { scope = scope || 'world'; type = type || 'individual'; }
  }
  return {
    scope: scope || 'world',
    type: type || 'individual',
    legacy: !scopeParam && !typeParam && Boolean(tab),
  };
}

// LOCAL-7D — pontos de uma linha da lista de Duplas, pelo PERÍODO da view.
// Antes a lista fazia `race_points ?? ranking_points` nas duas views: as
// linhas mundiais semeadas gravam `race_points: 0`, e `0 ?? x` é 0 — o
// Mundial exibia a Race zerada no lugar dos pontos mundiais (Coello/Tapia
// 5V·0D com "0 pontos"). Mundial = ranking_points; Race = race_points.
export function teamListPoints(row, { race = false } = {}) {
  return Math.max(0, Number(race ? row?.race_points : row?.ranking_points) || 0);
}

export function formatIndividualRankLabel(ranking) {
  if (!ranking || ranking.unranked || !(Number(ranking.rank) > 0)) return '#1000+';
  return `#${ranking.displayRank || ranking.rank}`;
}

export function formatTeamRankLabel(ranking) {
  if (!ranking || ranking.unranked || !(Number(ranking.rank) > 0)) return 'Sem ranking';
  return `#${ranking.displayRank || ranking.rank}`;
}

export function getNextRankingMilestone(rank) {
  const current = Number(rank) > 0 ? Number(rank) : 0;

  if (current <= 1) {
    return { label: '#1', absoluteRank: 1, positionsRemaining: 0, isLeader: true };
  }

  const next = [...RANK_MILESTONES]
    .sort((a, b) => b.rank - a.rank)
    .find((entry) => current >= entry.rank)
    || { rank: 1, label: '#1' };

  const positionsRemaining = Math.max(0, current - Number(next.rank));

  return {
    label: next.label,
    absoluteRank: Number(next.rank),
    positionsRemaining,
    isLeader: false,
  };
}

export function buildRankNeighborhood(rank, total = 1500) {
  const current = Number(rank) > 0 ? Number(rank) : 1;
  const safeTotal = Math.max(current, Number(total) || current);
  const start = Math.max(1, current - 4);
  const end = Math.min(safeTotal, current + 4);
  const items = [];

  for (let position = start; position <= end; position += 1) {
    const isPlayer = position === current;
    items.push({
      rank: position,
      label: isPlayer ? 'VOCÊ' : `#${position}`,
      isPlayer,
    });
  }

  return items;
}

// Playthrough 5.22-E, Parte H — corte de classificação para as Finals.
// Espelha `FINALS_TEAM_RANKING_LIMITS['Circuit Finals']` (WorldTourLifecycle),
// mantido aqui como número para a UI não importar o lifecycle inteiro. O
// teste test-ranking-race-distinct-v522e.mjs guarda a paridade com a
// autoridade.
//
// Playthrough 5.23, Partes H/I/T — a autoridade real das Circuit Finals é o
// TeamRanking MUNDIAL (WorldTourLifecycle.selectFinalsEntrants ordena
// `ranking_points` do TeamRanking), NÃO a Race. O corte é de DUPLAS: 8
// duplas / 16 jogadores. Por isso ele aparece em Mundial → Duplas; a Race
// Individual não pode sugerir "8 jogadores".
export const RACE_FINALS_CUTOFF = 8;
export const TEAM_FINALS_CUT = RACE_FINALS_CUTOFF;

// Contexto canônico do corte de Finals a partir da tabela MUNDIAL de duplas.
// `pointsToCut` só existe quando a dupla tem ranking e está fora do Top 8.
export function buildTeamFinalsCut({ rank, points, board = [] }) {
  const safeRank = Number(rank) > 0 ? Number(rank) : 0;
  const qualified = safeRank > 0 && safeRank <= TEAM_FINALS_CUT;
  const eighth = board.find((row) => Number(row?.ranking_display_position) === TEAM_FINALS_CUT)
    || board[TEAM_FINALS_CUT - 1]
    || null;
  const eighthPoints = eighth ? Math.max(0, Number(eighth.ranking_points) || 0) : null;
  const pointsToCut = (!qualified && safeRank > 0 && eighthPoints !== null)
    ? Math.max(0, eighthPoints - (Math.max(0, Number(points) || 0)))
    : null;
  return { cut: TEAM_FINALS_CUT, qualified, eighthPoints, pointsToCut, hasRank: safeRank > 0 };
}

// Ordem canônica das campanhas (melhor -> pior), alinhada a placementLabel
// (tournamentLifecycle.js). Usada só para escolher o "melhor resultado" da
// temporada entre resultados REAIS — nunca para inventar campanha.
const RACE_FINISH_ORDER = ['Campeão', 'Finalista', 'Semifinalista', 'Quartas de final', 'Participante'];

export function raceFinishScore(finish) {
  const index = RACE_FINISH_ORDER.indexOf(String(finish || ''));
  return index === -1 ? RACE_FINISH_ORDER.length : index;
}

export function bestRaceResult(results = []) {
  let best = null;
  for (const row of results || []) {
    if (!row) continue;
    if (!best || raceFinishScore(row.finish) < raceFinishScore(best.finish)
      || (raceFinishScore(row.finish) === raceFinishScore(best.finish) && Number(row.points || 0) > Number(best.points || 0))) {
      best = row;
    }
  }
  return best;
}

export function buildPlayerRankingContext({ rank, points, above, below, total = 1500 }) {
  const currentRank = Number(rank) > 0 ? Number(rank) : 0;
  const nextMilestone = currentRank > 0
    ? getNextRankingMilestone(currentRank)
    : { label: 'Top 750', absoluteRank: 750, positionsRemaining: 750, isLeader: false };
  const neighborhood = buildRankNeighborhood(currentRank || 1, total || 1500);

  return {
    rank: currentRank,
    points: Number(points) || 0,
    above: above || null,
    below: below || null,
    nextMilestone,
    neighborhood,
    total: Number(total) || 1500,
  };
}

// ── Fase 5.32-A — escada competitiva ("POSITION FIRST") ──────────────────
// Helpers PUROS de apresentação. Nenhum calcula pontos ou posição: recebem
// o que as autoridades já entregaram (snapshot mundial, TeamRanking,
// projeção da Race) e só decidem o que é exibível.

export const RANKING_WINDOW_WEEKS = Math.round(RANKING_WINDOW_DAYS / 7);

// Micro-explicação do período. O ano vem da data da carreira (nunca fixo).
export function describeRankingPeriod(scope, seasonYear) {
  if (scope === 'race') {
    const year = Number(seasonYear) > 0 ? Math.trunc(Number(seasonYear)) : null;
    return year
      ? `Race ${year}: pontos da temporada desde 1º de janeiro. Zera na virada do ano.`
      : 'Race: pontos da temporada atual. Zera na virada do ano.';
  }
  return `Mundial: os ${RANKING_BEST_N} melhores resultados das últimas ${RANKING_WINDOW_WEEKS} semanas.`;
}

// Posição exibível. Sem ranking real (flag da autoridade, posição 0 ou 0
// pontos) devolve null: a UI escreve "Ainda sem ranking" — nunca o fim da
// fila (#1001) nem "#1000+" como se fosse uma posição.
export function resolveStandingRank({ rank, unranked = false, points } = {}) {
  const value = Number(rank);
  if (unranked || !(value > 0)) return null;
  if (points !== undefined && points !== null && !(Number(points) > 0)) return null;
  return Math.trunc(value);
}

// Pontos que faltam para alcançar quem está logo acima (0 = empatado).
export function pointsGapToAbove(points, abovePoints) {
  if (abovePoints === null || abovePoints === undefined) return null;
  return Math.max(0, Math.round((Number(abovePoints) || 0) - (Number(points) || 0)));
}

// Vizinhos na escada: até `radius` acima e abaixo de `index`, na ordem que a
// autoridade já entregou.
export function sliceLadderNeighbors(items = [], index = -1, radius = 2) {
  if (!Array.isArray(items) || !(index >= 0) || index >= items.length) return [];
  const start = Math.max(0, index - radius);
  const end = Math.min(items.length, index + radius + 1);
  return items.slice(start, end).map((item, offset) => ({ item, index: start + offset, isSelf: start + offset === index }));
}

// Pódio só com pontos reais: se algum dos 3 primeiros tem 0 (Race recém-
// zerada, circuito vazio), não há pódio — "0 pts" no degrau não é pódio.
export function hasMeaningfulPodium(items = [], pointsOf = (row) => row?.points) {
  return Array.isArray(items) && items.length >= 3 && items.slice(0, 3).every((row) => Number(pointsOf(row)) > 0);
}

// Variação semanal de uma linha individual: só com a posição anterior que o
// circuito gravou (ranking_previous_position). Sem ela → null (não "estável").
export function ladderMovement(previousPosition, position) {
  const previous = Number(previousPosition);
  const current = Number(position);
  if (!(previous > 0) || !(current > 0)) return null;
  return previous - current;
}

// V/D/títulos de uma dupla, pela mesma autoridade de V/D: o ledger
// (LOCAL-7H: wins/losses/ledger_titles com stats_source 'ledger'). Linha sem
// ledger → null ("Histórico indisponível").
export function teamLedgerRecord(row) {
  if (!row || row.stats_source !== 'ledger') return null;
  return {
    wins: Math.max(0, Number(row.wins) || 0),
    losses: Math.max(0, Number(row.losses) || 0),
    titles: Math.max(0, Number(row.ledger_titles) || 0),
  };
}

export function normalizeSearchText(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Busca/filtros da lista. A posição de cada linha NÃO muda com o filtro (ela
// vem da autoridade, em `ladder_position`).
export function filterLadderRows(rows = [], { query = '', country = null, maxPosition = null, namesOf = (row) => [row?.name], countryOf = (row) => row?.country } = {}) {
  const q = normalizeSearchText(query);
  const wantedCountry = country ? normalizeSearchText(country) : null;
  return (rows || []).filter((row) => {
    if (q && !namesOf(row).some((name) => normalizeSearchText(name).includes(q))) return false;
    if (wantedCountry && normalizeSearchText(countryOf(row)) !== wantedCountry) return false;
    if (maxPosition && !(Number(row?.ladder_position) > 0 && Number(row.ladder_position) <= maxPosition)) return false;
    return true;
  });
}

// ── Fase 5.32-A.1 — contexto para subir (empates sem ambiguidade) ────────
// Lê a escada JÁ ordenada pela autoridade e devolve, para a linha `index`:
//   - target: a linha mais próxima ACIMA com MAIS pontos (para onde subir) e
//     quantos pontos faltam — nunca "faltam 0";
//   - tieAbove: a linha logo acima com os MESMOS pontos, e se ela divide a
//     posição (duplas: ranking de competição) ou não (individual: a
//     ordenação já desempatou). O critério do desempate não é afirmado;
//   - below: a linha logo abaixo e a vantagem sobre ela;
//   - isLeader: posição 1 sem ninguém com mais pontos.
// Fora da escada (index < 0) → null: sem vizinho real, nada é dito (antes a
// tela caía em "lidera o ranking" para uma dupla fora da lista carregada).
export function buildClimbContext(rows = [], index = -1, {
  pointsOf = (row) => row?.points,
  positionOf = (row) => row?.ladder_position,
  nameOf = (row) => row?.name,
} = {}) {
  if (!Array.isArray(rows) || !(index >= 0) || index >= rows.length) return null;
  const self = rows[index];
  const points = Math.max(0, Number(pointsOf(self)) || 0);
  const position = Number(positionOf(self)) || null;
  const view = (row) => ({ rank: Number(positionOf(row)) || null, name: nameOf(row), points: Math.max(0, Number(pointsOf(row)) || 0) });
  let target = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = view(rows[i]);
    if (candidate.points > points) { target = { ...candidate, gap: Math.round(candidate.points - points) }; break; }
  }
  const prev = index > 0 ? view(rows[index - 1]) : null;
  const tieAbove = prev && prev.points === points ? { ...prev, sharesPosition: prev.rank !== null && prev.rank === position } : null;
  const next = index < rows.length - 1 ? view(rows[index + 1]) : null;
  const below = next ? { ...next, gap: Math.max(0, Math.round(points - next.points)) } : null;
  return { position, points, target, tieAbove, below, isLeader: position === 1 && !target };
}
