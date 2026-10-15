// Playthrough 5.24-E — fixtures de boot: um save SAUDÁVEL é uma carreira já
// carregada uma vez (o 1º load de uma carreira nova pode legitimamente
// atualizar o índice: ela vira a "última jogada").
import { createFileStore, bootWithAchievements, createAchievementCareer, bootCareer } from './v524eAchievementHarness.mjs';

export async function healthySave({ coins = 100, stats = {} } = {}) {
  const store = createFileStore();
  const rt = await bootWithAchievements(store);
  const { careerId, profileId } = await createAchievementCareer(rt, { coins, stats });
  await rt.close();
  const first = await bootCareer(store, careerId);
  await first.close();
  return { store, careerId, profileId, firstBoot: first.bootMetrics };
}

/** Edita os bytes do save diretamente (simula um save gravado por versão antiga). */
export function editSave(store, careerId, mutate) {
  const path = `careers/${careerId}.json`;
  const career = JSON.parse(store.files.get(path));
  mutate(career);
  store.files.set(path, JSON.stringify(career));
}
