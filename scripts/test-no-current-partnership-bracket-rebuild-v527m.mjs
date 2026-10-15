// Playthrough 5.27-M — a chave nunca é reconstruída a partir do estado
// ATUAL (nome do atleta, parceria atual, campo atual). A identidade das
// duplas fica congelada no sorteio; a projeção da UI é função pura do
// Tournament persistido.
import { readFileSync } from 'node:fs';
import { gateRunner, samplePlayerBracket, withModules, PLAYER } from './lib/v527mTestKit.mjs';

const { gate, finish } = gateRunner('test-no-current-partnership-bracket-rebuild-v527m');
const CURRENT = 'Nome Novo & Outro Parceiro';
const all = (rounds) => rounds.flatMap((r) => r.matches.flatMap((m) => [m.team_a, m.team_b, m.winner])).filter(Boolean);

await withModules({ settlement: '/src/gameplay/worldTour/tournamentSettlement.js', view: '/src/lib/tournamentBracketView.js' }, async ({ settlement, view }) => {
  const drawn = samplePlayerBracket(settlement);

  // Atleta renomeado + parceria trocada ENTRE o sorteio e a partida: o
  // chamador (TournamentModal) passa o nome atual.
  let rounds = settlement.applyPlayerMatchToCanonicalBracket(drawn, { roundIndex: 0, playerTeamName: CURRENT, opponentTeamName: 'Outro Nome Do Rival', won: true, date: '2026-01-12' }).rounds;
  gate('1. lado do jogador na quarta continua o do sorteio', rounds[0].matches[0].team_a === PLAYER);
  gate('2. adversário da quarta continua o do sorteio', rounds[0].matches[0].team_b === drawn[0].matches[0].team_b);
  gate('3. vencedor gravado com a identidade do sorteio', rounds[0].matches[0].winner === PLAYER);
  rounds = settlement.applyPlayerMatchToCanonicalBracket(rounds, { roundIndex: 1, playerTeamName: CURRENT, won: false, date: '2026-01-13' }).rounds;
  gate('4. nome atual nunca entra na chave (nenhuma ocorrência)', !all(rounds).includes(CURRENT));
  gate('5. composição das quartas idêntica ao sorteio', JSON.stringify(rounds[0].matches.map((m) => [m.team_a, m.team_b])) === JSON.stringify(drawn[0].matches.map((m) => [m.team_a, m.team_b])));

  const t = { id: 'tour-527m', tier: 'Exibição', start_date: '2026-01-12', end_date: '2026-01-14', status: 'finalizado', bracket_schema_version: 2, bracket_history: rounds, champion: rounds[2].matches[0].winner };
  const a = view.getVisibleTournamentBracketState(t, '2026-01-15');
  const b = view.getVisibleTournamentBracketState(JSON.parse(JSON.stringify(t)), '2026-01-15');
  gate('6. projeção é determinística (mesmo Tournament → mesma chave)', JSON.stringify(a) === JSON.stringify(b));
});

const viewSrc = readFileSync('src/lib/tournamentBracketView.js', 'utf8');
gate('7. tournamentBracketView.js é puro (nenhum import de storage/parceria/ranking)', !/^import /m.test(viewSrc));
const bracketUi = readFileSync('src/components/tournaments/TournamentBracket.jsx', 'utf8');
gate('8. TournamentBracket.jsx não consulta parceria/ranking/perfil atual', !/partnership|getActivePartnership|teamRanking|PlayerProfile|localGame/.test(bracketUi));
finish();
