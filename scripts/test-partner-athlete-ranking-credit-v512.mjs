// Playthrough 5.12 (continuação), Parte W — arquivo nominal exigido pelo
// briefing. Roda o gate correspondente em partnerLifecycleGates.mjs, que
// contém as asserções próprias deste aspecto. Não duplica outro teste: o
// gate compartilhado existe apenas para reaproveitar o setup de carreira.
import { installShims, bootstrap, makeRunner, gateRankingCredit } from './lib/partnerLifecycleGates.mjs';

installShims('/test-partner-athlete-ranking-credit-v512');
const { check, finish } = makeRunner();
const ctx = await bootstrap('Credit');
try {
  await gateRankingCredit(ctx, check);
  finish('test-partner-athlete-ranking-credit-v512');
} finally {
  await ctx.vite.close();
}
