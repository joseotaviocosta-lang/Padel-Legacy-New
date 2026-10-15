// Playthrough 5.27-M — uma conclusão lógica → no máximo uma recompensa.
// Repete as fontes de recompensa da primeira semana (missão do tutorial,
// sincronização de conquistas, reabrir página, reload) e confere que o saldo
// e o extrato não mudam na repetição.
import { MemoryStorage, bootRuntime, createRealCareer, installDeterminism } from './lib/v526CareerSim.mjs';
import { gateRunner, onboarding } from './lib/v527mTestKit.mjs';

const { gate, finish } = gateRunner('test-reward-no-duplicate-first-week-v527m');

// Evidência da repro: ids de extrato e de conquista únicos.
for (const variant of ['continuous', 'no-panel-after', 'reload']) {
  const run = onboarding(variant);
  const txIds = run.financialTransactions.map((t) => t.id);
  gate(`1. [${variant}] nenhuma linha de extrato duplicada`, new Set(txIds).size === txIds.length);
  const rewardTx = run.financialTransactions.filter((t) => ['tutorial', 'missao', 'conquista'].includes(t.category));
  const keys = rewardTx.map((t) => t.description);
  gate(`2. [${variant}] cada recompensa de tutorial/missão/conquista aparece uma vez`, new Set(keys).size === keys.length, keys.join(' | '));
  const ach = (run.achievementsUnlocked || []).map((a) => a.id);
  gate(`3. [${variant}] cada conquista desbloqueada uma vez`, new Set(ach).size === ach.length);
}

// Repetição ao vivo das fontes.
installDeterminism('v527m-dup');
const storage = new MemoryStorage(new Map());
let rt = await bootRuntime(storage);
const created = await createRealCareer(rt, { saveName: 'Dup 527M' });
const id = created.profile.id;
const coins = async () => Number((await rt.localGame.entities.PlayerProfile.get(id)).coins) || 0;
const txCount = async () => ((await rt.localGame.entities.FinancialTransaction.filter({ profile_id: id })) || []).length;

await rt.padel.incrementMissionProgress(id, 'visit_career', 1, created.profile.career_date);
const afterFirst = await coins(); const txAfterFirst = await txCount();
gate('4. 1ª conclusão de etapa paga a recompensa', afterFirst > created.profile.coins);
for (let i = 0; i < 3; i += 1) await rt.padel.incrementMissionProgress(id, 'visit_career', 1, created.profile.career_date);
gate('5. repetir o mesmo objetivo 3× não paga de novo', (await coins()) === afterFirst && (await txCount()) === txAfterFirst);

const achievements = await rt.load('/src/lib/achievementEngine.js');
const ctxMod = await rt.load('/src/lib/achievementContext.js');
const sync = async () => {
  const p = await rt.localGame.entities.PlayerProfile.get(id);
  const ctx = await ctxMod.buildAchievementContext(p, { worldRank: { rank: 0 } });
  return achievements.syncPlayerAchievements(p, ctx, { localGame: rt.localGame });
};
await sync();
const afterSync = await coins(); const txAfterSync = await txCount();
await sync(); await sync();
gate('6. sincronizar conquistas de novo (reabrir página) não paga de novo', (await coins()) === afterSync && (await txCount()) === txAfterSync);

// Reload do runtime (boot) + nova sincronização.
await rt.close();
rt = await bootRuntime(storage);
rt.runtime.activeCareerAdapter.setActiveCareer(await rt.careerManager.loadCareer(created.careerId));
const achievements2 = await rt.load('/src/lib/achievementEngine.js');
const ctxMod2 = await rt.load('/src/lib/achievementContext.js');
const p2 = await rt.localGame.entities.PlayerProfile.get(id);
await achievements2.syncPlayerAchievements(p2, await ctxMod2.buildAchievementContext(p2, { worldRank: { rank: 0 } }), { localGame: rt.localGame });
await rt.padel.incrementMissionProgress(id, 'visit_career', 1, created.profile.career_date);
gate('7. boot/reload + nova sincronização não repaga nada', (await coins()) === afterSync && (await txCount()) === txAfterSync);
await rt.close();
finish();
