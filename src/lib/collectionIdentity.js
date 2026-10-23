// LOCAL-9C.2-C — stable collection identity.
//
// Separates "catalog item identity" from "collection achievement identity".
// Before this phase, distinct-item counting keyed on the inventory row
// `item_id`: because the catalog reconciles by NAME
// (`ensureExpandedShopCatalog`), renaming/substituting a product created a
// new row and old save + new product counted as two products for the same
// economic line (R1 residual risk, integrity doc section 16).
//
// Rules:
// - The canonical identity is NEVER the display name alone: the name is
//   only the current reconciliation key, always resolved through the alias
//   map before becoming identity. Names may change without fracturing.
// - True relics have STRUCTURAL identity (year+category+rarity from the
//   HISTORICAL_RARE_ITEMS model, same authority as seeding and the Shop):
//   renaming a relic does not change what it is, by construction.
// - Unknown never becomes known: no resolvable name and no matching model
//   means the row does not count (fail closed); equivalence is never
//   invented from similar names.
// - Genuinely distinct products never collapse: only explicit aliases merge
//   identities, and the table starts empty (the Fase 0 rename changed only
//   name/description of a relic — the structural id and the model stayed,
//   so it already resolves the same without alias).
//
// Pure: takes plain objects (inventory row + ShopItem row, if any) — never
// touches storage, clock or network.
import { HISTORICAL_RARE_ITEMS } from './marketEngine.js';

// Current reconciliation key — same normalization as the catalog
// (storeCatalog.js `cleanKey`): lowercase, trimmed.
export function cleanCollectionKey(value) {
  return String(value || '').trim().toLowerCase();
}

// Historical aliases: normalized OLD key -> canonical CURRENT key.
// Intentionally empty at ship: only receives entries with evidence that
// two IDs represent the same conceptual product.
// Tests inject synthetic aliases via
// `globalThis.__PL9C2C_COLLECTION_ALIASES` (same harness pattern as R1's
// release flag) — production always uses the frozen table.
export const COLLECTION_ALIASES = Object.freeze({});

function activeAliases() {
  if (typeof globalThis !== 'undefined') {
    const override = globalThis.__PL9C2C_COLLECTION_ALIASES;
    if (override && typeof override === 'object') return override;
  }
  return COLLECTION_ALIASES;
}

const relicTemplates = new Map(
  (HISTORICAL_RARE_ITEMS || []).map((item) => [`${Number(item?.release_year)}:${cleanCollectionKey(item?.category)}`, cleanCollectionKey(item?.rarity)]),
);

/**
 * True when a ShopItem row is a genuine relic: no `catalog_order`, with
 * year+category present in the canonical model and same rarity as the
 * model. Single authority for the Arsenal exclusion.
 */
export function isHistoricalRelicShopItem(item) {
  if (!item || item.catalog_order != null) return false;
  const year = Number(item.release_year);
  const category = cleanCollectionKey(item?.category);
  if (!Number.isFinite(year) || !category) return false;
  const templateRarity = relicTemplates.get(`${year}:${category}`);
  if (!templateRarity) return false;
  return cleanCollectionKey(item?.rarity) === templateRarity;
}

function keyOf(item, inventoryRow) {
  const name = item?.name ?? inventoryRow?.item_name ?? '';
  return cleanCollectionKey(name);
}

/**
 * Resolves the canonical collection identity of an inventory row.
 *
 * @returns {string|null} `relic:year:category`, `catalog:key` or null
 * (row without resolvable identity — never counts, never crashes).
 */
export function resolveCollectionId(inventoryRow, shopItem, options = {}) {
  if (isHistoricalRelicShopItem(shopItem)) {
    return `relic:${Number(shopItem.release_year)}:${cleanCollectionKey(shopItem.category)}`;
  }
  const key = keyOf(shopItem, inventoryRow);
  if (!key) return null;
  const aliases = options.aliases || activeAliases();
  const canonical = cleanCollectionKey(aliases[key] || key);
  if (!canonical) return null;
  return `catalog:${canonical}`;
}

/** True when the identity is a relic (excluded from Arsenal). */
export function isRelicCollectionId(collectionId) {
  return typeof collectionId === 'string' && collectionId.startsWith('relic:');
}

/**
 * Arsenal Completo eligibility: every resolved identity except relics.
 * Collectibles count (regular catalog, always available); only relic
 * content (limited stock, outside the normal equipment circuit) stays
 * out — per the approved owner decision.
 */
export function isArsenalEligible(collectionId) {
  return typeof collectionId === 'string' && collectionId.length > 0 && !isRelicCollectionId(collectionId);
}
