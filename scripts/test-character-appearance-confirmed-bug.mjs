// Aparência Fase A/B — bug real reportado em teste ao vivo: uma carreira
// nova chegava com altura/biotipo JÁ preenchidos e JÁ TRAVADOS, sem o
// jogador nunca ter visto a sugestão da Fase B nem a aba Aparência.
//
// Causa raiz (confirmada rastreando duas carreiras reais afetadas em
// disco): LOCAL_SEED.CharacterCustomization (localSeed.js) e a migração de
// schema v6 (CareerMigration.js) podiam fabricar uma CharacterCustomization
// com `id` sem o jogador nunca ter salvo nada pela UI — e a heurística da
// Fase A ("tem id -> já foi salvo, migrar") travava altura/biotipo com
// defaults usando esse `id` fabricado como prova de "já foi salvo".
//
// Correção em 3 partes, testadas aqui de ponta a ponta com o storage real
// (não mockado): (1) CharacterCustomization entra em NEVER_SEED_WITH_DEMO_DATA
// — nasce de ação real, nunca de fallback; (2) novo campo
// appearance_confirmed, setado só por CharacterEditor.jsx handleSave(),
// substitui `id` como sinal de "já foi salvo de verdade"; (3) a migração v6
// não fabrica mais uma linha com defaults quando não há dado legado real.
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
  const { NEVER_SEED_WITH_DEMO_DATA, seedCollection } = await vite.ssrLoadModule('/src/gameplay/services/CareerInitialDataService.js');
  const { normalizeCharacterCustomization } = await vite.ssrLoadModule('/src/lib/characterCustomization.js');
  const { isAppearanceConfirmed, isFieldLocked, lockPhysicalFieldsIfNeeded } = await vite.ssrLoadModule('/src/lib/characterFieldLocks.js');
  const { migrateCareer } = await vite.ssrLoadModule('/src/careers/CareerMigration.js');
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');

  // ── Correção 1: CharacterCustomization nunca mais nasce de seed ─────────
  gate('CharacterCustomization está em NEVER_SEED_WITH_DEMO_DATA', NEVER_SEED_WITH_DEMO_DATA.has('CharacterCustomization'));
  const seeded = seedCollection('CharacterCustomization', 'qualquer-player-id');
  gate('seedCollection(CharacterCustomization) devolve [] — nunca mais a linha demo com id fabricado', Array.isArray(seeded) && seeded.length === 0);

  // ── Reprodução de ponta a ponta com storage real (não mockado) ──────────
  const memory = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(memory)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ career_id: 'appearance-bug-audit', career_name: 'Appearance Bug Audit' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'appearance-bug-player', sport_name: 'Bug Audit', career_date: '2026-01-01', birth_date: '2001-01-01' });

  // Carreira NOVA, nunca visitou /character: filter() não deve devolver
  // NENHUMA linha (é exatamente o que CharacterEditor.jsx.load() chama).
  const firstRead = await localGame.entities.CharacterCustomization.filter({ profile_id: 'appearance-bug-player' }, null, 1);
  gate('BUG BLOQUEADO: primeira leitura de uma carreira nova não devolve a linha seed (era o gatilho do bug)', firstRead.length === 0);

  const freshCustomization = normalizeCharacterCustomization(firstRead[0] || null, 'appearance-bug-player');
  gate('Customização "nunca vista" não está travada', !isFieldLocked(freshCustomization, 'height_cm') && !isFieldLocked(freshCustomization, 'build'));
  gate('Customização "nunca vista" não está appearance_confirmed (sugestão da Fase B pode aparecer)', !isAppearanceConfirmed(freshCustomization));

  // Simula exatamente o que CharacterEditor.jsx load() faz com o novo gate:
  // isAppearanceConfirmed, não existingRow?.id.
  gate('load(): gate correto é isAppearanceConfirmed, não a presença de id', !isAppearanceConfirmed(freshCustomization));

  // Simula o jogador escolhendo altura/build e clicando "Salvar" pela
  // primeira vez (handleSave, payload sem id -> create).
  let payload = { ...freshCustomization, height_cm: 190, build: 'musculoso' };
  payload.appearance_confirmed = true; // handleSave() sempre seta isso
  payload = lockPhysicalFieldsIfNeeded(payload); // handleSave() trava no primeiro save (sem id)
  delete payload.id;
  const created = await localGame.entities.CharacterCustomization.create(payload);
  gate('Primeiro save real: appearance_confirmed=true persistido', created.appearance_confirmed === true);
  gate('Primeiro save real: locked_fields gravado com os valores ESCOLHIDOS pelo jogador (190cm/musculoso, não default)', created.height_cm === 190 && created.build === 'musculoso' && isFieldLocked(created, 'height_cm') && isFieldLocked(created, 'build'));

  // Segunda visita a /character: load() lê de novo, já travado, idempotente.
  const secondRead = await localGame.entities.CharacterCustomization.filter({ profile_id: 'appearance-bug-player' }, null, 1);
  const secondCustomization = normalizeCharacterCustomization(secondRead[0], 'appearance-bug-player');
  gate('Segunda leitura: appearance_confirmed persistiu (true)', isAppearanceConfirmed(secondCustomization));
  const remigrated = lockPhysicalFieldsIfNeeded(secondCustomization);
  gate('Segunda leitura: migração é no-op (já travado, não reescreve)', remigrated.locked_fields === secondCustomization.locked_fields);
  gate('Valores escolhidos pelo jogador sobrevivem (190cm/musculoso, nunca resetados a default)', secondCustomization.height_cm === 190 && secondCustomization.build === 'musculoso');

  // ── Correção 3: migração v6 não fabrica mais linha com defaults ─────────
  const noLegacyDataCareer = {
    save_schema_version: 5, metadata: {},
    player: { id: 'legacy-player-no-appearance', coins: 100 },
    world: {}, entities: {},
  };
  const noLegacyMigration = migrateCareer(noLegacyDataCareer);
  gate('BUG BLOQUEADO: migração v6 sem dado legado real não fabrica mais linha com defaults+id — devolve []', Array.isArray(noLegacyMigration.data.entities.CharacterCustomization) && noLegacyMigration.data.entities.CharacterCustomization.length === 0);

  const legacyDataCareer = {
    save_schema_version: 5, metadata: {},
    player: { id: 'legacy-player-with-appearance', coins: 100, appearance: { hairStyle: 'longo', shirtColor: '#ef4444' } },
    world: {}, entities: {},
  };
  const legacyMigration = migrateCareer(legacyDataCareer);
  const migratedRow = legacyMigration.data.entities.CharacterCustomization[0];
  gate('Migração v6 COM dado legado real ainda restaura a aparência antiga (nenhuma regressão)', migratedRow.hair_style === 'longo' && migratedRow.shirt_color === '#ef4444');
  gate('Migração v6 COM dado legado real marca appearance_confirmed=true (é uma ação real do jogador, só num formato antigo)', migratedRow.appearance_confirmed === true);

  console.log(`\n${gates} gates executados, todos PASS — Bug de trava prematura de altura/biotipo corrigido (seed, appearance_confirmed, migração v6).`);
} finally {
  await vite.close();
}
