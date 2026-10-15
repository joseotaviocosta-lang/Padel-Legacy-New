// Playthrough 5.27-M — a chave histórica de um torneio concluído é o grafo
// PERSISTIDO no sorteio: mesmas duplas, todas as rodadas resolvidas, campeão
// e vice da árvore real, nenhum placeholder depois da conclusão.
import { gateRunner, onboarding, samplePlayerBracket, withModules, PLAYER } from './lib/v527mTestKit.mjs';

const { gate, finish } = gateRunner('test-historical-bracket-integrity-v527m');
const names = (rounds) => rounds.flatMap((r) => r.matches.flatMap((m) => [m.team_a, m.team_b])).filter(Boolean);
const isPlaceholder = (n) => /^(Vencedor Jogo \d+|Participante a definir)$/.test(String(n));

await withModules({ settlement: '/src/gameplay/worldTour/tournamentSettlement.js', view: '/src/lib/tournamentBracketView.js' }, async ({ settlement, view }) => {
  const drawn = samplePlayerBracket(settlement);
  const drawEntrants = new Set(names([drawn[0]]));
  gate('1. sorteio: quartas com 8 duplas distintas', drawEntrants.size === 8);

  // Jogador perde nas quartas: o resto da chave é resolvido pelo cascade.
  const { rounds } = settlement.applyPlayerMatchToCanonicalBracket(drawn, { roundIndex: 0, playerTeamName: PLAYER, opponentTeamName: 'Rival QF A & Rival QF B', won: false, score: '4-6 3-6', date: '2026-01-12' });
  const graph = settlement.validateCanonicalBracketGraph(rounds);
  gate('2. grafo persistido válido (source_match_ids, um destino por origem, vencedor no slot certo)', graph.valid, graph.errors.join('; '));
  gate('3. todas as 7 partidas resolvidas', rounds.every((r) => r.matches.every((m) => m.winner)));
  gate('4. nenhuma dupla fora do sorteio aparece em rodada posterior', names(rounds.slice(1)).every((n) => drawEntrants.has(n)));

  const finalMatch = rounds.at(-1).matches[0];
  const tournament = { id: 'tour-527m', tier: 'Exibição', start_date: '2026-01-12', end_date: '2026-01-14', status: 'finalizado', current_phase: 'concluido', bracket_schema_version: 2, bracket_history: rounds, champion: finalMatch.winner, runner_up: finalMatch.team_a === finalMatch.winner ? finalMatch.team_b : finalMatch.team_a };
  const state = view.getVisibleTournamentBracketState(tournament, '2026-01-15');
  gate('5. histórico: nenhum "A definir"/"Vencedor Jogo" depois da conclusão', !names(state.rounds).some(isPlaceholder));
  gate('6. histórico: todas as rodadas com resultado', state.rounds.every((r) => r.matches.every((m) => m.terminal && m.winner)));
  gate('7. campeão = vencedor da final da árvore persistida', state.champion === finalMatch.winner);
  gate('8. quartas exibidas = duplas do sorteio', names([state.rounds[0]]).every((n) => drawEntrants.has(n)));

  // Evidência do cenário real (repro headless do playtest, com save/reload).
  for (const variant of ['continuous', 'reload']) {
    const run = onboarding(variant);
    const at = (moment) => run.bracketMoments.find((m) => m.moment === moment);
    const postDraw = at('post-draw'); const historical = at('historical-final-after-reload') || at('historical-final');
    const drawSet = new Set(postDraw.raw[0].matches.flatMap((m) => [m.team_a, m.team_b]));
    gate(`9. [${variant}] histórico final sem placeholder`, historical.viewPlaceholders === 0);
    gate(`10. [${variant}] histórico usa só duplas do sorteio`, historical.view.rounds.flatMap((r) => r.matches.flatMap((m) => [m.team_a, m.team_b])).every((n) => drawSet.has(n)));
    gate(`11. [${variant}] campeão exibido = vencedor da final persistida`, historical.view.champion === historical.raw.at(-1).matches[0].winner && historical.champion === historical.view.champion);
    gate(`12. [${variant}] quartas do histórico = quartas do sorteio`, JSON.stringify(historical.raw[0].matches.map((m) => [m.team_a, m.team_b])) === JSON.stringify(postDraw.raw[0].matches.map((m) => [m.team_a, m.team_b])));
  }
});
finish();
