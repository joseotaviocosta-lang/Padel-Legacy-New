// Playthrough 5.14, Partes E/L — a reunião da comissão não pode ter lógica
// de escolha própria: ela consome a MESMA autoridade do planner. Este teste
// também inspeciona os estados de inscrição que alimentam a decisão.
import assert from 'node:assert/strict';
import { installShims, bootstrap, makeRunner } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-tournament-recommendation-authority-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('RecAuth');
try {
  const { mod, localGame, profile, profileId, partner, rank, careerDate } = ctx;
  const { ensureWeeklyCompetitiveStaffReview } = await mod('/src/game-core/competitiveStaffReview.js');
  const { registerTournament } = await mod('/src/lib/tournamentRegistration.js');
  const { buildUpcomingTournamentPlanning, getTournamentPlanningRecommendation } = await mod('/src/lib/weeklyCareerReview.js');
  const { buildCompetitiveWeeklyDecision } = await mod('/src/lib/competitiveWeeklyDecision.js');
  const { isPlayerParticipating } = await mod('/src/lib/tournamentRegistrationState.js');

  const review = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  const recommendedId = review.message?.metadata?.recommended_tournament_id;
  assert.ok(recommendedId, 'sem recomendação');

  const load = async () => {
    const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
    const registrations = await localGame.entities.TournamentRegistration.filter({ profile_id: profileId }).catch(() => []);
    const calendarEvents = await localGame.entities.CalendarEvent.filter({ profile_id: profileId }).catch(() => []);
    return { tournaments, registrations: registrations || [], calendarEvents: calendarEvents || [], teamRank: rank, partner };
  };

  const ctxBefore = await load();
  const itemsBefore = buildUpcomingTournamentPlanning({ ...profile, career_date: careerDate }, ctxBefore);

  console.log('=== estados ANTES da inscrição ===');
  for (const item of itemsBefore) {
    console.log(`  ${String(item.name).slice(0, 28).padEnd(30)} ${String(item.registrationState).padEnd(22)} participa=${isPlayerParticipating(item.registrationState)}`);
  }

  await check('Parte L: a reunião usa a recomendação do planner', () => {
    const pick = getTournamentPlanningRecommendation(itemsBefore);
    assert.equal(recommendedId, pick.tournamentId);
  });

  // ---- inscrição ----
  const tournament = await localGame.entities.Tournament.get(recommendedId);
  const registered = await registerTournament({ player: profile, partner, tournament, teamRank: rank });
  assert.ok(registered?.success, `inscrição falhou: ${JSON.stringify(registered?.reasons)}`);

  const ctxAfter = await load();
  const itemsAfter = buildUpcomingTournamentPlanning({ ...profile, career_date: careerDate }, ctxAfter);

  console.log('\n=== estados DEPOIS da inscrição ===');
  console.log(`registros persistidos: ${ctxAfter.registrations.length} (status: ${ctxAfter.registrations.map((r) => r.status).join(', ')})`);
  for (const item of itemsAfter) {
    console.log(`  ${String(item.name).slice(0, 28).padEnd(30)} ${String(item.registrationState).padEnd(22)} participa=${isPlayerParticipating(item.registrationState)}`);
  }

  await check('Parte J: a inscrição foi persistida para o torneio recomendado', () => {
    const mine = ctxAfter.registrations.find((r) => r.tournament_id === recommendedId);
    assert.ok(mine, 'nenhuma inscrição persistida para o torneio recomendado');
    console.log(`   [registro] status persistido: ${mine.status}`);
  });

  await check('Parte J: o item do planner reflete a participação do jogador', () => {
    const item = itemsAfter.find((i) => i.id === recommendedId);
    assert.ok(item, 'torneio inscrito sumiu do planner');
    assert.ok(isPlayerParticipating(item.registrationState),
      `estado ${item.registrationState} não conta como participação`);
  });

  await check('Parte J/17: a decisão canônica vira COMPROMISSO', () => {
    const decision = buildCompetitiveWeeklyDecision({ ...profile, career_date: careerDate }, ctxAfter);
    assert.equal(decision.state, 'committed', `estado=${decision.state}`);
    assert.equal(decision.committed?.id, recommendedId);
  });

  finish('test-staff-tournament-recommendation-authority-v514');
} finally {
  await ctx.vite.close();
}
