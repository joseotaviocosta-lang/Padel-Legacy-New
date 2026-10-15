import assert from 'node:assert/strict';
import { loadWeeklyPlanning, review, tournament } from './lib/weeklyPlanningV58Harness.mjs';

const { buildWeeklyCareerReview, close } = await loadWeeklyPlanning();
try {
  const d10 = review(buildWeeklyCareerReview, '2026-03-01');
  assert.equal(d10.upcomingTournaments.length, 1, 'D-10 precisa mostrar a decisão relevante');
  const item = d10.upcomingTournaments[0];
  assert.equal(item.deadline, '2026-03-07');
  assert.equal(item.action.label, 'Inscrever-se');
  assert.equal(item.deadlineInfo.label, 'Encerra em 6 dias');
  assert.ok(item.coachComment.length > 0 && item.fieldStrength && item.riskReward);
  const multiple = review(buildWeeklyCareerReview, '2026-03-01', { tournaments: [tournament(), tournament({ id: 'planning-later', name: 'Roma', start_date: '2026-03-20', end_date: '2026-03-23' })] });
  assert.ok(multiple.upcomingTournaments.length === 2 && multiple.upcomingTournaments.some((entry) => entry.isRecommended), 'múltiplas opções precisam ter recomendação determinística');
  console.log('test-weekly-tournament-planning-v58: PASS');
} finally { await close(); }
