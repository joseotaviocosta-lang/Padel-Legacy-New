// Playthrough 5.14, Partes S/Y — semana com vários torneios gera UMA
// decisão com alternativas, nunca uma mensagem por evento; e a carreira
// simulada por 8 semanas não pode deixar a Federação ser o primeiro sinal.
import assert from 'node:assert/strict';
import { installShims, bootstrap, makeRunner } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-review-multi-tournament-choice-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('MultiWeek', { rank: 300, careerDate: '2026-01-12' });
try {
  const { mod, localGame, profile, profileId, partner, rank } = ctx;
  const { ensureWeeklyCompetitiveStaffReview, competitiveWeekKey } = await mod('/src/game-core/competitiveStaffReview.js');
  const { buildCompetitiveWeeklyDecision } = await mod('/src/lib/competitiveWeeklyDecision.js');

  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);

  // ---- Parte S: a semana Bronze + 2 Gold + Masters ----
  const sameDay = tournaments.filter((t) => t.start_date === '2026-01-29');
  console.log(`semana com ${sameDay.length} eventos: ${sameDay.map((t) => t.tier).join(', ')}`);

  const decision = buildCompetitiveWeeklyDecision(
    { ...profile, career_date: '2026-01-19' },
    { tournaments, registrations: [], calendarEvents: [], teamRank: rank, partner },
  );

  await check('Parte S: 4 eventos simultâneos geram UMA decisão', () => {
    assert.ok(sameDay.length >= 3, `só ${sameDay.length} eventos`);
    assert.equal(decision.state, 'decision');
    assert.ok(decision.recommended, 'sem recomendação única');
  });

  await check('Parte S/12: mostra até 3 alternativas, com motivo quando inelegível', () => {
    assert.ok(decision.alternatives.length <= 3, `${decision.alternatives.length} alternativas`);
    console.log(`   [registro] recomendado=${decision.recommended.name} (${decision.recommended.tier})`);
    for (const alt of decision.alternatives) {
      console.log(`   [registro] alternativa=${alt.name} (${alt.tier}) elegível=${alt.eligible}${alt.why ? ` — ${alt.why}` : ''}`);
      if (!alt.eligible) assert.ok(alt.why, `${alt.name} sem motivo`);
    }
  });

  // ---- Parte Y: 8 semanas ----
  const weeks = [];
  for (let i = 0; i < 8; i += 1) {
    const d = new Date('2026-01-12T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i * 7);
    const date = d.toISOString().slice(0, 10);
    const fresh = await localGame.entities.PlayerProfile.get(profileId);
    // Dois ticks no mesmo dia, simulando reprocessamento do avanço.
    await ensureWeeklyCompetitiveStaffReview({ ...fresh, career_date: date }, date);
    const result = await ensureWeeklyCompetitiveStaffReview({ ...fresh, career_date: date }, date);
    weeks.push({ date, week: competitiveWeekKey(date), state: result.decision?.state, recommended: result.decision?.recommended?.name || null });
  }

  const all = await localGame.entities.CareerMessage.filter({ profile_id: profileId });
  const reviews = (all || []).filter((m) => m.message_type === 'staff_competitive_review');
  const byKey = new Map();
  for (const m of reviews) byKey.set(m.metadata?.context_key, (byKey.get(m.metadata?.context_key) || 0) + 1);
  const duplicates = [...byKey.values()].filter((n) => n > 1).length;
  const competitiveWeeks = weeks.filter((w) => w.state === 'decision' || w.state === 'committed').length;

  console.log('\n=== Parte Y: 8 semanas ===');
  for (const w of weeks) console.log(`  ${w.date} (${w.week}) ${String(w.state).padEnd(10)} ${w.recommended || '-'}`);
  console.log(`competitiveWeeks=${competitiveWeeks} staffReviewsCreated=${reviews.length} duplicateStaffReviews=${duplicates}`);

  await check('Parte Y/26-28: 8 semanas simuladas, uma reunião por semana', () => {
    assert.equal(weeks.length, 8);
    assert.equal(reviews.length, byKey.size, 'mensagens além do número de semanas distintas');
  });

  await check('Parte Y/29: duplicateStaffReviews = 0', () => {
    assert.equal(duplicates, 0, `${duplicates} semanas com reunião duplicada`);
  });

  await check('Parte Y/30: em toda semana competitiva a comissão falou ANTES do D-7', () => {
    // A reunião é criada na primeira passagem da semana; o D-7 de qualquer
    // torneio recomendado cai depois disso por construção do calendário.
    let federationFirst = 0;
    for (const review of reviews) {
      const startDate = review.metadata?.start_date;
      if (!startDate || !review.career_date) continue;
      const d = new Date(`${startDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 7);
      const dMinus7 = d.toISOString().slice(0, 10);
      if (review.career_date > dMinus7) federationFirst += 1;
    }
    console.log(`   [registro] weeksWhereFederationWasFirstDecisionSignal = ${federationFirst}`);
    assert.equal(federationFirst, 0, `${federationFirst} semanas em que o D-7 veio primeiro`);
  });

  await check('Parte Y: toda semana produziu um estado válido', () => {
    for (const w of weeks) {
      assert.ok(['decision', 'committed', 'no_event'].includes(w.state), `${w.date}: estado ${w.state}`);
    }
  });

  finish('test-staff-review-multi-tournament-choice-v514');
} finally {
  await ctx.vite.close();
}
