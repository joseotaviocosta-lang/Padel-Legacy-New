import assert from 'node:assert/strict';
import { loadWeeklyPlanning, review } from './lib/weeklyPlanningV58Harness.mjs';

const { buildWeeklyCareerReview, close } = await loadWeeklyPlanning();
try {
  assert.equal(review(buildWeeklyCareerReview, '2026-03-04').upcomingTournaments[0].deadlineInfo.label, 'Encerra em 3 dias');
  assert.equal(review(buildWeeklyCareerReview, '2026-03-06').upcomingTournaments[0].deadlineInfo.label, 'Encerra amanhã');
  const lastDay = review(buildWeeklyCareerReview, '2026-03-07').upcomingTournaments[0];
  assert.equal(lastDay.deadlineInfo.label, 'Último dia');
  assert.equal(lastDay.action.label, 'Inscrever-se', 'D-4 continua permitindo inscrição');
  const closed = review(buildWeeklyCareerReview, '2026-03-08').upcomingTournaments[0];
  assert.equal(closed.deadlineInfo.label, 'Inscrições encerradas');
  assert.equal(closed.action.label, 'Prazo encerrado', 'D-3 não pode oferecer CTA falso');
  console.log('test-weekly-planning-deadline-v58: PASS');
} finally { await close(); }
