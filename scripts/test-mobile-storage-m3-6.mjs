// Mobile M3.6 — Storage/I/O Performance.
// Benchmark determinístico de amplificação de IPC + gates de navegação,
// cache, atomicidade e equivalência do estado persistido.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { GameStorage } from '../src/storage/GameStorage.js';
import { MatchCheckpointRepository } from '../src/careers/MatchCheckpointRepository.js';
import { buildMissionAliasUpdates } from '../src/lib/missionCatalogLogic.js';
import {
  getStoragePerformanceSnapshot,
  measureStorageOperation,
  resetStoragePerformanceStats,
  setStorageProbeEnabledForTests,
} from '../src/dev/storageIOProbe.js';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

class InstrumentedMemoryStorage {
  constructor() {
    this.files = new Map();
    this.directories = new Set();
    this.corruptNextTempWrite = false;
  }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async measured(operation, key, caller, task, bytes = 0) {
    return measureStorageOperation(
      { operation, key, caller, layer: 'tauri-ipc', cache: 'miss' },
      task,
      { bytes },
    );
  }
  async ensureDirectory(path, { caller = 'memory.mkdir' } = {}) {
    return this.measured('mkdir', path, caller, () => { this.directories.add(path); return true; });
  }
  async exists(path, { caller = 'memory.exists' } = {}) {
    return this.measured('exists', path, caller, () => this.files.has(path) || this.directories.has(path));
  }
  async writeText(path, content, { ensureParent = true, caller = 'memory.write' } = {}) {
    const parent = path.includes('/') ? path.split('/').slice(0, -1).join('/') : null;
    if (ensureParent && parent) await this.ensureDirectory(parent, { caller: `${caller}:parent` });
    const written = this.corruptNextTempWrite && (path.startsWith('temp/') || path.includes('/temp/'))
      ? `${String(content)}corrupt`
      : String(content);
    this.corruptNextTempWrite = false;
    return this.measured('write', path, caller, () => { this.files.set(path, written); }, written.length);
  }
  async readText(path, { knownToExist = false, caller = 'memory.read' } = {}) {
    if (!knownToExist && !(await this.exists(path, { caller: `${caller}:preflight` }))) {
      const error = new Error('missing'); error.code = 'FILE_NOT_FOUND'; throw error;
    }
    if (!this.files.has(path)) { const error = new Error('missing'); error.code = 'FILE_NOT_FOUND'; throw error; }
    return this.measured('read', path, caller, () => this.files.get(path), this.files.get(path).length);
  }
  async remove(path, { knownToExist = false, caller = 'memory.remove' } = {}) {
    if (!knownToExist && !(await this.exists(path, { caller: `${caller}:preflight` }))) return false;
    return this.measured('remove', path, caller, () => this.files.delete(path));
  }
  async rename(source, destination, { ensureParent = true, caller = 'memory.rename' } = {}) {
    const parent = destination.includes('/') ? destination.split('/').slice(0, -1).join('/') : null;
    if (ensureParent && parent) await this.ensureDirectory(parent, { caller: `${caller}:parent` });
    return this.measured('rename', `${source} -> ${destination}`, caller, () => {
      this.files.set(destination, this.files.get(source));
      this.files.delete(source);
      return destination;
    });
  }
  async copy(source, destination, { ensureParent = true, caller = 'memory.copy' } = {}) {
    const parent = destination.includes('/') ? destination.split('/').slice(0, -1).join('/') : null;
    if (ensureParent && parent) await this.ensureDirectory(parent, { caller: `${caller}:parent` });
    return this.measured('copy', `${source} -> ${destination}`, caller, () => {
      this.files.set(destination, this.files.get(source));
      return destination;
    });
  }
  async list(directory = '.', { knownToExist = false, caller = 'memory.list' } = {}) {
    if (!knownToExist && directory !== '.' && !(await this.exists(directory, { caller: `${caller}:preflight` }))) return [];
    return this.measured('list', directory, caller, () => [...this.files.keys()]
      .filter((path) => directory === '.' || path.startsWith(`${directory}/`))
      .map((path) => ({ name: path.split('/').pop(), isDirectory: false })));
  }
  async stat(path, { caller = 'memory.stat' } = {}) {
    return this.measured('stat', path, caller, () => ({ size: this.files.get(path)?.length || 0 }));
  }
}

function timestamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

async function legacyWriteJson(storage, path, value) {
  const serialized = `${JSON.stringify(value)}\n`;
  const temp = `temp/${path.split('/').pop()}-${timestamp()}.tmp.json`;
  try {
    await storage.writeText(temp, serialized, { caller: 'legacy:temp-write' });
    const tempContent = await storage.readText(temp, { caller: 'legacy:temp-verify' });
    assert.equal(tempContent, serialized);
    if (await storage.exists(path, { caller: 'legacy:destination-exists' })) {
      await storage.remove(path, { caller: 'legacy:replace-remove' });
    }
    await storage.rename(temp, path, { caller: 'legacy:rename' });
    const finalContent = await storage.readText(path, { caller: 'legacy:final-verify' });
    assert.deepEqual(JSON.parse(finalContent), value);
  } finally {
    if (await storage.exists(temp, { caller: 'legacy:temp-cleanup-exists' })) {
      await storage.remove(temp, { caller: 'legacy:temp-cleanup' });
    }
  }
}

function printTop(label, snapshot) {
  console.log(`\n${label}: reads=${snapshot.totals.reads}, writes=${snapshot.totals.writes}, calls=${snapshot.totals.calls}, total=${snapshot.totals.totalMs}ms, cache=${snapshot.totals.cacheHitRate}%`);
  snapshot.operations.slice(0, 20).forEach((operation, index) => {
    console.log(`${String(index + 1).padStart(2, '0')}. ${operation.operation} ${operation.key} | ${operation.caller} | n=${operation.count} total=${operation.totalMs}ms max=${operation.maxMs}ms`);
  });
}

setStorageProbeEnabledForTests(true);
try {
  const payload = {
    career_id: 'm3-6-career',
    player: { id: 'player', coins: 321, xp: 456 },
    entities: { Mission: [{ id: 'mission-1', progress: 2 }], Match: [{ id: 'match-1', status: 'scheduled' }] },
  };
  const path = 'careers/m3-6-career.json';

  const beforeStorage = new InstrumentedMemoryStorage();
  beforeStorage.files.set(path, `${JSON.stringify({ old: true })}\n`);
  resetStoragePerformanceStats();
  await legacyWriteJson(beforeStorage, path, payload);
  const before = getStoragePerformanceSnapshot(20);

  const afterStorage = new InstrumentedMemoryStorage();
  afterStorage.files.set(path, `${JSON.stringify({ old: true })}\n`);
  const gameStorage = new GameStorage(afterStorage);
  resetStoragePerformanceStats();
  await gameStorage.writeJson(path, payload, { backup: false, validate: false, caller: 'M3.6.determinism' });
  const after = getStoragePerformanceSnapshot(20);

  assert.deepEqual(JSON.parse(beforeStorage.files.get(path)), JSON.parse(afterStorage.files.get(path)));
  gate('estado final persistido é idêntico antes/depois da otimização', true);
  gate('escrita atômica reduz chamadas primitivas sem paralelizar', after.totals.calls < before.totals.calls);
  gate('releitura redundante do save após rename foi eliminada', after.totals.reads === 1 && before.totals.reads === 2);
  gate('quantidade de writes físicos permanece uma por persistência', after.totals.writes === before.totals.writes);

  printTop('TOP STORAGE BEFORE (modelo M3.5, benchmark local)', before);
  printTop('TOP STORAGE AFTER (M3.6, benchmark local)', after);

  const readStorage = new InstrumentedMemoryStorage();
  readStorage.files.set('probe.json', '{"ok":true}\n');
  const readGameStorage = new GameStorage(readStorage);
  resetStoragePerformanceStats();
  assert.deepEqual(await readGameStorage.readJsonIfExists('probe.json'), { ok: true });
  const readSnapshot = getStoragePerformanceSnapshot(20);
  gate('readJsonIfExists usa somente um exists + um read físico', readSnapshot.operations.filter((entry) => entry.operation === 'exists').reduce((n, entry) => n + entry.count, 0) === 1 && readSnapshot.totals.reads === 1);

  const recoveryStorage = new InstrumentedMemoryStorage();
  recoveryStorage.files.set(path, '{"safe":"original"}\n');
  recoveryStorage.corruptNextTempWrite = true;
  const recoveryGameStorage = new GameStorage(recoveryStorage);
  await assert.rejects(() => recoveryGameStorage.writeJson(path, payload, { backup: false, validate: false }));
  gate('falha de verificação do tmp preserva o save original', recoveryStorage.files.get(path) === '{"safe":"original"}\n');
  gate('tmp corrompido é limpo em best-effort', ![...recoveryStorage.files.keys()].some((key) => key.startsWith('temp/')));

  const normalizedMission = { id: 'mission', reward_xp: 10, reward_coins: 20, xp_reward: 10, coins_reward: 20, mission_type: 'diaria', is_active: true };
  gate('Missions não grava aliases já normalizados durante navegação', buildMissionAliasUpdates([normalizedMission]).length === 0);
  gate('Missions ainda repara exatamente uma vez um alias legado', buildMissionAliasUpdates([{ id: 'legacy', reward_xp: 10, reward_coins: 20 }]).length === 1);

  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { ActiveCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/adapters/ActiveCareerAdapter.js');
    const { GameRepository } = await vite.ssrLoadModule('/src/gameplay/repositories/GameRepository.js');
    const { CareerEntityRepository } = await vite.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');
    const probe = await vite.ssrLoadModule('/src/dev/storageIOProbe.js');
    probe.setStorageProbeEnabledForTests(true);
    const manager = {
      reads: 0, saves: 0,
      async getLastCareer() { this.reads += 1; return 'navigation'; },
      async loadCareer() { this.reads += 1; return null; },
      async readCareer() { this.reads += 1; return null; },
      async saveCareer(_id, career) { this.saves += 1; return career; },
    };
    const adapter = new ActiveCareerAdapter(manager);
    adapter.setActiveCareer({
      career_id: 'navigation', metadata: {}, player: { id: 'player' },
      entities: { Mission: [normalizedMission], MissionProgress: [], Match: [{ id: 'match' }] },
    });
    const entities = new CareerEntityRepository(new GameRepository(adapter));
    probe.resetStoragePerformanceStats();
    // Home -> Missions -> Home -> Matches -> Home. Todas são consultas do
    // snapshot ativo; a segunda passagem também comprova hits do query cache.
    await entities.list('Mission');
    await entities.filter('MissionProgress', { profile_id: 'player' });
    await entities.list('Mission');
    await entities.list('Match');
    await entities.list('Match');
    const navigationSnapshot = probe.getStoragePerformanceSnapshot(20);
    gate('navegação read-only não relê nem grava o save principal', manager.reads === 0 && manager.saves === 0);
    gate('navegação read-only reutiliza cache em memória', navigationSnapshot.totals.cacheHits > 0);
    probe.setStorageProbeEnabledForTests(null);
  } finally {
    await vite.close();
  }

  const checkpointStorage = new InstrumentedMemoryStorage();
  const checkpoints = new MatchCheckpointRepository(new GameStorage(checkpointStorage));
  resetStoragePerformanceStats();
  await checkpoints.read('navigation');
  await checkpoints.read('navigation');
  await checkpoints.read('navigation');
  const checkpointReadSnapshot = getStoragePerformanceSnapshot(20);
  gate('três consumidores do checkpoint fazem uma única consulta física', checkpointReadSnapshot.operations.filter((entry) => entry.operation === 'exists' && entry.key.includes('active-matches/navigation.json')).reduce((n, entry) => n + entry.count, 0) === 1);
  gate('cache de checkpoint contabiliza hits/misses', checkpointReadSnapshot.totals.cacheHits === 2 && checkpointReadSnapshot.totals.cacheMisses >= 1);

  const checkpoint = {
    type: 'practice', match_id: 'practice-1',
    engine_state: { pointNumber: 3, narration: [], teams: { A: [{ id: 'a' }], B: [{ id: 'b' }] }, finished: false },
  };
  await checkpoints.save('navigation', checkpoint);
  const cachedCheckpoint = await checkpoints.read('navigation');
  cachedCheckpoint.engine_state.pointNumber = 999;
  gate('cache de checkpoint devolve clone e não permite mutação acidental', (await checkpoints.read('navigation')).engine_state.pointNumber === 3);
  await checkpoints.clear('navigation');
  gate('clear invalida o cache e remove o checkpoint persistido', await checkpoints.read('navigation') === null);

  console.log(`\n${gates} gates executados, todos PASS — Mobile M3.6 Storage/I/O.`);
} finally {
  setStorageProbeEnabledForTests(null);
}
