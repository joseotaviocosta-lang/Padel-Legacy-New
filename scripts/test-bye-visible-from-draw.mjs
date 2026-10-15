// Playthrough 4.6B, itens 6/7/8/14 — um cabeça de chave com BYE (Masters de
// 24 duplas: 8 byes pros 8 seeds protegidos, Playthrough 4.6) só aparecia na
// Rodada de 16 depois que a Rodada de 24 inteira "acontecia" na carreira —
// mesmo sendo um FATO conhecido desde o sorteio (D-3). getVisibleTournamentBracketState
// agora projeta POR SLOT: o lado que veio de um BYE é revelado imediatamente
// (independente da data da rodada anterior); o lado que depende de uma
// partida real ainda não datada mostra um placeholder "Vencedor Jogo N" —
// nunca resolve quem vai vencer aquele jogo (item 8).
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildCanonicalTournamentBracket } = await vite.ssrLoadModule('/src/gameplay/worldTour/tournamentSettlement.js');
  const { getVisibleTournamentBracketState } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');
  const { getCanonicalRoundDates } = await vite.ssrLoadModule('/src/lib/tournamentSchedule.js');

  let passed = 0;
  let failed = 0;
  const PASS = '\x1b[32m✓\x1b[0m';
  const FAIL = '\x1b[31m✗\x1b[0m';
  function check(label, fn) {
    try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
    catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
  }

  // Draw 24 (Masters) — mesmo cenário do relato real (item 14). 8 byes pros
  // 8 primeiros seeds (bracketSize 32, seedCountForDrawSize(24)=8).
  const entrants = Array.from({ length: 24 }, (_, i) => ({ name: `Dupla ${i + 1}`, strength: 24 - i }));
  const startDate = '2026-03-05';
  const roundDates = getCanonicalRoundDates(startDate, 5); // 32 -> 5 rodadas.
  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'draw24-bye-visible', participants: entrants, date: startDate, roundDates });

  const byes = bracket.bracket_history[0].byes || [];
  console.log(`byes na Rodada de 24: ${byes.join(', ')}`);
  check('14. draw 24 real produz exatamente 8 BYEs (seedCountForDrawSize(24))', () => {
    assert.equal(byes.length, 8, JSON.stringify(byes));
  });

  const tournament = {
    id: 'draw24-bye-visible', bracket_schema_version: 2, bracket_history: bracket.bracket_history,
    status: 'chaveamento', current_phase: 'chaveamento', start_date: startDate,
  };

  // Data ANTES da Rodada de 24 concluir (a própria data da rodada 0 ainda
  // não chegou) — cenário exato do D-3: o sorteio já existe (bracket_history
  // já persistido), mas nenhuma partida da 1ª rodada aconteceu ainda.
  const beforeRound0Date = new Date(`${bracket.bracket_history[0].date}T00:00:00Z`);
  beforeRound0Date.setUTCDate(beforeRound0Date.getUTCDate() - 1);
  const careerDateAtDraw = beforeRound0Date.toISOString().slice(0, 10);

  const visible = getVisibleTournamentBracketState(tournament, careerDateAtDraw);
  const round0 = visible.rounds[0];
  const round1 = visible.rounds[1];

  check('6/7. Rodada de 24 (round 0) é visível desde o sorteio — todos os 24 nomes reais aparecem', () => {
    const namesInRound0 = new Set([...round0.matches.flatMap((m) => [m.team_a, m.team_b])]);
    for (const entrant of entrants) assert.ok(namesInRound0.has(entrant.name) || byes.includes(entrant.name), `${entrant.name} deveria aparecer na rodada 0`);
  });

  check('6/7/14. TODOS os 8 seeds com BYE já aparecem pelo nome na Rodada de 16, mesmo antes da Rodada de 24 acontecer', () => {
    const namesInRound1 = new Set([...round1.matches.flatMap((m) => [m.team_a, m.team_b])]);
    for (const byeName of byes) {
      assert.ok(namesInRound1.has(byeName), `BYE "${byeName}" deveria já aparecer na Rodada de 16 (D-3), sem esperar a Rodada de 24 acontecer — visto: ${[...namesInRound1].join(', ')}`);
    }
  });

  check('7/8. o lado NÃO-bye de cada confronto da Rodada de 16 mostra "Vencedor Jogo N", nunca um nome resolvido cedo demais', () => {
    for (const match of round1.matches) {
      const sides = [match.team_a, match.team_b];
      const nonByeSides = sides.filter((name) => !byes.includes(name));
      for (const side of nonByeSides) {
        assert.ok(/^Vencedor Jogo \d+$/.test(side) || side === 'Participante a definir', `lado dependente de partida futura não deveria estar resolvido: "${side}"`);
      }
    }
  });

  check('8. nenhuma partida da Rodada de 16 é marcada como terminal/decidida antes da hora (placar/vencedor nulos)', () => {
    for (const match of round1.matches) {
      assert.equal(match.terminal, false, `partida da Rodada de 16 não pode estar decidida ainda: ${JSON.stringify(match)}`);
      assert.equal(match.winner, null);
      assert.equal(match.score, null);
    }
  });

  // Depois que a Rodada de 24 acontece de verdade (data alcançada), os
  // placeholders "Vencedor Jogo N" viram os nomes reais dos vencedores —
  // sem alterar a estrutura (mesmos match_id/slots), só revelando o que já
  // estava correto desde o sorteio (nunca uma reconstrução).
  const round0Date = bracket.bracket_history[0].date;
  const visibleAfter = getVisibleTournamentBracketState(tournament, round0Date);
  const round1After = visibleAfter.rounds[1];
  check('7. depois que a Rodada de 24 acontece, os placeholders da Rodada de 16 viram nomes reais (mesma estrutura)', () => {
    for (const match of round1After.matches) {
      assert.ok(!/^Vencedor Jogo \d+$/.test(match.team_a), `team_a deveria estar revelado: ${match.team_a}`);
      assert.ok(!/^Vencedor Jogo \d+$/.test(match.team_b), `team_b deveria estar revelado: ${match.team_b}`);
    }
    assert.equal(round1After.matches.length, round1.matches.length, 'estrutura da rodada não muda, só a revelação');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-bye-visible-from-draw: PASS');
} finally {
  await vite.close();
}
