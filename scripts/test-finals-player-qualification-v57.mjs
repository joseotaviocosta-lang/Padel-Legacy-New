import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { evaluateTournamentEntry, ENTRY_PATHS } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  for (const [tier, cutoff] of [['Circuit Finals', 8], ['Legacy Finals', 16]]) {
    assert.equal(evaluateTournamentEntry({ tier }, { teamRank: cutoff }).path, ENTRY_PATHS.DIRECT, `${tier} cutoff`);
    assert.equal(evaluateTournamentEntry({ tier }, { teamRank: cutoff + 1 }).eligible, false, `${tier} outside cutoff`);
  }
  for (const rank of [300, 100, 50, 20]) assert.equal(evaluateTournamentEntry({ tier: 'Legacy Finals' }, { teamRank: rank }).eligible, false);
  assert.equal(evaluateTournamentEntry({ tier: 'Legacy Finals' }, { teamRank: 10 }).eligible, true);
  console.log('test-finals-player-qualification-v57: PASS');
} finally {
  await vite.close();
}
