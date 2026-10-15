import assert from 'node:assert/strict';
import { loadWeeklyPlanning, review, profile } from './lib/weeklyPlanningV58Harness.mjs';

const { buildWeeklyCareerReview, close } = await loadWeeklyPlanning();
try {
  const before = review(buildWeeklyCareerReview, '2026-03-06').upcomingTournaments[0];
  const after = review(buildWeeklyCareerReview, '2026-03-06', { registrations: [{ id: 'fresh', profile_id: profile.id, tournament_id: before.id, status: 'confirmed' }] }).upcomingTournaments[0];
  assert.equal(before.action.label, 'Inscrever-se');
  assert.equal(after.registrationState, 'REGISTERED');
  assert.equal(after.action.label, 'Ver inscrição');
  console.log('test-weekly-planning-post-registration-v58: PASS');
} finally { await close(); }
