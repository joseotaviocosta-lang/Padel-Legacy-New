// Playthrough 4.6C, itens 6/7/8/9 — invariantes de estado do sorteio/
// lifecycle de um torneio, centralizadas em getTournamentDrawState
// (tournamentBracketView.js). Antes, "Encerrado" no card da lista
// (Tournaments.jsx) vinha de uma comparação PURA de data
// (start_date < careerDate), sem saber se o settlement realmente
// concluiu — Madri/Cidade do Cabo/Doha apareciam "Encerrado" sem bloco de
// campeão. Este teste prova que a nova fonte única nunca confunde
// "data passou" com "lifecycle concluído", e que COMPLETED sempre implica
// campeão existente.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getTournamentDrawState, TOURNAMENT_DRAW_STATES } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');

  let passed = 0;
  let failed = 0;
  const PASS = '\x1b[32m✓\x1b[0m';
  const FAIL = '\x1b[31m✗\x1b[0m';
  function check(label, fn) {
    try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
    catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
  }

  check('9. torneio inválido/ausente -> INVALID', () => {
    assert.equal(getTournamentDrawState(null, '2026-01-01'), TOURNAMENT_DRAW_STATES.INVALID);
    assert.equal(getTournamentDrawState({}, '2026-01-01'), TOURNAMENT_DRAW_STATES.INVALID);
  });

  check('9. cancelado explicitamente -> CANCELLED, mesmo com data futura ou passada', () => {
    const cancelled = { id: 't1', world_tour_cancelled: true, start_date: '2026-01-29' };
    assert.equal(getTournamentDrawState(cancelled, '2026-01-01'), TOURNAMENT_DRAW_STATES.CANCELLED);
    assert.equal(getTournamentDrawState(cancelled, '2026-02-01'), TOURNAMENT_DRAW_STATES.CANCELLED);
  });

  check('9. sem chave, data futura -> NOT_DUE', () => {
    const notDue = { id: 't2', start_date: '2026-01-29', bracket_history: [] };
    assert.equal(getTournamentDrawState(notDue, '2026-01-01'), TOURNAMENT_DRAW_STATES.NOT_DUE);
  });

  check('5/9. sem chave, data já chegou/passou -> PENDING (pendência factual, nunca limbo silencioso)', () => {
    const pending = { id: 't3', start_date: '2026-01-29', bracket_history: [] };
    assert.equal(getTournamentDrawState(pending, '2026-01-29'), TOURNAMENT_DRAW_STATES.PENDING);
    assert.equal(getTournamentDrawState(pending, '2026-02-05'), TOURNAMENT_DRAW_STATES.PENDING);
  });

  check('9. chave existe, torneio ainda não começou -> DRAWN', () => {
    const drawn = {
      id: 't4', start_date: '2026-01-29', bracket_schema_version: 2,
      bracket_history: [{ round: 'Rodada de 16', matches: [{ match_id: 'm1', team_a: 'A', team_b: 'B' }] }],
    };
    assert.equal(getTournamentDrawState(drawn, '2026-01-26'), TOURNAMENT_DRAW_STATES.DRAWN);
  });

  check('7/8/9. chave existe, torneio em andamento (dentro da janela) -> IN_PROGRESS, nunca COMPLETED sem campeão', () => {
    const inProgress = {
      id: 't5', start_date: '2026-01-29', end_date: '2026-02-01', bracket_schema_version: 2,
      bracket_history: [{ round: 'Rodada de 16', matches: [{ match_id: 'm1', team_a: 'A', team_b: 'B' }] }],
      champion: null, status: 'em_andamento',
    };
    assert.equal(getTournamentDrawState(inProgress, '2026-01-30'), TOURNAMENT_DRAW_STATES.IN_PROGRESS);
  });

  check('6/7/8. chave existe, DATA JÁ PASSOU mas campeão ainda ausente -> IN_PROGRESS (pendente de resolução), NUNCA "Encerrado"/COMPLETED', () => {
    // Este é exatamente o caso relatado: Madri/Cidade do Cabo/Doha
    // apareciam "Encerrado" sem bloco de campeão. A causa correta (item 6)
    // é diferenciada aqui: se champion está ausente, o estado NUNCA pode
    // ser COMPLETED, mesmo com end_date no passado.
    const stuck = {
      id: 't6', start_date: '2026-01-29', end_date: '2026-02-01', bracket_schema_version: 2,
      bracket_history: [{ round: 'Rodada de 16', matches: [{ match_id: 'm1', team_a: 'A', team_b: 'B' }] }],
      champion: null, status: 'em_andamento', world_tour_resolved: false,
    };
    assert.equal(getTournamentDrawState(stuck, '2026-02-10'), TOURNAMENT_DRAW_STATES.IN_PROGRESS,
      'data no passado sem campeão não pode virar COMPLETED nem ser confundido com "Encerrado" definitivo');
  });

  check('7. status:"finalizado" sozinho NÃO basta — precisa de champion também (invariante do item 7)', () => {
    const fakeFinalized = {
      id: 't7', start_date: '2026-01-29', end_date: '2026-02-01', bracket_schema_version: 2,
      bracket_history: [{ round: 'Final', matches: [{ match_id: 'm1', team_a: 'A', team_b: 'B' }] }],
      status: 'finalizado', champion: null,
    };
    assert.notEqual(getTournamentDrawState(fakeFinalized, '2026-02-05'), TOURNAMENT_DRAW_STATES.COMPLETED,
      'status finalizado sem champion não é uma conclusão factual válida');
  });

  check('6/7. chave completa + campeão persistido -> COMPLETED', () => {
    const completed = {
      id: 't8', start_date: '2026-01-29', end_date: '2026-02-01', bracket_schema_version: 2,
      bracket_history: [{ round: 'Final', matches: [{ match_id: 'm1', team_a: 'A', team_b: 'B', winner: 'A' }], is_final: true }],
      status: 'finalizado', current_phase: 'concluido', champion: 'A', runner_up: 'B', world_tour_resolved: true,
    };
    assert.equal(getTournamentDrawState(completed, '2026-02-05'), TOURNAMENT_DRAW_STATES.COMPLETED);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-tournament-completion-invariants: PASS');
} finally {
  await vite.close();
}
