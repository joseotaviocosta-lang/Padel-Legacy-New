// Playthrough 5.27-J, Bloco F (itens 23–25) — a separação acontece no tick
// seguinte ao fim do último compromisso legítimo: nem antes (compromisso
// órfão), nem depois (atraso).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { runExitScenario, addDays } from './lib/v527jScenario.mjs';
import { limboDecomposition, reloadCareer, smokeCareers } from './lib/v527jTestKit.mjs';

const { check, finish } = makeSuite('test-final-commitment-triggers-separation-v527j');
try {
  for (const exit of ['lifecycle', 'player-scheduled']) {
    const s = await runExitScenario(`FinalSep${exit === 'lifecycle' ? 'L' : 'P'}J`, { exit });
    await check(`${exit}: separação = último compromisso legítimo + 1 dia (próximo tick)`, () => {
      assert.ok(s.lastLegitimateCommitmentEnd && s.effectiveSeparationDate);
      assert.equal(s.effectiveSeparationDate, addDays(s.lastLegitimateCommitmentEnd, 1));
    });
    await check(`${exit}: nunca antes do último compromisso`, () => assert.ok(s.effectiveSeparationDate > s.lastLegitimateCommitmentEnd));
  }
  await check('carreiras reais: separação agendada = fim do último compromisso anterior à decisão (sem atraso extra)', () => {
    for (const r of [...smokeCareers(), reloadCareer()]) for (const d of limboDecomposition(r)) {
      if (d.scheduledSeparationDay == null) continue; // saída sem compromisso pendente: encerra no próprio vencimento
      assert.ok(d.extensionDays <= 0, `seed ${r.seed}: separação ${d.scheduledSeparationDay} × último legítimo ${d.lastLegitimateDay} (+${d.extensionDays})`);
    }
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
