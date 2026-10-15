// Playthrough 5.14, Parte X — arquivo nominal exigido pelo briefing. Roda o
// gate correspondente em competitiveReviewGates.mjs, que contém as
// asserções próprias deste aspecto. O gate compartilhado existe só para
// reaproveitar o setup de carreira, não para duplicar outro teste.
import { installShims, bootstrap, makeRunner, gateNoEvent } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-review-no-event-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('NoEvent');
try {
  await gateNoEvent(ctx, check);
  finish('test-staff-review-no-event-v514');
} finally {
  await ctx.vite.close();
}
