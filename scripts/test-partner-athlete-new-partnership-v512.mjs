// Playthrough 5.12 (continuação), Parte W — arquivo nominal exigido pelo
// briefing. Roda o gate correspondente em partnerLifecycleGates.mjs, que
// contém as asserções próprias deste aspecto. Não duplica outro teste: o
// gate compartilhado existe apenas para reaproveitar o setup de carreira.
import { installShims, bootstrap, makeRunner, gateNewPartnership } from './lib/partnerLifecycleGates.mjs';

installShims('/test-partner-athlete-new-partnership-v512');
const { check, finish } = makeRunner();
const ctx = await bootstrap('NewPair');
try {
  await gateNewPartnership(ctx, check);
  finish('test-partner-athlete-new-partnership-v512');
} finally {
  await ctx.vite.close();
}
