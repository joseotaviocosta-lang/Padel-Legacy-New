// Hotfix 5.30-B — Caso A e Caso E: a Pré-Temporada (sem ranking) é o próximo
// evento do header quando vem antes do primeiro torneio oficial; sem ela, o
// header cai no próximo torneio normal.
import { CAREER_START, gateRunner, liveRun, profileOn, withNextEventModules } from './lib/v530bNextEventKit.mjs';

const { gate, finish } = gateRunner('test-header-next-event-includes-preseason-v530b');

await withNextEventModules(async ({ authority, header, preseason, season, london, world }) => {
  gate('0. cenário real: Roma Pré-Temporada em 12/01 e Londres Challenge em 29/01', preseason.name === 'Roma Pré-Temporada' && preseason.start_date === '2026-01-12' && london?.start_date === '2026-01-29');
  gate('1. a Pré-Temporada não dá pontos de ranking e mesmo assim é elegível', Number(preseason.rank_points) === 0 && preseason.tier === 'Exibição' && preseason.world_tour_event === false);

  // Caso A — pré-temporada antes do torneio oficial.
  const a = header.buildCareerHeaderContext({ profile: profileOn(CAREER_START), tournaments: world });
  gate('2. Caso A: header = Roma Pré-Temporada', a.tournamentId === preseason.id && /Roma Pré-Temporada/.test(a.label.full), JSON.stringify(a.label));
  gate('3. Caso A: 11 dias, não os 28 de Londres', a.daysUntil === 11 && a.label.compact === 'Roma Pré-Temporada · 11d');
  gate('4. Caso A: rótulo e aria-label continuam "Próximo torneio"', a.label.full === 'Próximo torneio · Roma Pré-Temporada · 11d' && a.ariaLabel === 'Próximo torneio: Roma Pré-Temporada em 11 dias');
  const pickA = authority.selectNextRelevantEvent({ tournaments: world, careerDate: CAREER_START });
  gate('5. Caso A: a autoridade classifica Roma como "inscrição aberta"', pickA?.kind === 'open' && pickA.tournamentId === preseason.id);

  // A ordem da lista não pode mudar a resposta (o header lia ascendente, Torneios descendente).
  const reversed = header.buildCareerHeaderContext({ profile: profileOn(CAREER_START), tournaments: [...world].reverse() });
  gate('6. ordem da consulta não muda a escolha', reversed.tournamentId === preseason.id);

  // Caso E — sem pré-temporada.
  const e = header.buildCareerHeaderContext({ profile: profileOn(CAREER_START), tournaments: season });
  gate('7. Caso E: sem pré-temporada, header = Londres Challenge (próximo torneio normal)', e.tournamentId === london.id && e.daysUntil === 28, JSON.stringify(e.label));

  // Inscrição ainda fechada não some: cai no "próximo no calendário".
  const early = header.buildCareerHeaderContext({ profile: profileOn('2025-12-20'), tournaments: [{ ...london, registration_open_date: '2026-01-05' }] });
  gate('8. evento futuro sem inscrição aberta continua elegível como próximo do calendário', early.tournamentId === london.id);
});

// Evidência do app real (desktop/Tauri, carreira de teste nova): antes da
// correção o header ficava em Londres enquanto Torneios mostrava Roma.
const before = liveRun('before-fix');
const after = liveRun('after-fix-new-career');
if (before && after) {
  gate('9. app real ANTES: Torneios = Roma e header = Londres (bug reproduzido)', /Roma Pré-Temporada/.test(before.steps[1].tournaments) && /Londres Challenge/.test(before.steps[1].header));
  gate('10. app real DEPOIS: header = Roma assim que a Pré-Temporada existe', /Roma Pré-Temporada/.test(after.steps[1].header) && /Roma Pré-Temporada/.test(after.steps[2].header));
}
finish();
