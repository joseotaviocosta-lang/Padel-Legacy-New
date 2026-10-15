// Playthrough 5.14 (continuação), Partes D/J/K/M — OPEN -> COMMITTED ->
// DRAWN na MESMA reunião semanal, com o CTA acompanhando e sem multiplicar
// mensagens.
import assert from 'node:assert/strict';
import { installShims, bootstrap, makeRunner } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-report-cta-state-transition-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('CtaTrans');
try {
  const { mod, localGame, profile, profileId, partner, rank, careerDate } = ctx;
  const { ensureWeeklyCompetitiveStaffReview } = await mod('/src/game-core/competitiveStaffReview.js');
  const { registerTournament } = await mod('/src/lib/tournamentRegistration.js');

  const reviews = async () => {
    const all = await localGame.entities.CareerMessage.filter({ profile_id: profileId }).catch(() => []);
    return (all || []).filter((m) => m.message_type === 'staff_competitive_review');
  };

  // --- OPEN ---
  const open = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  const messageId = open.message.id;
  const tournamentId = open.message.metadata.recommended_tournament_id;

  await check('Parte J: OPEN -> CTA "Inscrever-se"', () => {
    assert.equal(open.message.metadata.cta_id, 'register');
    assert.equal(open.message.metadata.cta_label, 'Inscrever-se');
  });

  // --- COMMITTED ---
  const tournament = await localGame.entities.Tournament.get(tournamentId);
  const registered = await registerTournament({ player: profile, partner, tournament, teamRank: rank });
  assert.ok(registered?.success, `inscrição falhou: ${JSON.stringify(registered?.reasons)}`);
  const committed = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  const afterCommit = await reviews();

  await check('Parte J/15: COMMITTED -> CTA muda, MESMA mensagem', () => {
    assert.equal(afterCommit.length, 1, `${afterCommit.length} mensagens`);
    assert.equal(afterCommit[0].id, messageId, 'criou mensagem nova');
    assert.equal(committed.decision.state, 'committed');
    assert.equal(afterCommit[0].metadata.cta_id, 'view_commitment');
    console.log(`   [registro] CTA agora: ${afterCommit[0].metadata.cta_label}`);
  });

  // --- DRAWN ---
  await localGame.entities.Tournament.update(tournamentId, {
    bracket_schema_version: 2,
    draw_date: careerDate,
    draw_pair_ids: ['a', 'b', 'c', 'd'],
    bracket_history: [{ round: 1, date: tournament.start_date, matches: [{ teamA: 'A', teamB: 'B' }] }],
  });
  const drawn = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  const afterDraw = await reviews();

  await check('Parte K/16: DRAWN -> continua UMA mensagem, mesmo id', () => {
    assert.equal(afterDraw.length, 1, `${afterDraw.length} mensagens`);
    assert.equal(afterDraw[0].id, messageId, 'criou mensagem nova no sorteio');
    console.log(`   [registro] estado=${afterDraw[0].metadata.decision_state} cta=${afterDraw[0].metadata.cta_label}`);
  });

  await check('Parte D: as transições produziram UMA única mensagem semanal', async () => {
    const rows = await reviews();
    const keys = new Set(rows.map((m) => m.metadata?.context_key));
    assert.equal(rows.length, 1);
    assert.equal(keys.size, 1);
  });

  await check('Parte M: nenhuma cópia diária durante as transições', async () => {
    for (const day of ['2026-01-20', '2026-01-21', '2026-01-22']) {
      await ensureWeeklyCompetitiveStaffReview({ ...profile, career_date: day }, day);
    }
    const rows = await reviews();
    assert.equal(rows.length, 1, `${rows.length} mensagens após mais 3 dias`);
  });

  void drawn;
  finish('test-staff-report-cta-state-transition-v514');
} finally {
  await ctx.vite.close();
}
