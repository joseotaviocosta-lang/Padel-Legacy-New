// Playthrough 5.14, Parte X — arquivo nominal exigido pelo briefing. Roda o
// gate correspondente em competitiveReviewGates.mjs, que contém as
// asserções próprias deste aspecto. O gate compartilhado existe só para
// reaproveitar o setup de carreira, não para duplicar outro teste.
import { installShims, bootstrap, makeRunner, gateAfterRegistration } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-review-after-registration-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('AfterReg');
try {
  await gateAfterRegistration(ctx, check);
  finish('test-staff-review-after-registration-v514');
} finally {
  await ctx.vite.close();
}
