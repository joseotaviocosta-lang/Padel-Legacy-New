// Playthrough 4.6, itens 9/10/11/13/14/15/19 — a regra rígida de "7 dias de
// descanso" bloqueava inscrição mesmo quando as datas não se sobrepunham de
// verdade (ex.: Londres termina 01/02, Los Angeles começa 05/02 — só 4 dias,
// mas SEM sobreposição real). Isso tornava impossível jogar semanas
// consecutivas, o que não corresponde a um circuito profissional real.
//
// A correção (tournamentRegistration.js) rebaixou o piso de 7 dias de
// `reasons` (bloqueante) para `warnings` (REST_ADVISORY, informativo) —
// a consequência real passa a ser física (fadiga/energia residual, sistema
// já existente em PhysicalConditionManager.js), nunca de agenda.
//
// Este teste prova:
//   (a) o cenário obrigatório do item 19 (Londres -> Los Angeles, 4 dias) é
//       PERMITIDO e não emite mais a mensagem antiga de bloqueio;
//   (b) sobreposição REAL de datas continua bloqueada (item 14, DATE_CONFLICT
//       nunca foi afetado pela remoção do piso de descanso);
//   (c) a exclusividade de agenda de duplas do World Tour (AI) nunca teve o
//       piso de 7 dias — é e continua sendo só overlap de datas real
//       (item 13, committedPairIdsForWindow em WorldTourLifecycle.js);
//   (d) uma simulação simples de início de carreira (item 14) mostra vários
//       torneios elegíveis em sequência semanal sem "semanas mortas"
//       artificiais.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const registrationModel = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const worldTourModule = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');

  let passed = 0;
  let failed = 0;
  const PASS = '\x1b[32m✓\x1b[0m';
  const FAIL = '\x1b[31m✗\x1b[0m';
  function check(label, fn) {
    try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
    catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
  }

  const player = { id: 'player-1', partner_id: 'partner-1', career_date: '2026-02-01', coins: 5000, energy: 100, age: 22 };
  const partner = { id: 'partner-1', status: 'active' };

  // Item 19 — cenário obrigatório: Londres termina 01/02, Los Angeles começa 05/02.
  const londres = {
    id: 'londres', profile_id: player.id, partner_id: partner.id, tournament_id: 'londres-challenge',
    tournament_name: 'Londres Challenge', status: 'completed',
    effective_start_date: '2026-01-26', effective_end_date: '2026-02-01',
  };
  const losAngeles = { id: 'los-angeles', name: 'Los Angeles Cup', tier: 'Silver', start_date: '2026-02-05', end_date: '2026-02-08' };

  check('19. Londres -> Los Angeles (4 dias de intervalo, sem overlap real) é PERMITIDO', () => {
    const result = registrationModel.evaluateTournamentRegistration({
      player, partner, tournament: losAngeles, currentDate: '2026-02-01',
      registrations: [londres], tournaments: [londres, losAngeles],
    });
    assert.equal(result.allowed, true, `deveria permitir inscrição: ${JSON.stringify(result.reasons)}`);
    assert.ok(!result.reasons.some((r) => r.code === 'REST_FLOOR'), 'REST_FLOOR não deve mais existir como reason bloqueante');
    assert.ok(!result.reasons.some((r) => /precisa de 7 dias de descanso/i.test(r.message || '')), 'mensagem antiga de bloqueio de 7 dias não deve mais aparecer');
  });

  check('19. a inscrição permitida ainda carrega o aviso de recuperação incompleta (consequência visível, item 11)', () => {
    const result = registrationModel.evaluateTournamentRegistration({
      player, partner, tournament: losAngeles, currentDate: '2026-02-01',
      registrations: [londres], tournaments: [londres, losAngeles],
    });
    assert.ok(result.warnings.some((w) => w.code === 'REST_ADVISORY'), JSON.stringify(result.warnings));
  });

  // Item 14 — sobreposição REAL de datas continua bloqueada, sem relação com o piso de descanso.
  const realOverlap = { id: 'overlap-b', name: 'Torneio B', tier: 'Silver', start_date: '2026-01-30', end_date: '2026-02-03' };
  check('14. sobreposição real de datas (Torneio B começa antes de Londres terminar) continua BLOQUEADA', () => {
    const activeLondres = { ...londres, status: 'confirmed', effective_end_date: '2026-02-01' };
    const result = registrationModel.evaluateTournamentRegistration({
      player, partner, tournament: realOverlap, currentDate: '2026-01-25',
      registrations: [activeLondres], tournaments: [{ id: 'londres-challenge', start_date: '2026-01-26', end_date: '2026-02-01' }, realOverlap],
    });
    assert.equal(result.allowed, false, 'sobreposição real deve continuar bloqueando');
    assert.ok(result.reasons.some((r) => r.code === 'DATE_CONFLICT'), JSON.stringify(result.reasons));
  });

  // Item 13/15 — exclusividade de agenda das duplas AI nunca teve piso de 7 dias; é e continua sendo overlap real.
  check('13/15. exclusividade AI (committedPairIdsForWindow) permite semanas consecutivas sem overlap real', () => {
    const pairAId = 'pair-ai-1';
    const tournamentWeek1 = {
      id: 'week1', start_date: '2026-01-26', end_date: '2026-02-01',
      bracket_schema_version: 2, world_tour_resolved: false, draw_pair_ids: [pairAId],
    };
    const tournamentWeek2Due = { id: 'week2', start_date: '2026-02-05', end_date: '2026-02-08' };
    const committed = worldTourModule.committedPairIdsForWindow([tournamentWeek2Due], [tournamentWeek1, tournamentWeek2Due]);
    assert.ok(!committed.has(pairAId), 'dupla livre na semana seguinte (sem overlap real) não pode ficar presa por um piso de dias que nunca existiu para IA');
  });

  check('13/15. exclusividade AI ainda bloqueia overlap real (invariante nunca deve quebrar)', () => {
    const pairAId = 'pair-ai-2';
    const tournamentWeek1 = {
      id: 'week1b', start_date: '2026-01-26', end_date: '2026-02-03',
      bracket_schema_version: 2, world_tour_resolved: false, draw_pair_ids: [pairAId],
    };
    const overlappingDue = { id: 'week2b', start_date: '2026-02-01', end_date: '2026-02-05' };
    const committed = worldTourModule.committedPairIdsForWindow([overlappingDue], [tournamentWeek1, overlappingDue]);
    assert.ok(committed.has(pairAId), 'overlap real de datas deve continuar impedindo a mesma dupla de ser sorteada em dois torneios simultâneos');
  });

  // Item 14 — simulação simples: um jogador iniciante ao longo de 6 semanas,
  // torneios semanais consecutivos sem overlap real. Antes da correção, cada
  // um destes seria bloqueado pelo piso rígido de 7 dias (intervalo de exatos
  // 4-6 dias entre o fim de um e o início do próximo).
  // Tiers abertos (Bronze/Silver, minRanking 0) para isolar o efeito em
  // teste da regra de descanso/continuidade, sem ruído de elegibilidade
  // esportiva (fora de escopo desta fase — item 2 audita seeding, não tier gating).
  const seasonWeeks = [
    { id: 'w1', name: 'Semana 1', tier: 'Silver', start_date: '2026-01-05', end_date: '2026-01-08' },
    { id: 'w2', name: 'Semana 2', tier: 'Silver', start_date: '2026-01-12', end_date: '2026-01-15' },
    { id: 'w3', name: 'Semana 3', tier: 'Bronze', start_date: '2026-01-19', end_date: '2026-01-22' },
    { id: 'w4', name: 'Semana 4', tier: 'Bronze', start_date: '2026-01-26', end_date: '2026-01-29' },
    { id: 'w5', name: 'Semana 5', tier: 'Silver', start_date: '2026-02-02', end_date: '2026-02-05' },
    { id: 'w6', name: 'Semana 6', tier: 'Silver', start_date: '2026-02-09', end_date: '2026-02-12' },
  ];
  check('14. calendário de início de carreira: 6 semanas seguidas todas elegíveis, sem semanas mortas artificiais', () => {
    let registrations = [];
    const eligibility = [];
    for (const week of seasonWeeks) {
      // Inscrição avaliada no dia em que ela normalmente abriria a sério
      // (algumas semanas antes do início) — não no próprio dia de início,
      // que já cairia fora da janela de inscrição (D-3) e geraria um falso
      // REGISTRATION_CLOSED sem relação nenhuma com a regra de descanso.
      const evalDate = new Date(week.start_date);
      evalDate.setUTCDate(evalDate.getUTCDate() - 5);
      const result = registrationModel.evaluateTournamentRegistration({
        player, partner, tournament: week, currentDate: evalDate.toISOString().slice(0, 10),
        registrations, tournaments: seasonWeeks,
      });
      eligibility.push({ id: week.id, allowed: result.allowed, hadOldRestBlock: result.reasons.some((r) => r.code === 'REST_FLOOR'), advisory: result.warnings.some((w) => w.code === 'REST_ADVISORY') });
      registrations = [...registrations, {
        id: `reg-${week.id}`, profile_id: player.id, partner_id: partner.id, tournament_id: week.id,
        tournament_name: week.name, status: 'completed',
        effective_start_date: week.start_date, effective_end_date: week.end_date,
      }];
    }
    console.log('\n--- Item 14: elegibilidade das 6 primeiras semanas de carreira ---');
    console.table(eligibility);
    assert.ok(eligibility.every((e) => e.allowed), `todas as 6 semanas deveriam ser elegíveis: ${JSON.stringify(eligibility)}`);
    assert.ok(eligibility.every((e) => !e.hadOldRestBlock), 'a regra antiga de 7 dias não deve bloquear mais nenhuma delas');
    const advisoryCount = eligibility.filter((e) => e.advisory).length;
    console.log(`semanas com aviso de recuperação incompleta (esperado, intervalo curto): ${advisoryCount}/${eligibility.length - 1}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-consecutive-tournament-eligibility: PASS');
} finally {
  await vite.close();
}
