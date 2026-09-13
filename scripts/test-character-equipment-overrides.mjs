// Inventário ↔ Aparência — sincroniza a boneca de CharacterPreview com o
// que está realmente equipado em PlayerInventory (raquete/roupa/tenis viram
// camada visual por raridade; grip/bola/mochila/acessorio_tec/colecionavel/
// acessorio viram badge, sem forçar mapeamento sem correspondência clara).
// Prova a função pura deriveEquipmentOverrides isolada — sem tocar em
// CharacterCustomization, sem I/O.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { deriveEquipmentOverrides, CHARACTER_EQUIPMENT_LAYER_CATEGORIES, CHARACTER_EQUIPMENT_BADGE_CATEGORIES } =
    await vite.ssrLoadModule('/src/lib/characterEquipmentOverrides.js');
  const { RARITY_HEX, CATEGORY_META } = await vite.ssrLoadModule('/src/lib/equipmentCatalog.js');

  // ─── Nenhum item equipado ────────────────────────────────────────────────
  const empty = deriveEquipmentOverrides([], {});
  gate('Sem itens equipados: overrides vazio, sem categorias sobrescritas, sem badges',
    Object.keys(empty.overrides).length === 0 && empty.overriddenCategories.length === 0 && empty.badges.length === 0);

  const emptyUndefined = deriveEquipmentOverrides(undefined, undefined);
  gate('equippedItems undefined não quebra (trata como lista vazia)',
    Object.keys(emptyUndefined.overrides).length === 0 && emptyUndefined.badges.length === 0);

  // ─── Categorias com camada (raquete/roupa/tenis) ────────────────────────
  const raquete = { category: 'raquete', rarity: 'mitico', item_name: 'Bullpadel Vertex Elite', item_id: 'sp1' };
  const withRaquete = deriveEquipmentOverrides([raquete], {});
  gate('Raquete equipada sobrepõe racket_color com a cor da raridade (mítico)',
    withRaquete.overrides.racket_color === RARITY_HEX.mitico);
  gate('Raquete equipada sobrepõe racket_label com o nome real do item',
    withRaquete.overrides.racket_label === 'Bullpadel Vertex Elite');
  gate('Raquete equipada entra em overriddenCategories e overriddenItemNames',
    withRaquete.overriddenCategories.includes('raquete') && withRaquete.overriddenItemNames.raquete === 'Bullpadel Vertex Elite');
  gate('Raquete equipada não mexe em shirt_color/shoes_color',
    withRaquete.overrides.shirt_color === undefined && withRaquete.overrides.shoes_color === undefined);

  const roupa = { category: 'roupa', rarity: 'raro', item_name: 'Adidas Padel Pro Shirt', item_id: 'sp2' };
  const withRoupa = deriveEquipmentOverrides([roupa], {});
  gate('Roupa equipada sobrepõe shirt_color com a cor da raridade (raro)',
    withRoupa.overrides.shirt_color === RARITY_HEX.raro);
  gate('Roupa equipada não gera racket_label nem badge',
    withRoupa.overrides.racket_label === undefined && withRoupa.badges.length === 0);

  const tenis = { category: 'tenis', rarity: 'lendario', item_name: 'Nox Court Runner', item_id: 'sp3' };
  const withTenis = deriveEquipmentOverrides([tenis], {});
  gate('Tênis equipado sobrepõe shoes_color com a cor da raridade (lendário)',
    withTenis.overrides.shoes_color === RARITY_HEX.lendario);

  // ─── Raridade desconhecida cai em fallback seguro (comum) ───────────────
  const unknownRarity = { category: 'roupa', rarity: 'inexistente', item_name: 'Item Corrompido', item_id: 'sp4' };
  const withUnknown = deriveEquipmentOverrides([unknownRarity], {});
  gate('Raridade não reconhecida usa RARITY_HEX.comum como fallback (nunca undefined/crash)',
    withUnknown.overrides.shirt_color === RARITY_HEX.comum);

  // ─── Categorias sem camada viram badge, reaproveitando o catálogo ───────
  const shopMap = { sp5: { id: 'sp5', image_url: '/assets/items/grip-epico.svg', icon: 'Circle' } };
  const grip = { category: 'grip', rarity: 'epico', item_name: 'Wilson Pro Overgrip', item_id: 'sp5' };
  const withGrip = deriveEquipmentOverrides([grip], shopMap);
  gate('Grip equipado não gera camada (overrides vazio)', Object.keys(withGrip.overrides).length === 0);
  gate('Grip equipado vira badge com image_url resolvido via shopMap',
    withGrip.badges.length === 1 && withGrip.badges[0].image_url === '/assets/items/grip-epico.svg');

  const noShopMatch = { category: 'bola', rarity: 'comum', item_name: 'Bola Genérica', item_id: 'sem-match-no-shop' };
  const withNoMatch = deriveEquipmentOverrides([noShopMatch], {});
  gate('Badge sem correspondência no shopMap não quebra — image_url cai em null',
    withNoMatch.badges[0].image_url === null);

  // ─── Acessório: badge, não camada (decisão explícita) ───────────────────
  const acessorio = { category: 'acessorio', rarity: 'raro', item_name: 'Adidas Focus Headband', item_id: 'sp6' };
  const withAcessorio = deriveEquipmentOverrides([acessorio], {});
  gate('Acessório equipado vira badge, não camada (sem correspondência semântica limpa no catálogo)',
    Object.keys(withAcessorio.overrides).length === 0 && withAcessorio.badges.some(b => b.category === 'acessorio'));

  // ─── Múltiplos equipados simultaneamente, sem contaminação cruzada ──────
  const all9 = [
    raquete, roupa, tenis,
    { category: 'grip', rarity: 'comum', item_name: 'Grip A', item_id: 'g' },
    { category: 'bola', rarity: 'comum', item_name: 'Bola A', item_id: 'b' },
    { category: 'mochila', rarity: 'comum', item_name: 'Mochila A', item_id: 'm' },
    { category: 'acessorio_tec', rarity: 'comum', item_name: 'Tech A', item_id: 't' },
    { category: 'colecionavel', rarity: 'comum', item_name: 'Colecionável A', item_id: 'c' },
    acessorio,
  ];
  const withAll = deriveEquipmentOverrides(all9, {});
  gate('9 categorias equipadas ao mesmo tempo: exatamente 3 chaves de override (raquete/roupa/tenis)',
    Object.keys(withAll.overrides).filter(k => k !== 'racket_label').length === 3);
  gate('9 categorias equipadas ao mesmo tempo: exatamente 6 badges (as sem camada)',
    withAll.badges.length === 6);

  // ─── Itens sem categoria não quebram ─────────────────────────────────────
  const withGarbage = deriveEquipmentOverrides([null, {}, { item_name: 'sem categoria' }], {});
  gate('Itens equipados sem category válida são ignorados sem crash',
    Object.keys(withGarbage.overrides).length === 0 && withGarbage.badges.length === 0);

  // ─── Cobertura exaustiva: toda categoria real do catálogo tem destino ───
  const realCategories = Object.keys(CATEGORY_META);
  const mapped = new Set([...CHARACTER_EQUIPMENT_LAYER_CATEGORIES, ...CHARACTER_EQUIPMENT_BADGE_CATEGORIES]);
  gate('Toda categoria real do catálogo (CATEGORY_META) tem destino — camada OU badge, nenhuma órfã',
    realCategories.every(cat => mapped.has(cat)));
  gate('Nenhuma categoria é camada E badge ao mesmo tempo',
    CHARACTER_EQUIPMENT_LAYER_CATEGORIES.every(cat => !CHARACTER_EQUIPMENT_BADGE_CATEGORIES.includes(cat)));

  console.log(`\n${gates} gates executados, todos PASS — Inventário ↔ Aparência (equipment overrides).`);
} finally {
  await vite.close();
}
