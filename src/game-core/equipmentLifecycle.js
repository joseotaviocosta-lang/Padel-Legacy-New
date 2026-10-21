import { localGame } from '@/api/localGameClient.js';
import { applyEquipmentModifiers, computeEquipmentModifiers, planEquipToggle } from '@/lib/equipmentModifiers.js';

// LOCAL-9B — leitura e escrita do equipamento (as regras moram em
// equipmentModifiers.js, puro). Ler não grava nada; equipar/desequipar só
// grava as flags do inventário e o nome da raquete, nunca um atributo-base.

export async function loadEquipmentState(profileId) {
  if (!profileId) return { inventory: [], shopItems: [], modifiers: {} };
  const [inventory, shopItems] = await Promise.all([
    localGame.entities.PlayerInventory.filter({ profile_id: profileId }).catch(() => []),
    localGame.entities.ShopItem.list().catch(() => []),
  ]);
  return { inventory: inventory || [], shopItems: shopItems || [], modifiers: computeEquipmentModifiers(inventory || [], shopItems || []) };
}

export async function loadEquipmentModifiers(profileId) {
  return (await loadEquipmentState(profileId)).modifiers;
}

// Perfil com atributos efetivos para montar uma partida. Snapshot: o motor
// copia os atributos em createMatch; trocar equipamento depois só vale na
// próxima partida e nunca altera uma partida concluída.
export async function loadEffectivePlayerProfile(profile) {
  if (!profile?.id) return profile;
  return applyEquipmentModifiers(profile, await loadEquipmentModifiers(profile.id));
}

export async function toggleEquipItem({ profile, inventory, target, shopItems }) {
  const plan = planEquipToggle({ inventory, target, shopItems });
  let updatedProfile = profile;
  if (Object.keys(plan.profileUpdates).length) updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, plan.profileUpdates);
  if (plan.invUpdates.length) await localGame.entities.PlayerInventory.bulkUpdate(plan.invUpdates);
  return { ...plan, profile: updatedProfile };
}
