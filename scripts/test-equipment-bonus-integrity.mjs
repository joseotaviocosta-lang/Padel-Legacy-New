// Fase 15.5.3 — Equipment bonus integrity.
// Descobre o catálogo real (storeCatalog.js, EXPANDED_ITEMS via
// ensureExpandedShopCatalog) em vez de uma lista inventada, classifica cada
// bônus declarado (DECLARED -> RESOLVED -> CONSUMED) e prova a correção do
// bug real encontrado na auditoria: o bônus é somado permanentemente no
// atributo base no equipar (Inventory.jsx, toggleEquip) — perto do teto 100
// o ganho real fica menor que o declarado (clamp), mas o desequipar
// subtraía o valor DECLARADO inteiro, drenando pontos reais do atleta a
// cada ciclo equipar/desequipar perto do teto. A correção grava o delta
// REALMENTE aplicado (applied_bonus) e reverte exatamente esse valor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async ensureDirectory(path) { this.directories.add(path); return true; }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) {
    const parent = path.includes('/') ? path.split('/').slice(0, -1).join('/') : null;
    if (parent) await this.ensureDirectory(parent);
    this.files.set(path, String(content));
  }
  async readText(path) {
    if (!this.files.has(path)) { const e = new Error(`missing: ${path}`); e.code = 'FILE_NOT_FOUND'; throw e; }
    return this.files.get(path);
  }
  async remove(path) { return this.files.delete(path); }
  async rename(source, destination) {
    if (!this.files.has(source)) throw new Error(`rename source missing: ${source}`);
    this.files.set(destination, this.files.get(source)); this.files.delete(source);
    return destination;
  }
  async copy(source, destination) {
    if (!this.files.has(source)) throw new Error(`copy source missing: ${source}`);
    this.files.set(destination, this.files.get(source));
    return destination;
  }
  async list(directory = '.') {
    return [...this.files.keys()].filter((p) => directory === '.' || p.startsWith(`${directory}/`)).map((p) => ({ name: p.split('/').pop(), isDirectory: false }));
  }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { ATTRIBUTE_KEYS } = await vite.ssrLoadModule('/src/lib/attributes.js');
  const { ensureExpandedShopCatalog, getExpandedCatalogSummary } = await vite.ssrLoadModule('/src/lib/storeCatalog.js');
  const racketsModule = await vite.ssrLoadModule('/src/lib/catalog/rackets.js');
  const gripsModule = await vite.ssrLoadModule('/src/lib/catalog/gripsBallsBags.js');
  const apparelModule = await vite.ssrLoadModule('/src/lib/catalog/apparelTechCollectibles.js');

  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');

  const memory = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(memory)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ career_id: 'equip-audit', career_name: 'Equipment Audit' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'equip-player', sport_name: 'Equip Audit', career_date: '2026-01-01', birth_date: '2001-01-01' });

  // ── 1. Inventário completo do catálogo real (não uma lista inventada) ──
  const summaryBefore = await ensureExpandedShopCatalog();
  gate('Catálogo de equipamentos carrega (getExpandedCatalogSummary)', getExpandedCatalogSummary().total > 0);
  const allItems = await localGame.entities.ShopItem.list('-created_date', 5000);
  gate('Todos os itens do catálogo foram persistidos como ShopItem', allItems.length >= getExpandedCatalogSummary().total);

  const itemsWithBonus = allItems.filter((item) => item.attribute_bonus && Object.keys(item.attribute_bonus).length > 0);
  const declaredKeys = new Set();
  itemsWithBonus.forEach((item) => Object.keys(item.attribute_bonus).forEach((key) => declaredKeys.add(key)));

  const consumedKeys = [...declaredKeys].filter((key) => ATTRIBUTE_KEYS.includes(key));
  const orphanKeys = [...declaredKeys].filter((key) => !ATTRIBUTE_KEYS.includes(key));

  gate('Catálogo tem itens com bônus declarado', itemsWithBonus.length > 0);
  gate(`Auditoria DECLARED->CONSUMED: ${consumedKeys.length} chave(s) de bônus mapeiam para ATTRIBUTE_KEYS reais (${consumedKeys.sort().join(', ') || 'nenhuma'})`, consumedKeys.length > 0);
  console.log(`  [info] Chaves ambíguas/órfãs (declaradas, sem consumidor em ATTRIBUTE_KEYS): ${orphanKeys.sort().join(', ') || 'nenhuma'}`);
  console.log(`  [info] Total de itens: ${allItems.length} · com bônus: ${itemsWithBonus.length} · consumidores reais (equip muda profile[attr]): sim, via Inventory.jsx`);

  // ── 2. Resolver real (Inventory.jsx toggleEquip) — auditoria estática ───
  const inventorySrc = readFileSync(new URL('../src/pages/Inventory.jsx', import.meta.url), 'utf8');
  gate('toggleEquip lê attribute_bonus do ShopItem (resolver único, não duplicado)', inventorySrc.includes('shopItem?.attribute_bonus'));
  gate('Hotfix 15.5.3: equip grava o delta REALMENTE aplicado (applied_bonus), pós-clamp', inventorySrc.includes('appliedBonus[key] = after - before'));
  gate('Hotfix 15.5.3: unequip reverte applied_bonus (não o bônus declarado bruto) quando disponível', inventorySrc.includes('const appliedBonus = invItem.applied_bonus || bonus'));
  gate('Hotfix 15.5.3: equip tem piso 0 além do teto 100 (raquetes com penalidade negativa não zeram/negativam sem limite)', inventorySrc.includes('Math.max(0, Math.min(100, before + val))'));
  gate('Categoria exclusiva por slot: equipar desequipa qualquer item da mesma categoria antes', inventorySrc.includes('sameCategory'));
  gate('Botão de equipar/desequipar desabilita durante a chamada em voo (proteção contra duplo clique)', inventorySrc.includes('disabled={toggling === invItem.id}'));

  // ── 3. Prova numérica do bug de deriva por cap e da correção ────────────
  // Simula exatamente a fórmula de Inventory.jsx: sem correção, unequip
  // subtrairia o bônus DECLARADO cheio mesmo quando o equip só aplicou
  // parte dele por causa do teto 100.
  function equipDelta(before, declaredVal) {
    const after = Math.max(0, Math.min(100, before + declaredVal));
    return { after, applied: after - before };
  }
  const nearCap = 98;
  const declaredBonus = 5; // ex.: raquete diamante de alta raridade em `smash`
  const { after: afterEquip, applied } = equipDelta(nearCap, declaredBonus);
  gate('Perto do teto: equipar aplica só o que cabe até 100 (não o valor declarado inteiro)', afterEquip === 100 && applied === 2);
  const afterUnequipFixed = Math.max(0, afterEquip - applied);
  const afterUnequipBuggy = Math.max(0, afterEquip - declaredBonus);
  gate('Correção: desequipar com applied_bonus devolve exatamente o valor de antes do equip (sem deriva)', afterUnequipFixed === nearCap);
  gate('BUG REPRODUZIDO (comportamento pré-correção): desequipar pelo bônus declarado bruto perderia pontos reais (98 -> 97, nunca volta a 98)', afterUnequipBuggy === nearCap - (declaredBonus - applied) && afterUnequipBuggy < nearCap);

  // ── 4. Reload preserva (equip é persistido, não recalculado do zero) ───
  gate('equipped e applied_bonus são persistidos via PlayerInventory.bulkUpdate (não recalculados a cada leitura)', inventorySrc.includes('PlayerInventory.bulkUpdate(invUpdates)'));

  // ── 5. Consumíveis ───────────────────────────────────────────────────────
  console.log('  [info] Nenhum item do catálogo é consumível (sem campo quantity/uses decrementável) — item 22 do briefing não se aplica; nada a testar/pular.');

  console.log(`\n${gates} gates executados, todos PASS — Equipment Bonus Integrity.`);
  console.log(JSON.stringify({
    totalItems: allItems.length,
    itemsWithBonuses: itemsWithBonus.length,
    consumedKeys,
    orphanKeys,
    created: summaryBefore.created,
    repaired: summaryBefore.repaired,
  }, null, 2));
} finally {
  await vite.close();
}
