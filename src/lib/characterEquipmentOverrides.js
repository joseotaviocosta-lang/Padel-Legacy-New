// Loja ↔ Aparência: deriva o que a boneca de CharacterPreview deve exibir a
// partir dos itens EQUIPADOS em PlayerInventory, sem nunca escrever em
// CharacterCustomization — o valor cosmético salvo pelo jogador continua
// intacto como fallback, só fica "ofuscado" na exibição enquanto o item
// estiver equipado. Função pura (sem I/O), pensada pra ser testável isolada.
import { RARITY_HEX } from './equipmentCatalog.js';

// Categorias com camada correspondente na boneca (CharacterPreview.jsx).
// `field` é a chave de CharacterCustomization que o item equipado sobrepõe.
const LAYER_MAP = {
  raquete: { field: 'racket_color' },
  roupa: { field: 'shirt_color' },
  tenis: { field: 'shoes_color' },
};

// Categorias sem camada correspondente — viram badge ao lado do preview.
// `acessorio` entra aqui por decisão explícita: o catálogo tem 5 subtipos
// reais (wristband, headband, protetor, garrafa, recovery) num único slot de
// equip, subcategory não é gravado em PlayerInventory na compra, e só 2 dos
// 5 subtipos têm equivalente na boneca — sem correspondência limpa o
// suficiente para forçar uma camada.
const BADGE_CATEGORIES = ['grip', 'bola', 'mochila', 'acessorio_tec', 'colecionavel', 'acessorio'];

/**
 * @param {Array} equippedItems - linhas de PlayerInventory com equipped=true
 * @param {Object} shopMap - { [shopItemId]: ShopItem } para resolver image_url
 * @returns {{ overrides: object, overriddenCategories: string[], badges: Array }}
 */
export function deriveEquipmentOverrides(equippedItems, shopMap = {}) {
  const overrides = {};
  const overriddenCategories = [];
  const overriddenItemNames = {};
  const badges = [];

  for (const invItem of equippedItems || []) {
    if (!invItem || !invItem.category) continue;
    const layer = LAYER_MAP[invItem.category];
    if (layer) {
      overrides[layer.field] = RARITY_HEX[invItem.rarity] || RARITY_HEX.comum;
      overriddenCategories.push(invItem.category);
      overriddenItemNames[invItem.category] = invItem.item_name || '';
      if (invItem.category === 'raquete') {
        overrides.racket_label = invItem.item_name || '';
      }
      continue;
    }
    if (BADGE_CATEGORIES.includes(invItem.category)) {
      const shopItem = shopMap[invItem.item_id];
      badges.push({
        category: invItem.category,
        item_name: invItem.item_name,
        rarity: invItem.rarity,
        image_url: shopItem?.image_url || null,
        icon: shopItem?.icon || null,
      });
    }
  }

  return { overrides, overriddenCategories, overriddenItemNames, badges };
}

export const CHARACTER_EQUIPMENT_LAYER_CATEGORIES = Object.keys(LAYER_MAP);
export const CHARACTER_EQUIPMENT_BADGE_CATEGORIES = BADGE_CATEGORIES;
