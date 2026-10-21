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
  console.log(`  [info] Total de itens: ${allItems.length} · com bônus: ${itemsWithBonus.length} · consumidor real: atributo efetivo na partida (equipmentModifiers.js, LOCAL-9B)`);

  // ── 2. Resolver real — auditoria estática ────────────────────────────────
  // LOCAL-9B: o equipar deixou de gravar o bônus no atributo (que consumia a
  // margem do teto de treino, 9A-01). As invariantes da 15.5.3 continuam
  // valendo, agora no modelo base + modificador derivado: sem deriva (nada é
  // gravado, então nada é revertido), piso 0 / teto 100 no efetivo, um item
  // por categoria. Os gates antigos verificavam o TEXTO da implementação
  // removida; foram trocados pelos equivalentes do modelo novo.
  const inventorySrc = readFileSync(new URL('../src/pages/Inventory.jsx', import.meta.url), 'utf8');
  const modifiersSrc = readFileSync(new URL('../src/lib/equipmentModifiers.js', import.meta.url), 'utf8');
  const lifecycleSrc = readFileSync(new URL('../src/game-core/equipmentLifecycle.js', import.meta.url), 'utf8');
  const EM = await vite.ssrLoadModule('/src/lib/equipmentModifiers.js');
  gate('Bônus derivado do attribute_bonus do ShopItem (resolver único: equipmentModifiers.js)', modifiersSrc.includes('sanitizeBonus(item.attribute_bonus)'));
  gate('Inventory.jsx equipa pelo domínio (toggleEquipItem) e não grava atributo-base', inventorySrc.includes('toggleEquipItem') && !/applyToProfile|appliedBonus\[key\]/.test(inventorySrc));
  gate('Efetivo tem piso 0 e teto 100 (raquetes com penalidade negativa não negativam)', EM.describeAttribute(3, -8).effective === 0 && EM.describeAttribute(98, 5).effective === 100);
  gate('Categoria exclusiva por slot: equipar desequipa o item da mesma categoria', EM.planEquipToggle({ inventory: [{ id: 'a', item_id: 'r1', category: 'raquete', equipped: true }], target: { id: 'b', item_id: 'r2', category: 'raquete', equipped: false }, shopItems: { r1: { id: 'r1', category: 'raquete' }, r2: { id: 'r2', category: 'raquete' } } }).invUpdates.some((u) => u.id === 'a' && u.equipped === false));
  gate('Botão de equipar/desequipar desabilita durante a chamada em voo (proteção contra duplo clique)', inventorySrc.includes('disabled={toggling === invItem.id}'));

  // ── 3. Deriva perto do teto: impossível no modelo novo ──────────────────
  // 15.5.3: desequipar pelo bônus declarado (e não pelo aplicado) drenava
  // pontos reais perto de 100. Agora a base nunca é tocada pelo equipar.
  const nearCap = 98;
  const declaredBonus = 5; // ex.: raquete diamante de alta raridade em `smash`
  const view = EM.describeAttribute(nearCap, declaredBonus);
  gate('Perto do teto: o efetivo vai só até 100 (aplicado 2 de 5 declarados)', view.effective === 100 && view.applied === 2);
  const equippedProfile = EM.applyEquipmentModifiers({ smash: nearCap }, { smash: declaredBonus });
  gate('Equipar/desequipar não altera a base (sem deriva possível): perfil gravado continua 98', equippedProfile.smash === 100 && EM.applyEquipmentModifiers({ smash: nearCap }, {}).smash === nearCap);

  // ── 4. Reload preserva (flag de equipado persistida; bônus recalculado do catálogo) ─
  gate('equipped é persistido via PlayerInventory.bulkUpdate; o bônus não é gravado em lugar nenhum', lifecycleSrc.includes('PlayerInventory.bulkUpdate(plan.invUpdates)') && modifiersSrc.includes('applied_bonus: null'));

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
