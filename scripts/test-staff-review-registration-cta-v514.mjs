// Playthrough 5.14, Partes O/P — o CTA do relatório reflete o estado real e
// a inscrição usa o MESMO fluxo canônico (registerTournament), sem segundo
// handler.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installShims, bootstrap, makeRunner } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-review-registration-cta-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('RegCta');
try {
  const { mod, localGame, profile, profileId, partner, rank, careerDate } = ctx;
  const { ensureWeeklyCompetitiveStaffReview } = await mod('/src/game-core/competitiveStaffReview.js');
  const { resolveCompetitiveDecisionCta, buildCompetitiveWeeklyDecision } = await mod('/src/lib/competitiveWeeklyDecision.js');
  const { registerTournament } = await mod('/src/lib/tournamentRegistration.js');

  const review = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  const recommendedId = review.message.metadata.recommended_tournament_id;

  await check('Parte O/13: inscrição aberta -> CTA "Inscrever-se"', () => {
    assert.equal(review.decision.state, 'decision');
    const cta = resolveCompetitiveDecisionCta(review.decision);
    assert.equal(cta.id, 'register');
    assert.equal(cta.label, 'Inscrever-se');
    assert.equal(review.message.metadata.cta_id, 'register');
  });

  const tournament = await localGame.entities.Tournament.get(recommendedId);
  const registered = await registerTournament({ player: profile, partner, tournament, teamRank: rank });

  await check('Parte P/16: a inscrição usa o fluxo canônico existente', () => {
    assert.ok(registered?.success, `falhou: ${JSON.stringify(registered?.reasons)}`);
    assert.ok(registered.registration?.id, 'sem registro canônico');
  });

  await check('Parte P: nenhum segundo handler de inscrição foi criado', () => {
    const source = readFileSync(new URL('../src/game-core/competitiveStaffReview.js', import.meta.url), 'utf8');
    assert.ok(!/TournamentRegistration\.create|registerTournament\(/.test(source),
      'a reunião está inscrevendo por conta própria');
  });

  await check('Parte O/17: já inscrito -> CTA deixa de pedir inscrição', async () => {
    const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
    const registrations = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId });
    const calendarEvents = await localGame.entities.CalendarEvent.filter({ profile_id: profileId }).catch(() => []);
    const decision = buildCompetitiveWeeklyDecision({ ...profile, career_date: careerDate },
      { tournaments, registrations: registrations || [], calendarEvents: calendarEvents || [], teamRank: rank, partner });
    const cta = resolveCompetitiveDecisionCta(decision);
    console.log(`   [registro] CTA agora: ${cta.label}`);
    assert.notEqual(cta.id, 'register');
    assert.ok(['view_commitment', 'view_bracket'].includes(cta.id), `cta=${cta.id}`);
  });

  finish('test-staff-review-registration-cta-v514');
} finally {
  await ctx.vite.close();
}
