// Playthrough 5.27-J, Blocos D/L (itens 15/39/40) — nenhum compromisso novo
// depois da saída decidida que estenda a dupla: no cenário (saída agendada pelo
// jogador) e nas carreiras reais (smoke + save/reload), pelo estado do jogo no
// momento de cada inscrição. Dentro do contrato (5.17) continua permitido.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { runExitScenario } from './lib/v527jScenario.mjs';
import { illegitimateRegistrations, reloadCareer, smokeCareers } from './lib/v527jTestKit.mjs';

const { check, finish } = makeSuite('test-no-new-commitment-after-exit-v527j');
try {
  const s = await runExitScenario('NoNewJ', { exit: 'player-scheduled' });
  await check('saída agendada: torneio que terminaria após a data nominal → recusado antes da escrita', () => {
    const a = s.attempts.find((x) => x.kind === 'extends-beyond-end');
    assert.ok(a?.tournamentId, 'cenário sem torneio após a data nominal');
    assert.equal(a.ok, false); assert.ok(a.reasons.includes('PARTNERSHIP_EXIT_PENDING')); assert.equal(a.rowWritten, false);
  });
  await check('saída agendada: torneio que termina dentro do contrato continua permitido (regra 5.17)', () => {
    const a = s.attempts.find((x) => x.kind === 'within-contract');
    if (a?.tournamentId) assert.equal(a.ok, true, JSON.stringify(a.reasons));
  });
  await check('separação não é empurrada: data efetiva = dia seguinte ao último compromisso legítimo', () => {
    const next = new Date(Date.parse(`${s.lastLegitimateCommitmentEnd}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    assert.equal(s.effectiveSeparationDate, next);
  });
  await check('carreiras reais: 0 inscrições que estendem a dupla depois da saída (smoke 5 seeds + save/reload)', () => {
    const cs = [...smokeCareers(), reloadCareer()];
    assert.equal(cs.length, 6);
    for (const r of cs) assert.deepEqual(illegitimateRegistrations(r).map((g) => `${g.day}:${g.tournamentId}:${g.partnershipStatus}`), [], `seed ${r.seed}`);
  });
  await check('carreiras reais: a data de separação agendada nunca é empurrada depois de marcada', () => {
    for (const r of [...smokeCareers(), reloadCareer()]) for (const e of r.exitEvents || []) assert.ok(e.scheduleHistory.length <= 1, `seed ${r.seed} ${e.partnershipId}: ${e.scheduleHistory.join(' → ')}`);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
