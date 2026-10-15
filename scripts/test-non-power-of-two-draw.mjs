// Playthrough 4.5B, itens 5/6/7/8/10 — draws que não são potência de 2
// (Madri: 23/24 duplas — "Rodada de 23 → 12 → 6 → 3 → Final"). Prova que:
//   - a estrutura (participantes/rounds/matches/byes) é coerente para toda
//     a matriz de tamanhos pedida;
//   - a política de bye (item 7: melhor cabeça de chave remanescente avança
//     direto) é determinística e documentada, inclusive na "Rodada de 3";
//   - a projeção temporal (getVisibleTournamentBracketState) nunca duplica
//     uma dupla na mesma rodada revelada, nunca inventa participante, e o
//     grafo armazenado == grafo visível (item 8) — só visibilidade muda.
import assert from 'node:assert/strict';
import {
  buildCanonicalTournamentBracket, deriveTournamentFactsFromFullBracket, validateCanonicalBracketGraph,
} from '../src/gameplay/worldTour/tournamentSettlement.js';
import { getCanonicalRoundDates } from '../src/lib/tournamentSchedule.js';
import { getVisibleTournamentBracketState } from '../src/lib/tournamentBracketView.js';

let passed = 0;
let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function teams(n) {
  return Array.from({ length: n }, (_, i) => ({ name: `Dupla ${i + 1}`, strength: 100 - i }));
}

// ── Item 10 — matriz de tamanhos.
for (const size of [8, 16, 17, 20, 23, 24, 32]) {
  check(`draw de ${size}: estrutura coerente (rounds/matches/byes/champion/runner_up)`, () => {
    const roundCount = Math.ceil(Math.log2(size));
    const roundDates = getCanonicalRoundDates('2026-05-01', roundCount);
    const bracket = buildCanonicalTournamentBracket({ tournamentId: `npow2-${size}`, participants: teams(size), roundDates, date: '2026-05-01' });
    assert.equal(bracket.bracket_history.length, roundCount, `${size} entrantes exige ${roundCount} rodadas`);
    assert.equal(bracket.participants.length, size);
    assert.equal(bracket.placements.length, size, 'todo participante recebe colocação, sem orphan');

    let expectedEntrants = size;
    bracket.bracket_history.forEach((round, roundIndex) => {
      const byeCount = Array.isArray(round.byes) ? round.byes.length : 0;
      const matchCount = round.matches.length;
      assert.equal(byeCount + matchCount * 2, expectedEntrants,
        `rodada ${roundIndex} (${round.round}): ${matchCount} confrontos + ${byeCount} bye(s) devem somar ${expectedEntrants} entrantes`);
      // Playthrough 4.6 — byes agora são decididos UMA VEZ no posicionamento
      // seedado (rodada 0); da rodada 1 em diante o campo já é potência de
      // 2 por construção, nunca mais bye nenhum (ao contrário da política
      // antiga desta fase, que podia gerar bye tardio numa rodada ímpar
      // qualquer — "Rodada de 3" sem proteção de seed nenhuma).
      if (roundIndex === 0) {
        // Byes = bracketSize (próxima potência de 2) - entrantes reais.
        // Campos logo acima de uma potência de 2 (17, 20...) dobram de
        // estrutura (16→32) e concentram MUITOS byes na rodada 0 — esperado
        // e correto pra chaveamento de eliminação simples, não um bug; o
        // invariante real é a conservação já checada acima (byes +
        // confrontos*2 == entrantes), não um teto arbitrário aqui.
        assert.ok(byeCount < size, `bye não pode ser o campo inteiro (obtido ${byeCount} de ${size})`);
      } else {
        assert.equal(byeCount, 0, `bye fora da rodada 0 (rodada ${roundIndex}, ${round.round}) — só a rodada 0 pode ter bye`);
      }
      // Nenhum participante duplicado na mesma rodada.
      const names = [...round.matches.flatMap((m) => [m.team_a, m.team_b]), ...(round.byes || [])];
      assert.equal(new Set(names).size, names.length, `dupla repetida na rodada ${roundIndex} (${round.round})`);
      expectedEntrants = matchCount + byeCount;
    });
    assert.equal(expectedEntrants, 1, 'a chave converge para exatamente 1 campeão');

    const graph = validateCanonicalBracketGraph(bracket);
    assert.equal(graph.valid, true, `sem source duplicado/orphan: ${JSON.stringify(graph.errors)}`);
    assert.ok(bracket.champion, 'campeão derivável');
    assert.ok(bracket.runner_up, 'vice derivável');

    const derived = deriveTournamentFactsFromFullBracket(bracket.bracket_history);
    assert.equal(derived.champion, bracket.champion, 'deriveTournamentFactsFromFullBracket concorda com o campeão do motor');
    assert.equal(derived.placements.length, size);
  });
}

// ── Item 7 — Rodada de 3: o melhor cabeça de chave remanescente avança
// direto para a final; os outros dois disputam a vaga restante.
check('7. Rodada de 3: melhor cabeça de chave recebe bye direto para a final', () => {
  const roundDates = getCanonicalRoundDates('2026-05-01', 2);
  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'round-of-3', participants: teams(3), roundDates, date: '2026-05-01' });
  const semiRound = bracket.bracket_history[0];
  assert.equal(semiRound.round, 'Rodada de 3');
  assert.deepEqual(semiRound.byes, ['Dupla 1'], 'a mais forte (seed 1) recebe o bye — política determinística e documentada');
  assert.equal(semiRound.matches.length, 1, 'as outras 2 duplas disputam a vaga restante');
  const finalRound = bracket.bracket_history[1];
  assert.equal(finalRound.round, 'Final');
  assert.ok([finalRound.matches[0].team_a, finalRound.matches[0].team_b].includes('Dupla 1'), 'quem recebeu o bye realmente chega à final');
});

// ── Item 8 — a projeção temporal só esconde/revela; nunca reconstrói o
// grafo. Compara bracket armazenado vs visível numa chave de 23 (Madri).
check('8/3/5/6. Madri (23 duplas): revelação por data nunca duplica/inventa participante, grafo armazenado == grafo visível', () => {
  const roundCount = Math.ceil(Math.log2(23));
  const roundDates = getCanonicalRoundDates('2026-05-01', roundCount);
  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'madri-23', participants: teams(23), roundDates, date: '2026-05-01' });
  const tournament = {
    id: 'madri-23', tier: 'Gold', status: 'em_andamento', current_phase: 'em_andamento',
    start_date: roundDates[0], end_date: roundDates.at(-1), bracket_schema_version: 2,
    bracket_history: bracket.bracket_history,
  };

  // Um snapshot por data (D0..Final) — item 3 (snapshots por dia).
  for (let dayIndex = 0; dayIndex < roundDates.length; dayIndex += 1) {
    const careerDate = roundDates[dayIndex];
    const visible = getVisibleTournamentBracketState(tournament, careerDate);
    assert.equal(visible.rounds.length, bracket.bracket_history.length, 'grafo visível tem o MESMO número de rodadas do armazenado (item 8: nunca reconstrói)');
    visible.rounds.forEach((round, roundIndex) => {
      const rawRound = bracket.bracket_history[roundIndex];
      assert.equal(round.matches.length, rawRound.matches.length, `rodada ${roundIndex}: mesma quantidade de confrontos armazenada/visível em ${careerDate}`);
      // Nenhuma dupla duplicada na rodada revelada (a corrupção relatada:
      // "o mesmo par aparece propagado em múltiplas partidas").
      const revealedNames = round.matches.flatMap((m) => [m.team_a, m.team_b]).filter((name) => name !== 'Participante a definir');
      assert.equal(new Set(revealedNames).size, revealedNames.length, `dupla duplicada na rodada ${roundIndex} (${round.round}) em careerDate=${careerDate}`);
      // Rodadas cuja data ainda não chegou não podem ter vencedor/placar.
      if (roundIndex > 0 && rawRound.date > careerDate) {
        assert.ok(round.matches.every((m) => m.winner === null && m.score === null),
          `rodada ${roundIndex} (${round.round}) não pode ter vencedor/placar em careerDate=${careerDate}, antes de ${rawRound.date}`);
      }
    });
  }

  // No dia da final, campeão só existe se a própria final foi alcançada —
  // e bate exatamente com o motor determinístico.
  const finalDay = getVisibleTournamentBracketState({ ...tournament, status: 'finalizado', current_phase: 'concluido', champion: bracket.champion }, roundDates.at(-1));
  assert.equal(finalDay.champion, bracket.champion, '9. campeão da projeção visível bate com o motor, só depois da final real');
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-non-power-of-two-draw: PASS');
