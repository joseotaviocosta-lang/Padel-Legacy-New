// Playthrough 5.14, Parte X — arquivo nominal exigido pelo briefing. Roda o
// gate correspondente em competitiveReviewGates.mjs, que contém as
// asserções próprias deste aspecto. O gate compartilhado existe só para
// reaproveitar o setup de carreira, não para duplicar outro teste.
import { installShims, bootstrap, makeRunner, gateFederationSeparation } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-review-federation-reminder-separation-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('FedSep');
try {
  await gateFederationSeparation(ctx, check);
  finish('test-staff-review-federation-reminder-separation-v514');
} finally {
  await ctx.vite.close();
}
