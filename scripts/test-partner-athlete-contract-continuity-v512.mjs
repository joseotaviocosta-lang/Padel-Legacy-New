// Playthrough 5.12 (continuação), Parte W — arquivo nominal exigido pelo
// briefing. Roda o gate correspondente em partnerLifecycleGates.mjs, que
// contém as asserções próprias deste aspecto. Não duplica outro teste: o
// gate compartilhado existe apenas para reaproveitar o setup de carreira.
import { installShims, bootstrap, makeRunner, gateContractContinuity } from './lib/partnerLifecycleGates.mjs';

installShims('/test-partner-athlete-contract-continuity-v512');
const { check, finish } = makeRunner();
const ctx = await bootstrap('Contract');
try {
  await gateContractContinuity(ctx, check);
  finish('test-partner-athlete-contract-continuity-v512');
} finally {
  await ctx.vite.close();
}
