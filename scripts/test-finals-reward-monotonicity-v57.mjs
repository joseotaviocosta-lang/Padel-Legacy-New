import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getTournamentTierConfig } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const circuit = getTournamentTierConfig('Circuit Finals');
  const legacy = getTournamentTierConfig('Legacy Finals');
  for (const field of ['rankPoints', 'prize', 'xp', 'prestige', 'exposure']) assert.ok(legacy[field] > circuit[field], `${field}: Legacy > Circuit`);
  assert.equal(circuit.entryFee, 0); assert.equal(legacy.entryFee, 0);
  console.log('test-finals-reward-monotonicity-v57: PASS');
} finally {
  await vite.close();
}
