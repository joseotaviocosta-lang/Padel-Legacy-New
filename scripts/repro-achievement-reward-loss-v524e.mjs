// Playthrough 5.24-E, Parte L — REPRODUÇÃO da perda de recompensa de conquista.
// saldo X → condição satisfeita → conquista gravada → app morre ANTES da
// gravação das moedas → restart → sync de novo.
import { createFileStore, bootWithAchievements, createAchievementCareer, openCareer, syncAchievements, persistedAchievementState, killOnDurableWrite } from './lib/v524eAchievementHarness.mjs';

const store = createFileStore();
let rt = await bootWithAchievements(store);
const { careerId } = await createAchievementCareer(rt, { coins: 100, stats: { tournaments_played: 1 } });
const before = persistedAchievementState(store, careerId);
const w0 = store.log.durableWrites.length;
// Contagem de escritas de um unlock completo (sem crash), num save gêmeo.
{
  const twin = createFileStore();
  for (const [k, v] of store.files) twin.files.set(k, v);
  const rt2 = await bootWithAchievements(twin);
  await openCareer(rt2, careerId);
  const t0 = twin.log.durableWrites.length;
  const r = await syncAchievements(rt2);
  console.log(`unlock sem crash: ${r.unlocked.map((a) => `${a.name} (+${a.coins_reward} moedas, +${a.xp_reward} XP)`).join(', ')} · escritas duráveis: ${twin.log.durableWrites.length - t0}`);
  await rt2.close();
}
killOnDurableWrite(store, 2); // a 1ª escrita (conquista) passa; a 2ª (moedas) morre
const res = await syncAchievements(rt).catch((e) => ({ error: e.message }));
await rt.close();
const afterCrash = persistedAchievementState(store, careerId);
console.log(`antes: moedas ${before.coins} · conquistas ${JSON.stringify(before.achievements)}`);
console.log(`sync com crash: ${res.error || 'ok'} · escritas duráveis até o crash: ${store.log.durableWrites.length - w0}`);
console.log(`disco após crash: moedas ${afterCrash.coins} · xp ${afterCrash.xp} · conquistas ${JSON.stringify(afterCrash.achievements)}`);
rt = await bootWithAchievements(store);
await openCareer(rt, careerId);
const again = await syncAchievements(rt);
await rt.close();
const final = persistedAchievementState(store, careerId);
console.log(`restart + sync: desbloqueadas agora ${again.unlocked.length} · disco: moedas ${final.coins} · xp ${final.xp} · conquistas ${JSON.stringify(final.achievements)}`);
