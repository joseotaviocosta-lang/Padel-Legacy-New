import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { FINALS_TEAM_RANKING_LIMITS, selectFinalsEntrants } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const pairs = Array.from({ length: 20 }, (_, index) => ({
    id: `partnership-${index + 1}`,
    athletes: [{ id: `athlete-${index * 2 + 1}` }, { id: `athlete-${index * 2 + 2}` }],
  }));
  const rankings = [...pairs].reverse().map((pair, index) => ({
    team_key: pair.athletes.map((athlete) => athlete.id).sort().join('_'),
    ranking_points: 20_000 - index,
  }));
  const circuit = selectFinalsEntrants({ tier: 'Circuit Finals' }, pairs, rankings);
  const legacy = selectFinalsEntrants({ tier: 'Legacy Finals' }, pairs, rankings);
  assert.deepEqual(FINALS_TEAM_RANKING_LIMITS, { 'Circuit Finals': 8, 'Legacy Finals': 16 });
  assert.equal(circuit.length, 8);
  assert.equal(legacy.length, 16);
  assert.deepEqual(circuit.map((pair) => pair.id), pairs.slice().reverse().slice(0, 8).map((pair) => pair.id));
  assert.deepEqual(legacy.map((pair) => pair.id), pairs.slice().reverse().slice(0, 16).map((pair) => pair.id));
  assert.equal(selectFinalsEntrants({ tier: 'Masters' }, pairs, rankings), null);
  console.log('test-finals-entry-authority-v57: PASS');
} finally {
  await vite.close();
}
