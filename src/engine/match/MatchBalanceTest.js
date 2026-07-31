import { compareBalanceBatches, runBalanceBatch } from './BalanceSimulator.js';

export async function runMatchBalanceTest(options = {}) {
  const matches = Math.max(20, Number(options.matches || 120));
  const batchOptions = {
    matches,
    seedPrefix: options.seedPrefix || 'v040-stage5-test',
    alternateSides: true,
  };
  const first = runBalanceBatch(batchOptions);
  const second = runBalanceBatch(batchOptions);
  const deterministicBatch = compareBalanceBatches(first, second);
  return {
    ...first,
    success: first.success && deterministicBatch,
    deterministicBatch,
    version: '0.4.0-alpha.5',
  };
}

export function setupMatchBalanceTest() {
  if (typeof window !== 'undefined') {
    window.PadelMatchBalanceTest = { run: runMatchBalanceTest };
  }
}
