import { generateAutoPost } from '@/lib/socialNetwork.js';
import { generateEventObject } from '@/lib/world.js';

export function runSequentialContextRegressionTest() {
  const newProfile = {
    id: 'context-test-player',
    career_date: '2026-01-01',
    matches_played: 0,
    wins: 0,
    losses: 0,
    partner_id: null,
    partner_name: null,
  };

  const posts = Array.from({ length: 100 }, () => generateAutoPost(newProfile));
  const forbiddenPost = posts.find(post => /derrota|vitória|troca de dupla|trocar de parceiro|partida de amanhã|melhor partida do ano/i.test(post.content || ''));

  const events = Array.from({ length: 50 }, () => generateEventObject('2026-01-01'));
  const forbiddenEvent = events.find(event => ['lesao', 'aposentadoria', 'transferencia', 'ranking', 'rivalidade', 'escandalo', 'rumor'].includes(event.event_type));

  const result = {
    ok: !forbiddenPost && !forbiddenEvent,
    generatedPosts: posts.length,
    generatedEvents: events.length,
    forbiddenPost: forbiddenPost || null,
    forbiddenEvent: forbiddenEvent || null,
  };

  if (!result.ok) throw new Error(`Falha contextual: ${JSON.stringify(result)}`);
  return result;
}

if (typeof window !== 'undefined') {
  window.PadelSequentialContextTest = { run: runSequentialContextRegressionTest };
}
