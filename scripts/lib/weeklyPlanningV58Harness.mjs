import { createServer } from 'vite';

export async function loadWeeklyPlanning() {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const module = await vite.ssrLoadModule('/src/lib/weeklyCareerReview.js');
  return { ...module, close: () => vite.close() };
}

export const profile = Object.freeze({
  id: 'planning-player', career_date: '2026-03-01', partner_id: 'planning-partner',
  serve: 40, forehand: 40, backhand: 40, volley: 40, overall_rating: 40, energy: 90, coins: 5000,
});

export const partner = Object.freeze({ id: 'planning-partner', name: 'Parceiro', overall_rating: 40 });

export function tournament(overrides = {}) {
  return {
    id: 'planning-open', name: 'Lisbon Open', tier: 'Silver', start_date: '2026-03-11', end_date: '2026-03-14',
    entry_fee: 100, prize_coins: 2000, rank_points: 120, max_participants: 32, min_level: 'Iniciante',
    ...overrides,
  };
}

export function review(buildWeeklyCareerReview, date, options = {}) {
  return buildWeeklyCareerReview({ ...profile, career_date: date }, {
    matches: [], trainings: [], messages: [], partner, teamRank: 0,
    tournaments: options.tournaments || [tournament()], registrations: options.registrations || [], calendarEvents: options.calendarEvents || [],
  });
}
