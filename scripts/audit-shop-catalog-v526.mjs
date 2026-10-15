// Playthrough 5.26 — catálogo REAL da loja (gerado em runtime por
// ensureExpandedShopCatalog numa carreira nova) para o teste "comprar tudo" e
// para a dominância de equipamento. Grava reports/progression-economy-526/shop-catalog.json.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installDeterminism, MemoryStorage, bootRuntime, createRealCareer } from './lib/v526CareerSim.mjs';
import * as act from './lib/v526Actions.mjs';

installDeterminism('shop-catalog-526');
const rt = await bootRuntime(new MemoryStorage());
try {
  const A = await act.loadActionModules(rt);
  const { profile } = await createRealCareer(rt, { saveName: 'catalogo-526' });
  const shop = await act.shopOptions(rt, A, profile);
  const items = shop.rows.map((r) => ({
    id: r.item.id, name: r.item.name, category: r.item.category, rarity: r.item.rarity, price: r.price, basePrice: Number(r.item.price) || null,
    bonusTotal: r.bonusTotal, attributeBonus: r.item.attribute_bonus || {}, brand: r.item.brand || null,
  }));
  const rarities = [...new Set(items.map((i) => i.rarity))];
  const categories = [...new Set(items.map((i) => i.category))];
  const byRarity = Object.fromEntries(rarities.map((rar) => {
    const list = items.filter((i) => i.rarity === rar);
    const prices = list.map((i) => i.price).sort((a, b) => a - b);
    return [rar, { items: list.length, totalPrice: prices.reduce((s, v) => s + v, 0), minPrice: prices[0], maxPrice: prices.at(-1), bonusMax: Math.max(...list.map((i) => i.bonusTotal)), bonusPerKCoins: Math.round((list.reduce((s, i) => s + i.bonusTotal, 0) / Math.max(1, prices.reduce((s, v) => s + v, 0))) * 1000 * 100) / 100 }];
  }));
  // Melhor item de cada categoria (maior bônus) — custo do "loadout máximo".
  const bestLoadout = categories.map((cat) => items.filter((i) => i.category === cat).sort((a, b) => b.bonusTotal - a.bonusTotal || a.price - b.price)[0]).filter(Boolean);
  const out = {
    items: items.length, categories, rarities, byRarity,
    buyEverythingCost: items.reduce((s, i) => s + i.price, 0),
    bestLoadout: { cost: bestLoadout.reduce((s, i) => s + i.price, 0), bonusTotal: bestLoadout.reduce((s, i) => s + i.bonusTotal, 0), items: bestLoadout.map((i) => ({ category: i.category, name: i.name, rarity: i.rarity, price: i.price, bonusTotal: i.bonusTotal })) },
    catalog: items,
  };
  writeFileSync(resolve('reports/progression-economy-526/shop-catalog.json'), JSON.stringify(out, null, 2));
  console.log(`itens ${items.length} · comprar tudo ${out.buyEverythingCost} · loadout máximo ${out.bestLoadout.cost} (+${out.bestLoadout.bonusTotal} atributos)`);
} finally {
  await rt.close();
  process.exit(0);
}
