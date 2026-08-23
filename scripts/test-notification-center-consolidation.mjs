import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => existsSync(new URL(path, root));

const appLayout = read('src/components/AppLayout.jsx');
const bell = read('src/components/communications/CommunicationBell.jsx');
const rail = read('src/components/system/FloatingUtilityRail.jsx');
const communications = read('src/lib/careerCommunications.js');
const press = read('src/pages/Press.jsx');
const interviewLifecycle = read('src/lib/interviewLifecycle.js');
const badge = read('src/components/design-system/NotificationBadge.jsx');

assert.equal(exists('src/components/career/CareerAssistant.jsx'), false, 'componente do Assistente ainda existe');
assert.equal(exists('src/lib/careerAssistant.js'), false, 'helper exclusivo do Assistente ainda existe');
assert.ok(!appLayout.includes('CareerAssistant') && !appLayout.includes('career-assistant-fab'), 'AppLayout ainda renderiza o Assistente/FAB');
assert.ok(appLayout.includes('<CommunicationBell compact />') && appLayout.includes('<CommunicationBell />'), 'sino deve existir em mobile e desktop');
assert.ok(!rail.includes('CareerAssistant') && !rail.includes('career-assistant'), 'floating rail ainda reserva espaço para o Assistente');
assert.ok(bell.includes('useOverlayBehavior({ open, onClose: closeCenter })') && bell.includes('ref={panelRef}') && bell.includes('ref={closeRef}'), 'sino não usa a pilha oficial de overlays/Android Back');
assert.ok(!bell.includes('setInterval('), 'sino não pode usar polling');
assert.ok(bell.includes("{ id: 'unread', label: 'Não lidas' }") && bell.includes("{ id: 'all', label: 'Todas' }"), 'filtros Não lidas/Todas ausentes');
assert.ok(badge.includes('if (value <= 0) return null'), 'badge zero deve desaparecer');
assert.ok(communications.includes('buildStableMessageId') && communications.includes('metadata?.context_key'), 'deduplicação persistida perdeu a identidade estável');
assert.ok(press.includes('resolveRelatedInterviewMessage(interview)') && interviewLifecycle.includes("status: 'resolvida'") && press.includes("reason: 'press-interview-answered'"), 'entrevista concluída não resolve/atualiza a notificação');

const vite = await createServer({
  root: rootPath,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const center = await vite.ssrLoadModule('/src/lib/notificationCenter.js');
  const selectors = await vite.ssrLoadModule('/src/lib/notificationSelectors.js');
  const destinations = await vite.ssrLoadModule('/src/lib/notificationDestinations.js');
  const careerMessages = await vite.ssrLoadModule('/src/lib/careerCommunications.js');

  const raw = [
    { id: 'a', status: 'nao_lida', metadata: { context_key: 'tournament-registration:t1' }, notification_type: 'TOURNAMENT_AVAILABLE' },
    { id: 'b', status: 'nao_lida', metadata: { context_key: 'tournament-registration:t1' }, notification_type: 'TOURNAMENT_AVAILABLE' },
    { id: 'c', status: 'lida', is_read: true, notification_type: 'RANKING', related_entity_id: 'p1' },
    { id: 'd', status: 'decisao_pendente', metadata: { memory_type: 'physical_condition' } },
  ];
  const relevant = center.selectRelevantCareerNotifications(raw);
  assert.equal(relevant.length, 2, 'eventos duplicados ou recomendações contextuais chegaram ao sino');
  assert.equal(selectors.countUnreadCareerMessages(relevant), 1, 'badge deve contar apenas não lidas relevantes');
  assert.equal(center.getNotificationCategory(relevant[0]), 'tournament', 'categoria de torneio incorreta');

  const persisted = JSON.parse(JSON.stringify({
    id: 'persisted',
    status: 'nao_lida',
    ...careerMessages.buildReadNotificationPatch({ status: 'nao_lida' }, '2026-08-14T12:00:00.000Z'),
  }));
  assert.equal(persisted.is_read, true, 'estado lido não persistiu');
  assert.equal(persisted.is_new, false, 'estado novo não foi encerrado');
  assert.equal(persisted.status, 'lida', 'status persistido não é lida');
  assert.equal(selectors.countUnreadCareerMessages([persisted]), 0, 'notificação lida reapareceu no badge');

  const answeredInterview = { id: 'interview', status: 'resolvida', is_read: true, notification_type: 'PRESS_INTERVIEW' };
  assert.equal(selectors.countUnreadCareerMessages([answeredInterview]), 0, 'entrevista concluída permaneceu pendente');

  const tournament = destinations.resolveNotificationDestination({
    notification_type: 'TOURNAMENT_AVAILABLE', related_entity_id: 't1', metadata: { tournament_id: 't1' },
  });
  const interview = destinations.resolveNotificationDestination({
    notification_type: 'PRESS_INTERVIEW', related_entity_id: 'i1', metadata: { interview_source_id: 'm1' },
  });
  const partner = destinations.resolveNotificationDestination({ notification_type: 'PARTNER_OFFER', related_entity_id: 'o1' });
  assert.match(tournament.route, /^\/tournaments\?/);
  assert.match(interview.route, /^\/press\?/);
  assert.match(partner.route, /^\/partners\?/);

  assert.deepEqual(center.NOTIFICATION_CATEGORIES.map((item) => item.label), [
    'Todas', 'Torneios', 'Carreira', 'Dupla', 'Comissão técnica', 'Treinos', 'Entrevistas', 'Mundo', 'Sistema',
  ]);
} finally {
  await vite.close();
}

console.log('NotificationCenterConsolidation: PASS');
console.log('✓ Assistente/FAB removidos; sino único em desktop e mobile');
console.log('✓ badge, leitura persistida, dedupe, categorias e deep links validados');
console.log('✓ entrevista resolvida, estado vazio e Android Back protegidos');
