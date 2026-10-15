// Playthrough 5.14 (continuação), Partes D/F/G — mudar de estado ATUALIZA a
// mesma reunião, não cria outra. E uma mudança substantiva pode voltar a
// marcar como não lida (é uma novidade real para o jogador).
import assert from 'node:assert/strict';
import { installShims, bootstrap, makeRunner } from './lib/competitiveReviewGates.mjs';

installShims('/test-staff-weekly-review-state-update-v514');
const { check, finish } = makeRunner();
const ctx = await bootstrap('StateUpd');
try {
  const { mod, localGame, profile, profileId, partner, rank, careerDate } = ctx;
  const { ensureWeeklyCompetitiveStaffReview } = await mod('/src/game-core/competitiveStaffReview.js');
  const { registerTournament } = await mod('/src/lib/tournamentRegistration.js');

  const reviews = async () => {
    const all = await localGame.entities.CareerMessage.filter({ profile_id: profileId }).catch(() => []);
    return (all || []).filter((m) => m.message_type === 'staff_competitive_review');
  };

  const first = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  const before = await reviews();
  const originalId = before[0].id;
  console.log(`criada: "${before[0].subject}" (${before.length} mensagem)`);

  // Marca como lida, para medir o comportamento de unread na transição.
  await localGame.entities.CareerMessage.update(originalId, { is_read: true, is_new: false, status: 'lida' });

  await check('Parte D: estado inicial é a recomendação', () => {
    assert.equal(first.decision.state, 'decision');
    assert.match(before[0].subject, /Reunião da comissão/);
    assert.equal(before.length, 1);
  });

  // ---- inscrição: transição substantiva ----
  const tournament = await localGame.entities.Tournament.get(first.message.metadata.recommended_tournament_id);
  const registered = await registerTournament({ player: profile, partner, tournament, teamRank: rank });
  assert.ok(registered?.success, `inscrição falhou: ${JSON.stringify(registered?.reasons)}`);

  const second = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
  const after = await reviews();
  console.log(`após inscrição: "${after[0].subject}" (${after.length} mensagem)`);

  await check('Parte D/7: após a inscrição continua sendo UMA mensagem', () => {
    assert.equal(after.length, 1, `${after.length} mensagens`);
  });

  await check('Parte D/10: é o MESMO message id, atualizado', () => {
    assert.equal(after[0].id, originalId, 'criou mensagem nova em vez de atualizar');
    assert.equal(second.decision.state, 'committed');
  });

  await check('Parte D: o assunto passou a refletir o compromisso', () => {
    assert.match(after[0].subject, /Compromisso confirmado/);
    assert.equal(after[0].metadata.decision_state, 'committed');
  });

  await check('Parte F/11: mudança SUBSTANTIVA volta a marcar como não lida', () => {
    assert.equal(after[0].is_read, false, 'transição de estado não reabriu a mensagem');
    console.log('   [registro] recomendação -> compromisso reabriu a mensagem (mudança real)');
  });

  await check('Parte D: reprocessar depois da transição não escreve de novo', async () => {
    await localGame.entities.CareerMessage.update(originalId, { is_read: true, is_new: false, status: 'lida' });
    const third = await ensureWeeklyCompetitiveStaffReview(profile, careerDate);
    const rows = await reviews();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].is_read, true, 'reprocessamento trivial reabriu a mensagem');
    assert.ok(third.unchanged, 'não reconheceu que nada mudou');
  });

  finish('test-staff-weekly-review-state-update-v514');
} finally {
  await ctx.vite.close();
}
