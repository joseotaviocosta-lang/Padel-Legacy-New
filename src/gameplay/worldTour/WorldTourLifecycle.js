import { localGame } from '@/api/localGameClient.js';
import { chooseTournament } from './TournamentSelectionAI.js';
import { resolveEntryRank } from './EntryManager.js';
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
const OPEN_TIER_RESERVED_SHARE = 0.25;
function pairTournamentsPlayedSoFar(pair) {
  const values = pair.athletes.map((athlete) => Number(athlete.tournaments_played) || 0);
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}
function applyOpenTierEntryPriority(entrants, tournament, drawSize) {
  if (entrants.length <= drawSize) return entrants;
  const ranked = entrants.map((pair) => ({
    pair,
    rank: pairEntryRank(pair) || (WORLD_RANKING_TARGET + 1),
    played: pairTournamentsPlayedSoFar(pair),
    skill: pairScore(pair, tournament),
  }));
  const reservedSlots = Math.max(0, Math.min(drawSize, Math.round(drawSize * OPEN_TIER_RESERVED_SHARE)));
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

  for (const weekTournaments of tournamentsByWeek.values()) {
    const assignments = new Map(weekTournaments.map((tournament) => [tournament.id, []]));
    for (const pair of pairs) {
      const representative = {
        ...pair.athletes[0],
        overall_rating: pair.athletes.reduce((sum, athlete) => sum + Number(athlete.overall_rating || athlete.overall || 50), 0) / 2,
      };
      const choice = chooseTournament(weekTournaments, representative, {
        strategy: representative.careerStrategy,
        currentRegion: representative.currentRegion,
      });
      if (choice?.decision === 'play' && choice.tournament?.id && assignments.has(choice.tournament.id)) assignments.get(choice.tournament.id).push(pair);
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
      // Fase 5.1, item 1 — só os tiers de acesso livre (Bronze/Silver,
      // `minRanking:0`) tinham o problema de oversubscrição sem piso
      // medido no achado #32; tiers com corte de ranking próprio já
      // controlam demanda pela elegibilidade. Decide QUEM ENTRA antes de
      // decidir QUEM VENCE (a linha de baixo, inalterada, continua
      // ordenando por pairScore/skill — só entre quem já entrou).
      if (config.minRanking === 0 && entrants.length > drawSize) {
        entrants = applyOpenTierEntryPriority(entrants, tournament, drawSize);
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
