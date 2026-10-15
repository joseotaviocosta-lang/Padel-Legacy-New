import assert from 'node:assert/strict';
import { loadWeeklyPlanning, review, tournament, profile } from './lib/weeklyPlanningV58Harness.mjs';

const { buildWeeklyCareerReview, close } = await loadWeeklyPlanning();
try {
  assert.equal(review(buildWeeklyCareerReview, '2026-03-01').upcomingTournaments[0].action.id, 'register');
  assert.equal(review(buildWeeklyCareerReview, '2026-03-06', { registrations: [{ profile_id: profile.id, tournament_id: 'planning-open', status: 'confirmed' }] }).upcomingTournaments[0].action.id, 'details');
  const inProgress = review(buildWeeklyCareerReview, '2026-03-11', {
    tournaments: [tournament({ bracket_schema_version: 2, bracket_history: [{ matches: [{}] }] })],
    registrations: [{ profile_id: profile.id, tournament_id: 'planning-open', status: 'confirmed' }],
    calendarEvents: [{ related_id: 'planning-open', event_type: 'tournament', metadata: { registration_id: 'reg', tournament_run: { status: 'playing' } } }],
  }).upcomingTournaments[0];
  assert.equal(inProgress.action.id, 'follow');
  const completed = review(buildWeeklyCareerReview, '2026-03-11', { registrations: [{ profile_id: profile.id, tournament_id: 'planning-open', status: 'completed' }] }).upcomingTournaments[0];
  assert.equal(completed.action.label, 'Ver resultados');
  console.log('test-weekly-planning-cta-v58: PASS');
} finally { await close(); }
