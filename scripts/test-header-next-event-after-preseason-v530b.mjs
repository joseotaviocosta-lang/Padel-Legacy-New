// Hotfix 5.30-B — Caso D: Pré-Temporada concluída. Ela sai da seleção e o
// header passa para o próximo evento relevante (Londres Challenge).
import { campaignEvent, gateRunner, profileOn, withNextEventModules } from './lib/v530bNextEventKit.mjs';

const { gate, finish } = gateRunner('test-header-next-event-after-preseason-v530b');

await withNextEventModules(async ({ authority, header, preseason, london, world }) => {
  const done = { ...preseason, status: 'finalizado', champion: 'Outra dupla' };
  const worldAfter = world.map((item) => (item.id === preseason.id ? done : item));

  // Eliminado no meio da Pré-Temporada, ainda dentro das datas do evento.
  const eliminated = campaignEvent(preseason, { round: 1, status: 'eliminated', eventStatus: 'completed' });
  const d1 = header.buildCareerHeaderContext({ profile: profileOn('2026-01-13'), tournaments: world, calendarEvents: [eliminated] });
  gate('1. Caso D: eliminado → header = Londres Challenge', d1.tournamentId === london.id, JSON.stringify(d1.label));

  // Campeão: campanha encerrada.
  const champion = campaignEvent(preseason, { round: 2, status: 'champion', eventStatus: 'completed' });
  const d2 = header.buildCareerHeaderContext({ profile: profileOn('2026-01-14'), tournaments: worldAfter, calendarEvents: [champion] });
  gate('2. Caso D: campeão → header = Londres Challenge', d2.tournamentId === london.id);

  // Torneio finalizado sai mesmo sem campanha do jogador.
  const d3 = authority.selectNextRelevantEvent({ tournaments: worldAfter, careerDate: '2026-01-12' });
  gate('3. torneio finalizado nunca é "próximo evento"', d3?.tournamentId !== preseason.id && d3?.tournamentId === london.id);

  // Depois das datas, sem nada gravado: start_date no passado sai sozinho.
  const d4 = header.buildCareerHeaderContext({ profile: profileOn('2026-01-15'), tournaments: world });
  gate('4. depois da data, header = Londres (14 dias)', d4.tournamentId === london.id && d4.daysUntil === 14);

  // Nunca volta para a Pré-Temporada por causa de um CalendarEvent antigo.
  const stale = campaignEvent(preseason, { round: 2, status: 'finished', eventStatus: 'scheduled' });
  const d5 = header.buildCareerHeaderContext({ profile: profileOn('2026-01-20'), tournaments: worldAfter, calendarEvents: [stale] });
  gate('5. campanha antiga encerrada não prende o header em Roma', d5.tournamentId === london.id);
});
finish();
