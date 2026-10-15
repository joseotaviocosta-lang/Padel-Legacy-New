// Playthrough 5.27-B, Bloco K — FIM DO DEAD-END: um jogador quebrado SEMPRE
// consegue rescindir (a multa vira dívida de curto prazo), mas a consequência
// permanece (o custo não é perdoado).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-severance-exit-path-v527b');
const { rt, profile } = await bootDrawCareer('severance-527b', { warmDays: 0 });
try {
  const E = rt.localGame.entities;
  const Economy = await rt.load('/src/lib/economy.js');

  const hire = await E.PlayerStaffHire.create({
    profile_id: profile.id, staff_type: 'physio', roleId: 'physio', role: 'physio', name: 'Fisio Teste',
    quality: 70, monthly_cost: 1200, base_monthly_cost: 1200, contract_status: 'active', contract_end_date: '2027-06-01',
  });
  await E.PlayerProfile.update(profile.id, { coins: 0 });

  await check('jogador sem caixa consegue rescindir (não lança erro)', async () => {
    const poor = await E.PlayerProfile.get(profile.id);
    const result = await Economy.fireStaff(hire, poor);
    assert.ok(result, 'fireStaff retornou vazio');
  });

  await check('o contrato é encerrado (custo recorrente removido)', async () => {
    const after = await E.PlayerStaffHire.get(hire.id);
    assert.equal(after.contract_status, 'terminated');
  });

  await check('a multa vira dívida de curto prazo (saldo negativo), não é perdoada', async () => {
    const fresh = await E.PlayerProfile.get(profile.id);
    assert.ok(Number(fresh.coins) < 0, `coins=${fresh.coins}`);
    const after = await E.PlayerStaffHire.get(hire.id);
    assert.equal(after.termination_funded_by_debt, true);
  });

  await check('com caixa suficiente, a multa é debitada normalmente (sem dívida)', async () => {
    const hire2 = await E.PlayerStaffHire.create({
      profile_id: profile.id, staff_type: 'manager', roleId: 'manager', role: 'manager', name: 'Manager Teste',
      quality: 70, monthly_cost: 800, base_monthly_cost: 800, contract_status: 'active', contract_end_date: '2027-06-01',
    });
    await E.PlayerProfile.update(profile.id, { coins: 5000 });
    const rich = await E.PlayerProfile.get(profile.id);
    await Economy.fireStaff(hire2, rich);
    const fresh = await E.PlayerProfile.get(profile.id);
    assert.ok(Number(fresh.coins) > 0, `coins=${fresh.coins}`);
    const after = await E.PlayerStaffHire.get(hire2.id);
    assert.equal(after.termination_funded_by_debt, false);
  });
} finally {
  await rt.close();
}
finish();
