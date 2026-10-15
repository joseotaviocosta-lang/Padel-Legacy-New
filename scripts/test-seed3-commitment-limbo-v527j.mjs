// Playthrough 5.27-J, Blocos L/M (itens 38–43) — seed 3 histórica (5.27-H:
// recusa no dia 49, troca no dia 323) decomposta antes/depois, e outras
// seeds: extensão ilegítima = 0; limbo legítimo medido.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { report } from './lib/v527jTestKit.mjs';

const { check, finish } = makeSuite('test-seed3-commitment-limbo-v527j');
try {
  const s = report('seed3-before-after.json');
  await check('antes: decisão no dia 49, troca no 323, compromissos novos depois da decisão > 0', () => {
    assert.equal(s.before.decisionDay, 49); assert.equal(s.before.actualChangeDay, 323);
    assert.ok(s.before.newCommitmentsAfterDecision > 0); assert.ok(s.before.illegitimateDays > 0);
  });
  await check('depois (mesma config da 5.27-H + correção): 0 compromisso novo após a decisão, 0 dia de extensão', () => {
    assert.equal(s.after.newCommitmentsAfterDecision, 0);
    assert.equal(s.after.illegitimateDays, 0);
    assert.ok(s.after.actualChangeDay < s.before.actualChangeDay, `${s.after.actualChangeDay} ≥ ${s.before.actualChangeDay}`);
  });
  await check('limbo legítimo medido e separação no fim do último compromisso anterior', () => {
    assert.ok(s.after.legitimateDays >= 0);
    assert.ok(s.after.extensionDays <= 0, `+${s.after.extensionDays} dias`);
  });
  await check('outras seeds (smoke 5 seeds): extensão ilegítima = 0 em todas as saídas', () => {
    const c = report('commitment-lifecycle-summary.json');
    assert.ok(c.after.exits >= 3, `${c.after.exits} saídas`);
    assert.equal(c.after.illegitimateRegistrations, 0);
    assert.equal(c.after.maxExtensionDays, 0);
  });
} catch (e) { console.error(e); process.exitCode = 1; }
finish();
