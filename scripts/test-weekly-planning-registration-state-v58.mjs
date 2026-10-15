import assert from 'node:assert/strict';
import { loadWeeklyPlanning, review, tournament, profile } from './lib/weeklyPlanningV58Harness.mjs';

const { buildWeeklyCareerReview, close } = await loadWeeklyPlanning();
try {
  const registered = review(buildWeeklyCareerReview, '2026-03-06', { registrations: [{ id: 'reg', profile_id: profile.id, tournament_id: 'planning-open', status: 'confirmed' }] }).upcomingTournaments[0];
  assert.equal(registered.registrationState, 'REGISTERED');
  assert.equal(registered.action.label, 'Ver inscrição');
  const drawnTournament = tournament({ bracket_schema_version: 2, bracket_history: [{ matches: [{}] }] });
  const drawn = review(buildWeeklyCareerReview, '2026-03-06', { tournaments: [drawnTournament], registrations: [{ id: 'reg', profile_id: profile.id, tournament_id: drawnTournament.id, status: 'confirmed' }] }).upcomingTournaments[0];
  assert.equal(drawn.registrationState, 'DRAWN');
  assert.equal(drawn.action.label, 'Ver chave');
  console.log('test-weekly-planning-registration-state-v58: PASS');
} finally { await close(); }
