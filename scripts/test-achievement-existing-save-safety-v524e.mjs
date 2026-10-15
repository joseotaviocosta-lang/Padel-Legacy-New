// Playthrough 5.24-E, Partes R/S — saves antigos: NENHUMA recompensa inventada.
// Política: o registro da conquista é a única autoridade. Saves antigos não
// têm ledger de entrega (reward_delivered só existe a partir desta fase), e
// saldo menor não prova perda (o jogador pode ter gastado). Logo:
//  Caso A: registro sem flag de entrega, saldo baixo → NÃO paga.
//  Caso B: registro com reward_delivered=true, saldo baixo → NÃO paga.
//  Caso C: saldo "já com o bônus", sem registro → o código antigo NUNCA
//          produzia isso (gravava o registro antes das moedas); sem prova,
//          vale o registro: desbloqueia e paga uma vez. Documentado.
import assert from 'node:assert/strict';
import { createFileStore, bootWithAchievements, createAchievementCareer, openCareer, syncAchievements, persistedAchievementState } from './lib/v524eAchievementHarness.mjs';
import { editSave } from './lib/v524eBootFixtures.mjs';
import { check, done } from './lib/v524dRewardHarness.mjs';

const ESTREIA = 'achv-estreia-em-torneios';

async function scenario(label, mutate) {
  const store = createFileStore();
  let rt = await bootWithAchievements(store);
  const { careerId, profileId } = await createAchievementCareer(rt, { coins: 100, stats: { tournaments_played: 1 } });
  await rt.close();
  editSave(store, careerId, (career) => mutate(career, profileId));
  const before = persistedAchievementState(store, careerId);
  rt = await bootWithAchievements(store);
  await openCareer(rt, careerId);
  const r = await syncAchievements(rt);
  await rt.close();
  const after = persistedAchievementState(store, careerId);
  const estreiaPaid = r.unlocked.some((a) => a.id === ESTREIA);
  console.log(`   [${label}] moedas ${before.coins} → ${after.coins} · Estreia paga agora: ${estreiaPaid}`);
  return { before, after, estreiaPaid };
}

const legacyRow = (profileId, extra = {}) => ({ id: `pa-${ESTREIA}-${profileId}`, profile_id: profileId, achievement_id: ESTREIA, achievement_name: 'Estreia em Torneios', unlocked_date: '2026-01-01T00:00:00.000Z', reconciled: false, ...extra });

const a = await scenario('caso A', (c, pid) => { (c.entities.PlayerAchievement ||= []).push(legacyRow(pid)); });
await check('caso A (registro antigo sem ledger): Estreia NÃO é paga de novo', () => assert.equal(a.estreiaPaid, false));

const b = await scenario('caso B', (c, pid) => { (c.entities.PlayerAchievement ||= []).push(legacyRow(pid, { reward_delivered: true, reward_coins: 200 })); });
await check('caso B (entregue, saldo baixo): Estreia NÃO é paga de novo', () => assert.equal(b.estreiaPaid, false));

const cc = await scenario('caso C', (c) => { c.player.coins = 300; });
await check('caso C (sem registro): desbloqueia e paga uma vez — política documentada', () => assert.equal(cc.estreiaPaid, true));

for (const [name, s] of [['A', a], ['B', b], ['C', cc]]) {
  await check(`caso ${name}: moedas finitas, não negativas, sem NaN`, () => assert.ok(Number.isFinite(s.after.coins) && s.after.coins >= 0));
}
done('test-achievement-existing-save-safety-v524e');
