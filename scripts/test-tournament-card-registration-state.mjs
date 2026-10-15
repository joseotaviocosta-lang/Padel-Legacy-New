// Playthrough 4.9, Parte D/P — cobre todos os estados do card descritos na
// Parte D: [Inscrever] antes do prazo, ✓ confirmada, ⚠ encerram em N dias /
// último dia, INSCRIÇÕES ENCERRADAS, NÃO PARTICIPANTE, VER CHAVE (via
// registrationState DRAWN+). Testa as funções puras (buildRegistrationCardNotice
// + canPlayerRegisterNow), nunca renderização React.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getPlayerTournamentRegistrationState, TOURNAMENT_REGISTRATION_STATE, canPlayerRegisterNow, buildRegistrationCardNotice } = await vite.ssrLoadModule('/src/lib/tournamentRegistrationState.js');

  const tournament = { id: 'card-t1', start_date: '2026-05-10' };

  // ANTES DO PRAZO — botão Inscrever, sem aviso de card ainda (longe do deadline).
  {
    const state = getPlayerTournamentRegistrationState({ tournament, registration: null, careerDate: '2026-04-20' });
    assert.equal(state, TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN);
    assert.equal(canPlayerRegisterNow(state), true);
    const notice = buildRegistrationCardNotice(state, { daysToDeadline: 10 });
    assert.equal(notice, null, 'longe do prazo, nenhum aviso deveria aparecer (só o botão Inscrever)');
  }

  // Perto do fechamento — aviso "encerram em N dias".
  {
    const state = TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN;
    const notice = buildRegistrationCardNotice(state, { daysToDeadline: 2 });
    assert.equal(notice.code, 'CLOSING_SOON');
    assert.match(notice.label, /encerram em 2 dias/);
  }

  // Último dia — aviso distinto de "encerram em N dias".
  {
    const state = TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN;
    const notice = buildRegistrationCardNotice(state, { daysToDeadline: 0 });
    assert.equal(notice.code, 'LAST_DAY');
    assert.equal(notice.label, 'Último dia para se inscrever');
  }

  // Inscrito, ainda não sorteado — ✓ Inscrição confirmada.
  {
    const notice = buildRegistrationCardNotice(TOURNAMENT_REGISTRATION_STATE.REGISTERED, {});
    assert.equal(notice.code, 'CONFIRMED');
    assert.equal(notice.tone, 'confirmed');
  }

  // Depois do deadline, ainda não sorteado, nunca se inscreveu — INSCRIÇÕES ENCERRADAS, sem botão.
  {
    const state = getPlayerTournamentRegistrationState({ tournament, registration: null, careerDate: '2026-05-08', drawn: false });
    assert.equal(state, TOURNAMENT_REGISTRATION_STATE.REGISTRATION_CLOSED);
    assert.equal(canPlayerRegisterNow(state), false);
    const notice = buildRegistrationCardNotice(state, { drawHappened: false, isPast: false });
    assert.equal(notice.code, 'REGISTRATION_CLOSED');
    assert.equal(notice.label, 'Inscrições encerradas');
  }

  // Depois do sorteio, nunca se inscreveu — NÃO PARTICIPANTE, com explicação.
  {
    const state = getPlayerTournamentRegistrationState({ tournament, registration: null, careerDate: '2026-05-08', drawn: true });
    assert.equal(state, TOURNAMENT_REGISTRATION_STATE.REGISTRATION_CLOSED);
    const notice = buildRegistrationCardNotice(state, { drawHappened: true, isPast: false });
    assert.equal(notice.code, 'NOT_PARTICIPANT');
    assert.equal(notice.label, 'Não participante');
    assert.equal(notice.message, 'Você não se inscreveu antes do fechamento.');
  }

  // Inscrito + sorteado — DRAWN (a tela usa isso pra mostrar "Ver chave").
  {
    const state = getPlayerTournamentRegistrationState({ tournament, registration: { status: 'confirmed' }, careerDate: '2026-05-08', drawn: true });
    assert.equal(state, TOURNAMENT_REGISTRATION_STATE.DRAWN);
    assert.equal(canPlayerRegisterNow(state), false, 'depois do sorteio, nunca mais pode "inscrever"');
  }

  // Nunca no próprio dia do torneio o botão Inscrever pode reaparecer pra
  // quem não está inscrito — regressão direta do bug relatado.
  {
    const state = getPlayerTournamentRegistrationState({ tournament, registration: null, careerDate: tournament.start_date, drawn: true });
    assert.equal(canPlayerRegisterNow(state), false);
  }

  console.log('test-tournament-card-registration-state: PASS');
} finally {
  await vite.close();
}
