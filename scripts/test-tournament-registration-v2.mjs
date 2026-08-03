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
  assert.deepEqual(allowed.registrationWindow, { opensAt: '2025-12-09', closesAt: '2026-01-07' });
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
