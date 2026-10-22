import { localGame } from '@/api/localGameClient.js';
import { computeItemPrice, isMarketEventActive, normalizeMarketEvent } from '@/lib/marketEngine.js';
import { getShopItemAccess, normalizeShopItem } from '@/lib/storeCatalog.js';
import { getEquipmentMarketState } from '@/lib/sportsEconomyV26.js';

// LOCAL-9C.2-A — compra e venda canônicas da Loja
// (docs/LOCAL_9C2_A_SHOP_TRANSACTION_INTEGRITY.md). Antes viviam em Shop.jsx
// buy() e Inventory.jsx sellItem(): 3-4 gravações separadas, saldo absoluto do
// perfil em memória e nenhuma checagem de estoque (C2A-01..04).
//
// Cada operação é UM localGame.batch com planejador: as regras são avaliadas
// dentro da gravação serializada, sobre o estado mais recente do save, e os
// efeitos (inventário, saldo por playerIncrement, extrato, estoque) são
// gravados juntos ou nada é gravado. Preço, estoque e desconto vêm sempre do
// save; nada que o chamador envie é cobrado.
//
// Identidade: o item é o ShopItem.id do save (o inventário referencia
// item_id). Ids estáveis entre saves ficam para a LOCAL-9C.2-C.
// Unicidade: nenhum item do catálogo atual é empilhável; possuir bloqueia nova
// compra até vender.

export const SHOP_RESALE_RATE = 0.3;
// Mesma consulta da Loja: MarketEvent ativos, '-priority', 20.
const SHOP_EVENT_LIMIT = 20;

const REJECTIONS = {
  'profile-not-found': 'Perfil não encontrado',
  'item-not-found': 'Item não encontrado',
  'item-unavailable': 'Item indisponível',
  duplicate: 'Operação já processada',
  'already-owned': 'Item já adquirido',
  'out-of-rotation': 'Item fora da rotação',
  locked: 'Equipamento ainda bloqueado',
  'out-of-stock': 'Item esgotado',
  'price-changed': 'Preço atualizado',
  'insufficient-funds': 'Moedas insuficientes',
  equipped: 'Item equipado',
  'not-sellable': 'Item não vendável',
};
const reject = (code, message, extra = {}) => ({ rejected: { code, title: REJECTIONS[code] || 'Operação recusada', message, ...extra } });
const formatCoins = (value) => Number(value || 0).toLocaleString('pt-BR');

// Valor de revenda atual: 30% do preço GRAVADO do ShopItem (regra do
// Inventário, preservada; rever sobre o preço pago pertence ao balanceamento).
export function computeResalePrice(shopItem) {
  return Math.floor((Number(shopItem?.price) || 0) * SHOP_RESALE_RATE);
}

function byFieldDesc(field) {
  return (a, b) => {
    const av = a?.[field]; const bv = b?.[field];
    const aMissing = av === undefined || av === null || av === '';
    const bMissing = bv === undefined || bv === null || bv === '';
    if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
    return av === bv ? 0 : av > bv ? -1 : 1;
  };
}

/** Eventos que valem para o preço na data da carreira (mesmo recorte da Loja). */
export function selectShopEvents(events = [], careerDate = null) {
  return (events || [])
    .filter((event) => event?.is_active === true)
    .sort(byFieldDesc('priority'))
    .slice(0, SHOP_EVENT_LIMIT)
    .map(normalizeMarketEvent)
    .filter((event) => isMarketEventActive(event, careerDate));
}

/** Histórico de preço/estoque do item: o mais recente (o mesmo que a Loja exibe). */
export function selectItemPriceHistory(histories = [], itemId) {
  return (histories || []).filter((row) => row?.item_id === itemId).sort(byFieldDesc('last_updated_date'))[0] || null;
}

/** Unidades restantes, ou null quando o item não tem estoque limitado. */
export function stockRemaining(history) {
  if (!history?.is_limited_stock) return null;
  const stock = Number(history.stock_remaining);
  return Number.isFinite(stock) && stock >= 0 ? stock : null;
}

export function sponsorRefsFromContracts(contracts = []) {
  return (contracts || []).filter((contract) => contract?.is_active === true).map((contract) => ({ sponsor_id: contract.sponsor_id, sponsor_name: contract.sponsor_name }));
}

/**
 * Preço efetivo (eventos, demanda, estoque, desconto de patrocínio ativo).
 * `sponsors`: {sponsor_id, sponsor_name}[] dos contratos ATIVOS.
 */
export function quoteShopItem(item, { events = [], history = null, sponsors = [], careerDate = null } = {}) {
  return computeItemPrice(item, events, history, sponsors, careerDate);
}

export function shopMarketState(item, profile, contracts = []) {
  return getEquipmentMarketState(item, { ...(profile || {}), active_sponsor_names: sponsorRefsFromContracts(contracts).map((ref) => ref.sponsor_name) });
}

function cleanOperationId(value) {
  const text = String(value ?? '').trim().replace(/[^A-Za-z0-9_.:-]/g, '-').slice(0, 96);
  return text || null;
}

// ─── Compra ─────────────────────────────────────────────────────────────────

function planPurchase(view, { profileId, itemId, requestedOperationId, expectedPrice }) {
  const player = view.player;
  if (!player?.id || player.id !== profileId) return reject('profile-not-found', 'Nenhum perfil ativo corresponde a esta compra.');
  const raw = itemId ? view.get('ShopItem', itemId) : null;
  if (!raw) return reject('item-not-found', 'Este item não existe no catálogo da Loja.');
  const item = normalizeShopItem(raw);
  if (!item.is_available) return reject('item-unavailable', 'Este item não está à venda.');

  const careerDate = player.career_date || null;
  // Identidade da operação. Sem id do chamador: n-ésima compra deste item na
  // data (determinística, sem RNG); com id: a mesma tentativa repetida
  // (clique duplo, retry, recarga) cai no mesmo registro e não cobra de novo.
  let operationId = requestedOperationId;
  if (!operationId) {
    const prefix = `shop-purchase-${item.id}-${careerDate || 'sem-data'}-`;
    operationId = `${item.id}-${careerDate || 'sem-data'}-${view.filter('FinancialTransaction', (row) => String(row.id || '').startsWith(prefix)).length + 1}`;
  }
  const ledgerId = `shop-purchase-${operationId}`;
  const inventoryId = `inventory-shop-${operationId}`;
  if (view.get('FinancialTransaction', ledgerId) || view.get('PlayerInventory', inventoryId)) {
    return reject('duplicate', 'Esta compra já foi processada.', { operationId });
  }
  if (view.filter('PlayerInventory', (row) => row.profile_id === player.id && row.item_id === item.id).length) {
    return reject('already-owned', `${item.name} já está no seu inventário.`);
  }

  const contracts = view.filter('PlayerContract', (row) => row.profile_id === player.id && row.is_active === true);
  const market = shopMarketState(item, player, contracts);
  if (!market?.available) return reject('out-of-rotation', market?.reason || 'Este equipamento pode voltar em outro mês.');
  const access = getShopItemAccess(player, item);
  if (!access.unlocked) return reject('locked', `Você precisa de ${access.reasons.join(', ')}.`);

  const history = selectItemPriceHistory(view.filter('MarketPriceHistory', (row) => row.item_id === item.id), item.id);
  const stock = stockRemaining(history);
  if (stock !== null && stock < 1) return reject('out-of-stock', `${item.name} esgotou.`, { stockRemaining: stock });

  const pricing = quoteShopItem(item, { events: selectShopEvents(view.filter('MarketEvent', (row) => row.is_active === true), careerDate), history, sponsors: sponsorRefsFromContracts(contracts), careerDate });
  const price = pricing.currentPrice;
  // O preço exibido é só um teto: se o mercado subiu desde a tela, recusa em
  // vez de cobrar a mais; se baixou, cobra o preço atual (menor).
  if (Number.isFinite(expectedPrice) && expectedPrice > 0 && price > expectedPrice) {
    return reject('price-changed', `O preço mudou para ${formatCoins(price)} moedas.`, { price });
  }
  if ((Number(player.coins) || 0) < price) return reject('insufficient-funds', `Você precisa de ${formatCoins(price)} moedas.`, { price });

  const acquiredDate = careerDate || new Date().toISOString().slice(0, 10);
  const operations = [
    { type: 'create', entityName: 'PlayerInventory', id: inventoryId, data: {
      profile_id: player.id,
      item_id: item.id,
      item_name: item.name,
      category: item.category,
      rarity: item.rarity,
      equipped: false,
      acquired_date: acquiredDate,
      current_durability: item.durability || 100,
      usage_count: 0,
    } },
    { type: 'playerIncrement', id: player.id, data: { coins: -price } },
    { type: 'upsert', entityName: 'FinancialTransaction', id: ledgerId, data: { profile_id: player.id, date: careerDate ? String(careerDate).slice(0, 10) : null, type: 'expense', category: 'loja', description: `Compra: ${item.name}`, amount: price } },
  ];
  if (history) {
    operations.push({ type: 'update', entityName: 'MarketPriceHistory', id: history.id, data: {
      demand_score: Math.min(100, (history.demand_score || 50) + 5),
      purchase_count: (history.purchase_count || 0) + 1,
      stock_remaining: history.is_limited_stock ? Math.max(0, (history.stock_remaining || 0) - 1) : -1,
    } });
  }
  return { operations, outcome: { operationId, ledgerId, inventoryId, itemId: item.id, itemName: item.name, price, pricing, stockRemaining: stock === null ? null : stock - 1 } };
}

/**
 * Compra um item da Loja para o perfil. Nunca lança por regra de negócio:
 * devolve { ok: false, code, title, message, profile } na recusa. Lança só
 * se a gravação falhar (nesse caso nada foi aplicado).
 * options.operationId — identidade da tentativa (clique/intenção).
 * options.expectedPrice — preço exibido; teto, nunca o valor cobrado.
 */
export async function purchaseShopItem(profileId, itemId, options = {}) {
  const requestedOperationId = cleanOperationId(options.operationId);
  const expectedPrice = Number(options.expectedPrice);
  const result = await localGame.batch(
    (view) => planPurchase(view, { profileId, itemId, requestedOperationId, expectedPrice }),
    { caller: 'shopTransactions.purchaseShopItem' },
  );
  if (result?.rejected) return { ok: false, ...result.rejected, profile: result.player || null };
  const outcome = result.outcome;
  notifyBalance(result.player);
  return {
    ok: true,
    code: 'purchased',
    ...outcome,
    inventoryItem: (result.records || []).find((record) => record?.id === outcome.inventoryId) || null,
    profile: result.player,
  };
}

// ─── Venda ──────────────────────────────────────────────────────────────────

function planSale(view, { profileId, inventoryItemId }) {
  const player = view.player;
  if (!player?.id || player.id !== profileId) return reject('profile-not-found', 'Nenhum perfil ativo corresponde a esta venda.');
  // Id já usado pelo Inventário desde a 5.27-M: a unidade vendida é a linha,
  // então a linha do extrato com esse id marca a venda como feita.
  const ledgerId = `inventory-sale-${inventoryItemId}`;
  const row = inventoryItemId ? view.get('PlayerInventory', inventoryItemId) : null;
  if (!row || row.profile_id !== player.id) {
    return view.get('FinancialTransaction', ledgerId)
      ? reject('duplicate', 'Este item já foi vendido.')
      : reject('item-not-found', 'Este item não está no seu inventário.');
  }
  if (row.equipped) return reject('equipped', 'Desequipe o item antes de vender.');
  const shopItem = view.get('ShopItem', row.item_id);
  const amount = computeResalePrice(shopItem);
  if (!shopItem || amount <= 0) return reject('not-sellable', 'Este item não tem valor de revenda no catálogo.');

  const careerDate = player.career_date || null;
  return {
    operations: [
      { type: 'delete', entityName: 'PlayerInventory', id: row.id },
      { type: 'playerIncrement', id: player.id, data: { coins: amount } },
      { type: 'upsert', entityName: 'FinancialTransaction', id: ledgerId, data: { profile_id: player.id, date: careerDate ? String(careerDate).slice(0, 10) : null, type: 'income', category: 'loja', description: `Venda: ${row.item_name}`, amount } },
    ],
    outcome: { inventoryItemId: row.id, itemId: row.item_id, itemName: row.item_name, amount, ledgerId },
  };
}

/** Vende uma unidade do inventário. Mesmo contrato de retorno da compra. */
export async function sellInventoryItem(profileId, inventoryItemId) {
  const result = await localGame.batch(
    (view) => planSale(view, { profileId, inventoryItemId }),
    { caller: 'shopTransactions.sellInventoryItem' },
  );
  if (result?.rejected) return { ok: false, ...result.rejected, profile: result.player || null };
  notifyBalance(result.player);
  return { ok: true, code: 'sold', ...result.outcome, profile: result.player };
}

// Mesmo aviso que PlayerAdapter.update dispara quando o saldo muda (header).
function notifyBalance(profile) {
  if (!profile?.id || typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent('padel:profile-updated', { detail: { profile, profileId: profile.id, careerDate: profile.career_date, source: 'player-adapter-balance' } }));
}
