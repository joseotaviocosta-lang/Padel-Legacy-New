import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const api = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const valid = { id: 'v', player1_id: 'b', player2_id: 'a', team_key: 'a_b', ranking_points: 10, matches_played: 2 };
  const invalid = { id: 'x', team_key: 'names-only', ranking_points: 9999 };
  assert.equal(api.isCanonicalTeamRankingRow(valid), true);
  assert.equal(api.isCanonicalTeamRankingRow(invalid), false);
  assert.deepEqual(api.dedupeTeamRankingsByCanonicalPair([invalid, valid]), [valid]);
  console.log('test-team-ranking-canonical-row-v56: PASS');
} finally { await vite.close(); }
