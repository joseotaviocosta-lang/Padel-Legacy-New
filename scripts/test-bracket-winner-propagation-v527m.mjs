// Playthrough 5.27-M — propagação de vencedor na chave do jogador:
// quartas → slot certo da semi, semi → slot certo da final, com
// source_match_ids desde o sorteio e rótulos "Vencedor Jogo N" na numeração
// global (a mesma do "Partida N" do card).
import { gateRunner, samplePlayerBracket, withModules, PLAYER } from './lib/v527mTestKit.mjs';

const { gate, finish } = gateRunner('test-bracket-winner-propagation-v527m');

await withModules({ settlement: '/src/gameplay/worldTour/tournamentSettlement.js', view: '/src/lib/tournamentBracketView.js' }, async ({ settlement, view }) => {
  const drawn = samplePlayerBracket(settlement);
  const [qf, sf, fin] = drawn;
  gate('1. semi do jogador nasce com 2 source_match_ids (quartas 1 e 2)', JSON.stringify(sf.matches[0].source_match_ids) === JSON.stringify([qf.matches[0].match_id, qf.matches[1].match_id]));
  gate('2. outra semi alimentada pelas quartas 3 e 4', JSON.stringify(sf.matches[1].source_match_ids) === JSON.stringify([qf.matches[2].match_id, qf.matches[3].match_id]));
  gate('3. final alimentada pelas duas semis', JSON.stringify(fin.matches[0].source_match_ids) === JSON.stringify([sf.matches[0].match_id, sf.matches[1].match_id]));

  // Projeção no dia do sorteio: rótulos globais.
  const tournament = (rounds, status = 'chaveamento') => ({ id: 'tour-527m', tier: 'Exibição', start_date: '2026-01-12', end_date: '2026-01-14', status, bracket_schema_version: 2, bracket_history: rounds });
  const pre = view.getVisibleTournamentBracketState(tournament(drawn), '2026-01-09');
  const labels = (r) => pre.rounds[r].matches.map((m) => `${m.team_a} x ${m.team_b}`);
  gate('4. semis no sorteio: "Vencedor Jogo 1 x 2" e "3 x 4"', JSON.stringify(labels(1)) === JSON.stringify(['Vencedor Jogo 1 x Vencedor Jogo 2', 'Vencedor Jogo 3 x Vencedor Jogo 4']), labels(1).join(' | '));
  gate('5. final no sorteio: "Vencedor Jogo 5 x 6" (as semis, não as quartas)', labels(2)[0] === 'Vencedor Jogo 5 x Vencedor Jogo 6', labels(2)[0]);
  gate('6. numeração global das partidas 1..7', JSON.stringify(pre.rounds.flatMap((r) => r.matches.map((m) => m.match_number))) === '[1,2,3,4,5,6,7]');

  // Caminho A: jogador vence QF e SF, perde a final.
  let rounds = settlement.applyPlayerMatchToCanonicalBracket(drawn, { roundIndex: 0, playerTeamName: PLAYER, won: true, score: '6-3 6-4', date: '2026-01-12' }).rounds;
  gate('7. vitória nas quartas leva o jogador ao lado A da semi', rounds[1].matches[0].team_a === PLAYER);
  gate('8. adversário da semi = vencedor da quarta 2', rounds[1].matches[0].team_b === rounds[0].matches[1].winner);
  rounds = settlement.applyPlayerMatchToCanonicalBracket(rounds, { roundIndex: 1, playerTeamName: PLAYER, won: true, score: '6-4 7-5', date: '2026-01-13' }).rounds;
  gate('9. vitória na semi leva o jogador à final contra o vencedor da outra semi', rounds[2].matches[0].team_a === PLAYER && rounds[2].matches[0].team_b === rounds[1].matches[1].winner);
  rounds = settlement.applyPlayerMatchToCanonicalBracket(rounds, { roundIndex: 2, playerTeamName: PLAYER, won: false, score: '3-6 4-6', date: '2026-01-14' }).rounds;
  let graph = settlement.validateCanonicalBracketGraph(rounds);
  gate('10. caminho A: grafo válido e campeão = adversário da final', graph.valid && rounds[2].matches[0].winner === rounds[1].matches[1].winner, graph.errors.join('; '));

  // Caminho B: jogador perde na semi — cascade completa a final.
  let b = settlement.applyPlayerMatchToCanonicalBracket(drawn, { roundIndex: 0, playerTeamName: PLAYER, won: true, date: '2026-01-12' }).rounds;
  b = settlement.applyPlayerMatchToCanonicalBracket(b, { roundIndex: 1, playerTeamName: PLAYER, won: false, date: '2026-01-13' }).rounds;
  graph = settlement.validateCanonicalBracketGraph(b);
  gate('11. caminho B: quem eliminou o jogador vai à final', b[2].matches[0].team_a === b[1].matches[0].winner && b[1].matches[0].winner !== PLAYER);
  gate('12. caminho B: grafo válido e final resolvida', graph.valid && Boolean(b[2].matches[0].winner), graph.errors.join('; '));

  // Projeção após cada data: rodadas resolvidas sem placeholder.
  const day13 = view.getVisibleTournamentBracketState(tournament(b, 'em_andamento'), '2026-01-13');
  gate('13. no dia da semi, quartas e semis exibidas com duplas reais', day13.rounds.slice(0, 2).every((r) => r.matches.every((m) => !/^Vencedor Jogo/.test(m.team_a) && !/^Vencedor Jogo/.test(m.team_b))));
  const done = view.getVisibleTournamentBracketState({ ...tournament(b, 'finalizado'), champion: b[2].matches[0].winner }, '2026-01-15');
  gate('14. concluído: campeão = vencedor da final', done.champion === b[2].matches[0].winner);
});
finish();
