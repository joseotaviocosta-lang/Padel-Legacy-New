import { localGame } from '@/api/localGameClient.js';
import { chooseTournament } from './TournamentSelectionAI.js';
import { evaluateTournamentEntry, buildAthleteEntryContext, resolveEntryRank } from './EntryManager.js';
import { fnv1aHash } from '@/lib/hashUtils.js';
import { WORLD_RANKING_TARGET } from '@/lib/rankingPopulation.js';
import { getTournamentTierConfig } from '@/lib/circuitCatalog.js';

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

// Fase 3, item 3A.1 — antes, uma tabela FIXA de 7 rótulos/frações
// (FINISH_POINTS) hardcoded neste arquivo, alheia ao tamanho real da
// chave de cada tier (uma chave de 8 nunca alcança "r32", uma de 64
// precisava de 6 vitórias pro título mas winsForFinish só ia até 5 —
// inconsistência que já existia antes desta fase). Substituída por uma
// leitura direta de `getTournamentTierConfig(tier)`, que já carrega
// roundLabels/roundPoints do tamanho de chave REAL do tier (circuitCatalog.js).
// `index` é a posição do par na lista ordenada por pontuação (0 = campeão);
// mapeia pra profundidade de eliminação por log2 (posições 1 → final,
// 2-3 → semifinal, 4-7 → quartas, ... — o dobro de gente a cada rodada
// anterior, mesma forma de qualquer chave de eliminação simples).
function resolveFinish(tournament, index) {
  const config = getTournamentTierConfig(tournament?.tier);
  const roundCount = config.roundCount;
  const depthFromChampion = index <= 0 ? 0 : Math.floor(Math.log2(index)) + 1;
  const tierIndex = Math.max(0, roundCount - depthFromChampion);
  return {
    finish: config.roundLabels[tierIndex] || config.roundLabels[0],
    points: config.roundPoints[tierIndex] ?? config.roundPoints[0] ?? 0,
    // Vitórias = quantas rodadas foram vencidas pra chegar a este posto —
    // exatamente o índice na tabela (0 = perdeu na entrada, roundCount =
    // campeão, venceu todas). Mais preciso que a tabela antiga (fixa em
    // até 5 vitórias mesmo pra chaves de 6 rodadas).
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
    ranking: Number(athlete.world_ranking || athlete.ranking_position || athlete.ranking || 999),
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
      // Fase 3, item 3B.2 (backstop de montagem de campo) — achado real: o
      // gatilho era `entrants.length < 2`, ou seja, o preenchimento de
      // reserva só entrava em ação pra garantir o MÍNIMO de uma partida
      // (2 duplas), nunca pra completar a chave inteira. Uma chave de 32
      // com 5 duplas escolhidas pela IA (chooseTournament) ficava com só 5
      // — nunca tentava completar as 27 vagas restantes, mesmo com pares
      // elegíveis sobrando no pool. Era EXATAMENTE a causa das 40,6% de
      // chaves incompletas mesmo depois de triplicar as duplas ativas
      // (Fase 2.6): mais duplas no pool não ajudava porque o preenchimento
      // nunca as buscava. Corrigido pra sempre tentar completar até
      // `drawSize`.
      if (entrants.length < drawSize) {
        const needed = drawSize - entrants.length;
        const present = new Set(entrants.map((pair) => pair.id));
        const remaining = pairs.filter((pair) => !present.has(pair.id));
        // Correção Fase 1A (achado #16): antes, o preenchimento de reserva
        // ignorava elegibilidade por completo — era isso que fazia um
        // Crown sortear do mesmo pool que um Silver. Agora que a
        // elegibilidade funciona de verdade (rank chega correto via
        // resolveEntryRank), tenta primeiro completar só com pares
        // REALMENTE elegíveis para o tier deste torneio. Só recorre a
        // qualquer par (comportamento anterior) se nem isso bastar — comum
        // na temporada 1, quando poucos pares ainda têm ranking para tiers
        // altos — e sempre registra quando isso acontece, em vez de
        // mascarar silenciosamente uma chave preenchida abaixo do corte.
        const eligibleRemaining = remaining.filter((pair) =>
          evaluateTournamentEntry(tournament, buildAthleteEntryContext({}, pairEntryRank(pair), tournament)).eligible);
        const usingBelowCutoffFallback = eligibleRemaining.length < needed;
        const backfillPool = usingBelowCutoffFallback ? remaining : eligibleRemaining;
        if (usingBelowCutoffFallback && remaining.length > eligibleRemaining.length) {
          console.warn(`[WorldTourLifecycle] ${tournament.id} (${tournament.tier}): só ${eligibleRemaining.length}/${needed} pares elegíveis disponíveis para completar a chave — preenchendo com os melhores disponíveis abaixo do corte de ranking.`);
        } else if (backfillPool.length < needed) {
          console.warn(`[WorldTourLifecycle] ${tournament.id} (${tournament.tier}): só ${backfillPool.length}/${needed} pares disponíveis no total (pool esgotado) — chave fecha incompleta por falta genuína de duplas, não por corte de elegibilidade.`);
        }
        entrants = [...entrants, ...backfillPool
          .sort((a, b) => pairScore(b, tournament) - pairScore(a, tournament))
          .slice(0, needed)];
      }
      const ordered = entrants
        .sort((a, b) => pairScore(b, tournament) - pairScore(a, tournament))
        .slice(0, drawSize);
      if (ordered.length < 2) continue;
      const champion = ordered[0];
      const runnerUp = ordered[1];

      ordered.forEach((pair, index) => {
        const { finish, points, wins: finishWins } = resolveFinish(tournament, index);
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

  const athleteUpdates = athletes.filter((athlete) => athletePoints.has(athlete.id)).map((athlete) => {
    const outcomes = athleteOutcomes.get(athlete.id) || [];
    const points = Number(athlete.world_ranking_points || athlete.ranking_points || 0) + athletePoints.get(athlete.id);
    // Correção UI/cronologia — Fase 3: race_points é a temporada (Race) EM
    // ANDAMENTO, separada do Circuito acumulado acima. Reaproveita o mesmo
    // ganho de pontos já calculado (athletePoints) em vez de recalcular —
    // cresce junto com o Circuito conforme torneios reais são disputados,
    // mas é zerada isoladamente na virada do ano (ver annualCareerReportLifecycle.js).
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

  // Fase 3, item 3F (achado #24) — perfilado por fase (instrumentação
  // temporária, já revertida): 99,5% do custo desta função está NESTE
  // bloco de persistência, não na seleção de torneio pela IA (0,3%) nem na
  // montagem de campo do achado #22 (0,2%). `reranked` reescreve a
  // população INTEIRA (até ~1000 atletas) toda vez que QUALQUER torneio
  // pendente resolve — independente de quantos torneios foram resolvidos
  // nesta chamada — clonando o save inteiro pra isso (achado #18). Ver
  // AUDITORIA-ATLETAS-REAIS-VS-BOTS.md, achado #24, pros números completos.
  const reranked = [...athletes]
    .map((athlete) => ({ ...athlete, points: Number(athlete.world_ranking_points || athlete.ranking_points || 0) + (athletePoints.get(athlete.id) || 0) }))
    .sort((a, b) => b.points - a.points)
    .map((athlete, index) => ({ id: athlete.id, world_ranking: index + 1, ranking_position: index + 1 }));
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
