import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const model = await server.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const migration = await server.ssrLoadModule('/src/careers/CareerMigration.js');
  const schema = await server.ssrLoadModule('/src/careers/careerSchema.js');
  const player = { id: 'player-1', partner_id: 'partner-1', career_date: '2026-01-01', coins: 1000, energy: 100, age: 22 };
  const partner = { id: 'partner-1', status: 'active' };
  const first = { id: 'first', name: 'Primeiro Silver', tier: 'Silver', start_date: '2026-01-08', end_date: '2026-01-10', entry_fee: 100, max_participants: 16 };
  const allowed = model.evaluateTournamentRegistration({ player, partner, tournament: first, currentDate: '2026-01-01' });
  assert.equal(allowed.allowed, true, JSON.stringify(allowed.reasons));
  // Playthrough 5.18-H, Parte R/S — estas três linhas codificavam a regra
  // ANTIGA (fechamento em D-3, o MESMO dia do sorteio). A Playthrough 4.9,
  // Parte C, tornou obrigatório `registration_deadline < draw_date`, NUNCA
  // igual: com os dois no mesmo dia, "fechado" dependia da ordem de
  // processamento do tick — uma corrida sem vencedor definido. O fechamento
  // passou para D-4 (`defaultCloseDaysBeforeStart: 4`), deixando 1 dia de
  // folga real antes do sorteio em D-3 (TOURNAMENT_DRAW_LEAD_DAYS).
  //
  // O off-by-one estava AQUI, não na regra: o teste seguia exigindo D-3.
  // Torneio começa em 2026-01-08, então D-4 = 2026-01-04.
  assert.deepEqual(allowed.registrationWindow, { opensAt: '2025-12-09', closesAt: '2026-01-04' });
  assert.equal(model.evaluateTournamentRegistration({ player, partner, tournament: first, currentDate: '2026-01-06' }).reasons.some(item => item.code === 'REGISTRATION_CLOSED'), true, 'D-2 deve estar fechado');
  assert.equal(model.evaluateTournamentRegistration({ player, partner, tournament: first, currentDate: '2026-01-04' }).allowed, true, 'D-4 (último dia) ainda aceita inscrição');
  assert.equal(model.evaluateTournamentRegistration({ player, partner, tournament: first, currentDate: '2026-01-05' }).reasons.some(item => item.code === 'REGISTRATION_CLOSED'), true, 'D-3 é o dia do sorteio: já fechado');
  assert.equal(model.evaluateTournamentRegistration({ player, partner, tournament: first, currentDate: '2025-12-08' }).reasons[0].code, 'REGISTRATION_NOT_OPEN');
  assert(model.evaluateTournamentRegistration({ player, partner, tournament: first, currentDate: '2026-01-08' }).reasons.some(item => item.code === 'TOURNAMENT_STARTED'));
  const custom = { ...first, registration_open_date: '2026-01-03', registration_deadline: '2026-01-06' };
  assert.equal(model.evaluateTournamentRegistration({ player, partner, tournament: custom, currentDate: '2026-01-02' }).allowed, false);
  assert.equal(model.evaluateTournamentRegistration({ player, partner, tournament: custom, currentDate: '2026-01-04' }).allowed, true);

  const overlapping = { id: 'overlap', name: 'Sobreposto', tier: 'Silver', qualifying_start_date: '2026-01-10', start_date: '2026-01-11', end_date: '2026-01-12' };
  const consecutive = { id: 'next', name: 'Seguinte', tier: 'Silver', start_date: '2026-01-11', end_date: '2026-01-13' };
  assert.equal(model.doTournamentDatesOverlap(first, overlapping), true);
  assert.equal(model.doTournamentDatesOverlap(first, consecutive), false);
  const registration = { id: 'r1', profile_id: player.id, partner_id: partner.id, tournament_id: first.id, tournament_name: first.name, status: 'confirmed', effective_start_date: first.start_date, effective_end_date: first.end_date };
  const conflict = model.evaluateTournamentRegistration({ player, partner, tournament: overlapping, currentDate: '2026-01-01', registrations: [registration], tournaments: [first, overlapping] });
  assert(conflict.reasons.some(item => item.code === 'DATE_CONFLICT'));
  assert.equal(model.evaluateTournamentRegistration({ player, partner, tournament: overlapping, currentDate: '2026-01-01', registrations: [{ ...registration, status: 'cancelled' }], tournaments: [first, overlapping] }).allowed, true);
  assert.equal(model.deterministicRegistrationId(player.id, first.id), model.deterministicRegistrationId(player.id, first.id));
  assert.equal(model.isConfirmedRegistration(registration, player.id, first.id), true);
  assert.equal(model.isConfirmedRegistration({ ...registration, status: 'cancelled' }, player.id, first.id), false);

  // Playthrough 4.6, itens 9/10/11 — a Proposta B (piso de descanso de 7
  // dias) deixou de BLOQUEAR inscrição — vira aviso informativo
  // (REST_ADVISORY em `warnings`, não mais REST_FLOOR em `reasons`). Um
  // circuito profissional tem torneios em semanas consecutivas; a
  // consequência agora é física (fadiga/energia residual, sistema já
  // existente), nunca impedimento de agenda. Só conta inscrição
  // 'completed': um torneio 'missed' não gera desgaste nenhum.
  // Playthrough 5.18-H — as datas destes cenarios foram movidas de 02-08 para
  // 02-07 pelo MESMO motivo da janela acima: com fechamento em D-4, um torneio
  // que comeca em 02-11 fecha inscricao em 02-07, e 02-08 ja estava fechado.
  // O cenario testa AVISO DE DESCANSO, nao prazo — a data precisa estar dentro
  // da janela para que o aviso seja o que decide.
  const restRules = model.TOURNAMENT_REGISTRATION_RULES;
  assert.equal(restRules.restFloorDays, 7);
  const finished = { id: 'played', profile_id: player.id, partner_id: partner.id, tournament_id: 'earlier', tournament_name: 'Miami Cup', status: 'completed', effective_start_date: '2026-02-04', effective_end_date: '2026-02-07' };
  const tooSoon = { id: 'soon', name: 'Logo Depois', tier: 'Silver', start_date: '2026-02-11', end_date: '2026-02-14' };
  const farEnough = { id: 'far', name: 'Com Descanso', tier: 'Silver', start_date: '2026-02-15', end_date: '2026-02-18' };
  const restSoon = model.evaluateTournamentRegistration({ player, partner, tournament: tooSoon, currentDate: '2026-02-07', registrations: [finished], tournaments: [tooSoon, farEnough] });
  assert.equal(restSoon.allowed, true, `torneio 4 dias após o anterior deve ser PERMITIDO (item 10): ${JSON.stringify(restSoon.reasons)}`);
  assert.ok(!restSoon.reasons.some(item => item.code === 'REST_FLOOR'), 'REST_FLOOR não existe mais como reason bloqueante');
  assert.ok(restSoon.warnings.some(item => item.code === 'REST_ADVISORY'), JSON.stringify(restSoon.warnings));
  const restOk = model.evaluateTournamentRegistration({ player, partner, tournament: farEnough, currentDate: '2026-02-07', registrations: [finished], tournaments: [tooSoon, farEnough] });
  assert.equal(restOk.allowed, true, `8 dias de folga deve passar: ${JSON.stringify(restOk.reasons)}`);
  assert.ok(!restOk.warnings.some(item => item.code === 'REST_ADVISORY'), 'com folga suficiente, nenhum aviso de descanso');
  // Um torneio não disputado (missed) não impõe aviso de descanso nenhum.
  const missedInstead = model.evaluateTournamentRegistration({ player, partner, tournament: tooSoon, currentDate: '2026-02-07', registrations: [{ ...finished, status: 'missed' }], tournaments: [tooSoon, farEnough] });
  assert.equal(missedInstead.allowed, true, `torneio 'missed' não deve impor descanso: ${JSON.stringify(missedInstead.reasons)}`);
  assert.ok(!missedInstead.warnings.some(item => item.code === 'REST_ADVISORY'), 'torneio missed não gera aviso de descanso');
  // Sobreposição REAL continua bloqueando normalmente (item 14) — a
  // remoção do cooldown não afeta DATE_CONFLICT.
  const overlapNotRest = model.evaluateTournamentRegistration({ player, partner, tournament: { id: 'ov', name: 'Sobreposto', tier: 'Silver', start_date: '2026-02-05', end_date: '2026-02-08' }, currentDate: '2026-02-01', registrations: [finished], tournaments: [] });
  assert.ok(!overlapNotRest.reasons.some(item => item.code === 'REST_FLOOR'), 'sobreposição não deve ser reportada como falta de descanso');

  const oldCareer = { save_schema_version: 12, career_id: 'legacy', created_at: '2026-01-01', updated_at: '2026-01-01', metadata: {}, player, world: {}, calendar: {}, ranking: {}, market: {}, tournaments: {}, training: {}, economy: {}, inventory: {}, statistics: {}, history: {}, entities: { Tournament: [first], CalendarEvent: [{ id: 'event-1', profile_id: player.id, event_type: 'tournament', related_id: first.id, related_name: first.name, title: first.name, status: 'scheduled', start_date: first.start_date, end_date: first.end_date, metadata: { partner_id: partner.id } }] } };
  const migrated = migration.migrateCareer(oldCareer).data;
  assert.equal(migrated.save_schema_version, schema.CAREER_SAVE_SCHEMA_VERSION);
  assert.equal(migrated.entities.TournamentRegistration.length, 1);
  assert.equal(migrated.entities.TournamentRegistration[0].status, 'confirmed');
  assert.deepEqual(migration.migrateCareer(migrated).data, migrated);

  const integrity = model.validateTournamentRegistrations({ registrations: [registration], tournaments: [first], players: [player, partner] });
  assert.equal(integrity.valid, true, JSON.stringify(integrity.issues));
  console.log(JSON.stringify({ firstTournament: allowed, overlapBlocked: conflict.reasons.map(item => item.code), migrationRegistrations: migrated.entities.TournamentRegistration.length, scenarios: ['registered-reload-play-gate', 'unregistered-play-blocked', 'overlap-cancel-reselect'] }, null, 2));
} finally { await server.close(); }
