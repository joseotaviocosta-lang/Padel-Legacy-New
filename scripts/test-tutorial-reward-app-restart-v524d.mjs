// Playthrough 5.24-D, Partes I/S — encerramento do app (APK-like).
//
// 1. concluir → fechar IMEDIATAMENTE (assim que a concessão resolve) → abrir
//    runtime novo: saldo, completion, claimed preservados, sem nova concessão.
// 2. app morto NO MEIO da gravação (falha no rename atômico): nada parcial
//    no disco (nem moedas sem claim, nem claim sem moedas) e o próximo boot
//    converge para +50 exatamente uma vez.
import assert from 'node:assert/strict';
import { createFileStore, boot, createCareer, openCareer, visitHome, memoryState, persistedState, check, done } from './lib/v524dRewardHarness.mjs';

// Cenário 1 — fechar logo após a recompensa.
{
  const store = createFileStore();
  let rt = await boot(store);
  const { careerId, profileId } = await createCareer(rt, { coins: 100 });
  await visitHome(rt, profileId);
  await rt.close(); // destrói TODO o runtime (módulos, caches, locks)
  for (let i = 1; i <= 3; i += 1) {
    rt = await boot(store);
    await openCareer(rt, careerId);
    const s = await memoryState(rt);
    const w = store.log.durableWrites.length;
    await visitHome(rt, profileId);
    await check(`restart #${i}: 150, completed+claimed, nova visita sem concessão nem escrita`, async () => {
      assert.equal(s.coins, 150);
      assert.equal(s.completed && s.claimed, true);
      assert.equal((await memoryState(rt)).coins, 150);
      assert.equal(store.log.durableWrites.length - w, 0);
    });
    await rt.close();
  }
}

// Cenário 2 — app morto durante a gravação da recompensa.
{
  const store = createFileStore();
  let rt = await boot(store);
  const { careerId, profileId } = await createCareer(rt, { coins: 100 });
  const before = persistedState(store, careerId);
  // Próximo rename para o arquivo da carreira "não acontece" (processo morto).
  const realRename = store.api.rename;
  store.api.rename = async (from, to) => {
    if (/^careers\/[^/]+\.json$/.test(to)) { store.api.rename = realRename; throw Object.assign(new Error('processo encerrado'), { code: 'KILLED' }); }
    return realRename(from, to);
  };
  await visitHome(rt, profileId).catch(() => null);
  await rt.close();
  const afterCrash = persistedState(store, careerId);
  await check('crash no meio: disco intacto (100, sem claim) — nenhum estado parcial', () => {
    assert.equal(afterCrash.coins, before.coins);
    assert.equal(afterCrash.claimed, false);
    assert.equal(afterCrash.status === 'rewarded', false);
  });
  rt = await boot(store);
  await openCareer(rt, careerId);
  await visitHome(rt, profileId);
  await visitHome(rt, profileId);
  await check('próximo boot converge: +50 exatamente uma vez', () => {
    const d = persistedState(store, careerId);
    assert.equal(d.coins, 150);
    assert.equal(d.claimed, true);
  });
  await rt.close();
}
done('test-tutorial-reward-app-restart-v524d');
