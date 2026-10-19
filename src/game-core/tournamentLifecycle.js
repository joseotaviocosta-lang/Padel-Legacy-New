import { localGame } from '@/api/localGameClient.js';
import { levelForXp, rebasePlayerPatchIncrements } from '@/lib/padel';
import { getTournamentRewards } from '@/lib/career';
import { teamKey, computeCanonicalTeamRankingPoints } from '@/lib/teamRanking';
import { buildPartnershipTitlePatch, getActivePartnership } from '@/lib/partnershipSystem';
import { safeName, todayForProfile } from './utils';
import { RANKING_RESULT_ENTITY, buildLegacySeedRow, needsLegacySeed, computeRollingPoints } from './rankingWindow.js';
import { bracketFactsFromHistory, deriveTournamentFactsFromFullBracket, finalizeTournamentFromBracket, applyPlayerMatchToCanonicalBracket, applyQualifyingExitToCanonicalBracket, opponentTeamNameOfRunMatch, remainingQualifyingOpponentNames } from '@/gameplay/worldTour/tournamentSettlement.js';
import { getCurrentTournamentMatch, withdrawTournamentRun, countMainDrawWins, buildTournamentBracketHistory } from '@/gameplay/worldTour/TournamentRunManager.js';
import { getTournamentRounds, getPartnerBot } from '@/lib/career.js';
import { upsertCareerMessage } from '@/lib/careerCommunications.js';
import { resolveCommittedPartnerAthlete } from '@/lib/committedRoster.js';

// Itens 3/4/15 — a chave COMPLETA (bracket_schema_version 2) resolve toda a
// chave deterministicamente já no sorteio/na eliminação do jogador
// (consistência entre reloads), mas o título só vira FATO quando a própria
// rodada final alcança sua data real de calendário (item 2, roundDates) —
// nunca antes, mesmo que a campanha do jogador já tenha terminado. Roma:
// eliminado nas quartas não pode ter campeão antes de SF/F chegarem na data.
// Sem a data da rodada final (chave legada, item 9), cai no caminho antigo:
// só decide quando a PRÓPRIA final do jogador foi jogada (finalDecided).
export function deriveDueCanonicalSettlement(tournament, bracketHistory, date) {
  const finalRound = Array.isArray(bracketHistory) ? bracketHistory[bracketHistory.length - 1] : null;
  const finalMatch = finalRound?.is_final ? finalRound.matches?.[0] : null;
  const finalDecided = Boolean(finalMatch?.winner);
  const finalRoundDate = finalRound?.date || finalMatch?.date || null;
  const finalRoundReached = Boolean(finalRoundDate && date && finalRoundDate <= date);
  const canonicalBracket = finalRoundReached
    ? (Number(tournament.bracket_schema_version) >= 2 && Array.isArray(bracketHistory) && bracketHistory.length > 0
      ? deriveTournamentFactsFromFullBracket(bracketHistory)
      : (finalDecided ? bracketFactsFromHistory(bracketHistory, [finalMatch.team_a, finalMatch.team_b]) : null))
    : null;
  const canonicalSettlement = canonicalBracket
    ? finalizeTournamentFromBracket({ tournament, bracket: canonicalBracket, date })
    : null;
  return { finalRoundReached, canonicalBracket, canonicalSettlement };
}

function buildCanonicalTitleWorldEventOperation(tournament, canonicalSettlement, date) {
  if (!canonicalSettlement?.result?.champion) return null;
  return { type: 'upsert', entityName: 'WorldEvent', id: `tournament-result-${tournament.id}`, data: {
    event_type: 'tournament_result',
    title: `${canonicalSettlement.result.champion} conquista o ${tournament.name}`,
    content: `${canonicalSettlement.result.champion} venceu ${canonicalSettlement.result.runner_up} na final do ${tournament.name}.`,
    event_date: date,
    related_tournament_id: tournament.id,
    related_players: [canonicalSettlement.result.champion, canonicalSettlement.result.runner_up],
    tier: String(tournament.tier || 'normal').toLowerCase(),
    author_name: 'Redação Padel Legacy World Tour',
    tags: ['tournament-result', String(tournament.tier || '').toLowerCase()],
  } };
}

async function findPlayerTournamentRun(entities, profileId, tournamentId) {
  const event = (await entities.CalendarEvent.filter({ profile_id: profileId, related_id: tournamentId }).catch(() => []))
    .find((item) => item.event_type === 'tournament' && item.metadata?.tournament_run);
  return event?.metadata?.tournament_run || null;
}

// CLOUD-7D1 — se a vaga do jogador na rodada 0 segue aberta porque a campanha dele terminou no qualifying (derrota ou
// W.O.), devolve a chave com a vaga herdada pela dupla que o eliminou; em qualquer outro caso devolve a chave intacta.
function repairOpenQualifyingSeat(bracketHistory, run) {
  const seat = bracketHistory?.[0]?.matches?.find((match) => match?.player_match === true);
  if (!seat || seat.winner || !run || !['eliminated', 'finished'].includes(run.status)) return bracketHistory;
  const exitMatch = (run.matches || []).find((match) => (match.status === 'completed' && match.result && !match.result.won) || match.status === 'cancelled');
  if (exitMatch?.stage !== 'qualifying') return bracketHistory;
  const qualifierTeamName = opponentTeamNameOfRunMatch(exitMatch);
  if (!qualifierTeamName) return bracketHistory;
  // LOCAL-7F — quem eliminou o jogador ainda disputa as rodadas de qualifying que faltam.
  return applyQualifyingExitToCanonicalBracket(bracketHistory, {
    qualifierTeamName, remainingOpponents: remainingQualifyingOpponentNames(run, exitMatch), date: exitMatch.date,
  }).rounds;
}

// Item 3/4/15 — day-tick complementar a prepareTournamentFinalization. Um
// jogador eliminado cedo (Roma nas quartas) não gera mais nenhum evento
// depois disso — não há mais partida dele que dispare a finalização real.
// Sem este passo diário, o torneio ficaria PARA SEMPRE com `champion` nulo
// mesmo depois da final real acontecer (a chave, resolvida
// deterministicamente desde o sorteio, só precisa esperar sua própria data
// chegar). Espelha exatamente a mesma autoridade de
// deriveDueCanonicalSettlement usada na finalização síncrona — nenhuma
// segunda forma de decidir campeão. Torneios com jogador NUNCA passam pelo
// settlement genérico do circuito de IA (isWorldTourResolutionPending
// exclui player_participated) — este é o único lugar que os retoma.
// Playthrough 4.7, item 7 — mesma defesa em profundidade de
// isWorldTourResolutionPending (WorldTourLifecycle.js): `player_participated`
// só era gravado depois da primeira partida jogada/abandonada, deixando de
// fora um torneio cujo W.O. automático (resolveUnavailablePlayerMatch,
// abaixo) ainda não rodou por qualquer motivo transitório. `player_match:true`
// já existe em bracket_history desde o sorteio (buildPlayerTournamentBracket),
// nunca depende de nenhuma partida ter acontecido.
function hasPlayerMatchInBracket(tournament) {
  return Array.isArray(tournament?.bracket_history)
    && tournament.bracket_history.some((round) => (round?.matches || []).some((match) => match?.player_match === true));
}

// Playthrough 5.0, Parte A/X — mesma causa raiz de prepareTournamentFinalization,
// achado separadamente pela auditoria: este retomador (dia em que a FINAL
// real chega, depois de o jogador já ter sido eliminado antes) também só
// gravava Tournament/WorldEvent — nunca creditava o adversário real que
// vira campeão. Escopo deliberadamente mais estreito que
// prepareTournamentFinalization: só o par da FINAL é creditável aqui com
// certeza (run.matches[totalRounds-1].opponent, via o CalendarEvent que já
// existe da campanha do próprio jogador) — o destino de quem eliminou o
// jogador ANTES da final não é conhecível sem simular uma segunda chave
// paralela (fora do escopo, Parte Z). Nunca fabrica além do que é
// determinável.
export async function resolvePendingPlayerCanonicalTournaments(careerDate, profile = null) {
  if (!careerDate) return { resolved: 0, errors: [] };
  const entities = /** @type {any} */ (localGame.entities);
  const tournaments = (await entities.Tournament.list('start_date', 2000)) || [];
  // CLOUD-7B2C — predicados puros reordenados (resultado idêntico): os escalares baratos vêm antes de varrer a chave,
  // então torneios já resolvidos (a maioria, em carreiras longas) nunca leem `bracket_history` neste filtro diário.
  const pending = tournaments.filter((tournament) => (
    !tournament.world_tour_resolved
    && Number(tournament.bracket_schema_version) >= 2
    && (tournament.player_participated || hasPlayerMatchInBracket(tournament))
    && Array.isArray(tournament.bracket_history)
    && tournament.bracket_history.length > 0
  ));
  const errors = [];
  const operations = [];
  let resolved = 0;
  for (const tournament of pending) {
    try {
      // CLOUD-7D1 — reparo de saves/torneios em que o jogador saiu no qualifying e a vaga dele na rodada 0 ficou
      // aberta (a chave nunca fecha). Só a vaga aberta é preenchida; nada já disputado é alterado.
      let run = null;
      let runLoaded = false;
      const loadRun = async () => {
        if (!runLoaded) { run = profile?.id ? await findPlayerTournamentRun(entities, profile.id, tournament.id) : null; runLoaded = true; }
        return run;
      };
      const seatOpen = tournament.bracket_history[0]?.matches?.some((match) => match?.player_match === true && !match.winner);
      const bracketHistory = seatOpen ? repairOpenQualifyingSeat(tournament.bracket_history, await loadRun()) : tournament.bracket_history;
      const { canonicalSettlement } = deriveDueCanonicalSettlement(tournament, bracketHistory, careerDate);
      if (!canonicalSettlement?.result?.champion) continue;
      const worldEventOp = buildCanonicalTitleWorldEventOperation(tournament, canonicalSettlement, careerDate);
      if (worldEventOp) operations.push(worldEventOp);
      operations.push({ type: 'update', entityName: 'Tournament', id: tournament.id, data: {
        status: 'finalizado',
        current_phase: 'concluido',
        ...canonicalSettlement.patch,
        player_decided_result: true,
      } });
      if (profile?.id) {
        await loadRun();
        const totalRounds = Array.isArray(tournament.bracket_history) ? tournament.bracket_history.length : 0;
        // `run.matches` inclui as rodadas de qualifying: a final é a última partida da chave principal do run.
        const finalRunMatch = [...(run?.matches || [])].reverse().find((item) => item.stage !== 'qualifying') || null;
        const finalRoundIndex = finalRunMatch ? run.matches.indexOf(finalRunMatch) : -1;
        // O jogador já foi eliminado ANTES desta final (por definição desta
        // fila — a final chegou depois, sem mais nenhuma partida dele pra
        // disparar prepareTournamentFinalization). O único fato determinável
        // sem simular uma segunda chave é: quem quer que seja o adversário
        // da FINAL no run do jogador (run.matches[finalRoundIndex].opponent)
        // é o CAMPEÃO real (canonicalSettlement.result.champion já confirma
        // que existe um campeão, e não pode ser o jogador — ele não chegou
        // lá). Nunca credita rodadas intermediárias aqui (destino
        // desconhecido de quem eliminou o jogador antes da final).
        // CLOUD-7D1 — só credita o título se o adversário da final no run for de fato o campeão da chave; senão o
        // crédito iria para uma dupla que não ganhou (a dupla que eliminou o jogador também pode vencer a final).
        if (finalRunMatch && finalRoundIndex >= 0 && (finalRunMatch.opponent || []).every((member) => member?.name && String(canonicalSettlement.result.champion).includes(member.name))) {
          const credits = new Map();
          for (const member of finalRunMatch.opponent || []) {
            if (member?.id) credits.set(member.id, { member, roundsWon: totalRounds });
          }
          operations.push(...await applyPairPlacementCredits({ tournament, credits, totalRounds, date: careerDate }));
        }
      }
      resolved += 1;
    } catch (error) {
      errors.push({ tournamentId: tournament.id, message: error?.message || String(error) });
    }
  }
  if (operations.length) await localGame.batch(operations);
  return { resolved, errors };
}

function walkoverTeamName(profile, partner) {
  return `${profile?.sport_name || profile?.name || 'Jogador'} & ${partner?.name || 'Parceiro'}`;
}

// Playthrough 4.7, itens 1-6 — W.O./forfeit AUTOMÁTICO. Até esta fase, a
// ÚNICA forma de resolver uma rodada que o jogador não pode/não consegue
// disputar (lesão no dia da partida, ausência simples) era o botão manual
// "Abandonar torneio" em TournamentModal.jsx (abandonTournament()) — se o
// jogador nunca abrisse aquela tela (o caso comum: lesão bloqueia
// startMatch via isInjured(), sem nenhum caminho automático), o match
// ficava PARA SEMPRE 'scheduled' sem vencedor. Consequência em cascata já
// comprovada: `deriveTournamentFactsFromFullBracket`
// (tournamentSettlement.js) recusa produzir campeão com qualquer match sem
// winner -> a rodada seguinte fica "Vencedor Jogo N" pra sempre -> o
// torneio nunca conclui -> `player_participated` (só gravado por
// finalizeTournamentRun, chamado só pelos dois caminhos manuais do modal)
// nunca vira true -> isWorldTourResolutionPending() trata o torneio como
// AI-only, `resolveCompletedWorldTourEvents` tenta resolver sem fatos
// suficientes e falha a SEMANA INTEIRA todo dia, pra sempre.
//
// Esta função reaproveita EXATAMENTE o mesmo motor que abandonTournament()
// já usa e que já está correto (withdrawTournamentRun +
// applyPlayerMatchToCanonicalBracket + finalizeTournamentRun) — nenhuma
// chave nova, nenhum grafo paralelo, nenhum placar inventado (score:null,
// nunca um resultado fabricado). Chamável pelo lifecycle do dia
// (calendarSystem.js:processCalendarEvents), sem depender de nenhuma tela
// estar aberta. Idempotente: `withdrawTournamentRun`/
// `applyPlayerMatchToCanonicalBracket` já retornam `idempotent:true` sem
// reescrever nada se a rodada já estiver terminal.
export async function resolveUnavailablePlayerMatch({ profile, tournament, calendarEvent, reason = 'Ausência' }) {
  const run = calendarEvent?.metadata?.tournament_run;
  if (!run || !tournament?.id) return null;
  if (['eliminated', 'champion', 'finished'].includes(run.status)) return null;
  const currentMatch = getCurrentTournamentMatch(run);
  if (!currentMatch || currentMatch.status === 'completed') return null;

  // Playthrough 5.17, Parte B — a dupla deste torneio é a que se INSCREVEU,
  // não a que existe hoje. Sem isto, um walkover depois do fim do contrato
  // gravava "<jogador> & Parceiro" no histórico.
  const partner = await resolveCommittedPartnerAthlete({
    profile, tournamentId: tournament.id, calendarEvents: calendarEvent ? [calendarEvent] : [],
  });
  const playerTeamName = walkoverTeamName(profile, partner);
  const withdrawn = withdrawTournamentRun(run, reason).run;

  const freshTournament = await localGame.entities.Tournament.get(tournament.id).catch(() => tournament);
  const hasCanonicalBracket = Number(freshTournament?.bracket_schema_version) >= 2
    && Array.isArray(freshTournament?.bracket_history) && freshTournament.bracket_history.length > 0;
  const bracketHistory = hasCanonicalBracket && currentMatch.stage === 'main' && currentMatch.status !== 'completed'
    ? applyPlayerMatchToCanonicalBracket(freshTournament.bracket_history, {
      roundIndex: currentMatch.stageRoundIndex,
      playerTeamName,
      opponentTeamName: Array.isArray(currentMatch.opponent) && currentMatch.opponent.length
        ? currentMatch.opponent.map((item) => item.name).filter(Boolean).join(' & ')
        : null,
      won: false,
      score: null,
      date: currentMatch.date,
    }).rounds
    // CLOUD-7D1 — W.O. durante o qualifying: a dupla adversária herda a vaga do jogador na chave principal.
    : (hasCanonicalBracket && currentMatch.stage === 'qualifying' && currentMatch.status !== 'completed'
      ? applyQualifyingExitToCanonicalBracket(freshTournament.bracket_history, {
        qualifierTeamName: opponentTeamNameOfRunMatch(currentMatch), remainingOpponents: remainingQualifyingOpponentNames(withdrawn, currentMatch), date: currentMatch.date,
      }).rounds
      : (hasCanonicalBracket ? freshTournament.bracket_history : buildTournamentBracketHistory(withdrawn, playerTeamName)));

  const mainRounds = getTournamentRounds(tournament);
  const completion = await finalizeTournamentRun({
    profile, tournament, partner, roundsWon: countMainDrawWins(withdrawn), totalRounds: mainRounds.length,
    runId: `${tournament.id}:${withdrawn.createdAt}`, bracketHistory, run: withdrawn,
  });

  const freshEvent = await localGame.entities.CalendarEvent.get(calendarEvent.id).catch(() => calendarEvent);
  await localGame.entities.CalendarEvent.update(calendarEvent.id, {
    title: tournament.name,
    status: 'completed',
    requires_decision: false,
    metadata: { ...(freshEvent.metadata || {}), tournament_run: withdrawn, tournament_run_schema_version: 2, withdrawal_reason: reason },
  }).catch(() => {});

  // Playthrough 4.7, item 9 — feedback claro e NEUTRO: nunca a notícia de
  // derrota normal (nenhuma partida foi jogada), nunca entrevista pós-jogo,
  // nunca placar. `upsertCareerMessage` (careerCommunications.js) já dá o
  // mesmo id estável/idempotência que a notificação de sorteio (4.6D) usa.
  if (profile?.id) {
    await upsertCareerMessage(profile.id, `tournament-walkover:${tournament.id}:${currentMatch.id}`, {
      message_type: 'tournament_walkover',
      notification_type: 'TOURNAMENT_WALKOVER',
      sender_type: 'federacao', sender_name: 'Federação do Circuito',
      title: 'Derrota por W.O.',
      content: `Você não pôde disputar ${currentMatch.round || 'a rodada'} de ${tournament.name} devido à indisponibilidade física. A dupla adversária avançou.`,
      related_entity_type: 'Tournament', related_entity_id: tournament.id, related_entity_name: tournament.name,
      destination: { type: 'TOURNAMENT_RUN', route: '/tournaments', params: { tournament: tournament.id, mode: 'run' } },
      metadata: { tournament_id: tournament.id, match_id: currentMatch.id, walkover_reason: reason },
    }).catch(() => {});
  }

  return { profile: completion.updatedProfile, rewards: completion.rewards, run: withdrawn, reason };
}

function placementLabel(roundsWon, totalRounds, champion) {
  if (champion) return 'Campeão';
  const remaining = Math.max(1, totalRounds - roundsWon);
  if (remaining === 1) return 'Finalista';
  if (remaining === 2) return 'Semifinalista';
  if (remaining === 3) return 'Quartas de final';
  return 'Participante';
}

// Playthrough 5.0, Parte A/E/F — causa raiz confirmada do bug real relatado
// ("Coello/Tapia venceram um Masters, +500 na Race; no torneio seguinte
// foram vice-campeões e a Race continuou em 500"): um torneio com
// participação do jogador é EXCLUÍDO da fila de settlement AI-only
// (isWorldTourResolutionPending, WorldTourLifecycle.js — "player_participated
// nunca passa por lá"), cuja autoridade única de settlement passa a ser
// esta função. Mas antes desta correção, prepareTournamentFinalization só
// gravava race_points/rolling points para o JOGADOR e seu PRÓPRIO parceiro
// — nenhum outro par da chave (adversários/fillers reais do jogo, que podem
// ser atletas reais como Coello/Tapia) recebia qualquer crédito, não
// importa até onde avançassem. A tabela de pontos é a MESMA usada pelo
// settlement AI-only (getTournamentRewards -> circuitCatalog.js,
// exatamente o que resolveFinish/getRoundOutcomeTable também leem) —
// nunca uma regra separada pra IA vs. jogador.
//
// Colocação de cada par não-jogador só é creditada quando é DETERMINÁVEL a
// partir do caminho REAL do jogador (nunca inventa o destino de um par que
// o jogador nunca enfrentou, fora do próprio bracket dele — sem simular uma
// segunda chave paralela):
//  - toda rodada k < roundsWon: o jogador venceu esse par -> eliminado
//    exatamente na rodada k (mesma convenção de índice que
//    getTournamentRewards/resolveFinish já usam: k rodadas vencidas antes
//    de cair);
//  - se o jogador foi eliminado antes do título (roundsWon < totalRounds),
//    o par que o eliminou na rodada `roundsWon`: se essa rodada É a final,
//    esse par é o CAMPEÃO real (nenhuma ambiguidade — não sobra mais
//    ninguém pra vencer depois); se não é a final, só sabemos com certeza
//    que esse par venceu ESSA rodada — crédito PISO conservador (nunca
//    superestimado) equivalente a "eliminado na rodada seguinte".
// IDs reais vêm de `run.matches[].opponent` (tournament_run, já construído
// com atletas reais desde o sorteio — createTournamentRun/tournamentDraw.js)
// — nunca por nome, nunca por posição de chave.
function placementRoundsWonForOpponent(run, roundsWon, totalRounds) {
  const credits = new Map();
  if (!Array.isArray(run?.matches)) return credits;
  // LOCAL-7F — `roundsWon`/`totalRounds` contam rodadas da CHAVE PRINCIPAL, mas
  // `run.matches` começa pelas rodadas de qualifying: indexar a lista inteira
  // creditava os adversários do qualifying como se tivessem disputado a chave
  // principal (medido: W.O. na Q1 dava 9 pontos de "rodada principal" à dupla da
  // Q1). Qualifying não pontua (como no AI-only); se a campanha terminou no
  // qualifying, o run não sabe nada sobre a chave principal — nenhum crédito.
  const exitMatch = run.matches.find((match) => (match?.status === 'completed' && match.result && !match.result.won) || match?.status === 'cancelled');
  if (exitMatch?.stage === 'qualifying') return credits;
  const mainMatches = run.matches.filter((match) => match?.stage !== 'qualifying');
  const addCredit = (members, pairRoundsWon) => {
    for (const member of members || []) {
      if (!member?.id) continue;
      const current = credits.get(member.id);
      if (!current || pairRoundsWon > current.roundsWon) credits.set(member.id, { member, roundsWon: pairRoundsWon });
    }
  };
  for (let k = 0; k < roundsWon && k < mainMatches.length; k += 1) {
    addCredit(mainMatches[k]?.opponent, k);
  }
  if (roundsWon < totalRounds && mainMatches[roundsWon]) {
    const eliminatingRoundsWon = roundsWon === totalRounds - 1 ? totalRounds : roundsWon + 1;
    addCredit(mainMatches[roundsWon]?.opponent, eliminatingRoundsWon);
  }
  return credits;
}

// Aplica o crédito de colocação (race_points/world_ranking_points/
// AthleteRankingResult/career_*) a um conjunto já resolvido de {member,
// roundsWon} — extraído de buildNonPlayerPairCreditOperations pra ser
// reaproveitado também por resolvePendingPlayerCanonicalTournaments (que
// resolve um caso mais restrito: só o campeão da FINAL, quando o jogador
// já tinha sido eliminado antes — nunca a mesma leitura "roundsWon do
// jogador" que buildNonPlayerPairCreditOperations usa).
async function applyPairPlacementCredits({ tournament, credits, totalRounds, date }) {
  if (!credits.size) return [];
  const memberIds = [...credits.keys()];
  // 5.26-D — o adversário agora pode ser um atleta REAL do mundo: o id do
  // roster É o id canônico do AthleteProfile (o bot_id é o template de
  // origem, diferente para reais). Resolve por ID primeiro e mantém bot_id
  // como fallback — mesma correção que a 5.12 fez para o parceiro do jogador.
  // Sem isso, o adversário real do campo não recebia crédito de torneio.
  const [athleteRowsById, athleteRowsByBotId, existingResultRows] = await Promise.all([
    localGame.entities.AthleteProfile.filter({ id: { $in: memberIds } }).catch(() => []),
    localGame.entities.AthleteProfile.filter({ bot_id: { $in: memberIds } }).catch(() => []),
    localGame.entities[RANKING_RESULT_ENTITY].filter({ athlete_id: { $in: memberIds } }).catch(() => []),
  ]);
  const athleteById = new Map();
  for (const row of athleteRowsById || []) if (row?.id) athleteById.set(row.id, row);
  for (const row of athleteRowsByBotId || []) if (row?.bot_id && !athleteById.has(row.bot_id)) athleteById.set(row.bot_id, row);
  const resultsByAthlete = new Map();
  for (const row of existingResultRows || []) {
    if (!resultsByAthlete.has(row.athlete_id)) resultsByAthlete.set(row.athlete_id, []);
    resultsByAthlete.get(row.athlete_id).push(row);
  }

  const operations = [];
  for (const { member, roundsWon: pairRoundsWon } of credits.values()) {
    // Sem AthleteProfile canônico (bot procedural sem presença no circuito
    // mundial) — nada pra creditar, nunca fabrica um registro novo aqui.
    const athlete = athleteById.get(member.id);
    if (!athlete?.id) continue;
    const pairRewards = getTournamentRewards(tournament.tier, pairRoundsWon);
    if (!pairRewards.rankPoints) continue;
    const pairChampion = pairRoundsWon >= totalRounds;

    const priorRows = resultsByAthlete.get(athlete.id) || [];
    const lifetimeFallback = Math.max(0, Number(athlete.world_ranking_points ?? athlete.ranking_points) || 0);
    const legacySeed = needsLegacySeed(priorRows, lifetimeFallback) ? buildLegacySeedRow(athlete.id, lifetimeFallback, date) : null;
    const resultRow = {
      id: `${athlete.id}:${tournament.id}`,
      athlete_id: athlete.id,
      tournament_id: tournament.id,
      tournament_name: tournament.name,
      tier: tournament.tier,
      date,
      points: pairRewards.rankPoints,
      finish: placementLabel(pairRoundsWon, totalRounds, pairChampion),
    };
    const extraRows = legacySeed ? [legacySeed, resultRow] : [resultRow];
    const nextWorldPoints = computeRollingPoints(priorRows, extraRows, date);
    if (legacySeed) operations.push({ type: 'upsert', entityName: RANKING_RESULT_ENTITY, id: legacySeed.id, data: legacySeed });
    operations.push({ type: 'upsert', entityName: RANKING_RESULT_ENTITY, id: resultRow.id, data: resultRow });

    const titlesByTier = { ...(athlete.career_titles_by_tier || {}) };
    if (pairChampion && tournament.tier) titlesByTier[tournament.tier] = (titlesByTier[tournament.tier] || 0) + 1;
    operations.push({ type: 'update', entityName: 'AthleteProfile', id: athlete.id, data: {
      race_points: Math.max(0, Number(athlete.race_points) || 0) + pairRewards.rankPoints,
      world_ranking_points: nextWorldPoints,
      ranking_points: nextWorldPoints,
      tournaments_played: Number(athlete.tournaments_played || 0) + 1,
      career_wins: Number(athlete.career_wins || 0) + pairRoundsWon,
      career_losses: Number(athlete.career_losses || 0) + (pairChampion ? 0 : 1),
      career_titles: Number(athlete.career_titles || 0) + (pairChampion ? 1 : 0),
      career_titles_by_tier: titlesByTier,
    } });
  }
  return operations;
}

async function buildNonPlayerPairCreditOperations({ tournament, run, roundsWon, totalRounds, date }) {
  const credits = placementRoundsWonForOpponent(run, roundsWon, totalRounds);
  return applyPairPlacementCredits({ tournament, credits, totalRounds, date });
}

export async function prepareTournamentFinalization({ profile, tournament, partner, roundsWon, totalRounds, runId = null, bracketHistory = null, runnerUp = null, run = null }) {
  const rewards = getTournamentRewards(tournament.tier, roundsWon, profile);
  const champion = roundsWon >= totalRounds;
  const finalizationKey = `tournament:${tournament.id}:canonical-settlement`;
  const processedRuns = Array.isArray(profile.processed_tournament_runs) ? profile.processed_tournament_runs : [];
  const alreadyProcessed = processedRuns.includes(finalizationKey);
  const date = todayForProfile(profile);
  const rankingKey = partner?.id ? teamKey(profile.id, partner.id) : null;
  const [calendarEvents, registrations, rankingRows, partnership, playerResultRows, partnerWorldRows] = await Promise.all([
    localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: tournament.id, status: 'scheduled' }),
    localGame.entities.TournamentRegistration.filter({ profile_id: profile.id, tournament_id: tournament.id }),
    rankingKey ? localGame.entities.TeamRanking.filter({ team_key: rankingKey }) : Promise.resolve([]),
    champion ? getActivePartnership(profile.id) : Promise.resolve(null),
    localGame.entities[RANKING_RESULT_ENTITY].filter({ athlete_id: profile.id }),
    // Playthrough 5.12 — o parceiro do jogador agora é um AthleteProfile de
    // verdade (materializePartnerAthlete), cujo `id` é a identidade
    // canônica; `bot_id` guarda a origem do template e NÃO coincide com ele.
    // A busca era só por `bot_id`, então o parceiro materializado não era
    // encontrado e ficava sem crédito nenhum de torneio (medido: 0
    // AthleteRankingResult depois de um torneio disputado). Resolve por id
    // primeiro e mantém o `bot_id` como fallback para os atletas do mundo
    // que já eram encontrados assim.
    partner?.id
      ? localGame.entities.AthleteProfile.filter({ id: partner.id }).catch(() => [])
      : Promise.resolve([]),
  ]);
  let partnerWorld = partnerWorldRows?.[0] || null;
  if (!partnerWorld && partner?.id) {
    const byBotId = await localGame.entities.AthleteProfile.filter({ bot_id: partner.id }).catch(() => []);
    partnerWorld = byBotId?.[0] || null;
  }
  // LOCAL-7D — resultados do parceiro, para recalcular o rolling dele NESTA
  // finalização (ver `nextPartnerPoints` abaixo).
  const partnerPriorRows = !alreadyProcessed && partnerWorld?.id
    ? ((await localGame.entities[RANKING_RESULT_ENTITY].filter({ athlete_id: partnerWorld.id }).catch(() => [])) || [])
    : [];

  const newXp = (Number(profile.xp) || 0) + rewards.xp;

  // Fase 4 (ranking rolling de 52 semanas): rank_points do jogador deixa de
  // ser incrementado pra sempre — grava um resultado datado nesta MESMA
  // finalização (AthleteRankingResult, coleção própria, nunca no
  // PlayerProfile clonado a cada escrita — mesmo motivo do ranking_history
  // na Fase 4.0) e recalcula o total como soma dos 22 melhores dentro dos
  // últimos 364 dias, igual a qualquer atleta de IA (circuitLifecycle.js).
  // Só roda quando a finalização é nova — idempotente, `alreadyProcessed`
  // continua barrando reprocessamento como sempre barrou.
  let nextRankPoints = Number(profile.rank_points) || 0;
  let playerLegacySeed = null;
  let playerResultRow = null;
  let partnerResultRow = null;
  let partnerLegacySeed = null;
  let nextPartnerPoints = null;
  if (!alreadyProcessed) {
    const priorRows = playerResultRows || [];
    const lifetimeFallback = Math.max(0, Number(profile.rank_points ?? profile.world_ranking_points) || 0);
    playerLegacySeed = needsLegacySeed(priorRows, lifetimeFallback) ? buildLegacySeedRow(profile.id, lifetimeFallback, date) : null;
    playerResultRow = {
      id: `${profile.id}:${tournament.id}`,
      athlete_id: profile.id,
      tournament_id: tournament.id,
      tournament_name: tournament.name,
      tier: tournament.tier,
      date,
      points: rewards.rankPoints,
      finish: champion ? 'champion' : placementLabel(roundsWon, totalRounds, champion),
    };
    if (partnerWorld?.id) {
      partnerResultRow = {
        id: `${partnerWorld.id}:${tournament.id}`,
        athlete_id: partnerWorld.id,
        tournament_id: tournament.id,
        tournament_name: tournament.name,
        tier: tournament.tier,
        date,
        points: rewards.rankPoints,
        finish: champion ? 'champion' : placementLabel(roundsWon, totalRounds, champion),
      };
      // LOCAL-7D — o parceiro recebia o resultado datado mas mantinha o
      // `world_ranking_points` antigo até a próxima passada semanal do
      // circuito; a linha da dupla era gravada com jogador novo + parceiro
      // antigo. Mesma conta que applyPairPlacementCredits já faz para os
      // adversários de IA e que o jogador recebe logo acima.
      const partnerRows = partnerPriorRows.filter((row) => row.id !== partnerResultRow.id);
      const partnerFallback = Math.max(0, Number(partnerWorld.world_ranking_points ?? partnerWorld.ranking_points) || 0);
      partnerLegacySeed = needsLegacySeed(partnerRows, partnerFallback) ? buildLegacySeedRow(partnerWorld.id, partnerFallback, date) : null;
      nextPartnerPoints = computeRollingPoints(partnerRows, partnerLegacySeed ? [partnerLegacySeed, partnerResultRow] : [partnerResultRow], date);
    }
    const extraRows = playerLegacySeed ? [playerLegacySeed, playerResultRow] : [playerResultRow];
    nextRankPoints = computeRollingPoints(priorRows, extraRows, date);
  }

  const playerPatch = alreadyProcessed ? {} : {
    coins: (Number(profile.coins) || 0) + rewards.coins,
    xp: newXp,
    level: levelForXp(newXp),
    tournaments_played: (Number(profile.tournaments_played) || 0) + 1,
    rank_points: nextRankPoints,
    world_ranking_points: nextRankPoints,
    // Correção UI/cronologia — Fase 3: race_points (temporada em andamento)
    // cresce junto com o Circuito (rank_points) a cada torneio real disputado,
    // mas é um campo isolado, zerado à parte na virada do ano civil — nunca
    // copiado/derivado do Circuito acumulado. Fase 4A.3: Race não entra na
    // janela rolling — continua um acumulador simples do ano civil.
    race_points: Math.max(0, Number(profile.race_points) || 0) + rewards.rankPoints,
    processed_tournament_runs: [...processedRuns, finalizationKey].slice(-100),
    ...(champion ? {
      tournaments_won: (Number(profile.tournaments_won) || 0) + 1,
      titles: [...(profile.titles || []), tournament.name],
      confidence: Math.min(100, (Number(profile.confidence) || 50) + 8),
      morale: Math.min(100, (Number(profile.morale) || 70) + 10),
    } : {}),
  };
  const operations = [];

  if (!alreadyProcessed && playerResultRow) {
    if (playerLegacySeed) operations.push({ type: 'upsert', entityName: RANKING_RESULT_ENTITY, id: playerLegacySeed.id, data: playerLegacySeed });
    operations.push({ type: 'upsert', entityName: RANKING_RESULT_ENTITY, id: playerResultRow.id, data: playerResultRow });
    if (partnerLegacySeed) operations.push({ type: 'upsert', entityName: RANKING_RESULT_ENTITY, id: partnerLegacySeed.id, data: partnerLegacySeed });
    if (partnerResultRow) operations.push({ type: 'upsert', entityName: RANKING_RESULT_ENTITY, id: partnerResultRow.id, data: partnerResultRow });
  }
  if (!alreadyProcessed && partnerWorld?.id) {
    operations.push({ type: 'update', entityName: 'AthleteProfile', id: partnerWorld.id, data: {
      race_points: Math.max(0, Number(partnerWorld.race_points) || 0) + rewards.rankPoints,
      ...(nextPartnerPoints !== null ? { world_ranking_points: nextPartnerPoints, ranking_points: nextPartnerPoints } : {}),
    } });
  }

  if (!alreadyProcessed && rankingKey && partner) {
    const ranking = rankingRows?.[0];
    const players = [profile, partner].sort((a, b) => a.id.localeCompare(b.id));
    // Fase 4 (achado #21, razão atualizada): a linha de TeamRanking do
    // jogador tinha o MESMO bug do carryover de temporada um nível abaixo
    // — incrementava pra sempre. Vira média dos dois totais rolling
    // ATUAIS (o do jogador já recalculado acima; o do parceiro, se for de
    // IA, já é rolling desde circuitLifecycle.js) — mesmo padrão que
    // duplas de IA já seguem em updateTeamRankings.
    const partnerPoints = nextPartnerPoints !== null
      ? nextPartnerPoints
      : Math.max(0, Number(partner.world_ranking_points ?? partner.ranking_points) || 0);
    operations.push({ type: 'upsert', entityName: 'TeamRanking', id: ranking?.id || `team-ranking-${rankingKey}`, data: {
      team_key: rankingKey,
      player1_id: players[0].id,
      player1_name: players[0].sport_name || players[0].name,
      player2_id: players[1].id,
      player2_name: players[1].sport_name || players[1].name,
      // Playthrough 5.11, Parte S — fórmula única (média geométrica) em
      // teamRanking.js:computeCanonicalTeamRankingPoints. Era média simples
      // replicada aqui.
      ranking_points: computeCanonicalTeamRankingPoints(nextRankPoints, partnerPoints),
      // Playthrough 5.0, Parte L/N/O — achado real: este bloco só CARREGAVA
      // matches_played adiante (nunca incrementava), e nenhum outro caminho
      // de produção grava esse campo pro par do JOGADOR (updateTeamRanking/
      // addTeamRankingPoints em teamRanking.js nunca são chamadas em
      // nenhum lugar — código morto). Resultado: getTeamRank (item 8 do
      // comentário lá) sempre via matches_played=0 e reportava "Sem
      // ranking" pra sempre, mesmo depois de títulos reais — a seção
      // "Ranking" de "Minha Dupla" (PartnerOverview.jsx, adicionada nesta
      // mesma fase) nunca teria uma posição real pra mostrar. Incrementa 1
      // torneio disputado por finalização real (idempotente, como todo o
      // resto deste bloco — só roda quando `!alreadyProcessed`).
      matches_played: Number(ranking?.matches_played || 0) + 1,
      wins: Number(ranking?.wins || 0) + (champion ? 1 : 0),
      losses: Number(ranking?.losses || 0) + (champion ? 0 : 1),
      titles: champion ? [...(ranking?.titles || []), tournament.name] : (ranking?.titles || []),
    } });
  }
  if (!alreadyProcessed && champion && partnership) {
    const partnershipPatch = buildPartnershipTitlePatch(partnership, date);
    operations.push({ type: 'update', entityName: 'Partnership', id: partnership.id, data: partnershipPatch });
    Object.assign(playerPatch, {
      partner_chemistry: partnershipPatch.chemistry,
      partner_trust: partnershipPatch.partner_trust,
      partner_morale: partnershipPatch.partner_morale,
    });
  }
  // Playthrough 4, item 1 (Londres Challenge: chave e Jornal anunciando
  // campeões DIFERENTES para o mesmo torneio) — a campanha do jogador
  // terminar nunca mais deve deixar o Tournament fora da autoridade única de
  // resolução. Mas Playthrough 4.5, itens 3/4/15 (Roma: campeão aparecendo
  // ANTES da final por a campanha do jogador ter terminado nas quartas) —
  // "encerrar o Tournament" deixou de significar "declarar campeão na hora".
  // `deriveDueCanonicalSettlement` só entrega um resultado quando a rodada
  // final da chave (sempre resolvida deterministicamente desde o sorteio,
  // item 1) alcançou sua PRÓPRIA data real de calendário (item 2) — nunca
  // pela campanha do jogador ter terminado sozinha. Antes da final chegar,
  // este Tournament fica com `status` intacto (não 'finalizado') e
  // `isWorldTourResolutionPending` o exclui da fila do circuito de IA porque
  // `player_participated` é gravado já aqui embaixo — nenhuma fila dupla
  // (Playthrough 4, item 1) e nenhum campeão prematuro (item 3/4) ao mesmo
  // tempo. `resolvePendingPlayerCanonicalTournaments` (day-tick) retoma este
  // MESMO torneio quando a final realmente chegar, sem mais nenhuma partida
  // do jogador para disparar isso.
  const { canonicalSettlement } = deriveDueCanonicalSettlement(tournament, bracketHistory, date);
  const worldEventOp = buildCanonicalTitleWorldEventOperation(tournament, canonicalSettlement, date);
  if (worldEventOp) operations.push(worldEventOp);
  operations.push({ type: 'update', entityName: 'Tournament', id: tournament.id, data: {
    ...(canonicalSettlement ? { status: 'finalizado', current_phase: 'concluido' } : {}),
    player_participated: true,
    ...(Array.isArray(bracketHistory) ? { bracket_history: bracketHistory } : {}),
    ...(canonicalSettlement ? { ...canonicalSettlement.patch, player_decided_result: true } : {}),
  } });
  for (const event of calendarEvents || []) operations.push({ type: 'update', entityName: 'CalendarEvent', id: event.id, data: { status: 'completed', requires_decision: false } });
  for (const registration of (registrations || []).filter((item) => ['pending', 'confirmed'].includes(item.status))) {
    operations.push({ type: 'update', entityName: 'TournamentRegistration', id: registration.id, data: { status: 'completed', completed_at: new Date().toISOString() } });
  }
  if (!alreadyProcessed) {
    operations.push(...await buildNonPlayerPairCreditOperations({ tournament, run, roundsWon, totalRounds, date }));
  }

  const placement = placementLabel(roundsWon, totalRounds, champion);
  const recordKey = finalizationKey.replace(/[^a-zA-Z0-9_-]/g, '-');
  operations.push(
    { type: 'upsert', entityName: 'FinancialTransaction', id: `tournament-prize-${recordKey}`, data: { profile_id: profile.id, date, type: 'income', category: 'torneio', description: `${placement} — ${tournament.name}`, amount: rewards.coins } },
    { type: 'upsert', entityName: 'HistoryEntry', id: `tournament-history-${recordKey}`, data: { profile_id: profile.id, year: Number(date.slice(0, 4)), event_date: date, title: champion ? `Título no ${tournament.name}` : `${placement} no ${tournament.name}`, description: `${safeName(profile)} e ${partner?.name || 'Parceiro'} encerraram o torneio como ${placement.toLowerCase()}.`, category: 'carreira' } },
    { type: 'upsert', entityName: 'PressArticle', id: `tournament-press-${recordKey}`, data: { profile_id: profile.id, title: champion ? `${safeName(profile)} conquista o ${tournament.name}` : `${safeName(profile)} encerra campanha no ${tournament.name}`, content: champion ? `Ao lado de ${partner?.name || 'seu parceiro'}, ${safeName(profile)} levantou o troféu e somou ${rewards.rankPoints} pontos no ranking.` : `A dupla chegou à fase de ${placement.toLowerCase()} e somou experiência para a sequência da temporada.`, sentiment: champion ? 'positivo' : 'neutro', outlet: 'Padel Legacy News', journalist_name: 'Redação PL', published_date: date } },
    { type: 'upsert', entityName: 'Post', id: `tournament-post-${recordKey}`, data: { author_name: 'Padel Legacy News', author_type: 'media', content: champion ? `🏆 ${safeName(profile)} e ${partner?.name || 'Parceiro'} são campeões do ${tournament.name}!` : `${safeName(profile)} terminou o ${tournament.name} como ${placement.toLowerCase()}.`, likes: champion ? 95 : 24, comments_count: champion ? 21 : 5, created_date: new Date().toISOString() } },
  );

  // Playthrough 5.26-B — `playerIncrements` é o ganho do torneio (moedas/XP)
  // para quem grava o patch: aplicado sobre o perfil lido NA HORA DA ESCRITA
  // (padel.js:rebasePlayerPatchIncrements). Os `coins`/`xp` absolutos do
  // `playerPatch` foram calculados sobre `profile` — que ainda não tem as
  // moedas de conquista da última partida — e, gravados como estão,
  // apagavam essas moedas.
  const playerIncrements = alreadyProcessed ? null : { coins: rewards.coins, xp: rewards.xp };
  return { operations, playerPatch, playerIncrements, updatedProfile: { ...profile, ...playerPatch }, rewards, champion, placement, idempotent: alreadyProcessed };
}

export async function finalizeTournamentRun(input) {
  const prepared = await prepareTournamentFinalization(input);
  const operations = [...prepared.operations];
  if (!prepared.idempotent) {
    const fresh = await localGame.entities.PlayerProfile.get(input.profile.id).catch(() => null);
    operations.push({ type: 'playerUpdate', id: input.profile.id, data: rebasePlayerPatchIncrements(prepared.playerPatch, prepared.playerIncrements, fresh || input.profile) });
  }
  const transaction = await localGame.batch(operations);
  return { ...prepared, updatedProfile: transaction.player || prepared.updatedProfile, writes: 1 };
}
