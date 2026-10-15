// Playthrough 4.7, item 5 — o W.O. precisa usar o MESMO grafo canônico
// (match_id/source_match_ids/winner) que qualquer outro resultado — nunca
// reconstrução paralela por índice. Cenário: jogador W.O. na Rodada de 16;
// prova que o adversário aparece corretamente nas Quartas, e que a chave
// continua até um campeão real nas rodadas seguintes (QF/SF/Final), sem o
// jogador nunca mais reaparecer.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildPlayerTournamentBracket, applyPlayerMatchToCanonicalBracket, validateCanonicalBracketGraph } = await vite.ssrLoadModule('/src/gameplay/worldTour/tournamentSettlement.js');

  let passed = 0;
  let failed = 0;
  const PASS = '\x1b[32m✓\x1b[0m';
  const FAIL = '\x1b[31m✗\x1b[0m';
  function check(label, fn) {
    try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
    catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
  }

  const tournamentId = 'walkover-propagation-test';
  const playerTeamName = 'Jogador & Parceiro';
  const mainOpponents = [
    { name: 'Rival R16 & Parceiro' }, { name: 'Rival QF & Parceiro' },
    { name: 'Rival SF & Parceiro' }, { name: 'Rival Final & Parceiro' },
  ];
  let fillerCursor = 0;
  const fillerFactory = (count) => Array.from({ length: count }, () => {
    fillerCursor += 1;
    return { name: `Preenchimento ${fillerCursor}`, strength: 40 + fillerCursor };
  });

  const bracket = buildPlayerTournamentBracket({
    tournamentId, date: '2026-03-05', roundDates: ['2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08'],
    playerTeamName, mainOpponents, fillerFactory,
  });

  check('pré-condição: chave do jogador tem 4 rodadas (draw 16), R16 com o jogador no match 0', () => {
    assert.equal(bracket.length, 4);
    assert.equal(bracket[0].matches[0].team_a, playerTeamName);
    assert.equal(bracket[0].matches[0].team_b, mainOpponents[0].name);
  });

  // W.O. na Rodada de 16 (roundIndex 0) — jogador perde sem jogar.
  const afterWalkover = applyPlayerMatchToCanonicalBracket(bracket, {
    roundIndex: 0, playerTeamName, opponentTeamName: mainOpponents[0].name,
    won: false, score: null, date: '2026-03-05',
  });

  check('5. o match do jogador na R16 fica terminal, vencedor é o adversário, placar nulo', () => {
    const match = afterWalkover.rounds[0].matches[0];
    assert.equal(match.status, 'completed');
    assert.equal(match.winner, mainOpponents[0].name);
    assert.equal(match.score, null);
  });

  check('5. o adversário do W.O. aparece corretamente nas Quartas de Final (QF)', () => {
    const qfMatch = afterWalkover.rounds[1].matches[0];
    assert.ok([qfMatch.team_a, qfMatch.team_b].includes(mainOpponents[0].name), `adversário deveria estar na QF: ${JSON.stringify(qfMatch)}`);
  });

  check('5. QF/SF/Final acontecem normalmente (todas terminais, com vencedor real)', () => {
    for (let roundIndex = 1; roundIndex < afterWalkover.rounds.length; roundIndex += 1) {
      const match = afterWalkover.rounds[roundIndex].matches[0];
      assert.equal(match.status, 'completed', `rodada ${roundIndex} deveria estar completa`);
      assert.ok(match.winner, `rodada ${roundIndex} deveria ter vencedor`);
    }
  });

  check('5. um campeão real é definido na Final, e o JOGADOR nunca mais reaparece em nenhuma rodada seguinte', () => {
    const finalMatch = afterWalkover.rounds[afterWalkover.rounds.length - 1].matches[0];
    assert.ok(finalMatch.winner, 'deveria haver campeão');
    for (let roundIndex = 1; roundIndex < afterWalkover.rounds.length; roundIndex += 1) {
      const match = afterWalkover.rounds[roundIndex].matches[0];
      assert.notEqual(match.team_a, playerTeamName, `jogador não pode reaparecer na rodada ${roundIndex}`);
      assert.notEqual(match.team_b, playerTeamName, `jogador não pode reaparecer na rodada ${roundIndex}`);
      assert.notEqual(match.winner, playerTeamName, `jogador não pode vencer nada depois do próprio W.O.`);
    }
  });

  check('5. o grafo canônico continua estruturalmente válido depois do W.O. (mesmo validador de sempre)', () => {
    const validation = validateCanonicalBracketGraph({ bracket_history: afterWalkover.rounds });
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-walkover-bracket-propagation: PASS');
} finally {
  await vite.close();
}
