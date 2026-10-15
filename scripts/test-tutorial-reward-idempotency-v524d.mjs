// Playthrough 5.24-D, Partes E/R — idempotência por ID (ledger canônico da
// missão), sem boolean global: N disparos da MESMA recompensa = +50 uma vez;
// uma recompensa DIFERENTE (próxima etapa do tutorial) continua sendo paga.
import assert from 'node:assert/strict';
import { createFileStore, boot, createCareer, visitHome, memoryState, persistedState, check, done } from './lib/v524dRewardHarness.mjs';

const store = createFileStore();
const rt = await boot(store);
try {
  const { careerId, profileId } = await createCareer(rt, { coins: 100 });

  // Mesmo evento repetido (double click) e eventos distintos (ticks/visitas).
  await visitHome(rt, profileId, 'mesmo-evento');
  await visitHome(rt, profileId, 'mesmo-evento');
  for (let i = 0; i < 5; i += 1) await visitHome(rt, profileId, `visita-${i}`);
  // Helper de conclusão chamado direto, mais 2 vezes.
  await rt.padel.incrementMissionProgress(profileId, 'visit_career', 1, '2026-01-01', {});
  await rt.padel.incrementMissionProgress(profileId, 'visit_career', 1, '2026-01-01', {});

  await check('8 disparos de tutorial-career-created → saldo sobe apenas 1 vez (+50)', async () => {
    assert.equal((await memoryState(rt)).coins, 150);
  });
  await check('disco: +50 uma vez e UMA linha de progresso para a missão', () => {
    const d = persistedState(store, careerId);
    assert.equal(d.coins, 150);
    assert.equal(d.rows, 1);
  });

  // Recompensa B: a etapa seguinte do tutorial (ordem 2), lida do catálogo ativo.
  const missions = await rt.localGame.entities.Mission.filter({ is_active: true });
  const next = missions.find((m) => m.mission_type === 'tutorial' && Number(m.tutorial_order) === 2);
  assert.ok(next, 'etapa 2 do tutorial existe no catálogo');
  const completedB = await rt.padel.incrementMissionProgress(profileId, next.objective_type, Number(next.target_count || 1), '2026-01-01', {});
  const coinsB = (await memoryState(rt)).coins;
  await check(`recompensa B (${next.id}, +${next.coins_reward}) NÃO é bloqueada pela idempotência de A`, () => {
    assert.deepEqual(completedB.map((m) => m.id), [next.id]);
    assert.equal(coinsB, 150 + Number(next.coins_reward));
  });
  await rt.padel.incrementMissionProgress(profileId, next.objective_type, Number(next.target_count || 1), '2026-01-01', {});
  await check('recompensa B também é idempotente', async () => {
    assert.equal((await memoryState(rt)).coins, coinsB);
    assert.equal(persistedState(store, careerId).coins, coinsB);
  });
  console.log(`   [registro] A: 100→150 · B (${next.id}): 150→${coinsB} · reaplicações: 0`);
} finally {
  await rt.close();
}
done('test-tutorial-reward-idempotency-v524d');
