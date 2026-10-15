import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildSeedings } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const entries = Array.from({ length: 16 }, (_, index) => ({ id: `team-${index + 1}`, rank: index + 1 }));
  const seeded = buildSeedings(entries.slice().reverse(), 16);
  assert.deepEqual(seeded.slice(0, 4).map((entry) => entry.seed), [1, 2, 3, 4]);
  assert.deepEqual(seeded.slice(0, 4).map((entry) => entry.rank), [1, 2, 3, 4]);
  console.log('test-finals-seeding-integrity-v57: PASS');
} finally {
  await vite.close();
}
