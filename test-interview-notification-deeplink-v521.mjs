import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { resolveNotificationDestination } = await server.ssrLoadModule('/src/lib/notificationDestinations.js');
  const { buildInterviewRoute } = await server.ssrLoadModule('/src/lib/tournamentNextAction.js');

  const interviewId = 'interview-pre-tournament-42';
  const sourceId = 'match-8';
  const returnTo = '/tournaments?tournament=tour-12&mode=run';

  const built = buildInterviewRoute({ interviewId, sourceId, returnTo });
  assert.equal(built, '/world/circuit?tab=press&interview=interview-pre-tournament-42&source=match-8&returnTo=%2Ftournaments%3Ftournament%3Dtour-12%26mode%3Drun');

  const resolved = resolveNotificationDestination({
    id: 'career-message-press-42',
    related_entity_type: 'PressInterview',
    related_entity_id: interviewId,
    status: 'nao_lida',
    metadata: {
      interview_id: interviewId,
      interview_source_id: sourceId,
      route: built,
    },
  });

  assert.equal(resolved.type, 'PRESS_INTERVIEW');
  assert.equal(resolved.route, '/world/circuit?tab=press&interview=interview-pre-tournament-42&source=match-8&returnTo=%2Ftournaments%3Ftournament%3Dtour-12%26mode%3Drun');
  assert.equal(resolved.actionable, true);

  const legacyPressRoute = '/press?tab=interviews&interview=interview-pre-tournament-42&source=match-8';
  const legacyResolved = resolveNotificationDestination({
    id: 'legacy-message',
    related_entity_type: 'PressInterview',
    related_entity_id: interviewId,
    status: 'nao_lida',
    metadata: {
      interview_id: interviewId,
      interview_source_id: sourceId,
      route: legacyPressRoute,
    },
  });
  assert.equal(legacyResolved.route, '/world/circuit?tab=press&interview=interview-pre-tournament-42&source=match-8');

  console.log('PASS: Interview notification deeplink canonical route');
} finally {
  await server.close();
}
