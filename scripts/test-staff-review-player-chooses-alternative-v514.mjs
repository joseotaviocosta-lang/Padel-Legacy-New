// Playthrough 5.14, Parte X — arquivo nominal exigido pelo briefing. Roda o
// gate correspondente em competitiveReviewGates.mjs, que contém as
// asserções próprias deste aspecto. O gate compartilhado existe só para
// reaproveitar o setup de carreira, não para duplicar outro teste.
import { installShims, bootstrap, makeRunner, gateChoosesAlternative } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-review-player-chooses-alternative-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('AltPick');
try {
  await gateChoosesAlternative(ctx, check);
  finish('test-staff-review-player-chooses-alternative-v514');
} finally {
  await ctx.vite.close();
}
