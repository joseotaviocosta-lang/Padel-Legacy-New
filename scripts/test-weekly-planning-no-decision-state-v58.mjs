import assert from 'node:assert/strict';
import { loadWeeklyPlanning, review, tournament } from './lib/weeklyPlanningV58Harness.mjs';

const { buildWeeklyCareerReview, close } = await loadWeeklyPlanning();
try {
  const inaccessible = tournament({ tier: 'Legacy Finals', start_date: '2026-03-11', end_date: '2026-03-14' });
  const result = review(buildWeeklyCareerReview, '2026-03-01', { tournaments: [inaccessible] });
  assert.equal(result.upcomingTournaments.length, 0, 'evento sem entrada esportiva não deve simular uma decisão');
  console.log('test-weekly-planning-no-decision-state-v58: PASS');
} finally { await close(); }
