// Playthrough 5.14, Parte X — arquivo nominal exigido pelo briefing. Roda o
// gate correspondente em competitiveReviewGates.mjs, que contém as
// asserções próprias deste aspecto. O gate compartilhado existe só para
// reaproveitar o setup de carreira, não para duplicar outro teste.
import { installShims, bootstrap, makeRunner, gateSingleMessagePerWeek } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-review-single-message-per-week-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('OneMsg');
try {
  await gateSingleMessagePerWeek(ctx, check);
  finish('test-staff-review-single-message-per-week-v514');
} finally {
  await ctx.vite.close();
}
