// LOCAL-9B — FONTE CANÔNICA dos modificadores de equipamento.
//
// Modelo de atributos (ver docs/LOCAL_9B_BASE_ATTRIBUTES_EQUIPMENT_MODIFIERS.md):
//   - atributo-base: o número gravado no PlayerProfile (`serve`, `smash`…).
//     Só treino, recompensa de vitória e envelhecimento o alteram. É o que o
//     teto de desenvolvimento (attributeCeiling.js) limita.
//   - modificador: derivado, NUNCA gravado — soma do `attribute_bonus` do
//     ShopItem de cada item equipado (um por categoria).
//   - atributo efetivo: base + modificador, limitado a [0, 100] (mesmo limite
//     que o equipar antigo aplicava ao gravar). Calculado só para a partida,
//     para a exibição e para as conquistas de atributo máximo.
//
// Antes (até a LOCAL-9A) o equipar SOMAVA o bônus no atributo gravado, e o
// treino passava a limitar o ganho por `teto − (base + bônus)`: o equipamento
// consumia a margem de desenvolvimento natural do atleta (achado 9A-01).
//
// Módulo puro (sem I/O): só importa a lista de atributos (módulo-folha).
// Import relativo: a migração de save (CareerMigration.js) também o usa.
import { ATTRIBUTE_KEYS } from './attributes.js';

export const ATTRIBUTE_MODEL_VERSION = 2;
export const EFFECTIVE_ATTRIBUTE_MIN = 0;
export const EFFECTIVE_ATTRIBUTE_MAX = 100;
// As 9 categorias do catálogo (storeCatalog.js). Cada uma é um slot: no
// máximo um item equipado concede bônus por categoria.
export const EQUIPMENT_SLOT_CATEGORIES = Object.freeze(['raquete', 'grip', 'bola', 'roupa', 'tenis', 'mochila', 'acessorio_tec', 'colecionavel', 'acessorio']);
const SLOT_SET = new Set(EQUIPMENT_SLOT_CATEGORIES);
const ATTRIBUTE_SET = new Set(ATTRIBUTE_KEYS);

const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const clampEffective = (value) => Math.max(EFFECTIVE_ATTRIBUTE_MIN, Math.min(EFFECTIVE_ATTRIBUTE_MAX, value));

function shopLookup(shopItems) {
  if (shopItems instanceof Map) return (id) => shopItems.get(id) || null;
  if (Array.isArray(shopItems)) {
    const map = new Map(shopItems.filter(Boolean).map((item) => [item.id, item]));
    return (id) => map.get(id) || null;
  }
  const record = shopItems || {};
  return (id) => record[id] || null;
}

// Itens que realmente concedem bônus: equipados, com ShopItem conhecido, de
// uma categoria de slot (a do catálogo, não a copiada na linha do
// inventário) e sem duplicação. Se uma categoria tiver mais de um item
// equipado (save inconsistente), vale um só, escolhido de forma
// determinística (menor id de inventário) — nunca a soma.
export function resolveEquippedItems(inventoryRows = [], shopItems = {}) {
  const lookup = shopLookup(shopItems);
  const seenRows = new Set();
  const bySlot = new Map();
  const rows = [...(inventoryRows || [])]
    .filter((row) => row && row.equipped === true)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const row of rows) {
    if (seenRows.has(row.id)) continue;
    seenRows.add(row.id);
    const item = lookup(row.item_id);
    const category = item?.category;
    if (!item || !SLOT_SET.has(category) || bySlot.has(category)) continue;
    bySlot.set(category, { inventoryId: row.id, itemId: item.id, name: item.name || row.item_name || '', category, bonus: sanitizeBonus(item.attribute_bonus) });
  }
  return EQUIPMENT_SLOT_CATEGORIES.filter((category) => bySlot.has(category)).map((category) => bySlot.get(category));
}

export function sanitizeBonus(bonus) {
  const out = {};
  for (const [key, value] of Object.entries(bonus || {})) {
    const amount = finite(value);
    if (ATTRIBUTE_SET.has(key) && amount != null && amount !== 0) out[key] = amount;
  }
  return out;
}

// { atributo: soma dos bônus declarados dos itens equipados }.
export function computeEquipmentModifiers(inventoryRows = [], shopItems = {}) {
  const modifiers = {};
  for (const item of resolveEquippedItems(inventoryRows, shopItems)) {
    for (const [key, value] of Object.entries(item.bonus)) modifiers[key] = (modifiers[key] || 0) + value;
  }
  return modifiers;
}

export function describeAttribute(base, modifier = 0) {
  const baseValue = finite(base) ?? 0;
  const declared = finite(modifier) ?? 0;
  const effective = clampEffective(baseValue + declared);
  return { base: baseValue, modifier: declared, effective, applied: effective - baseValue };
}

// Perfil com os atributos EFETIVOS, para o motor de partida e a exibição.
// Nunca é gravado. Só os atributos presentes no perfil recebem bônus (um
// atributo ausente continua ausente: o motor tem a própria regra de
// fallback). Marcado para impedir aplicação dupla.
export function applyEquipmentModifiers(profile, modifiers = {}) {
  if (!profile) return profile;
  if (profile._attribute_basis === 'effective') return profile;
  const effective = { ...profile, _attribute_basis: 'effective' };
  for (const key of ATTRIBUTE_KEYS) {
    const base = finite(profile[key]);
    if (base == null) continue;
    effective[key] = describeAttribute(base, modifiers?.[key] || 0).effective;
  }
  return effective;
}

export function getEffectiveAttributes(profile, modifiers = {}) {
  return Object.fromEntries(ATTRIBUTE_KEYS
    .filter((key) => finite(profile?.[key]) != null)
    .map((key) => [key, describeAttribute(profile[key], modifiers?.[key] || 0).effective]));
}

// Soma dos pontos que o equipamento realmente acrescenta (pós-limite).
export function totalAppliedModifier(profile, modifiers = {}) {
  return ATTRIBUTE_KEYS.reduce((sum, key) => {
    const base = finite(profile?.[key]);
    return base == null ? sum : sum + describeAttribute(base, modifiers?.[key] || 0).applied;
  }, 0);
}

// Plano puro de equipar/desequipar (Inventory.jsx e harnesses usam o mesmo).
// Só muda flags do inventário e o nome da raquete exibido no perfil — nunca
// um atributo-base. `applied_bonus` (modelo antigo) é zerado nas linhas
// tocadas: o bônus é sempre derivado do catálogo.
export function planEquipToggle({ inventory = [], target, shopItems = {} }) {
  if (!target?.id) return { invUpdates: [], profileUpdates: {}, equipping: false };
  const lookup = shopLookup(shopItems);
  const item = lookup(target.item_id);
  const category = item?.category || target.category;
  const invUpdates = [];
  const profileUpdates = {};
  if (target.equipped === true) {
    invUpdates.push({ id: target.id, equipped: false, applied_bonus: null });
    if (category === 'raquete') profileUpdates.racket = '';
    return { invUpdates, profileUpdates, equipping: false };
  }
  for (const other of inventory || []) {
    if (!other || other.id === target.id || other.equipped !== true) continue;
    const otherCategory = lookup(other.item_id)?.category || other.category;
    if (otherCategory !== category) continue;
    invUpdates.push({ id: other.id, equipped: false, applied_bonus: null });
  }
  invUpdates.push({ id: target.id, equipped: true, applied_bonus: null });
  if (category === 'raquete') profileUpdates.racket = target.item_name || item?.name || '';
  return { invUpdates, profileUpdates, equipping: true };
}

// Migração do modelo antigo (bônus gravado no atributo) para o novo: devolve
// o atributo-base, subtraindo de cada item equipado exatamente o que o
// desequipar antigo subtrairia (`applied_bonus`, ou o bônus declarado em
// linhas anteriores ao hotfix 15.5.3), com o mesmo piso 0.
export function extractBaseAttributesFromLegacy(player, inventoryRows = [], shopItems = {}) {
  const lookup = shopLookup(shopItems);
  const base = {};
  for (const key of ATTRIBUTE_KEYS) {
    const value = finite(player?.[key]);
    if (value != null) base[key] = value;
  }
  const removed = {};
  const rows = (inventoryRows || []).filter((row) => row && row.equipped === true && (!row.profile_id || !player?.id || row.profile_id === player.id));
  for (const row of rows) {
    const applied = row.applied_bonus && typeof row.applied_bonus === 'object' ? row.applied_bonus : (lookup(row.item_id)?.attribute_bonus || {});
    for (const [key, amount] of Object.entries(applied)) {
      const delta = finite(amount);
      if (!ATTRIBUTE_SET.has(key) || delta == null || base[key] == null) continue;
      const before = base[key];
      base[key] = Math.max(0, before - delta);
      removed[key] = (removed[key] || 0) + (before - base[key]);
    }
  }
  return { base, removed, rows: rows.map((row) => row.id) };
}
