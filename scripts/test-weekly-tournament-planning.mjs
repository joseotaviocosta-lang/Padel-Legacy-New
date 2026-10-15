// Playthrough 4.9, Parte G/P — seção "PRÓXIMOS TORNEIOS" da reunião
// semanal: 2-4 torneios elegíveis dentro de ~4 semanas, com deadline/dias
// restantes/pontos/premiação/custo/conflito/análise do treinador. Nunca
// inscreve sozinho — só apresenta a decisão (CTA correto por estado).
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { buildWeeklyCareerReview } = await vite.ssrLoadModule('/src/lib/weeklyCareerReview.js');

  const profile = {
    id: 'weekly-player', career_date: '2026-03-01', partner_id: 'weekly-partner',
    serve: 40, forehand: 40, backhand: 40, volley: 40, overall_rating: 40, energy: 90,
  };
  const partner = { id: 'weekly-partner', name: 'Parceiro Semanal', overall_rating: 40 };

  const nearTournament = { id: 'weekly-near', name: 'Los Angeles Cup', tier: 'Silver', start_date: '2026-03-08', end_date: '2026-03-11', entry_fee: 0, max_participants: 16, prize_coins: 2000, rank_points: 120, min_level: 'Iniciante' };
  const strongTournament = { id: 'weekly-strong', name: 'Barcelona Championship', tier: 'Gold', start_date: '2026-03-15', end_date: '2026-03-19', entry_fee: 0, max_participants: 32, prize_coins: 8000, rank_points: 400, min_level: 'Avançado' };
  const farTournament = { id: 'weekly-far', name: 'Far Future Cup', tier: 'Silver', start_date: '2026-06-01', end_date: '2026-06-04', entry_fee: 0, max_participants: 16, prize_coins: 1000, rank_points: 80, min_level: 'Iniciante' };

  const review = buildWeeklyCareerReview(profile, {
    matches: [], trainings: [], messages: [],
    tournaments: [nearTournament, strongTournament, farTournament],
    registrations: [], teamRank: 0, partner,
  });

  assert.ok(review, 'buildWeeklyCareerReview precisa continuar funcionando (regressão)');
  assert.ok(Array.isArray(review.upcomingTournaments), 'precisa expor upcomingTournaments');

  const ids = review.upcomingTournaments.map((item) => item.id);
  assert.ok(ids.includes('weekly-near'), 'torneio elegível dentro da janela precisa aparecer');
  assert.ok(!ids.includes('weekly-far'), 'torneio fora da janela de ~4 semanas não deveria aparecer');
  assert.ok(review.upcomingTournaments.length <= 4, 'no máximo 4 torneios na vitrine semanal');
  assert.ok(review.upcomingTournaments.length >= 1, 'esperava ao menos 1 torneio elegível nesta janela');

  const near = review.upcomingTournaments.find((item) => item.id === 'weekly-near');
  assert.ok(near, 'Los Angeles Cup precisa aparecer na vitrine');
  assert.ok(near.deadline, 'precisa expor a deadline canônica');
  assert.ok(Number.isFinite(near.daysToDeadline), 'precisa expor dias restantes até o prazo');
  assert.equal(near.points, 120);
  assert.equal(near.prize, 2000);
  assert.ok(typeof near.coachComment === 'string' && near.coachComment.length > 0, 'precisa ter análise do treinador, nunca vazia');
  assert.ok(['register', 'details'].includes(near.recommendedCta));

  console.log('test-weekly-tournament-planning: PASS');
} finally {
  await vite.close();
}
