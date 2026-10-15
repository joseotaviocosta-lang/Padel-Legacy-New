import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const mod = await server.ssrLoadModule('/src/lib/tournaments.js');
  const { orderTournamentsForView } = mod;

  const tournaments = [
    { id: 'old', start_date: '2026-01-02' },
    { id: 'newest', start_date: '2026-01-18' },
    { id: 'middle', start_date: '2026-01-09' },
  ];

  assert.deepEqual(
    orderTournamentsForView(tournaments, 'past').map((t) => t.id),
    ['newest', 'middle', 'old'],
    'histórico: o item mais recente precisa vir primeiro no passado'
  );

  assert.deepEqual(
    orderTournamentsForView(tournaments, 'upcoming').map((t) => t.id),
    ['old', 'middle', 'newest'],
    'agenda: o item mais próximo precisa vir primeiro no futuro'
  );

  console.log('test-tournament-history-order: PASS');
} finally {
  await server.close();
}
