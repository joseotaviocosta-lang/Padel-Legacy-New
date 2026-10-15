// Playthrough 4.9, Parte N — política de deadline: D-7/D-5/último dia
// (D-4) ainda OPEN; dia seguinte (D-3, dia do sorteio) CLOSED+DRAWN.
// registerTournament() depois do fechamento retorna um erro de domínio
// explícito (REGISTRATION_CLOSED) — nunca só desabilita a UI.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getTournamentRegistrationWindow } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { getPlayerTournamentRegistrationState, TOURNAMENT_REGISTRATION_STATE, canPlayerRegisterNow } = await vite.ssrLoadModule('/src/lib/tournamentRegistrationState.js');
  const { evaluateTournamentRegistration } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');

  const tournament = { id: 't-deadline', name: 'Deadline Cup', tier: 'Silver', start_date: '2026-03-08', entry_fee: 0, max_participants: 16 };
  const window = getTournamentRegistrationWindow(tournament);

  console.log('window', window);

  // Invariante obrigatória: registration_deadline < draw_date (D-3), nunca >=.
  const drawDate = new Date(`${tournament.start_date}T00:00:00Z`); drawDate.setUTCDate(drawDate.getUTCDate() - 3);
  const drawDateStr = drawDate.toISOString().slice(0, 10);
  assert.ok(window.closesAt < drawDateStr, `deadline (${window.closesAt}) precisa ser estritamente menor que draw_date (${drawDateStr})`);

  const addDays = (date, amount) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); };
  const dMinus7 = addDays(tournament.start_date, -7);
  const dMinus5 = addDays(tournament.start_date, -5);
  const lastDay = window.closesAt;
  const dayAfter = addDays(window.closesAt, 1);

  for (const [label, date, expected] of [
    ['D-7', dMinus7, TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN],
    ['D-5', dMinus5, TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN],
    ['último dia (deadline)', lastDay, TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN],
    ['dia seguinte ao deadline', dayAfter, TOURNAMENT_REGISTRATION_STATE.REGISTRATION_CLOSED],
    ['D-3 (dia do sorteio)', drawDateStr, TOURNAMENT_REGISTRATION_STATE.REGISTRATION_CLOSED],
  ]) {
    const state = getPlayerTournamentRegistrationState({ tournament, registration: null, careerDate: date, drawn: date >= drawDateStr });
    console.log(label, date, '->', state);
    assert.equal(state, expected, `${label} (${date}) deveria ser ${expected}, obtido ${state}`);
  }

  assert.equal(canPlayerRegisterNow(TOURNAMENT_REGISTRATION_STATE.REGISTRATION_OPEN), true);
  assert.equal(canPlayerRegisterNow(TOURNAMENT_REGISTRATION_STATE.REGISTRATION_CLOSED), false);

  // registerTournament (via evaluateTournamentRegistration, a mesma
  // validação de domínio) precisa retornar um erro EXPLÍCITO depois do
  // fechamento — nunca silenciosamente permitir, nunca depender só da UI
  // esconder o botão.
  const player = { id: 'deadline-player', career_date: dayAfter, coins: 1000, partner_id: 'partner-1' };
  const partner = { id: 'partner-1' };
  const validationAfterClose = evaluateTournamentRegistration({ player, partner, tournament, currentDate: dayAfter, registrations: [], tournaments: [tournament] });
  assert.equal(validationAfterClose.allowed, false);
  assert.ok(validationAfterClose.reasons.some((item) => item.code === 'REGISTRATION_CLOSED'), `esperava o código de erro REGISTRATION_CLOSED, obtido ${JSON.stringify(validationAfterClose.reasons)}`);

  const validationBeforeClose = evaluateTournamentRegistration({ player: { ...player, career_date: dMinus7 }, partner, tournament, currentDate: dMinus7, registrations: [], tournaments: [tournament] });
  assert.equal(validationBeforeClose.reasons.some((item) => item.code === 'REGISTRATION_CLOSED'), false);

  console.log('test-registration-deadline-authority: PASS');
} finally {
  await vite.close();
}
