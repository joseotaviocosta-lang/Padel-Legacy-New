// Playthrough 4 — autoridade do resultado de um torneio disputado pelo jogador.
//
// Regressão para o conflito de campeões medido em produção (Londres
// Challenge): a chave anunciava Hugo Torres & Diogo Monteiro, com o placar
// real da final contra o jogador, enquanto o Jornal e o Race coroavam uma
// dupla de IA que nunca entrou na chave. Causa: prepareTournamentFinalization
// só gravava no Tournament quando o jogador era CAMPEÃO; perdendo, o evento
// continuava elegível ao predicado de pendência do circuito da IA e era
// re-resolvido do zero.
import assert from 'node:assert';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const load = (path) => server.ssrLoadModule(path);

const { createTournamentRun, buildTournamentBracketHistory } = await load('/src/gameplay/worldTour/TournamentRunManager.js');
const { getVisibleTournamentBracketState, visibleTournamentChampion } = await load('/src/lib/tournamentBracketView.js');
const { isWorldTourResolutionPending } = await load('/src/gameplay/worldTour/WorldTourLifecycle.js');
const { getTournamentRoundsForTier } = await load('/src/lib/tournamentSchedule.js');

const PLAYER_TEAM = 'Jogador & Parceiro';
const rounds = getTournamentRoundsForTier('Bronze');
const tournamentBase = {
  id: 't-londres', name: 'Londres Challenge', tier: 'Bronze',
  start_date: '2026-01-29', end_date: '2026-01-31', world_tour_event: true,
};

function runWithResults(results) {
  const opponents = rounds.map((_, index) => [{ name: `Rival${index}A` }, { name: `Rival${index}B` }]);
  const run = createTournamentRun({ tournament: tournamentBase, profileId: 'p1', startDate: '2026-01-29', mainRounds: rounds, opponents });
  results.forEach((won, index) => {
    run.matches[index].status = 'completed';
    run.matches[index].result = { won, score: won ? '6-4 6-3' : '4-6 5-7' };
  });
  return run;
}

// --- Caso A: jogador perde a FINAL. A chave é a verdade e o circuito da IA
// não pode re-resolver o evento.
{
  const wins = rounds.map((_, index) => index < rounds.length - 1);
  const history = buildTournamentBracketHistory(runWithResults(wins), PLAYER_TEAM);
  const finalRound = history[history.length - 1];
  assert.equal(history.length, rounds.length, 'chave completa quando o jogador chega à final');
  assert.equal(finalRound.is_final, true, 'a última rodada da campanha é marcada como final');
  const bracketChampion = finalRound.matches[0].winner;
  assert.notEqual(bracketChampion, PLAYER_TEAM, 'quem perde a final não é campeão');

  const finalized = {
    ...tournamentBase, status: 'finalizado', current_phase: 'concluido',
    player_participated: true, player_decided_result: true, world_tour_resolved: true,
    champion: bracketChampion, runner_up: PLAYER_TEAM, bracket_history: history,
  };
  assert.equal(isWorldTourResolutionPending(finalized, '2026-02-05'), false,
    'torneio com final decidida pela chave nunca volta para a fila do circuito da IA');
  assert.equal(visibleTournamentChampion(finalized, '2026-02-05'), bracketChampion,
    'chave e Tournament.champion apontam para a MESMA dupla');
}

// --- Caso B: jogador eliminado na 1ª rodada. A chave termina ali, não coroa
// o algoz, e o circuito da IA ainda precisa decidir o título.
{
  const history = buildTournamentBracketHistory(runWithResults([false]), PLAYER_TEAM);
  assert.equal(history.length, 1, 'a chave termina na rodada da eliminação — sem rodadas fantasma do jogador');
  assert.equal(history[0].is_final, false, 'a rodada da eliminação não é a final do torneio');

  const finalizedNoChampion = {
    ...tournamentBase, status: 'finalizado', current_phase: 'concluido',
    player_participated: true, bracket_history: history,
  };
  const state = getVisibleTournamentBracketState(finalizedNoChampion, '2026-02-05');
  assert.equal(state.champion, null, 'sem campeão gravado, a chave não promove o algoz do jogador a campeão');
  assert.equal(isWorldTourResolutionPending(finalizedNoChampion, '2026-02-05'), true,
    'título indefinido continua pendente para o circuito da IA resolver');

  const resolvedByAi = { ...finalizedNoChampion, world_tour_resolved: true, champion: 'Rubén Giménez & Franco Herrera' };
  assert.equal(visibleTournamentChampion(resolvedByAi, '2026-02-05'), 'Rubén Giménez & Franco Herrera',
    'campeão definido pelo circuito aparece também na aba da chave');
  assert.equal(isWorldTourResolutionPending(resolvedByAi, '2026-02-05'), false, 'resolvido uma única vez');
}

// --- Caso C: torneio de IA puro (sem chave desenhada) segue resolvendo e
// exibindo campeão como sempre.
{
  const aiOnly = { ...tournamentBase, id: 't-doha', name: 'Doha Champions Masters' };
  assert.equal(isWorldTourResolutionPending(aiOnly, '2026-02-05'), true, 'torneio vencido sem resolução é pendente');
  assert.equal(isWorldTourResolutionPending(aiOnly, '2026-01-15'), false, 'torneio futuro não é pendente');
  const resolved = { ...aiOnly, status: 'finalizado', world_tour_resolved: true, champion: 'Galán & Chingotto' };
  assert.equal(visibleTournamentChampion(resolved, '2026-02-05'), 'Galán & Chingotto',
    'sem bracket_history o campeão do Tournament é a fonte da aba da chave');
}

await server.close();
console.log('OK test-tournament-result-authority: chave e circuito com uma única verdade por torneio');
