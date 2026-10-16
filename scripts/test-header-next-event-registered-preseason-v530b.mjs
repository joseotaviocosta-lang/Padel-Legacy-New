// Hotfix 5.30-B — Caso B: jogador já inscrito na Pré-Temporada. A inscrição
// é o compromisso mais forte depois de uma campanha em andamento.
import { CAREER_START, gateRunner, profileOn, registrationEvent, withNextEventModules } from './lib/v530bNextEventKit.mjs';

const { gate, finish } = gateRunner('test-header-next-event-registered-preseason-v530b');

await withNextEventModules(async ({ authority, header, preseason, london, world }) => {
  const reg = registrationEvent(preseason);
  const b = header.buildCareerHeaderContext({ profile: profileOn('2026-01-05'), tournaments: world, calendarEvents: [reg] });
  gate('1. Caso B: header = Roma Pré-Temporada', b.tournamentId === preseason.id && /Roma Pré-Temporada/.test(b.label.full), JSON.stringify(b.label));
  gate('2. Caso B: dias contados até a estreia (7d)', b.daysUntil === 7);
  const pick = authority.selectNextRelevantEvent({ tournaments: world, calendarEvents: [reg], careerDate: '2026-01-05' });
  gate('3. Caso B: autoridade = "inscrito"', pick?.kind === 'registered' && pick.tournamentId === preseason.id);

  // Inscrição continua prioritária mesmo depois do prazo de inscrição (D-3),
  // quando Roma já não está "aberta" para mais ninguém.
  const late = authority.selectNextRelevantEvent({ tournaments: world, calendarEvents: [reg], careerDate: '2026-01-11' });
  gate('4. inscrito vence depois de a inscrição fechar (D-1)', late?.kind === 'registered' && late.tournamentId === preseason.id);

  // Inscrito num evento POSTERIOR vence um evento aberto anterior.
  const regLondon = registrationEvent(london);
  const laterRegistered = authority.selectNextRelevantEvent({ tournaments: world, calendarEvents: [regLondon], careerDate: CAREER_START });
  gate('5. evento inscrito (Londres) vence evento só aberto (Roma)', laterRegistered?.kind === 'registered' && laterRegistered.tournamentId === london.id);

  // Inscrição cancelada não conta.
  const cancelled = authority.selectNextRelevantEvent({ tournaments: world, calendarEvents: [{ ...reg, status: 'cancelled' }], careerDate: '2026-01-05' });
  gate('6. inscrição cancelada não prende o header no evento', cancelled?.kind === 'open' && cancelled.tournamentId === preseason.id);
  const cancelledAfterDeadline = authority.selectNextRelevantEvent({ tournaments: world, calendarEvents: [{ ...reg, status: 'cancelled' }], careerDate: '2026-01-11' });
  gate('7. cancelada + prazo encerrado: header passa para o próximo aberto (Londres)', cancelledAfterDeadline?.tournamentId === london.id);

  // Evento ilustrativo do seed local (sem inscrição nem torneio real) não é compromisso.
  const demo = { id: 'cal-002', profile_id: 'player-1', event_type: 'tournament', title: 'Torneio (exemplo do calendário)', start_date: '2026-01-29', end_date: '2026-01-29', status: 'scheduled', related_id: 'demo-tournament-showcase' };
  const withDemo = authority.selectNextRelevantEvent({ tournaments: world, calendarEvents: [demo], careerDate: CAREER_START });
  gate('8. evento de exemplo do seed é ignorado (placeholder)', withDemo?.tournamentId === preseason.id);
});
finish();
