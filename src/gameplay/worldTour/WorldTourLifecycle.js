import { localGame } from '@/api/localGameClient.js';
import { chooseTournament } from './TournamentSelectionAI.js';
import { resolveEntryRank, OPEN_TIER_CEILING } from './EntryManager.js';
import { fnv1aHash } from '@/lib/hashUtils.js';
import { WORLD_RANKING_TARGET } from '@/lib/rankingPopulation.js';
import { getTournamentTierConfig, getRoundOutcomeTable } from '@/lib/circuitCatalog.js';
import {
  RANKING_RESULT_ENTITY, RANKING_RESULT_POPULATION_CAP,
  buildLegacySeedRow, needsLegacySeed, computeRollingPoints, groupResultsByAthlete,
} from '@/game-core/rankingWindow.js';

const entities = /** @type {any} */ (localGame.entities);
// Fase 2E.3: o limite era 1000 sobre uma população que agora É 1000 —
// margem zero, e generateProspects (achado 2D.2, agora 5-6/mês) passa a
// truncar já no primeiro mês em que a população cruzar 1000+1.
const ATHLETE_POPULATION_CAP = WORLD_RANKING_TARGET + 100;


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
function pairTournamentsPlayedSoFar(pair) {
  const values = pair.athletes.map((athlete) => Number(athlete.tournaments_played) || 0);
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}
function applyEntryPriority(entrants, tournament, drawSize) {
  if (entrants.length <= drawSize) return entrants;
  const ranked = entrants.map((pair) => ({
    pair,
    rank: pairEntryRank(pair) || (WORLD_RANKING_TARGET + 1),
    played: pairTournamentsPlayedSoFar(pair),
    skill: pairScore(pair, tournament),
  }));
  const reservedSlots = Math.max(0, Math.min(drawSize, Math.round(drawSize * ENTRY_RESERVED_SHARE)));
  const openSlots = drawSize - reservedSlots;
  const byRank = [...ranked].sort((a, b) => a.rank - b.rank || b.skill - a.skill);
  const selectedOpen = byRank.slice(0, openSlots);
  const selectedIds = new Set(selectedOpen.map((entry) => entry.pair.id));
  const byLeastPlayed = ranked
    .filter((entry) => !selectedIds.has(entry.pair.id))
    .sort((a, b) => a.played - b.played || a.rank - b.rank);
  const selectedReserved = byLeastPlayed.slice(0, reservedSlots);
  return [...selectedOpen, ...selectedReserved].map((entry) => entry.pair);
}

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

function buildCanonicalPairs(partnerships, athletes) {
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
    });
  }
  return pairs;
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
  const [allTournaments, rawAthletes, partnerships] = await Promise.all([
    entities.Tournament.list('-start_date', 300),
    entities.AthleteProfile.list('-world_ranking_points', ATHLETE_POPULATION_CAP),
    entities.Partnership.list('-created_date', 1200).catch(() => []),
  ]);

  const pending = (allTournaments || []).filter((tournament) => {
    const end = tournamentEndDate(tournament);
    return tournament.world_tour_event && end && end < careerDate && tournament.status !== 'finalizado' && !tournament.world_tour_resolved;
  });
  if (!pending.length) return { resolved: 0, tournaments: [], rankingUpdates: 0, news: 0 };

  const athletes = (rawAthletes || []).map(normalizeAthlete).filter((athlete) => !athlete.retired && athlete.career_status !== 'aposentado');
  const pairs = buildCanonicalPairs(partnerships, athletes);
  if (!pairs.length) return { resolved: 0, tournaments: [], rankingUpdates: 0, news: 0, waitingForCanonicalPairs: true };

  const tournamentsByWeek = new Map();
  pending.forEach((tournament) => {
    const key = `${tournament.year || tournament.start_date?.slice(0, 4)}:${tournament.week || tournament.start_date}`;
    if (!tournamentsByWeek.has(key)) tournamentsByWeek.set(key, []);
    tournamentsByWeek.get(key).push(tournament);
  });

  const athletePoints = new Map();
  const athleteOutcomes = new Map();
  const headToHeadByAthlete = new Map();
  const tournamentUpdates = [];
  const news = [];

  // DIAG_SELECT (Fase 6.4/6.5, temporário) — mesma instrumentação da
  // Fase 6.4, reaplicada pra medir o efeito do item 2 (prioridade
  // estendida) e do item 3 (fallback de tier) sobre a divisão
  // 45/22/19/14 e a taxa de corte por tier. Reverter após medir.
  const diagSelect = process.env.DIAG_SELECT ? true : false;

  for (const weekTournaments of tournamentsByWeek.values()) {
    const assignments = new Map(weekTournaments.map((tournament) => [tournament.id, []]));
    const diagChoiceByPair = diagSelect ? new Map() : null;
    // Fase 6.5, item 3 — fallback de tier na mesma semana. `chooseTournament`
    // já devolve `options`, a lista INTEIRA de torneios elegíveis da
    // semana, ordenada por pontuação (`scoreOption`) — não só o
    // escolhido. Guarda essa lista + em qual posição dela a dupla está
    // atualmente, pra tentar a próxima se for cortada da atual. Como
    // `options` já passou pelo filtro de elegibilidade de
    // `evaluateTournamentEntry` (inclusive `OPEN_TIER_CEILING`), uma
    // dupla barrada da base por ser boa demais nunca a vê nesta lista —
    // o fallback respeita o teto de acesso livre por construção, sem
    // checagem extra.
    const pairOptionState = new Map();
    for (const pair of pairs) {
      // Fase 5.5, item 1 — a elegibilidade da dupla passava por
      // `chooseTournament(..., pair.athletes[0])`: `resolveEntryRank` lia
      // o rank do PRIMEIRO atleta (o `athlete_a` da Partnership, ordem
      // arbitrária), não o da dupla. Uma dupla [#82, #189] com o #82 como
      // `athlete_b` passava o teto de acesso livre pelo rank 189 do
      // `athlete_a` e entrava em Bronze/Silver com um top-82 dentro
      // (medido: Pineda/Piotto, 1 dos 7 títulos reais de base em regime).
      // O `overall_rating` já era a média dos dois aqui; o rank passa a
      // ser `pairEntryRank` (média, mesmo adaptador de
      // `applyEntryPriority` e da redistribuição do item 1 da
      // Fase 5.4) — a porta enxerga a dupla, não um membro sorteado.
      const pairRank = pairEntryRank(pair);
      const representative = {
        ...pair.athletes[0],
        overall_rating: pair.athletes.reduce((sum, athlete) => sum + Number(athlete.overall_rating || athlete.overall || 50), 0) / 2,
        ...(pairRank > 0 ? { rank: pairRank, ranking_position: pairRank } : {}),
      };
      const choice = chooseTournament(weekTournaments, representative, {
        strategy: representative.careerStrategy,
        currentRegion: representative.currentRegion,
      });
      if (choice?.decision === 'play' && choice.tournament?.id && assignments.has(choice.tournament.id)) {
        assignments.get(choice.tournament.id).push(pair);
        pairOptionState.set(pair.id, { pair, options: choice.options || [], index: 0, currentTournamentId: choice.tournament.id });
      }
      if (diagChoiceByPair && pair.athletes.some((a) => a.is_real)) {
        diagChoiceByPair.set(pair.id, {
          decision: choice?.decision,
          tournamentId: choice?.decision === 'play' ? choice.tournament?.id : null,
          tier: choice?.decision === 'play' ? choice.tournament?.tier : null,
          eligibleOptions: choice?.options?.length || 0,
          pair,
        });
      }
    }

    // Fase 5.4, item 1 — redistribuição de excedente entre tiers de acesso
    // livre (Bronze/Silver) concorrentes na mesma semana. `chooseTournament`
    // + `scoreOption` pontuam Silver acima de Bronze pra quase toda
    // estratégia de carreira (mais pontos, mais prêmio, mais prestígio),
    // então numa semana com os dois TODO par elegível escolhe Silver e o
    // Bronze fecha com ZERO inscritos (medido: 8 Bronze/temporada
    // cancelados, todos em semanas Bronze+Silver — Fase 5.3/5.4). A IA não
    // modela que o Silver vai estar lotado: um par que seria CORTADO do
    // Silver superlotado está estritamente melhor jogando o Bronze.
    //
    // Redistribuição CONSERVADORA: só resgata um evento livre concorrente
    // que ficaria abaixo do mínimo viável (senão cancelaria), e o traz
    // exatamente até `minViableDraw` — não até `drawSize`. Um evento que
    // ninguém escolheu roda no tamanho mínimo honesto, não cheio à força
    // (mesmo princípio da chave de tamanho variável da Fase 5.3). Move só
    // os pares de MENOR força (`pairScore`) entre os que o doador cortaria
    // de qualquer forma: o tier de baixo fica com um campo genuinamente
    // fraco, e uma dupla forte cortada do doador continua cortada.
    //
    // Fase 5.5, item 1 — invariante explícita: uma dupla barrada pelo teto
    // de acesso livre (`pairEntryRank <= OPEN_TIER_CEILING`) NUNCA é movida
    // pra um evento de base, nem pra salvar um cancelamento. Depois da
    // correção da elegibilidade (representative usa `pairEntryRank`) o
    // `donor.list` já não contém essas duplas; o filtro abaixo é a rede de
    // segurança que torna a garantia local e legível.
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

    // Fase 6.5, item 3 — fallback de tier na mesma semana. Hoje, se uma
    // dupla é cortada da montagem de campo do tier escolhido, a semana
    // acaba ali — a redistribuição acima só move ENTRE tiers de acesso
    // livre concorrentes, nunca de um tier fechado pra outro. No circuito
    // real, quem não entra num evento joga outro. Reavalia
    // iterativamente: quem foi cortado do tier atual tenta o PRÓXIMO
    // melhor da própria lista de opções elegíveis (`chooseTournament` já
    // devolve essa lista ordenada — não é um recálculo novo, é a mesma
    // pontuação que decidiu a escolha original). Convirja num número
    // limitado de rodadas (a escada de tiers tem profundidade finita —
    // não pode ciclar) em vez de reprocessar até estabilizar sozinho.
    const drawSizeOf = (t) => {
      const cfg = getTournamentTierConfig(t?.tier);
      return Math.max(2, Number(t.main_draw_size) || cfg.mainDrawSize || 16);
    };
    // A redistribuição de Bronze/Silver acima já pode ter movido alguém
    // pra fora da 1ª escolha registrada em `pairOptionState` — sincroniza
    // `currentTournamentId` com onde `assignments` realmente tem cada
    // dupla agora, antes da 1ª rodada de fallback usar essa referência.
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
        // Cortada — tenta a próxima opção elegível da lista, se houver.
        let nextIndex = state.index + 1;
        while (nextIndex < state.options.length && !weekTournaments.some((t) => t.id === state.options[nextIndex].tournament?.id)) nextIndex += 1;
        if (nextIndex >= state.options.length) continue; // esgotou as opções — perde a semana, como hoje.
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
      let entrants = [...(assignments.get(tournament.id) || [])];
      const diagEntrantsBeforePriority = diagSelect ? entrants.length : 0;
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
        entrants = applyEntryPriority(entrants, tournament, drawSize);
      }
      const ordered = entrants
        .sort((a, b) => pairScore(b, tournament) - pairScore(a, tournament))
        .slice(0, drawSize);
      // DIAG_SELECT (Fase 6.4/6.5, temporário) — ver acima. `diagEntrantsBeforePriority`
      // conta quem ESCOLHEU antes de qualquer prioridade/corte (pra
      // comparar com a Fase 6.4, medida antes do item 2 existir).
      if (diagSelect) {
        const cutCount = Math.max(0, diagEntrantsBeforePriority - drawSize);
        if (diagEntrantsBeforePriority > 0) {
          console.log(`[DIAG_SELECT] ${careerDate} torneio ${tournament.id} tier=${tournament.tier} drawSize=${drawSize} escolheram=${diagEntrantsBeforePriority} cortados=${cutCount}`);
        }
        const survivedIds = new Set(ordered.map((p) => p.id));
        for (const [pairId, info] of diagChoiceByPair) {
          const finalTournamentId = pairOptionState.get(pairId)?.currentTournamentId ?? info.tournamentId;
          if (finalTournamentId === tournament.id) {
            const cut = !survivedIds.has(pairId);
            const fellBack = info.tournamentId != null && info.tournamentId !== finalTournamentId;
            console.log(`[DIAG_SELECT]   dupla-real ${info.pair.name} (${pairId}) escolheu tier=${info.tier} eligibleOptions=${info.eligibleOptions}${fellBack ? ` FALLBACK->${tournament.tier}` : ''} -> ${cut ? 'CORTADA' : 'jogou'}`);
          }
        }
      }
      // Fase 5.3, item 2 — campo pequeno demais não vira torneio. Marca
      // resolvido + cancelado (sai da fila de pendentes), sem campeão e
      // sem distribuir pontos. Antes o gatilho era `< 2` — qualquer par
      // de duplas já "resolvia" o evento com o preenchimento forçado.
      const belowMinViable = ordered.length < minViableDraw(drawSize);
      if (belowMinViable) {
        tournamentUpdates.push({
          id: tournament.id,
          world_tour_resolved: true,
          world_tour_cancelled: true,
          resolved_at: careerDate,
          simulated_entrants: ordered.length,
        });
        continue;
      }
      const champion = ordered[0];
      const runnerUp = ordered[1];

      ordered.forEach((pair, index) => {
        const { finish, points, wins: finishWins } = resolveFinish(tournament, index, ordered.length);
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
        status: 'finalizado',
        current_phase: 'concluido',
        world_tour_resolved: true,
        resolved_at: careerDate,
        champion: champion.name,
        runner_up: runnerUp.name,
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

      ordered.slice(0, 8).flatMap((pair) => pair.athletes).forEach((athlete) => { athlete.currentRegion = eventRegion(tournament); });
    }

    // DIAG_SELECT (Fase 6.4/6.5, temporário) — duplas reais que
    // descansaram ou não tinham NENHUMA opção elegível esta semana.
    if (diagChoiceByPair) {
      for (const [pairId, info] of diagChoiceByPair) {
        if (info.decision !== 'play') {
          console.log(`[DIAG_SELECT]   dupla-real ${info.pair.name} (${pairId}) decisão=${info.decision} eligibleOptions=${info.eligibleOptions}`);
        }
      }
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

  return { resolved: tournamentUpdates.length, tournaments: tournamentUpdates, rankingUpdates: athleteUpdates.length, news: news.length };
}

export async function processWorldTourDay(careerDate) {
  try {
    return await resolveCompletedWorldTourEvents(careerDate);
  } catch (error) {
    console.error('processWorldTourDay', error);
    return { resolved: 0, tournaments: [], rankingUpdates: 0, news: 0, error: error.message };
  }
}
