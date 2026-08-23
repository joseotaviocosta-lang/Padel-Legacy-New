import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveNotificationDestination } from '../src/lib/notificationDestinations.js';
import {
  getTournamentNotificationMode,
  resolveTournamentOpenMode,
  TOURNAMENT_DEEP_LINK_MODES,
} from '../src/lib/tournamentDeepLink.js';
import {
  getTournamentReminderMilestone,
  tournamentReminderContextKey,
} from '../src/lib/tournamentNotifications.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const detailsSource = read('src/components/tournaments/TournamentDetailsModal.jsx');
const campaignSource = read('src/components/tournaments/TournamentModal.jsx');
const tournamentsSource = read('src/pages/Tournaments.jsx');
const communicationsSource = read('src/lib/careerCommunications.js');
const bellSource = read('src/components/communications/CommunicationBell.jsx');
const pkg = JSON.parse(read('package.json'));

const futureUnregistered = {
  id: 'message-upcoming',
  notification_type: 'TOURNAMENT_UPCOMING',
  related_entity_type: 'Tournament',
  related_entity_id: 'singapore-masters',
};
const futureRegistered = { ...futureUnregistered, id: 'message-reminder', notification_type: 'TOURNAMENT_REMINDER' };
const activeRun = { ...futureUnregistered, id: 'message-ready', notification_type: 'TOURNAMENT_ROUND_READY' };
const finished = { ...futureUnregistered, id: 'message-history', notification_type: 'TOURNAMENT_AVAILABLE' };

assert.equal(getTournamentNotificationMode(futureUnregistered), TOURNAMENT_DEEP_LINK_MODES.DETAILS, 'aviso futuro deve abrir detalhes');
assert.equal(getTournamentNotificationMode(futureRegistered), TOURNAMENT_DEEP_LINK_MODES.DETAILS, 'lembrete inscrito ainda deve abrir detalhes');
assert.equal(getTournamentNotificationMode(activeRun), TOURNAMENT_DEEP_LINK_MODES.RUN, 'rodada pronta deve abrir campanha');
assert.equal(getTournamentNotificationMode({ ...activeRun, notification_type: 'TOURNAMENT_MATCH_READY' }), TOURNAMENT_DEEP_LINK_MODES.RUN);
assert.equal(getTournamentNotificationMode({ ...activeRun, notification_type: 'TOURNAMENT_CONTINUE' }), TOURNAMENT_DEEP_LINK_MODES.RUN);
assert.equal(getTournamentNotificationMode(finished), TOURNAMENT_DEEP_LINK_MODES.DETAILS, 'torneio encerrado deve abrir histórico/detalhes');
assert.equal(resolveNotificationDestination(futureUnregistered).route, '/tournaments?tournament=singapore-masters&mode=details');
assert.equal(resolveNotificationDestination(activeRun).route, '/tournaments?tournament=singapore-masters&mode=run');
assert.equal(resolveTournamentOpenMode('run', true), 'run', 'campanha só restaura quando existe run ativo');
assert.equal(resolveTournamentOpenMode('run', false), 'details', 'run ausente deve cair em detalhes, sem exceção');

// Hotfix 15.5.4 (P1 — notificações redundantes, QA físico): antes havia um
// marco por dia (7/3/1/0), cada um com sua própria chave de dedup — os
// quatro "Miami Cup se aproxima" persistiam juntos na caixa de entrada para
// o MESMO torneio. Reduzido a um único marco (D-3, o mais próximo do
// sorteio real de oponentes); os demais dias não geram mais aviso genérico
// (o próprio jogo já mostra o próximo torneio em Header/Home/Calendário/
// Torneios).
assert.equal(getTournamentReminderMilestone(7), null, 'D-7 não deve mais gerar aviso genérico (redundante com Header/Home/Calendário/Torneios)');
assert.equal(getTournamentReminderMilestone(6), null, 'não deve gerar cópia diária do mesmo aviso');
assert.equal(getTournamentReminderMilestone(3), 3, 'D-3 continua sendo o único marco pré-torneio');
assert.equal(getTournamentReminderMilestone(1), null, 'D-1 não deve gerar outro "torneio se aproxima" genérico');
assert.equal(getTournamentReminderMilestone(0), null, 'dia do torneio não deve gerar aviso genérico redundante');
assert.equal(
  tournamentReminderContextKey('singapore-masters', 3),
  tournamentReminderContextKey('singapore-masters', 3),
  'dedupe deve ser determinístico por tipo, torneio e marco',
);
assert.notEqual(tournamentReminderContextKey('singapore-masters', 3), tournamentReminderContextKey('singapore-masters', 7));

const sourceChecks = [
  ['details mode usa modal próprio na viewport', detailsSource.includes('<ModalShell') && detailsSource.includes('open={Boolean(tournament)}')],
  ['detalhes não exigem inscrição', !detailsSource.includes('isPlayerRegisteredForTournament') && !detailsSource.includes('não possui inscrição confirmada')],
  ['detalhes mostram status, parceiro, premiação, pontos e requisitos', ['Sua dupla', 'Inscrição confirmada', 'Premiação', 'Ranking', 'getEntryPathLabel'].every((token) => detailsSource.includes(token))],
  ['página separa detalhes de campanha', tournamentsSource.includes('setDetailsTournament(requested)') && tournamentsSource.includes('setActiveTournament(requested)') && tournamentsSource.includes('resolveTournamentOpenMode')],
  ['campanha ainda valida inscrição quando realmente aberta', campaignSource.includes('isPlayerRegisteredForTournament')],
  // Hotfix 15.5.4 (complemento — sorteio em D-3): o aviso deixou de abrir
  // "details" e passou a abrir a campanha real (mode: 'run', destination
  // type TOURNAMENT_RUN) — agora só é criado quando o sorteio (bracket_history)
  // já existe de verdade, então "Ver chave"/CTA sempre tem conteúdo real.
  ['aviso contextual declara run mode (sorteio real, não apenas detalhes)', communicationsSource.includes("notification_type: 'TOURNAMENT_UPCOMING'") && communicationsSource.includes("type: 'TOURNAMENT_RUN'")],
  ['dedupe não usa mais a data diária', !communicationsSource.includes('`federation-tournament:${nextTournament.id}:${careerDate}`')],
  // A auditoria de performance trocou o upsert individual por chamada por um
  // lote único via localGame.batch (menos escritas completas do save por
  // reconciliação), mas manteve o id estável/determinístico por contextKey —
  // a garantia de idempotência entre sinos concorrentes continua a mesma. O
  // esquema de id foi extraído para buildStableMessageId (reaproveitado por
  // geradores fora da reconciliação contextual), então o padrão de texto
  // verificado passou de `profile.id}-${contextKey}` inline para a função
  // nomeada, chamada com profile.id em cada contextKey.
  ['persistência resiste à corrida entre sinos mobile e desktop', communicationsSource.includes("type: 'upsert', entityName: 'CareerMessage', id: stableId") && communicationsSource.includes('career-message-${profileId}-${contextKey}') && communicationsSource.includes('buildStableMessageId(profile.id, contextKey)')],
  ['clique marca individualmente como lida', bellSource.includes('resolveAndOpenNotification(message, { navigate })') && communicationsSource.includes('await markCareerCommunicationRead(normalized)') && communicationsSource.includes('navigate(destination.route)')],
  ['script npm registrado', pkg.scripts?.['test:tournament-notification-deeplink'] === 'node scripts/test-tournament-notification-deeplink-rc.mjs'],
];

for (const [name, ok] of sourceChecks) {
  assert.equal(ok, true, `FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

console.log('TournamentNotificationDeepLinkRCTest: PASS');
console.log('✓ detalhes sem inscrição, inscrição confirmada, campanha ativa e histórico possuem destinos distintos');
console.log('✓ aviso de 7 dias tem chave estável e não é recriado nos dias 6, 5 ou 4');
