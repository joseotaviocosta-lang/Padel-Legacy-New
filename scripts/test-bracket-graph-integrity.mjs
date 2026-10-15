// Playthrough 4.5B, item 4 — validador puro do grafo estrutural da chave
// canônica. Prova que validateCanonicalBracketGraph aceita chaves sãs
// (qualquer tamanho, potência de 2 ou não) e detecta, com mensagem
// específica, cada uma das 8 invariantes quando violada de propósito.
import assert from 'node:assert/strict';
import {
  buildCanonicalTournamentBracket, validateCanonicalBracketGraph,
} from '../src/gameplay/worldTour/tournamentSettlement.js';

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

// ── Chaves sãs (produzidas pelo próprio motor) validam sem erro, para
// vários tamanhos, incluindo não-potência-de-2 (o caso de Madri).
for (const size of [8, 16, 17, 20, 23, 24, 32]) {
  check(`draw de ${size}: bracket produzido pelo motor valida sem erros estruturais`, () => {
    const bracket = buildCanonicalTournamentBracket({ tournamentId: `graph-${size}`, participants: teams(size), date: '2026-01-01' });
    const result = validateCanonicalBracketGraph(bracket);
    assert.equal(result.valid, true, `erros: ${JSON.stringify(result.errors)}`);
  });
}

// ── Cada invariante, violada de propósito, precisa ser detectada.

check('invariante 1: mais de 2 source_match_ids é rejeitado', () => {
  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'inv1', participants: teams(4), date: '2026-01-01' });
  bracket.bracket_history[1].matches[0].source_match_ids.push('inv1:r0:m0');
  const result = validateCanonicalBracketGraph(bracket);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('mais de 2 source_match_ids')), JSON.stringify(result.errors));
});

check('invariantes 2/5: um source match alimentando dois destinos é rejeitado', () => {
  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'inv2', participants: teams(8), date: '2026-01-01' });
  // Rodada 1 tem 2 confrontos, cada um com 2 sources da rodada 0 (4 matches).
  // Força o 2º confronto da rodada 1 a também citar o source do 1º —
  // "um vencedor alimentando dois destinos".
  bracket.bracket_history[1].matches[1].source_match_ids[0] = bracket.bracket_history[1].matches[0].source_match_ids[0];
  const result = validateCanonicalBracketGraph(bracket);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('alimenta dois destinos')), JSON.stringify(result.errors));
});

check('invariantes 3/4: mesma dupla duas vezes na mesma rodada é rejeitado', () => {
  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'inv3', participants: teams(8), date: '2026-01-01' });
  bracket.bracket_history[0].matches[1].team_a = bracket.bracket_history[0].matches[0].team_a;
  const result = validateCanonicalBracketGraph(bracket);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('aparece mais de uma vez na rodada')), JSON.stringify(result.errors));
});

check('propagação: vencedor de um source que não aparece no destino é rejeitado (propagação para slot errado)', () => {
  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'inv-prop', participants: teams(8), date: '2026-01-01' });
  bracket.bracket_history[1].matches[0].team_a = 'Dupla Inventada Errada';
  const result = validateCanonicalBracketGraph(bracket);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('não aparece em')), JSON.stringify(result.errors));
});

check('invariantes 6/7: rodada final com mais de 1 confronto é rejeitada', () => {
  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'inv6', participants: teams(8), date: '2026-01-01' });
  const finalRound = bracket.bracket_history.at(-1);
  const extra = { ...finalRound.matches[0], match_id: `${finalRound.matches[0].match_id}-dup`, source_match_ids: [] };
  finalRound.matches.push(extra);
  const result = validateCanonicalBracketGraph(bracket);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('exatamente 1 confronto')), JSON.stringify(result.errors));
});

check('invariante 7: champion declarado diferente do vencedor da final é rejeitado', () => {
  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'inv7', participants: teams(4), date: '2026-01-01' });
  const result = validateCanonicalBracketGraph({ ...bracket, champion: 'Alguém que não jogou a final' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('champion declarado')), JSON.stringify(result.errors));
});

check('invariante 8: runner_up declarado diferente do perdedor da final é rejeitado', () => {
  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'inv8', participants: teams(4), date: '2026-01-01' });
  const result = validateCanonicalBracketGraph({ ...bracket, runner_up: 'Alguém que não perdeu a final' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('runner_up declarado')), JSON.stringify(result.errors));
});

check('match_id duplicado é rejeitado', () => {
  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'inv-dup-id', participants: teams(4), date: '2026-01-01' });
  bracket.bracket_history[0].matches[1].match_id = bracket.bracket_history[0].matches[0].match_id;
  const result = validateCanonicalBracketGraph(bracket);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('match_id duplicado')), JSON.stringify(result.errors));
});

check('source_match_id inexistente é rejeitado', () => {
  const bracket = buildCanonicalTournamentBracket({ tournamentId: 'inv-missing-source', participants: teams(4), date: '2026-01-01' });
  bracket.bracket_history[1].matches[0].source_match_ids[0] = 'nao-existe:r0:m99';
  const result = validateCanonicalBracketGraph(bracket);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('inexistente')), JSON.stringify(result.errors));
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-bracket-graph-integrity: PASS');
