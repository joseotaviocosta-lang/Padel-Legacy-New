import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildWeeklyCareerReview } from '../src/lib/weeklyCareerReview.js';

const profile = { id: 'p1', career_date: '2026-03-10', energy: 80, fatigue: 20 };
const review = buildWeeklyCareerReview(profile, {
  matches: [
    { id: 'm1', match_date: '2026-03-09', status: 'completed', winner_id: 'p1' },
    { id: 'm2', match_date: '2026-03-07', status: 'completed', winner_id: 'p1' },
    { id: 'm3', match_date: '2026-03-05', status: 'completed', winner_id: 'p1' },
    { id: 'm4', match_date: '2026-02-20', status: 'completed', winner_id: 'x' },
  ],
  trainings: [
    { id: 't1', training_date: '2026-03-08', attribute_gain: 0.4 },
    { id: 't2', training_date: '2026-03-06', attribute_gains: { smash: 0.3, mental: 0.2 } },
  ],
  messages: [{ id: 'c1', status: 'nao_lida' }],
});

assert.equal(review.metrics.find((item) => item.id === 'matches').value, 3, 'deve considerar apenas os últimos sete dias');
assert.equal(review.metrics.find((item) => item.id === 'performance').value, '100%', 'deve calcular o aproveitamento semanal');
assert.equal(review.metrics.find((item) => item.id === 'trainings').value, 2, 'deve contar treinos da semana');
assert.equal(review.metrics.find((item) => item.id === 'communications').value, 1, 'deve contar comunicações pendentes');
assert.equal(review.headline.title, 'Semana perfeita em quadra');

const quiet = buildWeeklyCareerReview({ id: 'p2', career_date: '2026-03-10', energy: 90, fatigue: 10 }, {});
assert.equal(quiet.hasActivity, false, 'sem atividade não deve inventar resultados');
assert.equal(quiet.headline.title, 'Semana sob controle');

const hub = await readFile(new URL('../src/pages/CareerHub.jsx', import.meta.url), 'utf8');
assert.match(hub, /WeeklyCareerReview/);
assert.match(hub, /buildWeeklyCareerReview/);
console.log('LivingCareerV34_8Test: PASS (weekly window, metrics, headline and empty state)');
