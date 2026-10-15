import assert from 'node:assert/strict';
import { loadWeeklyPlanning, review, tournament, profile } from './lib/weeklyPlanningV58Harness.mjs';

const { buildWeeklyCareerReview, close } = await loadWeeklyPlanning();
try {
  const target = tournament();
  const other = tournament({ id: 'conflicting-event', name: 'Londres', start_date: '2026-03-12', end_date: '2026-03-15' });
  const item = review(buildWeeklyCareerReview, '2026-03-01', {
    tournaments: [target, other], registrations: [{ id: 'other-reg', profile_id: profile.id, partner_id: 'planning-partner', tournament_id: other.id, tournament_name: other.name, status: 'confirmed' }],
  }).upcomingTournaments.find((entry) => entry.id === target.id);
  assert.ok(item.conflictWith?.includes('Londres'));
  assert.notEqual(item.action.id, 'register', 'conflito não pode oferecer inscrição direta');
  console.log('test-weekly-planning-conflict-v58: PASS');
} finally { await close(); }
