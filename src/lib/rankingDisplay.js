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
