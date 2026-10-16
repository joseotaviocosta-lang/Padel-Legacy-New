// Hotfix 5.30-B — Caso C: Pré-Temporada em andamento. Campanha viva é o
// estado mais forte do header (regra da Fase 15.4, agora dentro da autoridade).
import { campaignEvent, gateRunner, profileOn, registrationEvent, withNextEventModules } from './lib/v530bNextEventKit.mjs';

const { gate, finish } = gateRunner('test-header-next-event-active-preseason-v530b');

await withNextEventModules(async ({ authority, header, preseason, london, world }) => {
  const day1 = campaignEvent(preseason, { round: 0 });
  const c = header.buildCareerHeaderContext({ profile: profileOn('2026-01-12'), tournaments: world, calendarEvents: [day1] });
  gate('1. Caso C: estreia hoje → "tournament_today" com Roma', c.kind === 'tournament_today' && c.tournamentId === preseason.id, JSON.stringify(c));
  gate('2. Caso C: rótulo mostra torneio + rodada atual + "Hoje"', c.label.full === 'Roma Pré-Temporada · Quartas de final · Hoje');

  const semi = campaignEvent(preseason, { round: 1 });
  const c2 = header.buildCareerHeaderContext({ profile: profileOn('2026-01-13'), tournaments: world, calendarEvents: [semi] });
  gate('3. Caso C: avançou → rodada atual (Semifinal), não a anterior', c2.tournamentId === preseason.id && /Semifinal/.test(c2.label.full) && !/Quartas/.test(c2.label.full));

  // Com a partida marcada para amanhã, continua sendo Roma (round), não Londres.
  const c3 = header.buildCareerHeaderContext({ profile: profileOn('2026-01-12'), tournaments: world, calendarEvents: [semi] });
  gate('4. Caso C: partida amanhã → "tournament_round" com Roma', c3.kind === 'tournament_round' && c3.tournamentId === preseason.id && c3.daysUntil === 1);

  // Campanha viva vence até uma inscrição em outro evento mais cedo/igual.
  const pick = authority.selectNextRelevantEvent({ tournaments: world, calendarEvents: [registrationEvent(london), day1], careerDate: '2026-01-12' });
  gate('5. em andamento vence inscrito', pick?.kind === 'active' && pick.tournamentId === preseason.id);

  // Prioridade do header preservada: campanha viva vence lesão/fadiga (Fase 15.4).
  const tired = header.buildCareerHeaderContext({ profile: profileOn('2026-01-12', { fatigue: 90, energy: 10 }), tournaments: world, calendarEvents: [day1] });
  gate('6. campanha viva continua acima de fadiga/energia', tired.tournamentId === preseason.id);
});
finish();
