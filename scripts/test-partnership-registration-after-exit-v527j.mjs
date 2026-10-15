// Playthrough 5.27-J, Blocos B/D — autoridade canônica: casos A–D da regra e,
// no ciclo real (processPartnerDay + registerTournament), a dupla com saída
// decidida recebe PARTNERSHIP_EXIT_PENDING ANTES de qualquer escrita.
import { makeSuite, assert, bootModules } from './lib/v526bTestKit.mjs';
import { runExitScenario } from './lib/v527jScenario.mjs';

const { check, finish } = makeSuite('test-partnership-registration-after-exit-v527j');
try {
  const m = await bootModules();
  const roster = await m.load('/src/lib/committedRoster.js');
  await m.close();
  const auth = (ps, date, end) => roster.evaluatePartnershipRegistrationAuthority(ps, { careerDate: date, tournament: end ? { start_date: end, end_date: end } : null });
  await check('Caso A: parceria ativa sem decisão (inclui vencido em carência) → permitido', () => {
    assert.equal(auth({ status: 'ativa', contract_status: 'ativo', contract_end_date: '2026-03-01' }, '2026-02-01', '2026-04-01').allowed, true);
    assert.equal(auth({ status: 'ativa', contract_status: 'vencido', contract_end_date: '2026-03-01' }, '2026-03-03', '2026-04-01').allowed, true, 'vencer a data não é decisão de saída (item 11)');
    assert.equal(auth({ status: 'ativa', contract_status: 'renovacao_proxima', contract_end_date: '2026-03-01' }, '2026-02-20', '2026-04-01').allowed, true);
  });
  await check('Caso B: saída decidida antes da data nominal → nada que termine depois dela', () => {
    for (const s of ['nao_renovara', 'encerrar_ao_final']) {
      const ps = { status: 'ativa', contract_status: s, contract_end_date: '2026-03-01' };
      assert.equal(auth(ps, '2026-02-01', '2026-02-20').allowed, true, `${s}: dentro do contrato (5.17)`);
      const b = auth(ps, '2026-02-01', '2026-03-10');
      assert.equal(b.allowed, false); assert.equal(b.code, 'PARTNERSHIP_EXIT_PENDING');
      assert.equal(auth(ps, '2026-03-02', '2026-03-05').allowed, false, `${s}: depois da data nominal`);
    }
  });
  await check('Caso C: encerra_apos_compromisso → nenhuma inscrição nova', () => {
    const r = auth({ status: 'ativa', contract_status: 'encerra_apos_compromisso', contract_end_date: '2026-03-01', separation_scheduled_date: '2026-03-20' }, '2026-03-05', '2026-03-12');
    assert.equal(r.allowed, false); assert.equal(r.code, 'PARTNERSHIP_EXIT_PENDING');
  });
  await check('Caso D: parceria encerrada → PARTNERSHIP_INACTIVE', () => assert.equal(auth({ status: 'encerrada_contrato', contract_status: 'encerrado' }, '2026-03-05', '2026-03-12').code, 'PARTNERSHIP_INACTIVE'));
  await check('assinatura 5.17 preservada (booleano; sem parceria = false)', () => {
    const ended = { contract_status: 'encerrar_ao_final', contract_end_date: '2026-02-01' };
    assert.equal(roster.canRegisterNewTournamentWithPartnership(ended, '2026-01-20'), true);
    assert.equal(roster.canRegisterNewTournamentWithPartnership(ended, '2026-02-10'), false);
    assert.equal(roster.canRegisterNewTournamentWithPartnership(null, '2026-01-20'), false);
  });
  const s = await runExitScenario('RegAfterExitJ', { exit: 'lifecycle' });
  await check('ciclo real: decisão de saída pelo lifecycle registrada com exit_decided_at', () => {
    assert.ok(s.exitDecisionDate, 'sem decisão'); assert.equal(s.exitDecidedAtField, s.exitDecisionDate);
  });
  await check('ciclo real: toda inscrição depois da saída recusada com PARTNERSHIP_EXIT_PENDING, sem escrita nem cobrança', () => {
    const after = s.attempts.filter((a) => a.kind === 'after-exit');
    assert.ok(after.length >= 1);
    for (const a of after) {
      assert.equal(a.ok, false); assert.ok(a.reasons.includes('PARTNERSHIP_EXIT_PENDING'), JSON.stringify(a.reasons));
      assert.equal(a.rowWritten, false, 'escreveu e depois desfez'); assert.equal(a.coinsChanged, false, 'cobrou a inscrição recusada');
    }
  });
  const low = await runExitScenario('LowMoraleJ', { exit: 'refused-low-morale' });
  await check('recusa + moral < 15: a saída decidida NÃO é apagada (sem cair em vencido/carência)', () => {
    assert.ok(!low.statusTimeline.some((x) => /^(insatisfeito|vencido)/.test(x.status)), JSON.stringify(low.statusTimeline));
    assert.ok(low.statusTimeline.every((x) => x.status === 'ended' || /^(nao_renovara|encerra_apos_compromisso)/.test(x.status)), JSON.stringify(low.statusTimeline));
  });
  await check('recusa + moral < 15: inscrição nova depois da data nominal recusada e separação no fim do último compromisso', () => {
    const after = low.attempts.filter((a) => a.kind === 'after-exit');
    assert.ok(after.length >= 1 && after.every((a) => !a.ok && a.reasons.includes('PARTNERSHIP_EXIT_PENDING')), JSON.stringify(after));
    const next = new Date(Date.parse(`${low.lastLegitimateCommitmentEnd}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    assert.equal(low.effectiveSeparationDate, next);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
