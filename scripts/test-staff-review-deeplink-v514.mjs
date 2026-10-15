// Playthrough 5.14, Parte N — a notificação da reunião competitiva abre o
// relatório daquela semana, reaproveitando o mecanismo da 5.13
// (context_key -> ?report=), sem landing genérica.
import assert from 'node:assert/strict';
import { installShims, bootstrap, makeRunner } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-review-deeplink-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('DeepLink');
try {
  const { mod, localGame, profile, profileId, careerDate } = ctx;
  const { ensureWeeklyCompetitiveStaffReview } = await mod('/src/game-core/competitiveStaffReview.js');
  const { resolveNotificationDestination } = await mod('/src/lib/notificationDestinations.js');
  const { buildStableMessageId } = await mod('/src/lib/careerCommunications.js');

  const review = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  const message = review.message;
  const destination = resolveNotificationDestination(message);
  console.log(`rota: ${destination.route}`);

  await check('Parte N: a rota carrega o identificador da reunião', () => {
    assert.match(destination.route, /^\/staff\?/, `rota=${destination.route}`);
    assert.match(destination.route, /report=/, 'sem parâmetro report');
  });

  await check('Parte N: o identificador é a chave semanal da reunião', () => {
    const params = new URLSearchParams(destination.route.split('?')[1] || '');
    assert.equal(params.get('report'), message.metadata.context_key);
    assert.match(params.get('report'), /^staff-competitive-review:/);
  });

  await check('Parte N: o identificador resolve a mensagem correta', async () => {
    const params = new URLSearchParams(destination.route.split('?')[1] || '');
    const found = await localGame.entities.CareerMessage
      .get(buildStableMessageId(profileId, params.get('report'))).catch(() => null);
    assert.ok(found, 'relatório não encontrado');
    assert.equal(found.id, message.id);
    assert.equal(found.metadata.recommended_tournament_id, message.metadata.recommended_tournament_id);
  });

  await check('Parte N: o relatório traz o conteúdo que a tela precisa exibir', () => {
    assert.ok(message.metadata.recommended_tournament_name, 'sem torneio');
    assert.ok((message.metadata.recommendations || []).length > 0, 'sem justificativas');
    assert.ok(message.metadata.cta_label, 'sem CTA');
  });

  finish('test-staff-review-deeplink-v514');
} finally {
  await ctx.vite.close();
}
