/** @returns {any} */
export function normalizeMarketEvent(event = {}) {
  const explicitModifier = Number(event.price_modifier);
  const legacyDiscount = Number(event.discount_percent ?? event.discount_percentage ?? event.discount);
  const priceModifier = Number.isFinite(explicitModifier) && explicitModifier > 0
    ? explicitModifier
    : Number.isFinite(legacyDiscount) && legacyDiscount >= 0
      ? Math.max(0.01, 1 - (legacyDiscount > 1 ? legacyDiscount / 100 : legacyDiscount))
      : 1;
  return {
    ...event,
    event_type: event.event_type === 'promotion' ? 'promocao' : event.event_type,
    price_modifier: priceModifier,
    affected_item_ids: Array.isArray(event.affected_item_ids) ? event.affected_item_ids : [],
    affected_categories: Array.isArray(event.affected_categories) ? event.affected_categories : [],
    affected_manufacturers: Array.isArray(event.affected_manufacturers) ? event.affected_manufacturers : [],
    affected_rarities: Array.isArray(event.affected_rarities) ? event.affected_rarities : [],
  };
}

export function isMarketEventActive(/** @type {any} */ event, careerDate) {
  if (!event?.is_active) return false;
  const date = String(careerDate || '').slice(0, 10);
  if (!date) return true;
  if (event.start_date && String(event.start_date).slice(0, 10) > date) return false;
  if (event.end_date && String(event.end_date).slice(0, 10) < date) return false;
  return true;
}
