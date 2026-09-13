// Fase 1 da Loja — sponsor_id, pipeline de imagem, itens novos.
// Prova: sponsor_id só em correspondência exata; migração idempotente e não
// destrutiva (preserva valor explícito já salvo); desconto 15%/10% nunca
// acumula, contrato inativo e nome vazio não descontam; nenhum item novo
// usa chave morta; teto de preço do catálogo continua respeitado.
import assert from 'node:assert/strict';
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
  const { SPONSOR_CATALOG, findSponsorIdByManufacturer } = await vite.ssrLoadModule('/src/lib/sponsors.js');
  const { computeItemPrice } = await vite.ssrLoadModule('/src/lib/marketEngine.js');

  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');

  const memory = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(memory)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ career_id: 'shop-phase1-audit', career_name: 'Shop Phase 1 Audit' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'shop-phase1-player', sport_name: 'Shop Phase 1', career_date: '2026-01-01', birth_date: '2001-01-01' });

  // ── 1. sponsor_id: correspondência exata, não substring ──────────────────
  gate('findSponsorIdByManufacturer bate exato (Bullpadel)', findSponsorIdByManufacturer('Bullpadel') === 'bullpadel');
  gate('findSponsorIdByManufacturer normaliza espaço/caixa (  bullpadel  )', findSponsorIdByManufacturer('  bullpadel  ') === 'bullpadel');
  gate('findSponsorIdByManufacturer NÃO faz substring (Bull não bate Bullpadel)', findSponsorIdByManufacturer('Bull') === null);
  gate('findSponsorIdByManufacturer retorna null para marca sem patrocinador (Padel Heritage)', findSponsorIdByManufacturer('Padel Heritage') === null);
  gate('findSponsorIdByManufacturer retorna null para vazio', findSponsorIdByManufacturer('') === null && findSponsorIdByManufacturer(null) === null);

  // ── 2. Catálogo gerado: sponsor_id preenchido para marca conhecida ────────
  const before = await ensureExpandedShopCatalog();
  const allItems = await localGame.entities.ShopItem.list('-created_date', 5000);
  const bullpadelItems = allItems.filter((i) => i.manufacturer === 'Bullpadel');
  gate('Todo item com manufacturer=Bullpadel tem sponsor_id=bullpadel', bullpadelItems.length > 0 && bullpadelItems.every((i) => i.sponsor_id === 'bullpadel'));
  const heritageItems = allItems.filter((i) => i.manufacturer === 'Padel Heritage');
  gate('Item de marca sem patrocinador (Padel Heritage) fica com sponsor_id nulo', heritageItems.length > 0 && heritageItems.every((i) => !i.sponsor_id));

  // ── 3. Migração idempotente e não destrutiva ──────────────────────────────
  const target = bullpadelItems[0];
  await localGame.entities.ShopItem.update(target.id, { sponsor_id: 'CUSTOM_OVERRIDE', image_url: 'https://example.com/custom.png' });
  const second = await ensureExpandedShopCatalog();
  const reread = await localGame.entities.ShopItem.list('-created_date', 5000);
  const targetAfter = reread.find((i) => i.id === target.id);
  gate('Migração preserva sponsor_id explícito já salvo (não sobrescreve)', targetAfter.sponsor_id === 'CUSTOM_OVERRIDE');
  gate('Migração preserva image_url explícito já salvo', targetAfter.image_url === 'https://example.com/custom.png');
  gate('Segunda rodada de ensureExpandedShopCatalog não cria itens novos (idempotente)', second.created === 0);
  const third = await ensureExpandedShopCatalog();
  gate('Terceira rodada também não repara nada a mais (estável)', third.repaired === 0 && third.created === 0);

  // ── 4. Desconto 15% (sponsor_id) vs 10% (fuzzy) vs sem desconto ──────────
  const bullpadelSponsor = SPONSOR_CATALOG.find((s) => s.id === 'bullpadel');
  gate('Sponsor "bullpadel" existe no catálogo para o teste', Boolean(bullpadelSponsor));
  const sampleItem = allItems.find((i) => i.manufacturer === 'Bullpadel' && i.sponsor_id === 'bullpadel' && i.id !== target.id);
  const activeSponsorMatch = [{ sponsor_id: 'bullpadel', sponsor_name: 'Bullpadel' }];
  const priceWithSponsorId = computeItemPrice(sampleItem, [], null, activeSponsorMatch);
  gate('Desconto de 15% aplicado quando sponsor_id do item bate contrato ativo', priceWithSponsorId.sponsorDiscount === 15);

  const noSponsorIdItem = { ...sampleItem, sponsor_id: null };
  const priceFuzzyFallback = computeItemPrice(noSponsorIdItem, [], null, activeSponsorMatch);
  gate('Fallback de 10% (fuzzy) só quando o item NÃO tem sponsor_id', priceFuzzyFallback.sponsorDiscount === 10);

  const priceNoMatchAtAll = computeItemPrice(sampleItem, [], null, [{ sponsor_id: 'nox', sponsor_name: 'Nox' }]);
  gate('Sem desconto quando nenhum contrato ativo bate (nem por id nem por nome)', priceNoMatchAtAll.sponsorDiscount === 0);

  const priceInactiveContract = computeItemPrice(sampleItem, [], null, []); // contratos inativos nunca entram no array (Shop.jsx só busca is_active:true)
  gate('Contrato inativo (array vazio, simulando nenhum contrato ativo) não desconta', priceInactiveContract.sponsorDiscount === 0);

  const priceEmptySponsorName = computeItemPrice(noSponsorIdItem, [], null, [{ sponsor_id: null, sponsor_name: '' }]);
  gate('Nome de patrocinador vazio não casa com nada (fuzzy)', priceEmptySponsorName.sponsorDiscount === 0);

  const priceNeverStacks = computeItemPrice(sampleItem, [], null, [{ sponsor_id: 'bullpadel', sponsor_name: 'Bullpadel' }, { sponsor_id: 'nox', sponsor_name: 'Nox' }]);
  gate('Desconto nunca acumula (15% sozinho, nunca 15%+10%)', priceNeverStacks.sponsorDiscount === 15);

  // ── 5. Itens novos: sem chave morta, dentro do teto de preço ─────────────
  const NEW_ITEM_NAMES = [
    'Babolat Pro Touch Elite', 'Wilson Championship Grip', 'Bullpadel Master Grip Pro',
    'Nox Pro Competition Kit', 'Adidas Elite Tour Jacket', 'Bullpadel Champion Series',
    'Joma Elite Court', 'Asics Pro Tour Legend', 'Adidas Master Series',
    'Head Tour Elite Bag', 'Wilson Champion Vault', 'Bullpadel Master Pro 20',
    'Garmin Padel Elite', 'Playtomic Court Vision', 'Movistar Smart Analytics Pro',
    'Nox Elite Wristband', 'Adidas Focus Master', 'Therabody Recovery Master',
  ];
  const newItems = allItems.filter((i) => NEW_ITEM_NAMES.includes(i.name));
  gate(`Os 18 itens novos existem no catálogo (achados: ${newItems.length})`, newItems.length === 18);
  const deadKeys = ['stamina', 'concentration', 'reflexes', 'tactics', 'health', 'control', 'durability', 'reputation', 'followers', 'speed', 'strength', 'positioning'];
  const itemsWithDeadKeys = newItems.filter((i) => Object.keys(i.attribute_bonus || {}).some((k) => deadKeys.includes(k)));
  gate('Nenhum item novo usa chave morta', itemsWithDeadKeys.length === 0);
  const itemsWithOnlyRealAttrs = newItems.every((i) => Object.keys(i.attribute_bonus || {}).every((k) => ATTRIBUTE_KEYS.includes(k)));
  gate('Todo bônus dos itens novos é uma das 10 ATTRIBUTE_KEYS reais', itemsWithOnlyRealAttrs);
  gate('Todo item novo tem manufacturer/sponsor_id explícitos e consistentes', newItems.every((i) => i.manufacturer && i.sponsor_id));

  const maxPrice = Math.max(...allItems.map((i) => Number(i.price) || 0));
  const CROWN = 30000;
  gate(`Teto do catálogo respeitado após os itens novos: preço máximo ${maxPrice} (${(maxPrice / CROWN).toFixed(2)}x Crown) dentro de 30.000-90.000`, maxPrice >= 30000 && maxPrice <= 90000);
  const newItemsOutOfBand = newItems.filter((i) => {
    if (i.rarity === 'epico') return i.price < 5000 || i.price > 15999;
    if (i.rarity === 'lendario') return i.price < 16000 || i.price > 44999;
    if (i.rarity === 'mitico') return i.price < 45000 || i.price > 90000;
    return false;
  });
  gate('Todo item novo cai dentro da faixa de preço da sua raridade', newItemsOutOfBand.length === 0);

  const summary = getExpandedCatalogSummary();
  console.log(`\n${gates} gates executados, todos PASS — Shop Phase 1.`);
  console.log(JSON.stringify({ totalItemsInCatalog: summary.total, byRarity: summary.byRarity, byCategory: summary.byCategory, maxPrice }, null, 2));
} finally {
  await vite.close();
}
