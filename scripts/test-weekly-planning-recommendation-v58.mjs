import assert from 'node:assert/strict';
import { loadWeeklyPlanning, review, tournament } from './lib/weeklyPlanningV58Harness.mjs';

const { buildWeeklyCareerReview, getTournamentPlanningRecommendation, close } = await loadWeeklyPlanning();
try {
  const weekly = review(buildWeeklyCareerReview, '2026-03-01', { tournaments: [
    tournament({ id: 'recommend-low', name: 'A', prize_coins: 500, rank_points: 50 }),
    tournament({ id: 'recommend-high', name: 'B', prize_coins: 4000, rank_points: 240, start_date: '2026-03-13', end_date: '2026-03-16' }),
  ] });
  const first = getTournamentPlanningRecommendation(weekly.upcomingTournaments);
  const second = getTournamentPlanningRecommendation(weekly.upcomingTournaments);
  assert.equal(first?.tournamentId, second?.tournamentId, 'recomendação não pode depender de aleatoriedade');
  assert.ok(first?.reason.includes('encaixe competitivo'), 'a razão deve explicar dados competitivos existentes');
  console.log('test-weekly-planning-recommendation-v58: PASS');
} finally { await close(); }
