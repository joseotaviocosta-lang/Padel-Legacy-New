import { localGame } from '@/api/localGameClient.js';
import { chooseTournament } from './TournamentSelectionAI.js';
import { resolveEntryRank, OPEN_TIER_CEILING, PRIORITY_WINDOW_N, evaluateTournamentEntry } from './EntryManager.js';
import { fnv1aHash } from '@/lib/hashUtils.js';
import { WORLD_RANKING_TARGET } from '@/lib/rankingPopulation.js';
import { getTournamentTierConfig, getRoundOutcomeTable, getTierRankingFit } from '@/lib/circuitCatalog.js';
import {
  RANKING_RESULT_ENTITY, RANKING_RESULT_POPULATION_CAP,
  buildLegacySeedRow, needsLegacySeed, computeRollingPoints, groupResultsByAthlete,
} from '@/game-core/rankingWindow.js';
import { buildCanonicalTournamentBracket, buildSeededDrawSlots, deriveTournamentFactsFromFullBracket, finalizeTournamentFromBracket } from './tournamentSettlement.js';
import { getCanonicalRoundDates } from '@/lib/tournamentSchedule.js';
import { verifySaveFoundation, ensureWorldSeed2025 } from '@/lib/saveFoundation.js';
import { getTeamRankings } from '@/lib/teamRanking.js';
import { getBalance527 } from '@/lib/balance527.js';

const entities = /** @type {any} */ (localGame.entities);
// Fase 2E.3: o limite era 1000 sobre uma população que agora É 1000 —
// margem zero, e generateProspects (achado 2D.2, agora 5-6/mês) passa a
// truncar já no primeiro mês em que a população cruzar 1000+1.
const ATHLETE_POPULATION_CAP = WORLD_RANKING_TARGET + 100;

// Finals não são mais um degrau da escada semanal. São convites fechados por
// mérito da DUPLA: Circuit Finals chama as 8 melhores, Legacy Finals chama
// as 16 melhores. Este limite também espelha `minRanking` de cada config e
// é aplicado sobre TeamRanking, a fonte canônica de ranking de dupla.
export const FINALS_TEAM_RANKING_LIMITS = Object.freeze({
  'Circuit Finals': 8,
  'Legacy Finals': 16,
});

export function isFinalsTournament(tournament) {
  return Boolean(FINALS_TEAM_RANKING_LIMITS[tournament?.tier]);
}

function pairTeamKey(pair) {
  return (pair?.athletes || []).map((athlete) => athlete?.id).filter(Boolean).sort().join('_');
}

export function selectFinalsEntrants(tournament, availablePairs = [], teamRankings = []) {
  const limit = FINALS_TEAM_RANKING_LIMITS[tournament?.tier];
  if (!limit) return null;
  const pairByTeamKey = new Map((availablePairs || []).map((pair) => [pairTeamKey(pair), pair]));
  const seen = new Set();
  const rows = [...(teamRankings || [])]
    .filter((row) => row?.team_key && Number(row.ranking_points) > 0)
    .sort((a, b) => (Number(b.ranking_points) || 0) - (Number(a.ranking_points) || 0));
  const entrants = [];
  for (const row of rows) {
    const pair = pairByTeamKey.get(row.team_key);
    if (!pair || seen.has(pair.id)) continue;
    seen.add(pair.id);
    entrants.push(pair);
    if (entrants.length === limit) break;
  }
  return entrants;
}

async function applyFinalsEntryAuthority(tournaments, availablePairs, assignments) {
  const finals = (tournaments || []).filter(isFinalsTournament);
  if (!finals.length) return assignments;
  const rankings = await getTeamRankings(600);
  for (const tournament of finals) {
    const entrants = selectFinalsEntrants(tournament, availablePairs, rankings);
    if (entrants) assignments.set(tournament.id, entrants);
  }
  return assignments;
}


function hash(value = '') {
  return Math.abs(fnv1aHash(String(value)));
}

function athleteScore(athlete, tournament) {
  const rating = Number(athlete.overall_rating || athlete.overall || 50);
  const form = Number(athlete.form || athlete.current_form || 50);
  const energy = Number(athlete.energy || 80);
  return rating * 1.8 + form * 0.25 + energy * 0.12 + (hash(`${athlete.id}:${tournament.id}`) % 2400) / 100;
}

// Correção Fase 1A: "rank de entrada" de uma DUPLA (não existe um
// TeamRanking dedicado para pares do World Tour em segundo plano) — média
// do rank individual de cada atleta, mesmo adaptador canônico
// (resolveEntryRank) usado pelo restante do pipeline de elegibilidade.
function pairEntryRank(pair) {
  const ranks = pair.athletes.map((athlete) => resolveEntryRank(athlete)).filter((value) => value > 0);
  if (!ranks.length) return 0;
  return Math.round(ranks.reduce((sum, value) => sum + value, 0) / ranks.length);
}

function pairScore(pair, tournament) {
  const base = pair.athletes.reduce((sum, athlete) => sum + athleteScore(athlete, tournament), 0) / pair.athletes.length;
  return base + Number(pair.chemistry || 50) * 0.08 + (hash(`${pair.id}:${tournament.id}:pair`) % 900) / 100;
}

// Playthrough 5.27 — AUTORIDADE DE ADMISSÃO (mesma para IA e jogador).
// `blendedCutScore` original = pairScore · (0.35 + 0.65·tierFit/100), que
// ordenava por FORÇA: nos tiers abertos (Bronze/Silver) o topo elegível
// (OVR 58–76) enchia a chave contra um iniciante de OVR 12. Para os tiers
// abertos a ordem é invertida (FRACO-PRIMEIRO, ainda ponderada por tierFit):
// a base é a porta de entrada e deve bater com quem começa. Tiers com corte
// mantêm a autoridade original. Exportada para o teste medir a mesma fonte.
export function fieldAdmissionScore(pair, tournament) {
  const fit = getTierRankingFit(tournament.tier, pairEntryRank(pair));
  const blended = pairScore(pair, tournament) * (0.35 + 0.65 * fit / 100);
  const openTier = (getTournamentTierConfig(tournament?.tier).minRanking || 0) === 0;
  return openTier ? -blended : blended;
}

// Playthrough 5.1, Parte I/W — extraída do laço de resgate (abaixo) pra
// ser testável isoladamente (test-tier-rescue-quality.mjs). Prioridade:
// 1) duplas ADEQUADAS ao tier (getTierRankingFit alto — a MESMA curva que
// chooseTournament usa, nunca uma segunda fórmula divergente de
// "adequação"); 2) duplas PRÓXIMAS (fit médio); 3) resgate excepcional
// (fit baixo/piso), só quando não sobra ninguém mais adequado — nunca
// "qualquer dupla livre" ordenada só por talento bruto (pairScore era a
// única ordenação antes desta fase, cega ao nível do tier).
// Playthrough 5.18-G, Partes B/C — gancho de diagnóstico do sorteio.
//
// Só para teste/dev. Nada é persistido e o schema do save não muda: em
// produção `drawAdmissionObserver` é null e o bloco de captura em
// `ensureWorldTourDraws` nem roda. Existe porque a autoridade de admissão é
// interna e a 5.18-F provou que reconstruí-la de fora produz 62% de deriva —
// o registro precisa nascer no instante da decisão, não depois dela.
let drawAdmissionObserver = null;
export function setDrawAdmissionObserver(fn) {
  drawAdmissionObserver = typeof fn === 'function' ? fn : null;
}

export function rankCandidatesByTierFit(idleCandidates, tournament) {
  return [...idleCandidates].sort((a, b) => (
    getTierRankingFit(tournament.tier, pairEntryRank(b)) - getTierRankingFit(tournament.tier, pairEntryRank(a))
  ) || (pairScore(b, tournament) - pairScore(a, tournament)));
}

// Fase 5.1, item 1 (agenda de tier) — achado #32 mediu que aumentar a
// capacidade de Bronze/Silver não move a fração de duplas nunca escaladas
// (~67% travado em 3 escalas): a mesma fatia de maior overall_rating
// reenche toda vaga nova, porque a chave era truncada só por `pairScore`
// (dominado por overall_rating — decide QUEM VENCE, papel que continua
// intacto abaixo, em `ordered`). Esta função decide só QUEM ENTRA na
// chave quando há mais candidatos que vagas (`entrants.length>drawSize`)
// — antes desta fase, era a MESMA operação (um único sort+slice por
// pairScore fazia as duas coisas). Agora: maioria das vagas por
// prioridade de RANKING (like o circuito real aloca entry list — não
// nunca vencido por talento bruto sem ranking pra provar), fração
// reservada (achado #30, opção "a" já proposta) pra quem tem MENOS
// torneios jogados na temporada até aqui — o piso que impede exclusão
// permanente mesmo de quem nunca sobe no ranking bruto. `RESERVED_SHARE`
// é ponto de partida, a ajustar pela medição, não um número final.
//
// Fase 6.5, item 2 — renomeada de `applyOpenTierEntryPriority` /
// `OPEN_TIER_RESERVED_SHARE`: a Fase 4.3 (achado #29) diagnosticou o
// corte por capacidade sem fila em Bronze/Silver (92 decisões de jogar,
// 0 pontos); a Fase 5.1 corrigiu SÓ ali (`minRanking===0` no ponto de
// chamada, abaixo) porque em 2026 eram os únicos tiers que um atleta de
// rank baixo podia escolher. Reincidência confirmada na Fase 6.4: o
// MESMO `entrants.sort(pairScore).slice(0, drawSize)`, intocado, segue
// sendo a via de corte pra Gold/Platinum/Masters/Elite/Crown — Gold
// cortava 79% de quem escolhia (razão de regime 4,69×), sem fila, sem
// exceção. A correção nunca foi específica de "acesso livre" — é
// genérica pra qualquer tier oversubscrito; só o nome e o gate no
// ponto de chamada eram. Generalizada aqui; medida por tier na
// Fase 6.5.
const ENTRY_RESERVED_SHARE = 0.25;
// Fase 7.1, item 1 — segunda porta de entrada (qualifying), a peça que
// faltava depois da Fase 7 identificar o mecanismo (rank ruim → menos
// vagas pela prioridade por rank → menos pontos, que só vêm de jogar →
// rank relativo pior, porque o resto do mundo continua jogando → menos
// vagas ainda — nenhuma peça nova de código, só as três já existentes
// compondo). Metade da fatia reservada (`QUALIFYING_SHARE` de
// `ENTRY_RESERVED_SHARE`, ~12,5% do draw) deixa de ser concedida direto
// e vira um mini-bracket de eliminação simples, decidido por
// `pairScore` — a MESMA função que já decide a chave principal — entre
// um pool maior (`QUALIFYING_POOL_MULTIPLIER`×) formado pelos PIORES
// ranks entre quem não ganhou vaga aberta nem reservada direta. Usa
// rank (não "menos torneios jogados") de propósito: é a variável que a
// Fase 7 mediu como o discriminador de 98,8% de acurácia entre o
// núcleo ocioso e quem joga, e cai em tempo real (posição relativa,
// nunca "vitalícia") — uma primeira versão usava o critério de
// menos-torneios-jogados já existente pra montar o pool e NÃO
// funcionou (`pairTournamentsPlayedSoFar` é contagem vitalícia; uma
// dupla presa que teve uma temporada 1 boa não tem "poucos jogos" nesse
// contador, mesmo travada há 2 temporadas — ver comentário mais abaixo,
// em `applyEntryPriority`). Dá uma chance RECORRENTE (toda semana
// elegível) contra um pool restrito às piores colocações, não contra o
// campo inteiro — ainda exige vencer algo (não é uma passagem livre),
// mas não é a mesma disputa por rank que a dupla já está perdendo.
const QUALIFYING_SHARE = 0.5;
const QUALIFYING_POOL_MULTIPLIER = 4;
function pairTournamentsPlayedSoFar(pair) {
  const values = pair.athletes.map((athlete) => Number(athlete.tournaments_played) || 0);
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}
// Eliminação simples entre `candidates` (já ordenados por prioridade de
// entrada no pool, não por skill — o emparceiramento é sequencial,
// como um chaveamento cabeça-a-cabeça comum) até sobrar `winnersNeeded`.
// Cada confronto usa o MESMO `skill` (pairScore) já calculado — sem
// lógica de partida nova. Pool ímpar numa rodada: quem sobra avança
// direto (bye), like qualquer chave real com número não-potência-de-2.
function resolveQualifyingBracket(candidates, winnersNeeded) {
  let pool = candidates;
  if (pool.length <= winnersNeeded) return pool;
  while (pool.length > winnersNeeded) {
    const nextRound = [];
    for (let i = 0; i < pool.length; i += 2) {
      if (i + 1 >= pool.length) { nextRound.push(pool[i]); continue; }
      nextRound.push(pool[i].skill >= pool[i + 1].skill ? pool[i] : pool[i + 1]);
    }
    pool = nextRound;
  }
  return pool.slice(0, winnersNeeded);
}
function applyEntryPriority(entrants, tournament, drawSize, commitWindow = false) {
  // Fase 7.3/7.4 — `commitWindow` default false porque esta função
  // também é chamada de forma ESPECULATIVA (loop de fallback de tier,
  // mais abaixo, avaliando "quem sobreviveria" pra decidir remanejamento
  // — não é a rodada final). Só o chamador do resultado JÁ COMMITADO
  // (loop principal, onde `ordered` vira pontuação/notícia de verdade)
  // passa `true`; senão uma dupla podia "ganhar" uma janela numa
  // simulação hipotética que nem é o torneio onde ela acaba jogando.
  // Quem ainda tem `priorityWindowRemaining > 0` entra garantido, fora
  // de toda disputa abaixo (lido sempre, mesmo em chamada especulativa —
  // só a CONCESSÃO de janela nova, mais abaixo, é que exige
  // `commitWindow`); o resto do mecanismo roda normalmente sobre o
  // espaço que sobra (`effectiveDrawSize`).
  const windowed = entrants.filter((pair) => pair.priorityWindowRemaining > 0);
  const pool = windowed.length ? entrants.filter((pair) => pair.priorityWindowRemaining <= 0) : entrants;
  const effectiveDrawSize = Math.max(0, drawSize - windowed.length);
  if (pool.length <= effectiveDrawSize) return [...windowed, ...pool];
  const ranked = pool.map((pair) => ({
    pair,
    rank: pairEntryRank(pair) || (WORLD_RANKING_TARGET + 1),
    played: pairTournamentsPlayedSoFar(pair),
    skill: pairScore(pair, tournament),
  }));
  const reservedSlots = Math.max(0, Math.min(effectiveDrawSize, Math.round(effectiveDrawSize * ENTRY_RESERVED_SHARE)));
  const openSlots = effectiveDrawSize - reservedSlots;
  const byRank = [...ranked].sort((a, b) => a.rank - b.rank || b.skill - a.skill);
  const selectedOpen = byRank.slice(0, openSlots);
  const selectedIds = new Set(selectedOpen.map((entry) => entry.pair.id));
  const remaining = ranked.filter((entry) => !selectedIds.has(entry.pair.id));
  // Fase 7.4 — `QUALIFYING_SCALE_FACTOR` (1,4×) reescala a fatia de
  // `QUALIFYING_SHARE` dentro do MESMO `reservedSlots` (nunca estoura
  // `effectiveDrawSize` — só realoca entre qualifying e vaga reservada
  // direta). Medido na Fase 7.3 junto com a janela de prioridade
  // (hipótese A da Fase 7.2): das 3 configurações testadas até 5
  // temporadas completas, N=4 com este fator fixo (política "rate") foi
  // a que zerou a reincidência (0% em T4 e T5, contra 90,9% com N=2 e
  // 40% com o fator escalando pelo tamanho do grupo em vez de fixo) —
  // ver FASE-7.3-RELATORIO.md §3.3. Fixo desde o primeiro torneio (não
  // só a partir da 2ª temporada, como na medição original): a Fase 7.3
  // aplicava o fator a partir da temporada 2 porque a instrumentação de
  // medição só descobria o tamanho do grupo rank>300 ao fim da
  // temporada 1 — mas o valor "rate" nunca dependeu do tamanho do grupo
  // (ao contrário de "group"), então não há razão pra atrasar sua
  // aplicação além do que a própria medição exigia; a temporada 1 é
  // bootstrap universal (nenhum real fica de fora, em toda medição já
  // feita), então isso não muda nenhum número já registrado.
  const qualifyingShareEffective = Math.min(1, QUALIFYING_SHARE * QUALIFYING_SCALE_FACTOR);
  const qualifyingSlots = Math.round(reservedSlots * qualifyingShareEffective);
  const reservedDirectSlots = reservedSlots - qualifyingSlots;
  const byLeastPlayed = [...remaining].sort((a, b) => a.played - b.played || a.rank - b.rank);
  const selectedReservedDirect = byLeastPlayed.slice(0, reservedDirectSlots);
  const reservedDirectIds = new Set(selectedReservedDirect.map((entry) => entry.pair.id));
  // Fase 7.1, medição — a 1ª versão desta função montava o pool de
  // qualifying tirando da MESMA fila de menos-torneios-jogados
  // (`byLeastPlayed`) que já alimenta `reservedDirectSlots`. Não
  // funcionou: `pairTournamentsPlayedSoFar` é uma contagem VITALÍCIA
  // (nunca reseta por temporada) — uma dupla que teve uma temporada 1
  // boa (todo mundo tem, é o bootstrap) acumula um total vitalício que
  // não cai só porque ela ficou 2 temporadas inteiras sem jogar depois;
  // outras duplas (bots recém-criados, parcerias recém-formadas) têm
  // menos jogos vitalícios sem estar presas em nenhuma espiral, e
  // furavam a frente da fila. Resultado medido: grupo rank>300 da Fase 7
  // continuava em 0% de "jogou" mesmo com qualifying ativo. Corrigido
  // usando RANK direto (a variável que a Fase 7 mediu como o
  // discriminador de 98,8% de acurácia, e que cai em tempo real por ser
  // posição relativa) pra montar o pool — mira exatamente quem a Fase 7
  // identificou como preso, em vez de um proxy que podia não incluí-los.
  const stillRemaining = remaining.filter((entry) => !reservedDirectIds.has(entry.pair.id));
  const byWorstRank = [...stillRemaining].sort((a, b) => b.rank - a.rank);
  const qualifyingPool = byWorstRank.slice(0, qualifyingSlots * QUALIFYING_POOL_MULTIPLIER);
  const qualifyingWinners = qualifyingSlots > 0 ? resolveQualifyingBracket(qualifyingPool, qualifyingSlots) : [];
  if (commitWindow) {
    for (const entry of qualifyingWinners) entry.pair.priorityWindowRemaining = PRIORITY_WINDOW_N;
  }
  return [...windowed, ...[...selectedOpen, ...selectedReservedDirect, ...qualifyingWinners].map((entry) => entry.pair)];
}

// Fase 7.3 (medição) / Fase 7.4 (permanente) — fecha a espiral
// auto-reforçada identificada na Fase 7 (rank pior → menos vagas pela
// prioridade por rank → menos pontos, que só vêm de jogar → rank
// relativo pior, porque o resto do mundo continua jogando → menos
// vagas ainda). O qualifying (Fase 7.1) já dava uma porta de entrada
// pra quem está preso, mas uma vitória PONTUAL não rende rank
// suficiente pra sair do bucket rank>300 antes da próxima rodada — a
// Fase 7.2 mediu 90-100% de reincidência (dupla resgatada que volta a
// ficar presa na temporada seguinte). A janela dá entrada GARANTIDA por
// `PRIORITY_WINDOW_N` aparições seguidas depois de vencer o qualifying,
// em vez de uma só — medida na Fase 7.3 como a peça que faltava (0% de
// reincidência com N=4, contra 90,9% com N=2 e 40% com o fator de
// qualifying escalando pelo grupo em vez de fixo — ver
// FASE-7.3-RELATORIO.md §3.3). `QUALIFYING_SCALE_FACTOR` é constante fixa
// de produção (Fase 7.4) — não mais variável de ambiente de diagnóstico.
// `PRIORITY_WINDOW_N` — importado de `EntryManager.js` (Fase 8.1, item 2):
// o caminho de entrada do JOGADOR reusa a mesma constante, uma fonte só
// pro tamanho da janela nos dois caminhos (IA em segundo plano, jogador).
const QUALIFYING_SCALE_FACTOR = 1.4;

// Fase 5.3, item 2 — mínimo viável de chave. Sem o preenchimento forçado
// (removido nesta fase, item 1), um campo pequeno demais não vira
// torneio, em vez de "rodar com 3". 8 = a menor chave real da escada de
// tiers (Circuit/Legacy Finals, Exibição) — uma chave de eliminação com
// estrutura de verdade (quartas/semi/final). Pros tiers cuja chave-padrão
// já é 8 ou menor, o mínimo cede pra metade dela, pra não cancelar uma
// final de acesso restrito por causa de uma dupla que descansou.
const MIN_VIABLE_DRAW_SIZE = 8;
function minViableDraw(drawSize) {
  return Math.min(MIN_VIABLE_DRAW_SIZE, Math.max(2, Math.ceil(drawSize / 2)));
}

// Playthrough 5.26-D — AUTORIDADE ÚNICA do rank canônico de dupla (posição de
// exibição/seeding). Extraída de ensureWorldTourDraws (5.16/5.22-F) para que o
// campo do torneio do JOGADOR seja montado com a MESMA resolução, sem uma
// segunda fórmula de posição. `pairSeedRank(pair)` devolve, em ordem: posição
// da linha canônica de TeamRanking (quando existe); posição equivalente da
// SOMA dos pontos rolling dos membros contra a distribuição canônica
// (mesma unidade, 5.22-F); e, só no fim, `pairEntryRank` (média dos ranks
// individuais) como piso. Nunca inventa posição, nunca usa seed de chave.
export async function createPairSeedRankResolver() {
  const canonicalTeamRanks = new Map();
  const canonicalTeamPointsDesc = [];
  try {
    for (const row of await getTeamRankings(5000)) {
      const key = [row.player1_id, row.player2_id].filter(Boolean).sort().join('_');
      const position = Number(row.ranking_display_position) || 0;
      if (key && position > 0 && !canonicalTeamRanks.has(key)) canonicalTeamRanks.set(key, position);
      const points = Math.max(0, Number(row.ranking_points) || 0);
      if (points > 0) canonicalTeamPointsDesc.push(points);
    }
    canonicalTeamPointsDesc.sort((a, b) => b - a);
  } catch { /* sem ranking de duplas, o fallback abaixo assume */ }
  const positionForCanonicalPoints = (points) => {
    if (!(points > 0) || !canonicalTeamPointsDesc.length) return 0;
    let index = 0;
    while (index < canonicalTeamPointsDesc.length && canonicalTeamPointsDesc[index] > points) index += 1;
    return index + 1;
  };
  const pairSeedRank = (pair) => {
    const ids = (pair?.athletes || []).map((athlete) => athlete?.id).filter(Boolean).sort();
    if (ids.length === 2) {
      const canonical = canonicalTeamRanks.get(ids.join('_'));
      if (canonical > 0) return canonical;
      const memberPoints = (pair.athletes || []).reduce(
        (sum, athlete) => sum + Math.max(0, Number(athlete?.world_ranking_points ?? athlete?.ranking_points) || 0), 0);
      const canonicalPosition = positionForCanonicalPoints(memberPoints);
      if (canonicalPosition > 0) return canonicalPosition;
    }
    return pairEntryRank(pair);
  };
  return { pairSeedRank, canonicalTeamRanks, positionForCanonicalPoints };
}

// Fase 3, item 3A.1 — antes, uma tabela FIXA de 7 rótulos/frações
// (FINISH_POINTS) hardcoded neste arquivo, alheia ao tamanho real da
// chave de cada tier. Substituída por uma leitura de `circuitCatalog.js`,
// que carrega roundLabels/roundPoints do tamanho de chave do tier.
// `index` é a posição do par na lista ordenada por pontuação (0 =
// campeão); mapeia pra profundidade de eliminação por log2 (posições 1 →
// final, 2-3 → semifinal, 4-7 → quartas, ... — o dobro de gente a cada
// rodada anterior, mesma forma de qualquer chave de eliminação simples).
//
// Fase 5.3, item 2 — chave de tamanho variável: `getRoundOutcomeTable`
// devolve a tabela pro TAMANHO REAL do campo (`entrantCount`), não pro
// `mainDrawSize` do tier. Campeão continua valendo o `rankPoints`
// canônico do tier; só as rodadas intermediárias encolhem com o campo —
// um Bronze de 9 paga o mesmo título que um de 16, mas quem perde na
// estreia recebe pontos de estreia, não de uma quartas que não existiu.
function resolveFinish(tournament, index, entrantCount) {
  const { roundCount, roundLabels, roundPoints } = getRoundOutcomeTable(tournament?.tier, entrantCount);
  const depthFromChampion = index <= 0 ? 0 : Math.floor(Math.log2(index)) + 1;
  const tierIndex = Math.max(0, roundCount - depthFromChampion);
  return {
    finish: roundLabels[tierIndex] || roundLabels[0],
    points: roundPoints[tierIndex] ?? roundPoints[0] ?? 0,
    // Vitórias = quantas rodadas foram vencidas pra chegar a este posto —
    // exatamente o índice na tabela (0 = perdeu na entrada, roundCount =
    // campeão, venceu todas).
    wins: tierIndex,
  };
}

function addHeadToHead(rows, opponent, won, tournamentId, date) {
  if (!opponent?.id) return Array.isArray(rows) ? rows : [];
  const nextRows = [...(Array.isArray(rows) ? rows : [])];
  const index = nextRows.findIndex((row) => row.opponent_id === opponent.id);
  const current = index >= 0 ? nextRows[index] : { opponent_id: opponent.id, opponent_name: opponent.name, meetings: 0, wins: 0, losses: 0 };
  const next = {
    ...current,
    opponent_name: opponent.name,
    meetings: Number(current.meetings || 0) + 1,
    wins: Number(current.wins || 0) + (won ? 1 : 0),
    losses: Number(current.losses || 0) + (won ? 0 : 1),
    last_tournament_id: tournamentId,
    last_meeting_date: date,
  };
  if (index >= 0) nextRows[index] = next;
  else nextRows.push(next);
  return nextRows.sort((a, b) => Number(b.meetings || 0) - Number(a.meetings || 0)).slice(0, 16);
}

function tournamentEndDate(tournament) {
  return tournament.end_date || tournament.start_date;
}

/**
 * Invariante pura de "este torneio ainda precisa ser resolvido pelo circuito
 * da IA?". Extraída de resolveCompletedWorldTourEvents para ser testável sem
 * storage — mesmo padrão de shouldClearPendingDecision (calendarSystem.js).
 *
 * Playthrough 4, item 1/2: a campanha do jogador passou a fechar o Tournament
 * (status 'finalizado') em QUALQUER desfecho, não só no título — era esse
 * buraco que deixava o torneio do jogador voltar para esta fila e ganhar um
 * SEGUNDO campeão, diferente do da chave (ver tournamentLifecycle.js).
 *
 * Playthrough 4.2: com a chave COMPLETA (bracket_schema_version 2), a
 * derrota do jogador em QUALQUER rodada já dispara a continuação AI-only do
 * resto do quadro na hora (tournamentSettlement.js:
 * applyPlayerMatchToCanonicalBracket) — `world_tour_resolved`/`champion` são
 * gravados sempre, não só quando o jogador chega à final. Só um save
 * ANTIGO, sem essa chave completa (item 9), ainda deixa o título
 * genuinamente indefinido numa eliminação antes da final; nesse caso o
 * circuito da IA continua sendo quem completa o evento, como antes.
 * 'finalizado' sozinho não exclui mais: só exclui junto com um campeão já
 * gravado.
 */
// Playthrough 4.7, item 7 — `player_participated` só é gravado por
// prepareTournamentFinalization (game-core/tournamentLifecycle.js), que só
// roda depois que o jogador de fato terminou uma partida ou clicou
// abandonar. Um jogador inscrito que se lesiona ANTES da primeira partida
// e nunca chega a acionar nenhum desses dois caminhos deixava
// `player_participated` para sempre falso — o torneio caía nesta fila
// AI-only, `resolveCompletedWorldTourEvents` tentava resolvê-lo sem fatos
// suficientes (o match do jogador nunca teve vencedor) e falhava a semana
// inteira, todo dia, pra sempre (Playthrough 4.7, W.O. automático corrige
// a causa: resolveUnavailablePlayerMatch chama prepareTournamentFinalization
// e passa a gravar player_participated mesmo num W.O. sem nenhuma partida
// jogada). Esta função continua servindo de defesa em profundidade:
// `player_match:true` já é gravado em bracket_history no PRÓPRIO SORTEIO
// (buildPlayerTournamentBracket, tournamentSettlement.js) — um sinal
// disponível desde o D-3, nunca dependente de uma partida ter acontecido.
function hasPlayerMatchInBracket(tournament) {
  return Array.isArray(tournament?.bracket_history)
    && tournament.bracket_history.some((round) => (round?.matches || []).some((match) => match?.player_match === true));
}

export function isWorldTourResolutionPending(tournament, careerDate) {
  const end = tournamentEndDate(tournament || {});
  if (!tournament?.world_tour_event || !end || !careerDate || end >= careerDate) return false;
  if (tournament.world_tour_resolved) return false;
  if (tournament.status === 'finalizado' && tournament.champion) return false;
  // Playthrough 4.5, itens 3/4/15 — um torneio com participação do jogador E
  // chave canônica completa (bracket_schema_version 2) nunca é resolvido por
  // esta fila (simulação semanal de pares AI-only, que nem inclui o jogador
  // como "par" candidato). Sua autoridade única passa a ser
  // game-core/tournamentLifecycle.js: prepareTournamentFinalization decide na
  // hora quando a final real já foi alcançada, e
  // resolvePendingPlayerCanonicalTournaments retoma no day-tick quando não
  // foi (Roma eliminado cedo — a final chega dias depois, sem mais nenhuma
  // partida do jogador para disparar a finalização). Duas filas resolvendo o
  // mesmo Tournament era exatamente o bug original da Fase 4 (Londres:
  // "duas verdades para um evento só").
  //
  // Item 9 (saves legados, sem chave completa) — mantém o comportamento
  // anterior: eliminado antes da final, sem chave capaz de derivar fatos do
  // campo inteiro, o título genuinamente fica indefinido e só o circuito da
  // IA pode completá-lo (Playthrough 4, Caso B do teste de autoridade).
  const bracketReady = Number(tournament.bracket_schema_version) >= 2;
  if (bracketReady && (tournament.player_participated || hasPlayerMatchInBracket(tournament))) return false;
  return true;
}

function daysUntil(date, target) {
  if (!date || !target) return null;
  return Math.round((new Date(`${target}T00:00:00Z`) - new Date(`${date}T00:00:00Z`)) / 86400000);
}

/**
 * Materializa a chave do mundo no mesmo relógio do calendário do jogador.
 * Antes, somente CalendarEvent com registration_id passava por
 * ensureTournamentDraw; eventos AI-only não tinham esse evento e só eram
 * resolvidos depois do end_date, deixando a UI sem chave durante todo o
 * torneio. A chave é factual e determinística, mas o settlement continua
 * reservado para o fim do evento.
 */
export async function ensureWorldTourDraws(careerDate) {
  if (!careerDate) return { drawn: 0, cancelled: 0, errors: [] };
  const [tournaments, rawAthletes, partnerships, registrations] = await Promise.all([
    entities.Tournament.list('start_date', 2000),
    entities.AthleteProfile.list('-world_ranking_points', ATHLETE_POPULATION_CAP),
    entities.Partnership.list('-created_date', 1200).catch(() => []),
    entities.TournamentRegistration.list('-created_date', 2000).catch(() => []),
  ]);
  const playerTournamentIds = new Set((registrations || [])
    .filter((registration) => ['pending', 'confirmed'].includes(registration.status))
    .map((registration) => registration.tournament_id)
    .filter(Boolean));
  for (const tournament of tournaments || []) {
    if (Number(tournament.bracket_schema_version) < 2 || tournament.world_tour_resolved || !tournament.start_date) continue;
    const end = tournamentEndDate(tournament);
    if (tournament.start_date <= careerDate && careerDate <= end && tournament.status !== 'em_andamento') {
      await entities.Tournament.update(tournament.id, { status: 'em_andamento', current_phase: 'em_andamento' });
    }
  }
  // Item 2B (Playthrough 4.5B) — Cidade do Cabo aparecia sem chave durante
  // todo o torneio e ganhava uma chave completa (com campeão) já pronta
  // depois do end_date: o loop de sorteio (`due`, abaixo) só tenta enquanto
  // `daysUntil(careerDate, start_date)` está em [0,3] — no dia seguinte ao
  // início (`daysUntil < 0`), o evento simplesmente PARAVA de ser
  // considerado, sem nunca ser cancelado nem sorteado, até
  // resolveCompletedWorldTourEvents encontrá-lo no fim (`end_date` já
  // passado) e criar uma chave nova do zero SÓ ALI — a "chave retroativa"
  // relatada. Nunca deve existir esse limbo silencioso: se o evento chega
  // ao próprio início sem ter conseguido campo mínimo (D-3/D-2/D-1/D0 já
  // tentaram via `due`, abaixo), cancela EXPLICITAMENTE aqui, no primeiro
  // dia em que isso é verdade — data e motivo preservados, nunca uma
  // chave fingindo que existia desde o começo.
  for (const tournament of tournaments || []) {
    if (!tournament.world_tour_event || tournament.world_tour_cancelled || Number(tournament.bracket_schema_version) >= 2) continue;
    if (playerTournamentIds.has(tournament.id) || !tournament.start_date) continue;
    const days = daysUntil(careerDate, tournament.start_date);
    if (days === null || days >= 0) continue; // ainda não passou do início — due (abaixo) ainda pode tentar.
    await entities.Tournament.update(tournament.id, {
      status: 'cancelado',
      current_phase: 'cancelado',
      world_tour_cancelled: true,
      world_tour_resolved: true,
      cancellation_reason: 'sem_chave_ate_o_inicio',
      resolved_at: careerDate,
      draw_pending_reason: null,
    }).catch(() => {});
    // Item 4 (Playthrough 4.5C) — o cancelamento por campo insuficiente já
    // publicava WorldEvent quando descoberto no settlement (belowMinViable,
    // abaixo); este segundo ponto de cancelamento (item 2B, descoberto no
    // próprio D+1) precisa da MESMA cobertura — sem isso, um evento
    // cancelado por este caminho específico não deixava rastro nenhum no
    // Jornal, mesmo com o Tournament corretamente marcado.
    await entities.WorldEvent.create({
      event_type: 'tournament_cancelled',
      title: `${tournament.name} cancelado por falta de inscritos`,
      content: `O ${tournament.name} foi cancelado sem chave oficial: não reuniu duplas elegíveis suficientes até o início do evento.`,
      author_name: 'Redação Padel Legacy World Tour',
      tier: String(tournament.tier || 'normal').toLowerCase(),
      event_date: careerDate,
      tags: ['world-tour', 'torneio', 'cancelamento'],
      related_tournament_id: tournament.id,
    }).catch(() => {});
  }
  const due = (tournaments || []).filter((tournament) => (
    tournament.world_tour_event
    && !playerTournamentIds.has(tournament.id)
    && !tournament.world_tour_cancelled
    && !tournament.bracket_schema_version
    && daysUntil(careerDate, tournament.start_date) >= 0
    && daysUntil(careerDate, tournament.start_date) <= 3
  ));
  if (!due.length) return { drawn: 0, cancelled: 0, errors: [] };
  // Playthrough 5.16, Partes Y/Z — autoridade de CABEÇA DE CHAVE.
  //
  // O comentário histórico em pairEntryRank dizia que "não existe TeamRanking
  // dedicado para pares do World Tour"; desde a 5.10/5.11 existe, e é a
  // autoridade canônica de dupla (updateTeamRankings mantém as linhas de IA).
  // Medido: usar a média dos ranks INDIVIDUAIS diverge do ranking de duplas a
  // ponto de o bye da chave ir para a dupla #308 enquanto a #1 jogava a
  // rodada 0. O rank canônico da dupla é lido aqui uma vez por sorteio;
  // pairEntryRank continua como fallback para pares ainda sem linha.
  // Pair 5.26-D — a resolução canônica de posição de dupla (5.16/5.22-F) foi
  // extraída para `createPairSeedRankResolver`, reusada também pelo campo do
  // torneio do jogador. Mesma autoridade, nenhuma segunda fórmula.
  const { pairSeedRank } = await createPairSeedRankResolver();
  const athletes = (rawAthletes || []).map(normalizeAthlete).filter((athlete) => !athlete.retired && athlete.career_status !== 'aposentado');
  const allPairs = buildCanonicalPairs(partnerships, athletes);
  // Item 6 — exclusividade de agenda. Uma dupla já sorteada (chave existente,
  // ainda não resolvida) em outro torneio cuja janela [start_date, end_date]
  // cruza a de QUALQUER torneio `due` nesta chamada não concorre a uma
  // segunda chave sobreposta — Coello/Tapia não podem estar em Madri E Doha
  // ao mesmo tempo.
  const committedPairIds = committedPairIdsForWindow(due, tournaments);
  const pairs = allPairs.filter((pair) => !committedPairIds.has(pair.id));
  // Itens 5/6/7 — mesma autoridade de atribuição semanal do settlement
  // (chooseTournament + redistribuição entre tiers de acesso livre + fallback
  // de tier), aplicada agora no sorteio: o campo que o D-3 desenha deixa de
  // divergir de quem o settlement creditaria semanas depois, e um tier de
  // elite concorrente (Doha Masters) tem prioridade de fato sobre um tier
  // aberto concorrente (Madri Gold) pela mesma pontuação de `chooseTournament`
  // — o Gold recebe as melhores duplas RESTANTES, não as mesmas do Masters.
  const assignments = await applyFinalsEntryAuthority(due, pairs, assignPairsForWeek(due, pairs));
  // Item 3 (Playthrough 4.5D) — fallback de campo. Depois da atribuição
  // semanal normal (economia + fallback de tier já embutidos em
  // assignPairsForWeek), qualquer dupla CANÔNICA que não foi escolhida por
  // NENHUM torneio `due` fica ociosa nesta semana. Antes de aceitar um
  // evento como pendente, uma última rodada de resgate oferece essas
  // duplas ociosas — sempre reais (Partnership/ai_partner_id, nunca
  // inventadas), sempre respeitando a exclusividade de agenda (já vieram
  // de `pairs`, que já exclui `committedPairIds`) — só quando o campo
  // normal não bastou. Tiers mais altos processam primeiro (mesma
  // hierarquia Crown>...>Bronze), então o resgate nunca esvazia o pool
  // ocioso às custas de um evento de elite.
  const TIER_PRIORITY_ORDER = { Crown: 0, Elite: 1, Masters: 2, Platinum: 3, 'Circuit Finals': 3, Gold: 4, Silver: 5, Bronze: 6 };
  const orderedDue = [...due].sort((a, b) => (TIER_PRIORITY_ORDER[a.tier] ?? 9) - (TIER_PRIORITY_ORDER[b.tier] ?? 9));
  const assignedPairIds = new Set([...assignments.values()].flatMap((list) => list.map((pair) => pair.id)));
  const idlePairs = pairs.filter((pair) => !assignedPairIds.has(pair.id));
  const drawn = [];
  const cancelled = [];
  const errors = [];
  for (const tournament of orderedDue) {
    try {
      const config = getTournamentTierConfig(tournament.tier);
      const drawSize = Math.max(2, Number(tournament.main_draw_size) || config.mainDrawSize || 16);
      // Playthrough 5.1, Parte C/N — este corte final pra `drawSize` (o
      // sorteio D-3, o caminho que grava draw_pair_ids de verdade) sempre
      // ordenou só por pairScore/OVR, cego a rank. Duas tentativas medidas
      // e descartadas antes desta: (1) applyEntryPriority — seu mecanismo
      // de reserva/qualifying existe pra impedir exclusão PERMANENTE ao
      // longo de várias semanas, não pra ser seletor de qualidade de UM
      // sorteio, e já roda dentro de assignPairsForWeek; reaplicado aqui
      // derrubou a força média de TODOS os tiers. (2) corte 100% por
      // getTierRankingFit (rankCandidatesByTierFit puro) — Gold tem uma
      // rede de elegibilidade tão mais ampla que sua própria zona ideal
      // que um corte estrito por adequação simplesmente não encontra gente
      // adequada o bastante pra preencher o draw inteiro (Bronze avgOVR
      // caiu de ~78 pra ~55 numa simulação real de 1 ano — Gold/Silver só
      // trocaram de lugar, o desequilíbrio migrou, não sumiu).
      // Blend (esta versão): fit não FILTRA, DESCONTA — de 100% do
      // pairScore (fit=100, encaixe perfeito) a 50% dele (fit=0, fora da
      // faixa) — nunca elimina um candidato de OVR muito alto só por fit
      // baixo (preserva profundidade de talento pro corte, evitando a
      // fome de resgate do corte estrito), mas dá vantagem real e
      // consistente a quem tem o rank certo pro tier. `chooseTournament`
      // (Parte C, causa raiz) já mudou QUEM TENTA entrar em cada torneio
      // antes deste corte — este blend completa o efeito no corte final
      // sem repetir a fome de população dos dois caminhos descartados.
      const blendedCutScore = (pair) => fieldAdmissionScore(pair, tournament);
      // Playthrough 5.18-G, Partes B/C — OBSERVABILIDADE DA ADMISSÃO.
      //
      // A 5.18-F tentou auditar o corte reconstruindo a fila DE FORA, depois
      // do sorteio, e mediu 62% de deriva: a reconstrução não representava a
      // decisão. A causa era dupla — o instante era outro E a autoridade era
      // outra (a reconstrução usava a semântica de `applyEntryPriority`,
      // enquanto QUEM CORTA AQUI é `blendedCutScore`; ver o comentário acima,
      // que registra applyEntryPriority como tentada e descartada neste
      // ponto). Em vez de reconstruir melhor, o observador registra a decisão
      // no instante em que ela é tomada.
      //
      // Não é fonte de verdade e não persiste nada: `drawAdmissionObserver` é
      // null em produção (custo zero), e só um harness de teste o instala.
      const observing = typeof drawAdmissionObserver === 'function';
      const queue = [...(assignments.get(tournament.id) || [])];
      const ranked = queue
        .map((pair) => ({ pair, cut: blendedCutScore(pair) }))
        .sort((a, b) => b.cut - a.cut);
      let entrants = ranked.slice(0, drawSize).map((e) => e.pair);
      const admittedByCut = new Set(entrants.map((p) => p.id));
      let rescued = [];
      const sizeBeforeRescue = entrants.length;
      if (entrants.length < minViableDraw(drawSize) && idlePairs.length) {
        const usedIds = new Set(entrants.map((pair) => pair.id));
        const stillNeeded = Math.min(drawSize, minViableDraw(drawSize)) - entrants.length;
        const rescue = rankCandidatesByTierFit(idlePairs.filter((pair) => !usedIds.has(pair.id)), tournament).slice(0, stillNeeded);
        if (rescue.length) {
          rescued = rescue;
          entrants = [...entrants, ...rescue];
          for (const pair of rescue) idlePairs.splice(idlePairs.indexOf(pair), 1);
        }
      }
      if (observing) {
        const rescuedIds = new Set(rescued.map((p) => p.id));
        drawAdmissionObserver({
          tournamentId: tournament.id,
          careerDate,
          tier: tournament.tier,
          drawSize,
          queueSize: queue.length,
          // A linha de corte: a pontuação da última vaga preenchida pelo
          // corte normal. Quem fica abaixo dela só entra por resgate.
          cutLine: ranked.length > drawSize ? (ranked[drawSize - 1]?.cut ?? null) : null,
          candidates: ranked.map((entry, index) => ({
            pairId: entry.pair.id,
            teamRank: pairSeedRank(entry.pair) || null,
            pairEntryRank: pairEntryRank(entry.pair) || null,
            tournamentsPlayed: pairTournamentsPlayedSoFar(entry.pair),
            pairScore: pairScore(entry.pair, tournament),
            tierFit: getTierRankingFit(tournament.tier, pairEntryRank(entry.pair)),
            blendedCutScore: entry.cut,
            priorityWindow: Number(entry.pair.priorityWindowRemaining) || 0,
            finalOrder: index,
            admitted: admittedByCut.has(entry.pair.id),
            viaRescue: false,
          })).concat(rescued.map((pair, index) => ({
            pairId: pair.id,
            teamRank: pairSeedRank(pair) || null,
            pairEntryRank: pairEntryRank(pair) || null,
            tournamentsPlayed: pairTournamentsPlayedSoFar(pair),
            pairScore: pairScore(pair, tournament),
            tierFit: getTierRankingFit(tournament.tier, pairEntryRank(pair)),
            blendedCutScore: blendedCutScore(pair),
            priorityWindow: Number(pair.priorityWindowRemaining) || 0,
            finalOrder: ranked.length + index,
            admitted: true,
            viaRescue: true,
          }))),
          rescue: {
            triggered: rescued.length > 0,
            sizeBefore: sizeBeforeRescue,
            minViable: minViableDraw(drawSize),
            poolSize: idlePairs.length + rescued.length,
            added: rescued.length,
            addedIds: [...rescuedIds],
            reason: rescued.length ? 'campo_abaixo_do_minimo_viavel' : null,
          },
        });
      }
      if (entrants.length < minViableDraw(drawSize)) {
        // Item 5 — não aceitar silent skip. A população de duplas pode ainda
        // estar sendo formada pelo mercado no mesmo avanço, então isto NÃO
        // vira cancelamento aqui (o settlement no fim do evento continua
        // sendo a única autoridade para decidir se o campo ficou abaixo do
        // mínimo viável) — mas o motivo de não ter sorteado ainda fica
        // persistido e visível, nunca um `continue` silencioso.
        await entities.Tournament.update(tournament.id, {
          draw_pending_reason: 'inscritos_insuficientes_ate_agora',
          draw_pending_participant_count: entrants.length,
          draw_pending_checked_at: careerDate,
        }).catch(() => {});
        continue;
      }
      const roundCount = Math.ceil(Math.log2(Math.max(2, entrants.length)));
      const roundDates = getCanonicalRoundDates(tournament.start_date, roundCount);
      const bracket = buildCanonicalTournamentBracket({
        tournamentId: tournament.id,
        date: tournament.start_date,
        roundDates,
        // Playthrough 5.16, Parte Z — `seedRank` separa as duas autoridades
        // que antes se confundiam: quem é cabeça de chave (ranking) e quem
        // ganha o jogo (força). Sem isso, um bot de OVR alto mas rank ruim
        // virava cabeça de chave acima da elite real.
        participants: entrants.map((pair) => ({
          name: pair.name,
          strength: pairScore(pair, tournament),
          seedRank: pairSeedRank(pair),
        })),
      });
      await entities.Tournament.update(tournament.id, {
        bracket_history: bracket.bracket_history,
        bracket_schema_version: 2,
        participants: entrants.map((pair) => pair.name),
        draw_pair_ids: entrants.map((pair) => pair.id),
        status: 'chaveamento',
        current_phase: 'chaveamento',
        draw_date: careerDate,
        draw_participant_count: entrants.length,
        draw_pending_reason: null,
        // Playthrough 5.17, Parte M — SNAPSHOT DE RANKING NO SORTEIO.
        //
        // Fecha a dívida metodológica registrada na 5.16: auditar seeding
        // comparando o ranking do FIM da temporada com uma chave sorteada
        // meses antes é inválido — a dupla que era #4 no D-3 pode terminar o
        // ano em #243. Sem snapshot, não havia como provar nada depois.
        //
        // Guarda só o necessário para auditoria determinística (nome + rank
        // canônico no instante do sorteio), não uma cópia do banco. Isto é
        // registro histórico: NUNCA deve ser lido como fonte de ranking.
        draw_generated_at: careerDate,
        field_origin_version: '5.17',
        draw_ranking_snapshot: entrants.map((pair) => ({
          pair_id: pair.id,
          name: pair.name,
          rank: pairSeedRank(pair) || null,
        })),
      });
      drawn.push(tournament.id);
    } catch (error) {
      errors.push({ tournamentId: tournament.id, message: error?.message || String(error) });
    }
  }
  return { drawn: drawn.length, cancelled: cancelled.length, errors };
}

function eventRegion(tournament) {
  return tournament.region || tournament.continent || tournament.country || tournament.location || 'global';
}

function normalizeAthlete(athlete) {
  return {
    ...athlete,
    // Fase 4.0, item 2A (achado #18): `world_ranking` foi removido — todo
    // consumidor (aqui e fora deste arquivo) já lia ranking_position
    // primeiro, e este próprio campo `.ranking` normalizado nunca é lido
    // por ninguém depois de calculado (grep confirma). Campo morto.
    ranking: Number(athlete.ranking_position || athlete.ranking || 999),
    energy: Number(athlete.energy || 80),
    careerStrategy: athlete.career_strategy || athlete.careerStrategy || 'balanced',
    currentRegion: athlete.current_region || athlete.currentRegion || 'global',
  };
}

function partnershipAthleteIds(partnership) {
  return [partnership.athlete_a_id || partnership.participant_a_id, partnership.athlete_b_id || partnership.participant_b_id].filter(Boolean);
}

export function buildCanonicalPairs(partnerships, athletes) {
  const byId = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  const seen = new Set();
  const pairs = [];
  for (const partnership of partnerships || []) {
    if (partnership.status !== 'ativa') continue;
    if (partnership.partnership_type && partnership.partnership_type !== 'npc' && partnership.scope !== 'world') continue;
    const ids = partnershipAthleteIds(partnership);
    if (ids.length !== 2 || ids[0] === ids[1] || ids.some((id) => !byId.has(id) || seen.has(id))) continue;
    const members = ids.map((id) => byId.get(id));
    members.forEach((member) => seen.add(member.id));
    pairs.push({
      id: partnership.id || [...ids].sort().join(':'),
      partnershipId: partnership.id,
      athletes: members,
      name: members.map((member) => member.name).join(' & '),
      chemistry: Number(partnership.chemistry || partnership.partner_chemistry || 50),
      // Fase 7.4 — persistido em Partnership.priority_window_remaining (não
      // mais um Map em memória, ver applyEntryPriority): sobrevive a
      // reinício de app/--resumeFrom por construção, porque é lido do
      // mesmo `partnerships` já carregado no topo desta função a cada
      // chamada, igual qualquer outro campo de estado deste pipeline.
      priorityWindowRemaining: Number(partnership.priority_window_remaining) || 0,
    });
  }
  // Saves recém-criados podem ter a dupla canônica já materializada no
  // AthleteProfile pelo save foundation, antes de o mercado criar a linha
  // Partnership correspondente. O ID do parceiro é a mesma identidade
  // persistida, então não há motivo para deixar o mundo sem pares durante
  // essa janela: aceita o vínculo por ID e mantém partnershipId nulo até o
  // registro de Partnership existir.
  for (const athlete of athletes || []) {
    const partnerId = athlete.ai_partner_id;
    if (!partnerId || athlete.id === partnerId || seen.has(athlete.id) || seen.has(partnerId) || !byId.has(partnerId)) continue;
    const partner = byId.get(partnerId);
    const ids = [athlete.id, partner.id].sort();
    ids.forEach((id) => seen.add(id));
    pairs.push({
      id: `profile-pair:${ids.join(':')}`,
      partnershipId: null,
      athletes: [athlete, partner],
      name: [athlete, partner].map((member) => member.name).join(' & '),
      chemistry: Number(athlete.ai_partnership_chemistry || partner.ai_partnership_chemistry || 50),
      priorityWindowRemaining: 0,
    });
  }
  return pairs;
}

// Playthrough 5.4, Parte F/M — achado: mesmo com ensureWorldTourDraws e
// resolveCompletedWorldTourEvents chamando a MESMA lógica de atribuição
// (Fase 4.5, comentário abaixo), elas rodam em MOMENTOS diferentes (sorteio
// no D-3, settlement só depois que o torneio termina, 4-8 dias depois) sobre
// um `pairs` reconstruído do zero a cada chamada — se o rank/região de um
// atleta mudou nesse intervalo (o normal: outros torneios da MESMA semana
// resolvem em paralelo), `chooseTournament` pode preferir outro torneio na
// segunda chamada, e a dupla historicamente sorteada (`draw_pair_ids`,
// gravado no sorteio) some do campo recalculado no settlement — mesmo sem
// nunca ter trocado de parceiro. Medido numa temporada real: 73% das
// aparições não-campeãs perdiam o crédito de ranking inteiro por causa
// disso (concentrado nos tiers de chave maior — Gold, Platinum, Bronze — 4
// vezes mais raro em Crown/Masters). O campeão nunca era afetado (o
// fallback `ordered.find(...) || ordered[0]` sempre resolvia certo por
// coincidência de posição), mas o RESTO do campo perdia pontos por um
// torneio que genuinamente jogou, comprovado pelo próprio bracket_history
// salvo. Resolve os IDs de `draw_pair_ids` (Partnership real OU sintético
// `profile-pair:`) direto, sem depender do `pairs` recém-recomputado.
function resolveDrawnPairMembers(pairId, partnershipById, athleteById) {
  if (typeof pairId !== 'string') return null;
  let ids;
  if (pairId.startsWith('profile-pair:')) {
    ids = pairId.slice('profile-pair:'.length).split(':').filter(Boolean);
  } else {
    const partnership = partnershipById.get(pairId);
    ids = partnership ? partnershipAthleteIds(partnership) : null;
  }
  if (!ids || ids.length !== 2) return null;
  const members = ids.map((id) => athleteById.get(id));
  return members.every(Boolean) ? members : null;
}

// Devolve o MESMO formato de objeto de `pairs` (buildCanonicalPairs) —
// preferindo a instância já existente em `pairsById` (traz
// priorityWindowRemaining/chemistry atuais) e só reconstruindo um
// equivalente mínimo quando a dupla sorteada não sobreviveu como par
// canônico ATUAL (ex.: parceria dissolvida depois do sorteio — caso raro,
// não o mecanismo dominante medido acima). `priorityWindowRemaining:0`
// nesse fallback é seguro: não existe mais janela de prioridade de uma
// parceria que não existe mais pra descontar.
function resolveDrawnPair(pairId, partnershipById, athleteById, pairsById) {
  const existing = pairsById.get(pairId);
  if (existing) return existing;
  const members = resolveDrawnPairMembers(pairId, partnershipById, athleteById);
  if (!members) return null;
  const partnership = partnershipById.get(pairId);
  return {
    id: pairId, partnershipId: partnership?.id || null, athletes: members,
    name: members.map((member) => member.name).join(' & '),
    chemistry: Number(partnership?.chemistry || partnership?.partner_chemistry || 50),
    priorityWindowRemaining: 0,
  };
}

// Fase 4.5 (circuito cronológico) — pipeline de atribuição semanal EXTRAÍDA
// (antes vivia só dentro de resolveCompletedWorldTourEvents) para virar a
// MESMA autoridade usada por ensureWorldTourDraws (D-3) e pelo settlement.
// Antes, o sorteio do D-3 usava uma seleção independente mais simples (só
// chooseTournament + corte por pairScore, sem o fallback de tier nem a
// redistribuição entre tiers de acesso livre) — o campo que a chave
// mostrava no D-3 podia divergir de quem o settlement escolhia semanas
// depois para o MESMO torneio (duas fontes de verdade para "quem joga",
// itens 5/6/7 do circuito cronológico). Agora as duas chamadas resolvem a
// mesma pergunta com a mesma lógica, sobre o mesmo `weekTournaments`/`pairs`.
export function assignPairsForWeek(weekTournaments, pairs) {
  const assignments = new Map(weekTournaments.map((tournament) => [tournament.id, []]));
  // Fase 6.5, item 3 — fallback de tier na mesma semana. `chooseTournament`
  // já devolve `options`, a lista INTEIRA de torneios elegíveis da semana,
  // ordenada por pontuação (`scoreOption`) — não só o escolhido. Guarda essa
  // lista + em qual posição dela a dupla está atualmente, pra tentar a
  // próxima se for cortada da atual.
  const pairOptionState = new Map();
  for (const pair of pairs) {
    // Fase 5.5, item 1 — elegibilidade pela dupla (pairEntryRank), não pelo
    // rank de um atleta sorteado arbitrariamente.
    const pairRank = pairEntryRank(pair);
    const representative = {
      ...pair.athletes[0],
      overall_rating: pair.athletes.reduce((sum, athlete) => sum + Number(athlete.overall_rating || athlete.overall || 50), 0) / 2,
      ...(pairRank > 0 ? { rank: pairRank, ranking_position: pairRank } : {}),
    };
    // Playthrough 5.3, Parte D — único chamador com aiFieldContext:true
    // neste arquivo (o campo de fundo AI-only, nunca o jogador).
    const choice = chooseTournament(weekTournaments, representative, {
      strategy: representative.careerStrategy,
      currentRegion: representative.currentRegion,
      aiFieldContext: true,
    });
    if (choice?.decision === 'play' && choice.tournament?.id && assignments.has(choice.tournament.id)) {
      assignments.get(choice.tournament.id).push(pair);
      pairOptionState.set(pair.id, { pair, options: choice.options || [], index: 0, currentTournamentId: choice.tournament.id });
    }
  }

  // Fase 5.4, item 1 — redistribuição de excedente entre tiers de acesso
  // livre (Bronze/Silver) concorrentes na mesma semana (ver histórico
  // completo no comentário original desta função, agora aqui).
  const barredFromOpen = (p) => {
    const r = pairEntryRank(p);
    return r > 0 && r <= OPEN_TIER_CEILING;
  };
  const openEvents = weekTournaments.filter((t) => getTournamentTierConfig(t?.tier).minRanking === 0);
  if (openEvents.length > 1) {
    const drawOf = (t) => Math.max(2, Number(t.main_draw_size) || getTournamentTierConfig(t?.tier).mainDrawSize || 16);
    const keepFirst = (a, b) => {
      const ra = pairEntryRank(a) || (WORLD_RANKING_TARGET + 1);
      const rb = pairEntryRank(b) || (WORLD_RANKING_TARGET + 1);
      return (ra - rb) || (pairTournamentsPlayedSoFar(a) - pairTournamentsPlayedSoFar(b));
    };
    for (let guard = 0; guard < 200; guard += 1) {
      const state = openEvents.map((t) => ({ t, draw: drawOf(t), min: minViableDraw(drawOf(t)), list: assignments.get(t.id) }));
      const donor = state.filter((s) => s.list.length > s.draw).sort((x, y) => (y.list.length - y.draw) - (x.list.length - x.draw))[0];
      const receiver = state.filter((s) => s.list.length < s.min).sort((x, y) => x.list.length - y.list.length)[0];
      if (!donor || !receiver) break;
      const present = new Set(receiver.list.map((p) => p.id));
      const cutCandidates = [...donor.list].sort(keepFirst).slice(donor.draw)
        .filter((p) => !present.has(p.id) && !barredFromOpen(p))
        .sort((a, b) => pairScore(a, receiver.t) - pairScore(b, receiver.t));
      const n = Math.min(donor.list.length - donor.draw, receiver.min - receiver.list.length, cutCandidates.length);
      if (n <= 0) break;
      const moveIds = new Set(cutCandidates.slice(0, n).map((p) => p.id));
      assignments.set(donor.t.id, donor.list.filter((p) => !moveIds.has(p.id)));
      receiver.list.push(...cutCandidates.slice(0, n));
    }
  }

  // Fase 6.5, item 3 — fallback de tier na mesma semana: quem é cortado do
  // tier escolhido tenta a PRÓXIMA melhor opção elegível da própria lista.
  const drawSizeOf = (t) => {
    const cfg = getTournamentTierConfig(t?.tier);
    return Math.max(2, Number(t.main_draw_size) || cfg.mainDrawSize || 16);
  };
  for (const [tournamentId, list] of assignments) {
    for (const p of list) {
      const state = pairOptionState.get(p.id);
      if (state) state.currentTournamentId = tournamentId;
    }
  }
  const MAX_FALLBACK_ROUNDS = 6;
  for (let round = 0; round < MAX_FALLBACK_ROUNDS; round += 1) {
    const survivedByTournament = new Map();
    for (const tournament of weekTournaments) {
      const drawSize = drawSizeOf(tournament);
      let candidates = [...(assignments.get(tournament.id) || [])];
      if (candidates.length > drawSize) candidates = applyEntryPriority(candidates, tournament, drawSize);
      const ordered = candidates.sort((a, b) => pairScore(b, tournament) - pairScore(a, tournament)).slice(0, drawSize);
      survivedByTournament.set(tournament.id, new Set(ordered.map((p) => p.id)));
    }
    let anyMoved = false;
    for (const state of pairOptionState.values()) {
      if (survivedByTournament.get(state.currentTournamentId)?.has(state.pair.id)) continue;
      let nextIndex = state.index + 1;
      while (nextIndex < state.options.length && !weekTournaments.some((t) => t.id === state.options[nextIndex].tournament?.id)) nextIndex += 1;
      if (nextIndex >= state.options.length) continue; // esgotou as opções — perde a semana.
      const nextTournamentId = state.options[nextIndex].tournament.id;
      const oldList = assignments.get(state.currentTournamentId);
      if (oldList) assignments.set(state.currentTournamentId, oldList.filter((p) => p.id !== state.pair.id));
      assignments.get(nextTournamentId)?.push(state.pair);
      state.currentTournamentId = nextTournamentId;
      state.index = nextIndex;
      anyMoved = true;
    }
    if (!anyMoved) break;
  }
  return assignments;
}

// Item 6 — exclusividade de agenda. Uma Partnership não pode ser sorteada em
// dois torneios cujas janelas [start_date, end_date] se sobrepõem. Devolve o
// conjunto de pair.id já comprometidos (chave sorteada, ainda não resolvida)
// em algum torneio cuja janela cruza a de QUALQUER torneio em `dueTournaments`.
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= (bEnd || bStart) && bStart <= (aEnd || aStart);
}
export function committedPairIdsForWindow(dueTournaments, allTournaments) {
  const committed = new Set();
  const drawnElsewhere = (allTournaments || []).filter((t) => (
    Number(t.bracket_schema_version) >= 2
    && !t.world_tour_resolved
    && Array.isArray(t.draw_pair_ids)
    && t.draw_pair_ids.length
  ));
  for (const due of dueTournaments) {
    const dueEnd = tournamentEndDate(due);
    for (const other of drawnElsewhere) {
      if (other.id === due.id) continue;
      const otherEnd = tournamentEndDate(other);
      if (!overlaps(due.start_date, dueEnd, other.start_date, otherEnd)) continue;
      for (const pairId of other.draw_pair_ids) committed.add(pairId);
    }
  }
  return committed;
}

// ═══════════════════════════════════════════════════════════════════════
// Playthrough 5.26-D — CAMPO REAL DO TORNEIO DO JOGADOR
// ═══════════════════════════════════════════════════════════════════════
//
// Até a 5.26-C os adversários dos torneios do jogador vinham do catálogo
// SINTÉTICO BOTS_BY_DIFFICULTY (career.js:generateTournamentOpponent), nunca
// inscritas no circuito: quase nenhuma tinha TeamRanking canônica (5 de
// 21.332 partidas) e a detecção de zebra quase nunca tinha dado real.
//
// Esta função ADAPTA A FONTE (duplas reais ativas do mundo) sem mudar a
// LÓGICA: o MESMO pool canônico do ensureWorldTourDraws (buildCanonicalPairs),
// a MESMA exclusividade de agenda (committedPairIdsForWindow) e a MESMA
// autoridade de admissão (blendedCutScore = pairScore · (0.35 + 0.65·tierFit/100)
// — nunca "top TeamRanking puro"), sem tocar em drawSize, BYEs, capacity ou
// fórmula de partida.
//
// Devolve o campo real selecionado + a projeção do adversário por rodada do
// main draw, pelo MESMO motor de seed da IA (buildSeededDrawSlots). Quem
// preenche eventual lacuna com o catálogo é o chamador (tournamentDraw.js),
// que marca o fallback e nunca atribui rank falso.
export async function buildPlayerTournamentField({
  tournament,
  profile,
  playerRank = 0,
  playerTeamName = 'Sua dupla',
  partnerAthleteId = null,
  qualifyingRoundCount = 0,
} = {}) {
  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const startedAt = nowMs();
  const config = getTournamentTierConfig(tournament?.tier);
  const mainDrawSize = Math.max(2, Number(tournament?.main_draw_size) || config.mainDrawSize || 16);
  const roundCount = Math.max(1, Number(config.roundCount) || Math.ceil(Math.log2(mainDrawSize)));
  // O bracket do caminho do jogador SEMPRE foi o esqueleto potência-de-2
  // (2^roundCount), com preenchimento nas posições que o jogador nunca
  // cruza. Preservamos esse tamanho (não é `main_draw_size`): para Gold/
  // Masters (24) e Elite/Crown (20) são 32 slots. A capacidade oficial do
  // tier (main_draw_size) fica intacta para a entrada/admissão da IA.
  const bracketSize = 2 ** roundCount;
  const diagnostics = {
    fieldOrigin: 'world-pairs-v526d', drawSize: bracketSize, mainDrawSize, roundCount,
    candidatePool: 0, eligiblePool: 0, preferredPool: 0, committedExcluded: 0, realSelected: 0, rescueSelected: 0,
    unrankedSelected: 0, qualifyingReal: 0, admissionMs: 0, buildMs: 0,
  };
  const empty = {
    entrants: [], pairsById: new Map(), mainOpponentIds: new Array(roundCount).fill(null),
    qualifyingOpponentIds: [], strengthByPairId: new Map(), rankByPairId: new Map(), pointsByPairId: new Map(), diagnostics,
  };
  if (!tournament?.id) return empty;

  const [allTournaments, rawAthletes, partnerships] = await Promise.all([
    entities.Tournament.list('start_date', 2000),
    entities.AthleteProfile.list('-world_ranking_points', ATHLETE_POPULATION_CAP),
    entities.Partnership.list('-created_date', 1200).catch(() => []),
  ]);
  const { pairSeedRank } = await createPairSeedRankResolver();

  const athletes = (rawAthletes || []).map(normalizeAthlete).filter((athlete) => !athlete.retired && athlete.career_status !== 'aposentado');
  const committed = committedPairIdsForWindow([tournament], allTournaments);
  const allPairs = buildCanonicalPairs(partnerships, athletes);
  const playerProfileId = profile?.id || null;
  const pool = allPairs.filter((pair) => {
    if (committed.has(pair.id)) return false;
    const memberIds = pair.athletes.map((athlete) => athlete?.id).filter(Boolean);
    if (partnerAthleteId && memberIds.includes(partnerAthleteId)) return false;
    // O jogador é PlayerProfile, nunca AthleteProfile — mas defesa em
    // profundidade: nenhuma dupla do mundo carrega a identidade do jogador.
    if (playerProfileId && memberIds.includes(playerProfileId)) return false;
    return true;
  });
  diagnostics.candidatePool = pool.length;
  diagnostics.committedExcluded = allPairs.length - pool.length;

  // ── ADMISSÃO (autoridade preservada, 5.18) ──────────────────────────────
  // A MESMA pergunta de elegibilidade que a IA faz (chooseTournament →
  // evaluateTournamentEntry com aiFieldContext) e a MESMA pontuação de corte
  // do ensureWorldTourDraws (blendedCutScore = pairScore · (0.35 + 0.65·tierFit/100)).
  // Nunca "top TeamRanking puro".
  const representativeOf = (pair) => {
    const pairRank = pairEntryRank(pair);
    return {
      ...pair.athletes[0],
      overall_rating: pair.athletes.reduce((sum, athlete) => sum + Number(athlete.overall_rating || athlete.overall || 50), 0) / pair.athletes.length,
      ...(pairRank > 0 ? { rank: pairRank, ranking_position: pairRank } : {}),
    };
  };
  const need = Math.max(0, bracketSize - 1);
  // Autoridade de admissão compartilhada com a IA (fieldAdmissionScore):
  // fraco-primeiro nos tiers abertos, blendedCutScore nos tiers com corte.
  const cutOf = (pair) => fieldAdmissionScore(pair, tournament);
  const orderField = (list) => [...list].sort((a, b) => cutOf(b) - cutOf(a) || String(a.id).localeCompare(String(b.id)));
  const isOpenTier = (getTournamentTierConfig(tournament.tier).minRanking || 0) === 0;

  // Paridade com o chooseTournament semanal da IA (dívida registrada na
  // 5.26-D): uma dupla só entra no field do jogador se, realisticamente,
  // ESCOLHERIA este torneio na semana — o torneio do jogador concorre com os
  // eventos da mesma janela, reusando a MESMA autoridade da IA.
  const weekTournaments = (() => {
    const start = tournament?.start_date;
    if (!start) return [tournament];
    const t0 = new Date(`${start}T00:00:00Z`).getTime();
    const same = (allTournaments || []).filter((t) => t?.id !== tournament.id && t?.start_date
      && Math.abs(new Date(`${t.start_date}T00:00:00Z`).getTime() - t0) <= 4 * 86400000);
    return [tournament, ...same];
  })();

  const eligiblePairs = [];
  const ineligiblePairs = [];
  const preferredPairs = [];
  for (const pair of pool) {
    const rep = representativeOf(pair);
    const entry = evaluateTournamentEntry(tournament, rep, { aiFieldContext: true });
    if (!entry.eligible) { ineligiblePairs.push(pair); continue; }
    eligiblePairs.push(pair);
    try {
      const choice = chooseTournament(weekTournaments, rep, {
        strategy: rep.careerStrategy, currentRegion: rep.currentRegion, aiFieldContext: true,
      });
      if (choice?.decision === 'play' && choice?.tournament?.id === tournament.id) preferredPairs.push(pair);
    } catch { /* preferência é best-effort; a elegibilidade já decidiu */ }
  }
  diagnostics.eligiblePool = eligiblePairs.length;
  diagnostics.preferredPool = preferredPairs.length;
  const primary = orderField(preferredPairs);
  const primaryIds = new Set(primary.map((pair) => pair.id));
  const secondary = orderField(eligiblePairs.filter((pair) => !primaryIds.has(pair.id)));
  const ordered = [...primary, ...secondary];
  // Bronze = banda mais fraca; Silver = a banda SEGUINTE (percentil 25% do
  // pool ordenado), para a escada Bronze < Silver existir de fato. Tiers com
  // corte mantêm o blendedCutScore (topo).
  // 5.27-I: a largura dessa janela vem do preset (`competition.silverFieldOffsetPct`);
  // sem `competition` (presets antigos) continua 25%.
  const silverOffsetPct = Number(getBalance527().competition?.silverFieldOffsetPct ?? 0.25);
  const openTierOffset = isOpenTier && tournament.tier === 'Silver'
    ? Math.max(need, Math.round(ordered.length * silverOffsetPct))
    : 0;
  const selected = ordered.slice(openTierOffset, openTierOffset + need);
  // Se o deslocamento da banda deixou o quadro curto, completa com o restante
  // ordenado (nunca repete dupla).
  if (selected.length < need) {
    const usedIds = new Set(selected.map((pair) => pair.id));
    for (const pair of ordered) {
      if (selected.length >= need) break;
      if (!usedIds.has(pair.id)) { selected.push(pair); usedIds.add(pair.id); }
    }
  }
  // Resgate (mesma autoridade da IA, só quando o pool elegível não cobre o
  // quadro): candidatos por adequação ao tier, nunca elite aleatória.
  if (selected.length < need) {
    const usedIds = new Set(selected.map((pair) => pair.id));
    const rescue = rankCandidatesByTierFit(ineligiblePairs.filter((pair) => !usedIds.has(pair.id)), tournament)
      .slice(0, need - selected.length);
    diagnostics.rescueSelected = rescue.length;
    selected.push(...rescue);
  }
  diagnostics.realSelected = selected.length;
  diagnostics.admissionMs = nowMs() - startedAt;
  // 5.27-I — só harness (nunca setado pelo app): observa o campo montado
  // (composição por OVR/rank/fit/força) sem alterar nada.
  if (typeof globalThis.__PL527I_FIELD_OBSERVER === 'function') {
    try {
      globalThis.__PL527I_FIELD_OBSERVER({
        tournamentId: tournament.id, tier: tournament.tier, startDate: tournament.start_date, need,
        orderedSize: ordered.length, preferredSize: primary.length, eligibleSize: eligiblePairs.length, offset: openTierOffset, rescue: diagnostics.rescueSelected,
        field: selected.map((pair) => ({
          ovr: pair.athletes.reduce((sum, athlete) => sum + Number(athlete.overall_rating || athlete.overall || 50), 0) / pair.athletes.length,
          rank: pairEntryRank(pair) || null, fit: getTierRankingFit(tournament.tier, pairEntryRank(pair)), strength: pairScore(pair, tournament), preferred: primaryIds.has(pair.id),
        })),
      });
    } catch { /* diagnóstico nunca interfere */ }
  }

  const pairsById = new Map();
  const strengthByPairId = new Map();
  const rankByPairId = new Map();
  const pointsByPairId = new Map();
  const registerPair = (pair) => {
    if (!pair || pairsById.has(pair.id)) return;
    const strength = pairScore(pair, tournament);
    const rank = pairSeedRank(pair) || 0;
    pair.strength = strength;
    pair.seedRank = rank;
    pairsById.set(pair.id, pair);
    strengthByPairId.set(pair.id, strength);
    rankByPairId.set(pair.id, rank);
    if (!(rank > 0)) diagnostics.unrankedSelected += 1;
    pointsByPairId.set(pair.id, pair.athletes.reduce(
      (sum, athlete) => sum + Math.max(0, Number(athlete?.world_ranking_points ?? athlete?.ranking_points) || 0), 0));
  };
  selected.forEach(registerPair);

  // Qualifying REAL (fora do main field): as duplas elegíveis mais fracas —
  // o caminho de qualifying do jogador também usa identidade/rank/OVR reais.
  // Nenhuma dupla do main field é reaproveitada.
  const qualifyingOpponentIds = [];
  if (qualifyingRoundCount > 0) {
    const mainIds = new Set(selected.map((pair) => pair.id));
    // Qualifying = as duplas MAIS FRACAS por posição (pior rank primeiro),
    // nunca por blendedCutScore (que desconta elite e devolveria um top-5).
    const qualifyingPool = [...eligiblePairs]
      .filter((pair) => !mainIds.has(pair.id))
      .sort((a, b) => {
        const ra = pairEntryRank(a) > 0 ? pairEntryRank(a) : Number.MAX_SAFE_INTEGER;
        const rb = pairEntryRank(b) > 0 ? pairEntryRank(b) : Number.MAX_SAFE_INTEGER;
        return rb - ra;
      });
    for (let index = 0; index < qualifyingRoundCount && index < qualifyingPool.length; index += 1) {
      registerPair(qualifyingPool[index]);
      qualifyingOpponentIds.push(qualifyingPool[index].id);
    }
  }
  diagnostics.qualifyingReal = qualifyingOpponentIds.length;

  // ── PROJEÇÃO DO CAMINHO DO JOGADOR ──────────────────────────────────────
  const effectivePlayerRank = Number(playerRank) > 0
    ? Math.min(Math.round(Number(playerRank)), Math.max(1, bracketSize))
    : Math.max(1, Math.min(bracketSize - 1, Math.round(bracketSize * 0.75)));
  const playerEntrant = {
    id: `__player__:${playerProfileId || 'career'}`, name: playerTeamName,
    seedRank: effectivePlayerRank, strength: 0, isPlayer: true,
  };
  const { slots } = buildSeededDrawSlots({
    entrants: [...selected, playerEntrant], tournamentId: `${tournament.id}:player-field`,
  });
  const playerSlot = slots.findIndex((entrant) => entrant?.isPlayer);
  const mainOpponentIds = new Array(roundCount).fill(null);
  const usedOpponentPairIds = new Set();
  if (playerSlot >= 0) {
    for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
      const blockSize = 2 ** roundIndex;
      const blockStart = Math.floor(playerSlot / blockSize) * blockSize;
      const siblingStart = (Math.floor(blockStart / blockSize) % 2 === 0) ? blockStart + blockSize : blockStart - blockSize;
      const sibling = slots.slice(siblingStart, siblingStart + blockSize).filter((entrant) => entrant && !entrant.isPlayer);
      if (!sibling.length) continue;
      const seedOf = (entrant) => (Number(entrant.seedRank) > 0 ? Number(entrant.seedRank) : Number.POSITIVE_INFINITY);
      const ranked = [...sibling].sort((a, b) => seedOf(a) - seedOf(b));
      // Nunca repetir a MESMA dupla em duas rodadas do caminho do jogador
      // (a projeção por bloco-espelho poderia devolver o vencedor anterior).
      const chosen = ranked.find((entrant) => !usedOpponentPairIds.has(entrant.id)) || ranked[0];
      if (pairsById.has(chosen.id)) {
        mainOpponentIds[roundIndex] = chosen.id;
        usedOpponentPairIds.add(chosen.id);
      }
    }
  }
  diagnostics.buildMs = nowMs() - startedAt;
  return { entrants: selected, pairsById, mainOpponentIds, qualifyingOpponentIds, strengthByPairId, rankByPairId, pointsByPairId, diagnostics };
}

function appendFinalHeadToHead(headToHeadByAthlete, winner, loser, tournament) {
  if (!winner || !loser) return;
  const date = tournamentEndDate(tournament);
  for (const athlete of winner.athletes) {
    let rows = headToHeadByAthlete.get(athlete.id) || athlete.head_to_head || [];
    for (const opponent of loser.athletes) rows = addHeadToHead(rows, opponent, true, tournament.id, date);
    headToHeadByAthlete.set(athlete.id, rows);
  }
  for (const athlete of loser.athletes) {
    let rows = headToHeadByAthlete.get(athlete.id) || athlete.head_to_head || [];
    for (const opponent of winner.athletes) rows = addHeadToHead(rows, opponent, false, tournament.id, date);
    headToHeadByAthlete.set(athlete.id, rows);
  }
}

export async function resolveCompletedWorldTourEvents(careerDate) {
  const [allTournaments, rawAthletes, partnerships, playerRegistrations] = await Promise.all([
    // Ordenação ASCENDENTE de propósito. Com '-start_date' a consulta trazia
    // os torneios mais FUTUROS primeiro e truncava no limite — exatamente ao
    // contrário do que esta função precisa, que é o passado já encerrado e
    // ainda não resolvido. Enquanto o calendário coube no limite isso era
    // inofensivo (por isso o harness, que roda 1 temporada, nunca reproduziu),
    // mas `ensureFutureTournaments` mantém 15 meses à frente e o total cresce
    // a cada avanço: passado do limite, os eventos vencidos são os PRIMEIROS a
    // sair da janela e deixam de ser resolvidos para sempre — sem campeão,
    // sem notícia, sem pontos de ranking. Mesma classe do achado #32.
    entities.Tournament.list('start_date', 2000),
    entities.AthleteProfile.list('-world_ranking_points', ATHLETE_POPULATION_CAP),
    entities.Partnership.list('-created_date', 1200).catch(() => []),
    entities.TournamentRegistration.list('-created_date', 2000).catch(() => []),
  ]);

  // Playthrough 5.19, Partes V/W/Z — EVENTO DO JOGADOR CONTAMINAVA OS PARALELOS.
  //
  // `isWorldTourResolutionPending` só exclui o torneio do jogador quando existe
  // CHAVE CANÔNICA (`bracketReady && (player_participated || player_match)`).
  // Sem sorteio executado — por exemplo quando o jogador se lesiona e o evento
  // vai a W.O., ou durante "avançar até recuperação" — a exclusão não se
  // aplica: o torneio do jogador cai nesta fila AI-only, entra em
  // `tournamentsByWeek` e é passado a `assignPairsForWeek` JUNTO com os eventos
  // paralelos. As duplas de IA que o escolhem são alocadas nele e desaparecem
  // dos demais, que então cancelam por "duplas insuficientes".
  //
  // Medido (test-player-wo-does-not-cancel-ai-events-v519): com o evento do
  // jogador na mesma semana, 12 duplas eram consumidas por ele e três eventos
  // paralelos perdiam campo (48->38, 16->15, 17->16).
  //
  // É também por isso que nenhuma simulação 5.17/5.18 reproduziu o sintoma: o
  // harness não tem jogador inscrito, então `playerTournamentIds` era vazio.
  //
  // A autoridade sobre "este evento é do jogador" é a INSCRIÇÃO, nunca o estado
  // da chave — mesma fonte que `ensureWorldTourDraws` já usa. Nada de mexer em
  // `minViableDraw` nem em tamanho de campo (Parte AB).
  const playerTournamentIds = new Set((playerRegistrations || [])
    .filter((row) => {
      const status = String(row?.status || '').toLowerCase();
      return row?.tournament_id && !['cancelled', 'cancelado', 'withdrawn'].includes(status);
    })
    .map((row) => row.tournament_id));

  const pending = (allTournaments || []).filter((tournament) => (
    !playerTournamentIds.has(tournament.id) && isWorldTourResolutionPending(tournament, careerDate)
  ));
  if (!pending.length) return { resolved: 0, tournaments: [], rankingUpdates: 0, news: 0 };

  const athletes = (rawAthletes || []).map(normalizeAthlete).filter((athlete) => !athlete.retired && athlete.career_status !== 'aposentado');
  const pairs = buildCanonicalPairs(partnerships, athletes);
  // Playthrough 5.4, Parte F/M — usados pra recreditar o campo REALMENTE
  // sorteado (`tournament.draw_pair_ids`) em vez de reconfiar só no `pairs`
  // recém-recomputado (ver resolveDrawnPair, acima).
  const athleteById = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  const partnershipById = new Map((partnerships || []).map((partnership) => [partnership.id, partnership]));
  const pairsById = new Map(pairs.map((pair) => [pair.id, pair]));
  if (!pairs.length) {
    // Aborto silencioso: se o mundo ficar sem duplas canônicas, NENHUM torneio
    // é resolvido — sem campeão, notícia, rivalidade ou ponto de ranking — e
    // nada na tela indica que o circuito parou. `simulatePastTournaments`
    // também não cobre esses eventos (ignora `world_tour_event` de propósito),
    // então o estado é permanente. Medido como não reproduzível em harness
    // (resolve 115/115 torneios mesmo com zero duplas procedurais semeadas),
    // mas o caminho existe — e sem este aviso ele é invisível no diagnóstico.
    console.warn('[WorldTour] nenhuma dupla canônica disponível — nenhum torneio será resolvido nesta chamada.', {
      pendentes: pending.length, atletas: athletes.length, parcerias: (partnerships || []).length,
    });
    // Playthrough 4.5A, item 2 — Race watch mesmo no aborto: distingue
    // "seeding nunca pareou este atleta" (ai_partner_id null) de "pareado
    // mas buildCanonicalPairs ainda assim não formou nenhum par" (sinal de
    // um bug estrutural mais grave, não coberto pela hipótese de seeding).
    const athleteByBotIdAbort = new Map(athletes.map((athlete) => [athlete.bot_id, athlete]));
    const raceWatchAbort = ['real_arturo_coello', 'real_agustin_tapia', 'real_alejandro_galan', 'real_federico_chingotto']
      .map((botId) => {
        const athlete = athleteByBotIdAbort.get(botId);
        return athlete
          ? { bot_id: botId, found_in_population: true, athlete_id: athlete.id, ai_partner_id: athlete.ai_partner_id || null, canonical_pair_formed: false }
          : { bot_id: botId, found_in_population: false };
      });
    return {
      resolved: 0, tournaments: [], rankingUpdates: 0, news: 0, waitingForCanonicalPairs: true,
      canonicalPairsFound: 0, athletesConsidered: athletes.length, raceWatch: raceWatchAbort, tournamentDiagnostics: [],
    };
  }
  // Fase 7.4 — janela de prioridade persistida em Partnership (ver
  // buildCanonicalPairs); grava só quem mudou nesta chamada, comparando
  // contra o valor lido no início.
  const priorityWindowInitialByPairId = new Map(pairs.map((pair) => [pair.id, pair.priorityWindowRemaining]));

  const tournamentsByWeek = new Map();
  pending.forEach((tournament) => {
    const key = `${tournament.year || tournament.start_date?.slice(0, 4)}:${tournament.week || tournament.start_date}`;
    if (!tournamentsByWeek.has(key)) tournamentsByWeek.set(key, []);
    tournamentsByWeek.get(key).push(tournament);
  });

  const athletePoints = new Map();
  const athleteOutcomes = new Map();
  // Playthrough 5.17, Parte J — acumulador do ledger REAL de dupla.
  const pairLedger = new Map();
  const headToHeadByAthlete = new Map();
  const tournamentUpdates = [];
  const news = [];
  // Playthrough 4.5A, item 1 — diagnóstico factual por torneio (não o save
  // inteiro): id/nome/settlement iniciado/participantes/campeão/vice/
  // WorldEvent criado — o suficiente para localizar exatamente onde um
  // torneio específico perde pontos de Race, sem depender de inferência
  // visual no app real. Consumido por src/dev/worldTourDiagnostics.js.
  const tournamentDiagnostics = [];

  // Um torneio com dado corrompido não pode travar a resolução do dia
  // inteiro. Cada SEMANA é resolvida isoladamente: se uma falhar, o erro é
  // registrado (com os ids envolvidos) e as demais seguem normalmente, em vez
  // de a exceção subir e zerar tudo — que é como o circuito conseguia parar
  // de registrar campeões sem nada aparecer na tela.
  const resolutionErrors = [];
  for (const [weekKey, weekTournaments] of tournamentsByWeek.entries()) {
   try {
    const assignments = await applyFinalsEntryAuthority(weekTournaments, pairs, assignPairsForWeek(weekTournaments, pairs));

    for (const tournament of weekTournaments) {
      // Achado #16b da auditoria, corrigido na Fase 3: lia
      // `tournament.draw_size`, um campo que NUNCA existiu (produção grava
      // `main_draw_size`) — o fallback de 32 fazia qualquer tier com chave
      // real >32 (Masters/Elite/Crown na escada antiga, 64) nunca preencher
      // mais que a metade. A nova escada (3A) não tem mais tier acima de
      // 32, mas o campo errado continuava errado independente disso — lê
      // `main_draw_size` (com o tamanho da config como respaldo, nunca um
      // teto arbitrário).
      const config = getTournamentTierConfig(tournament?.tier);
      const drawSize = Math.max(2, Number(tournament.main_draw_size) || config.mainDrawSize || 16);
      // Playthrough 5.4, Parte F/M — um torneio que JÁ foi sorteado (D-3,
      // bracket_history existe) tem sua resposta pra "quem joga" definida —
      // não recalculada de novo aqui. Recalcular do zero via
      // assignPairsForWeek/chooseTournament (o `assignments` desta semana)
      // usa o estado ATUAL de rank/região, que já pode ter mudado desde o
      // sorteio (outros torneios da mesma semana resolvendo em paralelo) —
      // sem NENHUMA troca de parceiro, isso bastava pra `chooseTournament`
      // preferir outro torneio na nova chamada e a dupla sorteada sumir do
      // campo, perdendo o crédito de um torneio que o bracket_history
      // salvo comprova que ela jogou (achado desta fase: 73% das
      // aparições não-campeãs numa temporada real). `assignments` continua
      // servindo os torneios que AINDA não têm chave (ver hadCanonicalDraw
      // abaixo).
      const hadCanonicalDraw = Number(tournament.bracket_schema_version) >= 2 && Array.isArray(tournament.bracket_history);
      let entrants = hadCanonicalDraw
        ? (tournament.draw_pair_ids || []).map((pairId) => resolveDrawnPair(pairId, partnershipById, athleteById, pairsById)).filter(Boolean)
        : [...(assignments.get(tournament.id) || [])];
      // Fase 5.3, itens 1 e 2 — o preenchimento de reserva que completava
      // a chave até `drawSize` foi REMOVIDO. O campo agora é exatamente
      // quem ESCOLHEU o torneio (`chooseTournament`, que já filtra por
      // elegibilidade). Quando os inscritos não enchem a chave, ela roda
      // menor — informação honesta sobre o estado do circuito, não
      // defeito a mascarar (desenho aprovado da Fase 5.2, item 3.3b:
      // "roda com quem se inscreveu ... sem preenchimento").
      //
      // Isso zera por construção o vazamento do achado da Fase 5.2 (item
      // 1 do pedido): o ramo antigo `usingBelowCutoffFallback` recorria a
      // `pairs` inteiro sem filtro de elegibilidade, ordenado por
      // `pairScore` — reconvidava as duplas mais FORTES disponíveis,
      // exatamente a elite que o teto (`OPEN_TIER_CEILING`) tinha acabado
      // de barrar (Coello/Tapia, rank 2, entrando em Bronze — 176 eventos
      // em teto=800). Sem preenchimento, não há porta dos fundos: nenhuma
      // dupla barrada pelo teto volta, e "inverter o critério" do
      // preenchimento (item 1.1) fica sem objeto — não há mais critério.
      // Abaixo de `minViableDraw` inscritos o torneio não acontece (item 2).
      // Fase 5.1, item 1 — desenhado só pros tiers de acesso livre
      // (Bronze/Silver, `minRanking:0`), na premissa de que tiers com
      // corte de ranking próprio já controlavam demanda pela
      // elegibilidade. Premissa refutada pela Fase 6.4: elegibilidade
      // decide QUEM PODE tentar um tier, não QUANTOS CABEM na chave — Gold
      // (corte 450, ~metade da população elegível) cortava 79% de quem
      // escolhia jogar, sem fila, o mesmo `sort+slice` que a Fase 4.3
      // (achado #29, Bronze/Silver, 92 decisões de jogar/0 pontos) já
      // tinha diagnosticado num contexto diferente. Fase 6.5, item 2 —
      // generalizada pra qualquer tier oversubscrito, não só os de acesso
      // livre; nenhuma outra regra de elegibilidade muda (quem PODE
      // escolher o tier continua exatamente como antes). Decide QUEM
      // ENTRA antes de decidir QUEM VENCE (a linha de baixo, inalterada,
      // continua ordenando por pairScore/skill — só entre quem já
      // entrou).
      if (entrants.length > drawSize) {
        entrants = applyEntryPriority(entrants, tournament, drawSize, true);
      }
      const ordered = entrants
        .sort((a, b) => pairScore(b, tournament) - pairScore(a, tournament))
        .slice(0, drawSize);
      // Fase 5.3, item 2 — campo pequeno demais não vira torneio. Marca
      // resolvido + cancelado (sai da fila de pendentes), sem campeão e
      // sem distribuir pontos. Antes o gatilho era `< 2` — qualquer par
      // de duplas já "resolvia" o evento com o preenchimento forçado.
      const belowMinViable = ordered.length < minViableDraw(drawSize);
      if (belowMinViable) {
        tournamentUpdates.push({
          id: tournament.id,
          status: 'cancelado',
          current_phase: 'cancelado',
          world_tour_resolved: true,
          world_tour_cancelled: true,
          cancellation_reason: 'inscritos_insuficientes',
          resolved_at: careerDate,
          simulated_entrants: ordered.length,
        });
        news.push({
          event_type: 'tournament_cancelled',
          title: `${tournament.name} cancelado por falta de inscritos`,
          content: `O ${tournament.name} foi encerrado sem chave competitiva porque recebeu ${ordered.length} dupla(s), abaixo do mínimo viável.`,
          author_name: 'Redação Padel Legacy World Tour',
          tier: String(tournament.tier || 'normal').toLowerCase(),
          event_date: tournamentEndDate(tournament),
          tags: ['world-tour', 'torneio', 'cancelamento'],
          related_tournament_id: tournament.id,
        });
        tournamentDiagnostics.push({
          tournament_id: tournament.id, tournament_name: tournament.name, tier: tournament.tier,
          bracket_schema_version: Number(tournament.bracket_schema_version) || null,
          settlement_started: true, cancelled: true, entrants_found: ordered.length,
          canonical_pairs_found: pairs.length, champion: null, runner_up: null,
          world_event_created: true, athlete_ranking_results_created: 0,
        });
        continue;
      }
      // Fase 7.4 — cada aparição EFETIVA num torneio que rodou (não
      // cancelado) desconta 1 da janela de prioridade, independente de
      // ter sido a janela a garantir a entrada ou não.
      for (const pair of ordered) {
        if (pair.priorityWindowRemaining > 0) pair.priorityWindowRemaining -= 1;
      }
      // Item 2C — este ramo só deveria ser alcançado por saves antigos ou
      // por uma falha genuinamente excepcional do D-3 (a cancelação
      // explícita em ensureWorldTourDraws, acima, cobre o caso comum —
      // Cidade do Cabo). Nunca finge que a chave existia desde o sorteio:
      // `bracket_origin` preserva a origem/data real da recuperação, visível
      // no próprio Tournament, em vez de uma chave indistinguível de uma
      // sorteada a tempo.
      if (!hadCanonicalDraw) {
        console.warn('[WorldTour] recuperação de chave no settlement — torneio nunca recebeu sorteio no D-3.', {
          tournamentId: tournament.id, tournamentName: tournament.name, careerDate,
        });
      }
      const bracket = hadCanonicalDraw
        ? { ...deriveTournamentFactsFromFullBracket(tournament.bracket_history), bracket_history: tournament.bracket_history }
        : buildCanonicalTournamentBracket({
          tournamentId: tournament.id,
          date: tournamentEndDate(tournament),
          // Playthrough 5.16, Parte Z — o caminho de RECUPERAÇÃO (torneio que
          // nunca recebeu sorteio no D-3) precisa da mesma autoridade de
          // seed do caminho normal; senão a chave de recuperação voltaria a
          // ordenar cabeças de chave só por força.
          participants: ordered.map((pair) => ({
            name: pair.name,
            strength: pairScore(pair, tournament),
            seedRank: pairEntryRank(pair),
          })),
        });
      const settlement = finalizeTournamentFromBracket({ tournament, bracket, date: careerDate });
      if (!hadCanonicalDraw && !settlement.idempotent) {
        settlement.patch.bracket_origin = 'retroactive-recovery';
        settlement.patch.bracket_recovery_date = careerDate;
      }
      const champion = ordered.find((pair) => pair.name === settlement.result.champion) || ordered[0];
      const runnerUp = ordered.find((pair) => pair.name === settlement.result.runner_up) || ordered[1];
      const placementByTeam = new Map(settlement.result.placements.map((placement) => [placement.team, placement.position]));

      ordered.forEach((pair, index) => {
        const position = Math.max(1, Number(placementByTeam.get(pair.name) || index + 1));
        const { finish, points, wins: finishWins } = resolveFinish(tournament, position - 1, ordered.length);
        // Playthrough 5.17, Parte J — LEDGER REAL DA DUPLA.
        //
        // Até aqui, `matches_played/wins/losses` do TeamRanking eram uma
        // ESTIMATIVA derivada dos contadores INDIVIDUAIS dos dois membros
        // (min das vitórias de A e B) — o próprio circuitLifecycle
        // documentava isso. Era por isso que a tela mostrava "0V · 0D" em
        // duplas com milhares de pontos: os pontos vinham de um caminho
        // real, as partidas de outro, derivado e frequentemente zero.
        //
        // Este ponto é o único lugar onde o resultado REAL da dupla existe:
        // quantas partidas ela venceu (`finishWins`) e se caiu (`finish`).
        // A partir daqui os contadores são fato, incrementado por evento.
        const ledgerIds = pair.athletes.map((member) => member.id).filter(Boolean).sort();
        if (ledgerIds.length === 2) {
          const ledgerKey = ledgerIds.join('_');
          const entry = pairLedger.get(ledgerKey) || { wins: 0, losses: 0, titles: 0, events: 0, ids: ledgerIds };
          entry.wins += Number(finishWins) || 0;
          // Uma dupla que não foi campeã perdeu exatamente uma partida no
          // evento (eliminação simples). A campeã não perde nenhuma.
          entry.losses += finish === 'champion' ? 0 : 1;
          entry.titles += finish === 'champion' ? 1 : 0;
          entry.events += 1;
          pairLedger.set(ledgerKey, entry);
        }
        pair.athletes.forEach((athlete) => {
          athletePoints.set(athlete.id, (athletePoints.get(athlete.id) || 0) + points);
          if (!athleteOutcomes.has(athlete.id)) athleteOutcomes.set(athlete.id, []);
          athleteOutcomes.get(athlete.id).push({
            tournament_id: tournament.id,
            tournament_name: tournament.name,
            tier: tournament.tier,
            date: tournamentEndDate(tournament),
            finish,
            points,
            wins: finishWins,
            won: finish === 'champion',
            partnership_id: pair.partnershipId,
            partner_id: pair.athletes.find((member) => member.id !== athlete.id)?.id,
            pair_name: pair.name,
          });
        });
      });

      appendFinalHeadToHead(headToHeadByAthlete, champion, runnerUp, tournament);
      tournamentUpdates.push({
        id: tournament.id,
        bracket_schema_version: 2,
        ...settlement.patch,
        // Fase 3, item 3E.3 — achado #21 registrava a referência órfã
        // (champion_partnership_id/runner_up_partnership_id sobrevivem à
        // poda de 24 meses de Partnership só por uma carência generosa, não
        // por garantia estrutural). Escolha aqui: DENORMALIZAR os ids/nomes
        // individuais dos dois atletas de cada dupla no PRÓPRIO Tournament
        // — mesmo padrão que WorldEvent.title já usa pra história
        // permanente — em vez de a poda checar referências antes de
        // remover. Checar-antes-de-remover reintroduziria exatamente o
        // padrão "nunca remove de verdade" que motivou a fase inteira (uma
        // Partnership premiada em vários torneios, ou um Tournament nunca
        // podado, bloquearia a exclusão indefinidamente). Com a
        // denormalização, `champion_partnership_id`/`runner_up_partnership_id`
        // viram best-effort — úteis enquanto a Partnership ainda existe,
        // seguros como referência pendurada (dangling) depois que a poda
        // remover — nenhum consumidor mais PRECISA deles pra saber quem
        // venceu ou classificar reais-vs-bots.
        champion_athlete_ids: champion.athletes.map((athlete) => athlete.id),
        champion_athlete_names: champion.athletes.map((athlete) => athlete.name),
        runner_up_athlete_ids: runnerUp.athletes.map((athlete) => athlete.id),
        runner_up_athlete_names: runnerUp.athletes.map((athlete) => athlete.name),
        champion_partnership_id: champion.partnershipId,
        runner_up_partnership_id: runnerUp.partnershipId,
        simulated_entrants: ordered.length,
      });

      news.push({
        event_type: 'tournament_result',
        title: `${champion.name} conquista o ${tournament.name}`,
        content: `${champion.name} venceu ${runnerUp.name} na final e levantou o troféu do ${tournament.name}, em ${tournament.location || tournament.city || 'uma etapa do World Tour'}.`,
        author_name: 'Redação Padel Legacy World Tour',
        related_players: [...champion.athletes, ...runnerUp.athletes].map((athlete) => athlete.name),
        tier: String(tournament.tier || 'normal').toLowerCase(),
        event_date: tournamentEndDate(tournament),
        likes: 150 + (hash(tournament.id) % 4850),
        tags: ['world-tour', 'resultado', String(tournament.tier || '').toLowerCase()],
        related_tournament_id: tournament.id,
      });
      tournamentDiagnostics.push({
        tournament_id: tournament.id, tournament_name: tournament.name, tier: tournament.tier,
        bracket_schema_version: Number(tournament.bracket_schema_version) || null,
        settlement_started: true, cancelled: false, entrants_found: ordered.length,
        canonical_pairs_found: pairs.length,
        athlete_ids_involved: ordered.flatMap((pair) => pair.athletes.map((athlete) => athlete.id)).slice(0, 40),
        champion: champion.name, champion_athlete_ids: champion.athletes.map((athlete) => athlete.id),
        runner_up: runnerUp.name, world_event_created: true,
        athlete_ranking_results_created: ordered.length * 2,
      });

      ordered.slice(0, 8).flatMap((pair) => pair.athletes).forEach((athlete) => { athlete.currentRegion = eventRegion(tournament); });
    }
   } catch (error) {
    resolutionErrors.push({
      week: weekKey,
      tournamentIds: weekTournaments.map((tournament) => tournament.id),
      tournamentNames: weekTournaments.map((tournament) => tournament.name),
      message: error?.message || String(error),
      stack: String(error?.stack || '').split('\n').slice(0, 5).join(' | '),
    });
    console.error('[WorldTour] semana não resolvida, seguindo para as demais:', weekKey, error);
   }
  }

  // Fase 4 (ranking rolling de 52 semanas): world_ranking_points deixa de
  // ser um acumulador vitalício (`oldGeneral + gain`) — cada resultado vira
  // uma linha datada própria, nunca no documento clonado a cada escrita
  // (mesmo motivo do ranking_history na Fase 4.0), e o total é a soma dos
  // 22 melhores dentro dos últimos 364 dias. Leitura ÚNICA de toda a
  // coleção aqui (não uma por atleta tocado) — mesmo padrão de "1 leitura,
  // N gravações" já usado pro resto desta função.
  const existingResultRows = (await entities[RANKING_RESULT_ENTITY].list(null, RANKING_RESULT_POPULATION_CAP)) || [];
  const resultsByAthlete = groupResultsByAthlete(existingResultRows);
  const newResultRows = [];

  const athleteUpdates = athletes.filter((athlete) => athletePoints.has(athlete.id)).map((athlete) => {
    const outcomes = athleteOutcomes.get(athlete.id) || [];
    const priorRows = resultsByAthlete.get(athlete.id) || [];
    // Migração (rankingWindow.js:buildLegacySeedRow): só dispara na
    // primeira vez que este atleta específico é tocado depois da Fase 4 —
    // idempotente, porque a partir daí ele sempre tem ao menos uma linha.
    const legacySeed = needsLegacySeed(priorRows, athlete.world_ranking_points ?? athlete.ranking_points)
      ? buildLegacySeedRow(athlete.id, athlete.world_ranking_points ?? athlete.ranking_points, careerDate)
      : null;
    const freshRows = outcomes.map((outcome) => ({
      id: `${athlete.id}:${outcome.tournament_id}`,
      athlete_id: athlete.id,
      tournament_id: outcome.tournament_id,
      tournament_name: outcome.tournament_name,
      tier: outcome.tier,
      date: outcome.date,
      points: outcome.points,
      finish: outcome.finish,
    }));
    if (legacySeed) newResultRows.push(legacySeed);
    newResultRows.push(...freshRows);
    const points = computeRollingPoints(priorRows, legacySeed ? [legacySeed, ...freshRows] : freshRows, careerDate);
    // Correção UI/cronologia — Fase 3: race_points é a temporada (Race) EM
    // ANDAMENTO, separada do Circuito acumulado acima. Reaproveita o mesmo
    // ganho de pontos já calculado (athletePoints) em vez de recalcular —
    // cresce junto com o Circuito conforme torneios reais são disputados,
    // mas é zerada isoladamente na virada do ano (ver annualCareerReportLifecycle.js).
    // Fase 4A.3: Race não entra na janela rolling — continua um acumulador
    // simples dentro do ano civil, sem mudança nesta fase.
    const racePoints = Math.max(0, Number(athlete.race_points) || 0) + athletePoints.get(athlete.id);
    // Fase 2.6, item 3: títulos por tier, pra linha-resumo de aposentadoria
    // (AthleteCareerLegacy) — reaproveita os outcomes já calculados acima,
    // nenhuma consulta nova. career_titles (total) continua existindo,
    // sem mudança de forma.
    const titlesByTier = { ...(athlete.career_titles_by_tier || {}) };
    for (const outcome of outcomes) {
      if (outcome.finish !== 'champion' || !outcome.tier) continue;
      titlesByTier[outcome.tier] = (titlesByTier[outcome.tier] || 0) + 1;
    }
    return {
      id: athlete.id,
      world_ranking_points: points,
      ranking_points: points,
      race_points: racePoints,
      current_region: athlete.currentRegion,
      tournaments_played: Number(athlete.tournaments_played || 0) + outcomes.length,
      career_wins: Number(athlete.career_wins || 0) + outcomes.reduce((sum, item) => sum + Number(item.wins || 0), 0),
      career_losses: Number(athlete.career_losses || 0) + outcomes.filter((item) => item.finish !== 'champion').length,
      career_titles: Number(athlete.career_titles || 0) + outcomes.filter((item) => item.finish === 'champion').length,
      career_titles_by_tier: titlesByTier,
      recent_results: [...(Array.isArray(athlete.recent_results) ? athlete.recent_results : []), ...outcomes].slice(-12),
      ...(headToHeadByAthlete.has(athlete.id) ? { head_to_head: headToHeadByAthlete.get(athlete.id) } : {}),
    };
  });

  if (tournamentUpdates.length) await entities.Tournament.bulkUpdate(tournamentUpdates);
  if (athleteUpdates.length) await entities.AthleteProfile.bulkUpdate(athleteUpdates);
  if (news.length) await entities.WorldEvent.bulkCreate(news);

  // Playthrough 5.17, Parte J — grava o ledger da dupla como INCREMENTO
  // sobre a linha canônica de TeamRanking.
  //
  // Incremento, não substituição: cada evento resolvido soma o que a dupla
  // realmente fez. `stats_source: 'ledger'` marca a linha como fato medido,
  // distinguindo-a das linhas antigas cujo histórico não existe e que a UI
  // deve mostrar como indisponível em vez de "0V · 0D".
  if (pairLedger.size) {
    try {
      const rows = await entities.TeamRanking.list(null, 5000).catch(() => []);
      const rowByKey = new Map();
      for (const row of rows || []) {
        const key = [row.player1_id, row.player2_id].filter(Boolean).sort().join('_');
        if (key && !rowByKey.has(key)) rowByKey.set(key, row);
      }
      const ledgerUpdates = [];
      for (const [key, entry] of pairLedger.entries()) {
        const row = rowByKey.get(key);
        if (!row?.id) continue;
        const priorLedger = row.stats_source === 'ledger';
        const wins = (priorLedger ? Number(row.wins) || 0 : 0) + entry.wins;
        const losses = (priorLedger ? Number(row.losses) || 0 : 0) + entry.losses;
        const titles = (priorLedger ? Number(row.ledger_titles) || 0 : 0) + entry.titles;
        ledgerUpdates.push({
          id: row.id,
          wins,
          losses,
          matches_played: wins + losses,
          ledger_titles: titles,
          ledger_events: (priorLedger ? Number(row.ledger_events) || 0 : 0) + entry.events,
          stats_source: 'ledger',
        });
      }
      if (ledgerUpdates.length && entities.TeamRanking.bulkUpdate) {
        await entities.TeamRanking.bulkUpdate(ledgerUpdates);
      } else {
        for (const update of ledgerUpdates) {
          const { id, ...data } = update;
          await entities.TeamRanking.update(id, data).catch(() => {});
        }
      }
    } catch (error) {
      console.warn('[WorldTour] ledger de dupla não gravado:', error?.message || error);
    }
  }

  // Playthrough 4.5A, item 1/4/5 — Race watch dos 4 pares reais mais visíveis
  // do circuito (exatamente os nomes citados no relato: Coello/Tapia/
  // Galán/Chingotto). `athletes` é o snapshot LIDO no início desta chamada
  // (antes de qualquer escrita) — `race_points_before` vem dali;
  // `race_points_after` vem do PATCH que acabou de ser gravado acima
  // (`athleteUpdates`), sem I/O extra. `canonical_pair_formed` prova ou
  // refuta a hipótese de buildCanonicalPairs (item 2): se `ai_partner_id`
  // existe mas `canonical_pair_formed` é false, o problema está em
  // buildCanonicalPairs; se `ai_partner_id` é null, o problema é anterior —
  // a semeadura (ensureWorldSeed2025/verifySaveFoundation) nunca pareou
  // este atleta.
  const RACE_WATCHLIST = [
    { botId: 'real_arturo_coello', label: 'Coello' },
    { botId: 'real_agustin_tapia', label: 'Tapia' },
    { botId: 'real_alejandro_galan', label: 'Galán' },
    { botId: 'real_federico_chingotto', label: 'Chingotto' },
  ];
  const athleteByBotId = new Map(athletes.map((athlete) => [athlete.bot_id, athlete]));
  const updateById = new Map(athleteUpdates.map((update) => [update.id, update]));
  const pairedAthleteIds = new Set(pairs.flatMap((pair) => pair.athletes.map((athlete) => athlete.id)));
  const raceWatch = RACE_WATCHLIST.map(({ botId, label }) => {
    const athlete = athleteByBotId.get(botId);
    if (!athlete) return { bot_id: botId, label, found_in_population: false };
    const update = updateById.get(athlete.id);
    return {
      bot_id: botId, label, athlete_id: athlete.id, found_in_population: true,
      ai_partner_id: athlete.ai_partner_id || null,
      canonical_pair_formed: pairedAthleteIds.has(athlete.id),
      race_points_before: Number(athlete.race_points) || 0,
      race_points_after: update ? Number(update.race_points) || 0 : Number(athlete.race_points) || 0,
      touched_this_call: Boolean(update),
    };
  });
  // Fase 7.4 — só grava quem mudou (concedeu ou descontou janela) nesta
  // chamada; a maioria das duplas nunca toca priority_window_remaining.
  const priorityWindowUpdates = pairs
    .filter((pair) => pair.priorityWindowRemaining !== priorityWindowInitialByPairId.get(pair.id))
    .map((pair) => ({ id: pair.partnershipId, priority_window_remaining: pair.priorityWindowRemaining }));
  if (priorityWindowUpdates.length) await entities.Partnership.bulkUpdate(priorityWindowUpdates);
  // Fase 4: `upsert` (não bulkCreate) — id determinístico
  // (`${athleteId}:${tournamentId}` ou `${athleteId}:legacy-seed`), então
  // uma reexecução acidental desta função pro mesmo torneio mescla em vez
  // de lançar erro de id duplicado.
  if (newResultRows.length) {
    await localGame.batch(newResultRows.map((row) => ({ type: 'upsert', entityName: RANKING_RESULT_ENTITY, id: row.id, data: row })));
  }

  // Fase 3, item 3F (achado #24) — perfilado por fase (instrumentação
  // temporária, já revertida): 99,5% do custo desta função está NESTE
  // bloco de persistência, não na seleção de torneio pela IA (0,3%) nem na
  // montagem de campo do achado #22 (0,2%). `reranked` reescreve a
  // população INTEIRA (até ~1000 atletas) toda vez que QUALQUER torneio
  // pendente resolve — independente de quantos torneios foram resolvidos
  // nesta chamada — clonando o save inteiro pra isso (achado #18). Ver
  // AUDITORIA-ATLETAS-REAIS-VS-BOTS.md, achado #24, pros números completos.
  // Fase 4.0, item 3.1 (achado #18): necessário mesmo assim — alimenta o
  // corte de elegibilidade por rank (EntryManager.js:resolveEntryRank) do
  // Circuit Finals (minRanking:8) e Legacy Finals (minRanking:16) com
  // granularidade mais fina que o passe semanal do circuito. Item 2A:
  // `world_ranking` removido do payload — campo morto, todo consumidor já
  // lia ranking_position primeiro.
  //
  // Fase 4.0, item 2B (achado #18): a ordenação continua sobre a população
  // INTEIRA (precisa saber quem está acima de quem pra decidir o top 8/16
  // corretamente) — só a GRAVAÇÃO deixa de tocar todo mundo. Nenhum
  // consumidor confirmado precisa de ranking_position fresco no mesmo dia
  // fora dos dois cortes acima; RERANK_WRITE_TOP_N dá margem de 3x sobre o
  // maior deles (16). Troca-off explícito e assumido, não escondido: os
  // tiers de corte mais largo (Gold:800, Platinum:500, Masters:300,
  // Elite:150, Crown:80) deixam de ganhar frescor no mesmo dia por este
  // bloco — caem pra frescor semanal (processWorldCircuit), que já era o
  // padrão do resto da população antes deste achado existir.
  //
  // Achado real do teste de equivalência (scripts/test-rerank-topn-
  // equivalence-fase4.mjs, GATE FALHOU na primeira versão): escrever só
  // quem entra no top N por pontos NOVOS não basta — quem CAI do top N
  // (era #3, kicked pra #55 pela rodada) precisa da mesma correção, senão
  // fica com a ranking_position ANTIGA (ainda dentro do corte) indefinidamente,
  // elegível pra um torneio que não devia mais poder disputar. A escrita
  // precisa ser a UNIÃO de quem está no top N AGORA com quem estava no
  // top N ANTES (ranking_position pré-rodada) — os dois lados da transição.
  //
  // Fase 4: `+ athletePoints.get(id)` somava o ganho bruto por cima do
  // total antigo — com o total agora sendo "22 melhores de 364 dias", isso
  // dobraria a contagem do resultado recém-criado (ele já está embutido no
  // `points` recém-calculado em athleteUpdates, acima). Pra quem foi
  // tocado nesta chamada, usa o total JÁ recalculado; pra todo o resto da
  // população, usa o total vigente sem alteração — exatamente o que a
  // rodada de hoje não mudou.
  const updatedPointsByAthlete = new Map(athleteUpdates.map((update) => [update.id, update.world_ranking_points]));
  const RERANK_WRITE_TOP_N = 50;
  const rankedFull = [...athletes]
    .map((athlete) => ({
      ...athlete,
      points: updatedPointsByAthlete.has(athlete.id)
        ? updatedPointsByAthlete.get(athlete.id)
        : Number(athlete.world_ranking_points || athlete.ranking_points || 0),
    }))
    .sort((a, b) => b.points - a.points)
    .map((athlete, index) => {
      const previous = Number(athlete.ranking_position);
      return { id: athlete.id, ranking_position: index + 1, previousPosition: Number.isFinite(previous) ? previous : Infinity };
    });
  const reranked = rankedFull
    .filter((entry) => entry.ranking_position <= RERANK_WRITE_TOP_N || entry.previousPosition <= RERANK_WRITE_TOP_N)
    .map(({ id, ranking_position }) => ({ id, ranking_position }));
  if (reranked.length) await entities.AthleteProfile.bulkUpdate(reranked);

  return {
    resolved: tournamentUpdates.length,
    tournaments: tournamentUpdates,
    rankingUpdates: athleteUpdates.length,
    news: news.length,
    // Instrumentação: o que o dia TENTOU resolver e o que falhou, para o
    // relatório diário poder responder "é exceção, pending vazio, ou
    // resolução acontecendo?" sem precisar de novo diagnóstico.
    pending: pending.length,
    errors: resolutionErrors,
    // Playthrough 4.5A — diagnóstico factual por torneio (item 1) e Race
    // watch dos 4 pares reais mais visíveis do circuito (item 4/5), lidos
    // por src/dev/worldTourDiagnostics.js e persistidos de forma rotativa.
    tournamentDiagnostics,
    raceWatch,
    canonicalPairsFound: pairs.length,
    athletesConsidered: athletes.length,
  };
}

export async function processWorldTourDay(careerDate) {
  try {
    // Playthrough 4.5D, item 4 — rede de segurança contra a MESMA corrida
    // já corrigida na origem (saveFoundation.js): `ensureWorldSeed2025()`
    // roda hoje de um efeito fire-and-forget (SaveFoundationBootstrap.jsx),
    // nunca aguardado pelo avanço de dia. Se o dispositivo for lento ou o
    // jogador avançar o dia antes desse efeito terminar, o D-3 da primeira
    // janela ainda veria o mundo incompleto mesmo com a correção da
    // semeadura. `verifySaveFoundation`/`ensureWorldSeed2025` são
    // idempotentes e baratos depois da 1ª vez completa (ver saveFoundation.js)
    // — pagar o custo aqui, todo dia, é seguro; nunca pagar o preço de um
    // Gold cancelado por o mundo ainda não estar pronto não é.
    const foundationStatus = await verifySaveFoundation().catch(() => ({ ok: true }));
    if (!foundationStatus.ok) await ensureWorldSeed2025().catch((error) => console.error('[WorldTour] reparo de fundação falhou:', error));
    const draw = await ensureWorldTourDraws(careerDate);
    const settlement = await resolveCompletedWorldTourEvents(careerDate);
    return {
      ...settlement,
      drawn: draw.drawn,
      cancelled: draw.cancelled,
      errors: [...(draw.errors || []), ...(settlement.errors || [])],
    };
  } catch (error) {
    // Antes devolvia só `error.message` e ficava no console — indistinguível,
    // no relatório, de "não havia nada para resolver". Agora o erro viaja com
    // stack para o relatório diário, que é o que o jogador e o diagnóstico
    // conseguem ver.
    console.error('processWorldTourDay', error);
    return {
      resolved: 0,
      tournaments: [],
      rankingUpdates: 0,
      news: 0,
      errors: [{
        scope: 'resolveCompletedWorldTourEvents',
        message: error?.message || String(error),
        stack: String(error?.stack || '').split('\n').slice(0, 5).join(' | '),
      }],
    };
  }
}
