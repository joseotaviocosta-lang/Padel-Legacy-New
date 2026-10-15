import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const catalog = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const entry = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const diagnostics = await vite.ssrLoadModule('/src/gameplay/worldTour/tierEntryDiagnostics.js');
  const expected = {
    Bronze: [800, Number.MAX_SAFE_INTEGER], Silver: [400, 800], Gold: [320, 450],
    Platinum: [230, 320], Masters: [140, 230], Elite: [75, 140], Crown: [1, 75],
  };
  for (const [tier, [minRank, maxRank]] of Object.entries(expected)) {
    assert.deepEqual(catalog.getTierDiagnosticCoreBand(tier), { minRank, maxRank });
    assert.equal(catalog.isRankInTierDiagnosticCore(minRank, tier), true, `${tier} lower boundary`);
    assert.equal(catalog.isRankInTierDiagnosticCore(maxRank, tier), true, `${tier} upper boundary`);
  }
  assert.equal(catalog.isRankInTierDiagnosticCore(400, 'Gold'), true);
  assert.ok(catalog.tierPreferenceFit(400, 'Gold') < 100, 'Gold tilted fit proves CORE is no longer fit===100');
  assert.equal(entry.eligibleForTier(400, 'Gold', {}, { aiFieldContext: true }), true);
  assert.equal(diagnostics.classifyTierEntryLayer(400, 'Gold'), 'CORE');
  assert.equal(diagnostics.classifyTierEntryLayer(460, 'Gold'), 'NEAR');
  assert.equal(diagnostics.classifyTierEntryLayer(850, 'Gold'), 'STRETCH');
  assert.equal(diagnostics.classifyTierEntryLayer(950, 'Gold'), 'EMERGENCY');
  assert.equal(catalog.getTierDiagnosticCoreBand('Circuit Finals'), null);
  console.log('test-tier-entry-label-semantics-v56: PASS');
} finally { await vite.close(); }
