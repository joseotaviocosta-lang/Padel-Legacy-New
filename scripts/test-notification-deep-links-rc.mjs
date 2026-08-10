import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveNotificationDestination } from '../src/lib/notificationDestinations.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const bell = read('src/components/communications/CommunicationBell.jsx');
const communications = read('src/pages/Communications.jsx');
const careerCommunications = read('src/lib/careerCommunications.js');
const press = read('src/pages/Press.jsx');
const tournaments = read('src/pages/Tournaments.jsx');
const coaches = read('src/pages/Coaches.jsx');
const missions = read('src/pages/Missions.jsx');
const offers = read('src/components/partner/PartnerOffersPanel.jsx');
const ranking = read('src/pages/Ranking.jsx');
const calendar = read('src/pages/CalendarPage.jsx');
const worldEvents = read('src/pages/WorldEvents.jsx');
const economy = read('src/pages/Economy.jsx');
const training = read('src/pages/Training.jsx');
const pkg = JSON.parse(read('package.json'));

const cases = [
  [{ id: 'n1', related_entity_type: 'PressInterview', related_entity_id: 'interview-9', metadata: { interview_source_id: 'match-4' } }, '/press?tab=interviews&interview=interview-9&source=match-4'],
  [{ id: 'n2', related_entity_type: 'Tournament', related_entity_id: 'tour-2' }, '/tournaments?tournament=tour-2&mode=details'],
  [{ id: 'n3', message_type: 'proposta_parceria', related_entity_id: 'offer-3' }, '/partners?view=offers&offer=offer-3'],
  [{ id: 'n4', message_type: 'mission_completed', related_entity_id: 'mission-7' }, '/game/missions?mission=mission-7'],
  [{ id: 'n5', message_type: 'injury_report', related_entity_id: 'injury-1' }, '/game/calendar?focus=recovery&injury=injury-1'],
  [{ id: 'n6', message_type: 'ranking_update', related_entity_id: 'athlete-2' }, '/ranking?athlete=athlete-2'],
  [{ id: 'n7', message_type: 'sponsor_contract', related_entity_id: 'contract-2' }, '/game/economy?view=sponsors&contract=contract-2'],
  [{ id: 'n8', notification_type: 'MONTHLY_REPORT', related_entity_id: 'monthly-career-report:player-1:2026-01' }, '/game/monthly-reports?report=monthly-career-report%3Aplayer-1%3A2026-01'],
  [{ id: 'legacy', message_type: 'mensagem' }, '/communications?message=legacy'],
];

const checks = [
  ...cases.map(([notification, expected]) => [`destino ${notification.id}`, resolveNotificationDestination(notification).route === expected]),
  ['clique usa resolver central e navega por SPA', bell.includes('resolveNotificationDestination(message)') && bell.includes('navigate(destination.route)')],
  ['abrir o sino não marca tudo como lido', !bell.includes('markAllCommunicationsRead') && bell.includes('setOpen((current) => !current)')],
  ['leitura individual preserva decisão pendente', careerCommunications.includes("message.status === 'nao_lida'") && careerCommunications.includes('is_read: true')],
  ['central usa a mesma leitura e o mesmo destino', communications.includes('markCareerCommunicationRead') && communications.includes('resolveNotificationDestination(selected)')],
  ['entrevista consome IDs da URL', press.includes("searchParams.get('interview')") && press.includes("searchParams.get('source')")],
  ['torneio abre pelo ID da URL', tournaments.includes("searchParams.get('tournament')") && tournaments.includes('setActiveTournament(requested)')],
  ['treinador abre pelo ID da URL', coaches.includes("searchParams.get('coach')") && coaches.includes('setSelected(requested)')],
  ['missão seleciona categoria e destaca item', missions.includes("searchParams.get('mission')") && missions.includes('aria-current=')],
  ['proposta importante abre no modal global', offers.includes('focusOfferId') && offers.includes('<ModalShell') && offers.includes('Aceitar proposta')],
  ['ranking abre atleta específico', ranking.includes("searchParams.get('athlete')") && ranking.includes('setSelectedAthlete(requested)')],
  ['calendário seleciona a data do evento', calendar.includes("searchParams.get('event')") && calendar.includes('requested.start_date')],
  ['evento mundial abre no modal global', worldEvents.includes("searchParams.get('event')") && worldEvents.includes('<ModalShell')],
  ['economia e treino consomem a seção indicada', economy.includes("searchParams.get('view')") && training.includes("searchParams.get('training')")],
  ['nenhum deep link usa scrollIntoView', ![bell, communications, press, tournaments, coaches, missions, offers, ranking, calendar, worldEvents].some((source) => source.includes('scrollIntoView'))],
  ['script registrado', pkg.scripts?.['test:notification-deep-links'] === 'node scripts/test-notification-deep-links-rc.mjs'],
];

for (const [name, ok] of checks) {
  assert.equal(ok, true, `FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

console.log(`NotificationDeepLinksRCTest: PASS (${checks.length}/${checks.length})`);
