// Fase 15.2 — QA integrado do hotfix (docs pendente). Cobre, com o pipeline
// real (sem mocks) via server.ssrLoadModule, os 4 bugs de lógica corrigidos
// nesta fase:
//
//   Bug 7 (P0): rodada de torneio não pode parecer pronta/jogável antes da
//   própria data chegar (getTournamentRunPhase, TournamentRunManager.js) —
//   e o bloqueio de avanço de dia (calendarAdvancePolicy.js) continua
//   respeitando a data oficial da pendência mesmo depois da correção.
//   Bug 4 (P1): entrevista pré-torneio nunca hardcoda "amanhã" — usa
//   formatDaysUntilPhrase (pressData.js) com o número real de dias.
//   Bug 5 (P1): a missão "tournament-registered" conclui no instante da
//   inscrição confirmada, sem exigir partida jogada (tutorialState.js).
//   Bug 6 (P1): energia/fadiga nunca mostram casas decimais longas —
//   formatPercent (physicalStats.js) arredonda e clampa só para exibição.
//
// Bugs 1/2/3 (Home layout, editor de Aparência, idade nas listas) são
// puramente estruturais/JSX — verificados por inspeção visual real (dev
// server + Playwright, ver relatório) e por não introduzirem regressão nos
// testes estruturais já existentes (test:onboarding-single-source-of-truth,
// test:tournament-round-availability etc.), não repetidos aqui.

import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const {
    createTournamentRun, completePreTournamentMeeting, completeRoundPreparation,
    recordTournamentMatchResult, getTournamentRunPhase, getCurrentTournamentMatch,
  } = await server.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const { shouldBlockBeforeAdvance, getTournamentCommitmentDate, getCalendarDecisionState } = await server.ssrLoadModule('/src/game-core/calendarAdvancePolicy.js');
  const { getPendingInterviews, fillTemplate, formatDaysUntilPhrase, QUESTION_BANKS } = await server.ssrLoadModule('/src/lib/pressData.js');
  const { deriveTutorialFacts, inferCompletedSteps } = await server.ssrLoadModule('/src/onboarding/tutorialState.js');
  const { formatPercent, normalizeFatigue } = await server.ssrLoadModule('/src/game-core/physicalStats.js');

  // ═══════════════════════════════════════════════════════════════════════
  // TORNEIO (Bug 7) — R16 → QF → SF → F com o motor real de rodadas.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Torneio (Bug 7) ---');

  function makeOpponent(name) {
    return [{ id: `${name}-a`, name: `${name} A`, smash: 60 }, { id: `${name}-b`, name: `${name} B`, smash: 60 }];
  }
  const tournament = { id: 'miami-cup', name: 'Miami Cup', tier: 'Gold' };
  const mainRounds = [
    { label: 'R32', short: 'R32' }, { label: 'Oitavas de Final', short: 'R16' },
    { label: 'Quartas de Final', short: 'QF' }, { label: 'Semifinal', short: 'SF' }, { label: 'Final', short: 'F' },
  ];
  const opponents = mainRounds.map((_, i) => makeOpponent(`opp${i}`));

  let run = createTournamentRun({ tournament, profileId: 'p1', startDate: '2026-01-06', mainRounds, opponents });
  run = completePreTournamentMeeting(run, 'balanced').run;
  // Fast-forward to R16 (index 1) by winning R32 first, as a real career would.
  let transition = recordTournamentMatchResult(run, { matchId: getCurrentTournamentMatch(run).id, won: true, score: '6-2 6-2', tournament });
  run = transition.run;
  run = completeRoundPreparation(run, { optionId: 'balanced' }).run;
  gate('R32 vencida, R16 é a rodada atual', getCurrentTournamentMatch(run).round === 'Oitavas de Final');

  const r16Date = getCurrentTournamentMatch(run).date;
  gate('R16 agendada num dia após R32 (datas monotônicas)', r16Date > '2026-01-06');

  // Win R16 on r16Date — this is the exact scenario from the bug report.
  transition = recordTournamentMatchResult(run, { matchId: getCurrentTournamentMatch(run).id, won: true, score: '6-3 6-4', tournament });
  run = transition.run;
  const qfMatch = getCurrentTournamentMatch(run);
  gate('Após vencer R16, currentRound aponta para QF', qfMatch.round === 'Quartas de Final');
  gate('QF agendada para um dia estritamente após R16 (nunca no mesmo dia)', qfMatch.date > r16Date);

  const phaseRightAfterR16Win = getTournamentRunPhase(run, r16Date);
  gate('QF NÃO auto-inicia em R16Date — fase é "waiting", não "round_preparation"/"playable"', phaseRightAfterR16Win === 'waiting');
  const playableTodayBug = phaseRightAfterR16Win === 'playable' || phaseRightAfterR16Win === 'round_preparation';
  gate('round_result não ofereceria "Jogar QF agora" no dia da R16 (playableToday falso)', playableTodayBug === false);

  const fakeQfEvent = {
    event_type: 'tournament', status: 'scheduled', requires_decision: true,
    start_date: qfMatch.date, related_id: tournament.id, metadata: { tournament_run: run },
  };
  gate('08→09 (R16Date → QF date) permitido: bloqueio de avanço NÃO dispara em R16Date', shouldBlockBeforeAdvance(fakeQfEvent, r16Date) === false);
  gate('getCalendarDecisionState em R16Date é "future" (nunca dueToday/overdue antes da hora)', getCalendarDecisionState(fakeQfEvent, r16Date) === 'future');
  gate('Fonte canônica da data de pendência é matches[currentRound].date', getTournamentCommitmentDate(fakeQfEvent) === qfMatch.date);

  gate('Na data da QF, fase vira jogável (playable ou round_preparation) — não fica presa em "waiting"', ['playable', 'round_preparation'].includes(getTournamentRunPhase(run, qfMatch.date)));
  gate('09→10 sem jogar a QF: bloqueio dispara na própria data da QF (dueToday)', shouldBlockBeforeAdvance(fakeQfEvent, qfMatch.date) === true);
  gate('Depois da data da QF sem jogar: overdue também bloqueia', getCalendarDecisionState(fakeQfEvent, '2099-01-01') === 'overdue');

  // Full R16 → QF → SF → F sequence: no round ever appears playable/prep before its own date.
  run = completeRoundPreparation(run, { optionId: 'balanced' }).run;
  let guardOk = true;
  for (const roundLabel of ['Quartas de Final', 'Semifinal', 'Final']) {
    const current = getCurrentTournamentMatch(run);
    if (current.round !== roundLabel) { guardOk = false; break; }
    const dayBefore = new Date(`${current.date}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const dayBeforeIso = dayBefore.toISOString().slice(0, 10);
    const phaseDayBefore = getTournamentRunPhase(run, dayBeforeIso);
    if (phaseDayBefore !== 'waiting') { guardOk = false; break; }
    const win = recordTournamentMatchResult(run, { matchId: current.id, won: true, score: '6-1 6-1', tournament });
    run = win.run;
    if (!win.terminal) run = completeRoundPreparation(run, { optionId: 'balanced' }).run;
  }
  gate('R16→QF→SF→F: nenhuma rodada apareceu pronta um dia antes da própria data', guardOk);
  gate('Torneio encerrado como campeão após vencer a Final', run.status === 'champion');
  gate('Torneio encerrado não deixa pendência de calendário (status terminal)', getTournamentCommitmentDate({ event_type: 'tournament', metadata: { tournament_run: run } }) === null);

  // ═══════════════════════════════════════════════════════════════════════
  // ENTREVISTA (Bug 4) — nunca "amanhã" hardcoded; texto reflete dias reais.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Entrevista pré-torneio (Bug 4) ---');

  function preTournamentText(careerDate, tournamentDate) {
    const profile = { id: 'p1', sport_name: 'Você', career_date: careerDate, matches_played: 0, wins: 0, losses: 0 };
    const events = [{
      id: 'evt1', event_type: 'tournament', status: 'scheduled', start_date: tournamentDate,
      is_mandatory: true, metadata: { registration_id: 'reg1' }, related_id: 't1', title: 'Miami Cup',
    }];
    const pending = getPendingInterviews(profile, [], { calendarEvents: events, registrations: [] });
    const preTournament = pending.find((item) => item.type === 'press_conference');
    if (!preTournament) return null;
    const question = QUESTION_BANKS.pre_match.find((q) => q.id === 'pre_1');
    return { daysUntil: preTournament.daysUntil, text: fillTemplate(question.text, { opponent: preTournament.opponent, daysPhrase: formatDaysUntilPhrase(preTournament.daysUntil) }) };
  }

  const today = preTournamentText('2026-01-08', '2026-01-08');
  gate('daysUntil=0 → "hoje"', today.text.includes(' hoje.'));
  const tomorrow = preTournamentText('2026-01-08', '2026-01-09');
  gate('daysUntil=1 → "amanhã"', tomorrow.text.includes(' amanhã.'));
  const twoDays = preTournamentText('2026-01-08', '2026-01-10');
  gate('daysUntil=2 → "em 2 dias"', twoDays.text.includes(' em 2 dias.'));
  const sixDays = preTournamentText('2026-01-08', '2026-01-14');
  gate('daysUntil=6 (cenário real do bug — torneio a ~6 dias) → "em 6 dias", NUNCA "amanhã"', sixDays.text.includes(' em 6 dias.') && !sixDays.text.includes('amanhã'));
  const monthTurn = preTournamentText('2026-01-29', '2026-02-02');
  gate('virada de mês: 4 dias reais calculados corretamente', monthTurn.daysUntil === 4);
  const yearTurn = preTournamentText('2026-12-30', '2027-01-02');
  gate('virada de ano: 3 dias reais calculados corretamente', yearTurn.daysUntil === 3);
  gate('formatDaysUntilPhrase nunca produz "amanhã" fora de daysUntil=1', formatDaysUntilPhrase(6) !== 'amanhã' && formatDaysUntilPhrase(0) !== 'amanhã');

  // ═══════════════════════════════════════════════════════════════════════
  // TUTORIAL (Bug 5) — inscrição conclui a etapa imediatamente.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Tutorial: inscrição em torneio (Bug 5) ---');

  const freshRegistrationEvent = {
    event_type: 'tournament', status: 'scheduled', related_id: 't1', is_mandatory: true,
    metadata: { registration_id: 'reg-1' },
  };
  const factsWithRegistration = deriveTutorialFacts({ player: { id: 'p1' } }, { registrations: [freshRegistrationEvent], matches: [], trainings: [] });
  gate('Inscrição real (registerTournament) conclui a etapa IMEDIATAMENTE, sem jogar partida', factsWithRegistration.tournamentRegistered === true);
  gate('inferCompletedSteps inclui tournament-registered sem nenhuma partida no histórico', inferCompletedSteps({ player: { id: 'p1' } }, { registrations: [freshRegistrationEvent], matches: [], trainings: [] }).includes('tournament-registered'));

  const legacyRegistrationNoId = { event_type: 'tournament', status: 'scheduled', related_id: 't1', is_mandatory: true, metadata: {} };
  gate('Save/registro legado sem metadata.registration_id ainda reconcilia (mandatory+related_id bastam)', deriveTutorialFacts({ player: {} }, { registrations: [legacyRegistrationNoId] }).tournamentRegistered === true);

  const notRegistered = { event_type: 'tournament', status: 'scheduled', is_mandatory: false, metadata: {} };
  gate('Evento não-obrigatório sem related_id NÃO conta como inscrição', deriveTutorialFacts({ player: {} }, { registrations: [notRegistered] }).tournamentRegistered === false);

  const noRegistrationYet = deriveTutorialFacts({ player: {} }, { registrations: [], matches: [], trainings: [] });
  gate('Sem nenhuma inscrição, a etapa continua pendente', noRegistrationYet.tournamentRegistered === false);

  const matchCompletedFacts = deriveTutorialFacts({ player: {} }, {
    registrations: [freshRegistrationEvent],
    matches: [{ competition_type: 'tournament', is_official: true }],
    trainings: [],
  });
  gate('"Jogue sua primeira partida" continua sendo um fato SEPARADO (matchCompleted), não fundido com a inscrição', matchCompletedFacts.matchCompleted === true && matchCompletedFacts.tournamentRegistered === true);

  // ═══════════════════════════════════════════════════════════════════════
  // ENERGIA / FADIGA (Bug 6) — exibição arredondada, valor interno intacto.
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n--- Energia/Fadiga: formatação de exibição (Bug 6) ---');

  gate('formatPercent(94.524999999999999) === 95 (arredonda para exibição)', formatPercent(94.524999999999999) === 95);
  gate('formatPercent(48.175) === 48', formatPercent(48.175) === 48);
  gate('formatPercent clampa visualmente no mínimo (negativo → 0)', formatPercent(-12.4) === 0);
  gate('formatPercent clampa visualmente no máximo (>100 → 100)', formatPercent(134.9) === 100);
  gate('formatPercent(NaN/undefined) não quebra a UI — cai para 0', formatPercent(undefined) === 0 && Number.isFinite(formatPercent(NaN)));
  gate('formatPercent é uma função pura de exibição — não muta o valor recebido', (() => { const v = 94.524999999999999; formatPercent(v); return v === 94.524999999999999; })());
  gate('normalizeFatigue continua com o mesmo contrato (não foi alterado por este hotfix)', normalizeFatigue(94.5) === 95 && normalizeFatigue(-5) === 0 && normalizeFatigue(150) === 100);

  console.log(`\n${gates} gates executados, todos PASS — Fase 15.2 Integrated QA.`);
} finally {
  await server.close();
}
