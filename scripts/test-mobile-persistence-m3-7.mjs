// Mobile M3.7 — Transactional / Batched Persistence.
// Exercita a API real, falhas atômicas e um advance-day real antes/depois.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { GameStorage } from '../src/storage/GameStorage.js';
import { MatchCheckpointRepository } from '../src/careers/MatchCheckpointRepository.js';
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

function clone(value) { return structuredClone(value); }

class InstrumentedMemoryStorage {
  constructor() {
    this.files = new Map();
    this.directories = new Set();
    this.failure = null;
    this.corruptNextTempWrite = false;
    this.measureFn = measureStorageOperation;
  }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async measured(operation, key, caller, task, bytes = 0) {
    if (this.failure === operation || this.failure === caller) {
      this.failure = null;
      throw new Error(`falha injetada: ${operation} (${caller})`);
    }
    return this.measureFn(
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
    const written = this.corruptNextTempWrite && path.startsWith('temp/')
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
    const value = this.files.get(path);
    return this.measured('read', path, caller, () => value, value.length);
  }
  async remove(path, { knownToExist = false, caller = 'memory.remove' } = {}) {
    if (!knownToExist && !(await this.exists(path, { caller: `${caller}:preflight` }))) return false;
    return this.measured('remove', path, caller, () => this.files.delete(path));
  }
  async rename(source, destination, { ensureParent = true, caller = 'memory.rename' } = {}) {
    const parent = destination.includes('/') ? destination.split('/').slice(0, -1).join('/') : null;
    if (ensureParent && parent) await this.ensureDirectory(parent, { caller: `${caller}:parent` });
    return this.measured('rename', `${source} -> ${destination}`, caller, () => {
      if (!this.files.has(source)) throw new Error(`rename source missing: ${source}`);
      this.files.set(destination, this.files.get(source));
      this.files.delete(source);
      return destination;
    });
  }
  async copy(source, destination, { ensureParent = true, caller = 'memory.copy' } = {}) {
    const parent = destination.includes('/') ? destination.split('/').slice(0, -1).join('/') : null;
    if (ensureParent && parent) await this.ensureDirectory(parent, { caller: `${caller}:parent` });
    return this.measured('copy', `${source} -> ${destination}`, caller, () => {
      if (!this.files.has(source)) throw new Error(`copy source missing: ${source}`);
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

function createSeededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function operationCount(snapshot, predicate) {
  return snapshot.operations.filter(predicate).reduce((sum, item) => sum + item.count, 0);
}

function mainSaveCounts(snapshot, careerId) {
  const careerPath = `careers/${careerId}.json`;
  return {
    primitiveCalls: operationCount(snapshot, (item) => item.layer === 'tauri-ipc'),
    stringify: operationCount(snapshot, (item) => item.operation === 'stringify' && item.key === careerPath),
    tempWrites: operationCount(snapshot, (item) => item.operation === 'write' && item.key.startsWith(`temp/${careerId}.json-`)),
    renames: operationCount(snapshot, (item) => item.operation === 'rename' && item.key.endsWith(`-> ${careerPath}`)),
  };
}

function fixedDateScope(iso, task) {
  const RealDate = globalThis.Date;
  const fixedMs = RealDate.parse(iso);
  class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixedMs])); }
    static now() { return fixedMs; }
  }
  globalThis.Date = FixedDate;
  return Promise.resolve().then(task).finally(() => { globalThis.Date = RealDate; });
}

setStorageProbeEnabledForTests(true);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { ActiveCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/adapters/ActiveCareerAdapter.js');
  const { GameRepository } = await vite.ssrLoadModule('/src/gameplay/repositories/GameRepository.js');
  const { CareerEntityRepository } = await vite.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');
  const transactionProbe = await vite.ssrLoadModule('/src/dev/persistenceTransactionProbe.js');

  class CountingManager {
    constructor(career) { this.disk = clone(career); this.saves = 0; this.failNextSave = false; this.commitOrder = []; }
    async getLastCareer() { return this.disk.career_id; }
    async loadCareer() { return clone(this.disk); }
    async readCareer() { return clone(this.disk); }
    async saveCareer(_id, career) {
      if (this.failNextSave) { this.failNextSave = false; throw new Error('commit failure'); }
      this.saves += 1;
      this.disk = clone(career);
      this.commitOrder.push(career.player?.coins);
      return clone(career);
    }
  }

  const baseCareer = {
    career_id: 'transaction-unit', metadata: {},
    player: { id: 'player', coins: 10 },
    entities: { Mission: [{ id: 'm1', progress: 0 }] },
  };
  const manager = new CountingManager(baseCareer);
  const adapter = new ActiveCareerAdapter(manager);
  adapter.setActiveCareer(baseCareer);
  const game = new GameRepository(adapter);
  const entities = new CareerEntityRepository(game);

  transactionProbe.resetPersistenceTransactionStats();
  await game.withPersistenceTransaction('unit-single-commit', async (transaction) => {
    await entities.update('Mission', 'm1', { progress: 1 });
    await game.updatePlayerProfile('player', { coins: 20 });
    await transaction.withTransaction('nested', async () => {
      await entities.create('Mission', { id: 'm2', progress: 0 });
    });
  });
  let txSnapshot = transactionProbe.getPersistenceTransactionSnapshot();
  gate('nested transaction produz um único commit físico', manager.saves === 1 && txSnapshot.last.physicalCommits === 1);
  gate('todas as mutações lógicas são contabilizadas', txSnapshot.last.logicalMutations === 3);
  gate('stages internos enxergam e confirmam o mesmo draft', manager.disk.player.coins === 20 && manager.disk.entities.Mission.length === 2);

  const savesBeforeClean = manager.saves;
  await game.withPersistenceTransaction('clean', async () => game.getPlayerProfile());
  txSnapshot = transactionProbe.getPersistenceTransactionSnapshot();
  gate('transação limpa não grava', manager.saves === savesBeforeClean && txSnapshot.last.skippedCleanCommit);

  const beforeRollback = clone(manager.disk);
  await assert.rejects(() => game.withPersistenceTransaction('rollback', async (transaction) => {
    await game.updatePlayerProfile('player', { coins: 999 });
    await transaction.withTransaction('inner-failure', async () => { throw new Error('stage failure'); });
  }), /stage failure/);
  gate('falha interna restaura memória e disco anteriores', assert.deepEqual(await game.getActiveCareer(), beforeRollback) === undefined && assert.deepEqual(manager.disk, beforeRollback) === undefined);
  gate('rollback encerra a transação', transactionProbe.getPersistenceTransactionSnapshot().active === null);

  manager.failNextSave = true;
  await assert.rejects(() => game.withPersistenceTransaction('commit-failure', async () => {
    await game.updatePlayerProfile('player', { coins: 777 });
  }), /commit failure/);
  gate('falha do commit não publica draft em memória', (await game.getPlayerProfile()).coins === beforeRollback.player.coins);
  gate('falha do commit preserva disco anterior', manager.disk.player.coins === beforeRollback.player.coins);

  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = game.withPersistenceTransaction('concurrent-1', async () => {
    await game.updatePlayerProfile('player', { coins: 30 });
    await firstGate;
  });
  const second = game.withPersistenceTransaction('concurrent-2', async () => {
    await game.updatePlayerProfile('player', { coins: 40 });
  });
  releaseFirst();
  await Promise.all([first, second]);
  gate('duas transações concorrentes são serializadas pela writeChain', manager.commitOrder.slice(-2).join(',') === '30,40');
  gate('não há commit fora de ordem nem write-after-rollback', manager.disk.player.coins === 40);

  // Protocolo físico: tmp/verify/backup/replace e recuperação em qualquer falha.
  const path = 'careers/failure.json';
  const oldRaw = '{"career_id":"failure","value":"old"}\n';
  const payload = { career_id: 'failure', value: 'new' };
  for (const failure of ['write', 'rename']) {
    const memory = new InstrumentedMemoryStorage();
    memory.files.set(path, oldRaw);
    memory.failure = failure;
    const storage = new GameStorage(memory);
    await assert.rejects(() => storage.writeJson(path, payload, {
      backup: true, crashRecovery: true, validate: false, caller: `failure-${failure}`,
    }));
    gate(`falha injetada em ${failure} preserva o save antigo`, memory.files.get(path) === oldRaw);
  }
  {
    const memory = new InstrumentedMemoryStorage();
    memory.files.set(path, oldRaw);
    memory.corruptNextTempWrite = true;
    const storage = new GameStorage(memory);
    await assert.rejects(() => storage.writeJson(path, payload, { backup: true, crashRecovery: true, validate: false }));
    gate('verify failure preserva save e limpa tmp inválido', memory.files.get(path) === oldRaw && ![...memory.files.keys()].some((key) => key.endsWith('.tmp.json')));
  }
  {
    const memory = new InstrumentedMemoryStorage();
    memory.files.set('temp/failure.json.rollback.json', oldRaw);
    const storage = new GameStorage(memory);
    gate('crash entre remove e rename recupera o save anterior', (await storage.readJson(path)).value === 'old');
  }
  {
    const memory = new InstrumentedMemoryStorage();
    memory.files.set(path, `${JSON.stringify(payload)}\n`);
    memory.files.set('temp/failure.json.rollback.json', oldRaw);
    const storage = new GameStorage(memory);
    gate('crash após rename mantém o save novo completo', (await storage.readJson(path)).value === 'new');
  }
  {
    const memory = new InstrumentedMemoryStorage();
    memory.files.set(path, oldRaw);
    const storage = new GameStorage(memory);
    const circular = { career_id: 'failure' }; circular.self = circular;
    await assert.rejects(() => storage.writeJson(path, circular, { backup: true, crashRecovery: true, validate: false }));
    gate('stringify failure preserva o save antigo', memory.files.get(path) === oldRaw);
  }

  // Checkpoint continua em storage independente mesmo durante uma transação de carreira.
  const checkpointMemory = new InstrumentedMemoryStorage();
  const checkpoints = new MatchCheckpointRepository(new GameStorage(checkpointMemory));
  let checkpointPersistedInside = false;
  await game.withPersistenceTransaction('checkpoint-independence', async () => {
    await game.updatePlayerProfile('player', { coins: 50 });
    await checkpoints.save('transaction-unit', {
      type: 'practice', match_id: 'match-1',
      engine_state: { pointNumber: 2, narration: [], teams: { A: [], B: [] }, finished: false },
    });
    checkpointPersistedInside = checkpointMemory.files.has('active-matches/transaction-unit.json');
  });
  gate('MatchCheckpoint permanece imediato e independente', checkpointPersistedInside);

  const savesBeforeIdempotency = manager.saves;
  const operations = [{ type: 'playerUpdate', id: 'player', data: { coins: 60 } }];
  const firstFinalization = await entities.batch(operations, { idempotencyKey: 'match-finalization:1' });
  const repeatedFinalization = await entities.batch(operations, { idempotencyKey: 'match-finalization:1' });
  gate('idempotency de finalização de partida permanece ativa', !firstFinalization.skipped && repeatedFinalization.skipped && manager.saves === savesBeforeIdempotency + 1);

  // Benchmark real: mesmo snapshot, mesma seed e mesma data fixa.
  const { GameStorage: ViteGameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter, gameRepository } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const {
    advanceCareerDay,
    advanceCareerDays,
    finalizeCareerAdvanceRange,
  } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { processGameStateDay } = await vite.ssrLoadModule('/src/game-core/gameStateLifecycle.js');
  const { createStageProfiler } = await vite.ssrLoadModule('/src/dev/performanceProbe.js');
  const { generateFictionalAthletes } = await vite.ssrLoadModule('/src/players/athleteGenerator.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const viteStorageProbe = await vite.ssrLoadModule('/src/dev/storageIOProbe.js');
  viteStorageProbe.setStorageProbeEnabledForTests(true);
  const benchmarkMemory = new InstrumentedMemoryStorage();
  benchmarkMemory.measureFn = viteStorageProbe.measureStorageOperation;
  const careerManager = new CareerManager(new CareerRepository(new ViteGameStorage(benchmarkMemory)));
  activeCareerAdapter.careerManager = careerManager;
  activeCareerAdapter.lastRoutineBackupAt = Date.now();
  activeCareerAdapter.lastIndexSyncAt = Date.now();
  const { career } = await careerManager.createCareer({ career_id: 'm3-7-benchmark', career_name: 'M3.7 Benchmark' });
  const careerId = career.career_id;
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'm3-7-player', sport_name: 'Benchmark', career_date: '2026-11-30', birth_date: '2001-01-01',
    energy: 70, fatigue: 35, morale: 65, form: 55, coins: 25000, xp: 8000,
    level: 'Amador', court_side: 'direita', play_style: 'controle', career_difficulty: 'hard',
  });
  const initial = await activeCareerAdapter.getActiveCareer({ cloneResult: false });
  initial.entities.AthleteProfile = generateFictionalAthletes({ count: 300, seed: 'm3-7-athletes' })
    .map((athlete, index) => ({ ...athlete, ranking_position: index + 1 }));
  initial.entities.CalendarEvent = [];
  await activeCareerAdapter.saveActiveCareer(initial);
  const initialSnapshot = clone(await activeCareerAdapter.getActiveCareer());
  const careerPath = `careers/${careerId}.json`;
  const originalSaveCareer = careerManager.saveCareer.bind(careerManager);
  let saveCallers = [];
  careerManager.saveCareer = async (...args) => {
    saveCallers.push(args[2]?.caller || 'unknown');
    return originalSaveCareer(...args);
  };

  async function runAdvance({ transactional }) {
    activeCareerAdapter.setActiveCareer(initialSnapshot);
    activeCareerAdapter.lastRoutineBackupAt = Date.now();
    activeCareerAdapter.lastIndexSyncAt = Date.now();
    benchmarkMemory.files.set(careerPath, `${JSON.stringify(initialSnapshot)}\n`);
    saveCallers = [];
    viteStorageProbe.resetStoragePerformanceStats();
    transactionProbe.resetPersistenceTransactionStats();
    const originalRandom = Math.random;
    Math.random = createSeededRandom(3701);
    let stageBreakdown = null;
    const startedAt = performance.now();
    try {
      const execute = async () => {
        const profile = await localGame.entities.PlayerProfile.get('m3-7-player');
        const core = await advanceCareerDay(profile, {
          deferGameState: true,
          deferGlobalProcessing: true,
          persistenceTransaction: false,
        });
        const profiler = createStageProfiler();
        const result = await processGameStateDay(core, profile.career_date, core.career_date, { profiler });
        stageBreakdown = profiler.finish();
        return result.profile || core;
      };
      await fixedDateScope('2030-01-02T03:04:05.000Z', () => (
        transactional
          ? gameRepository.withPersistenceTransaction('advance-day-benchmark', execute)
          : execute()
      ));
    } finally {
      Math.random = originalRandom;
    }
    return {
      career: clone(await activeCareerAdapter.getActiveCareer()),
      callers: [...saveCallers],
      storage: viteStorageProbe.getStoragePerformanceSnapshot(500),
      transaction: transactionProbe.getPersistenceTransactionSnapshot(),
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      stageBreakdown,
    };
  }

  const before = await runAdvance({ transactional: false });
  const after = await runAdvance({ transactional: true });
  const beforeCounts = mainSaveCounts(before.storage, careerId);
  const afterCounts = mainSaveCounts(after.storage, careerId);
  gate('advance-day real preserva estado final/determinismo', assert.deepEqual(after.career, before.career) === undefined);
  gate('logical mutations permanecem iguais antes/depois', after.transaction.last.logicalMutations === before.callers.length);
  gate('advance-day real cai para um commit principal', before.callers.length > 1 && after.callers.length === 1 && after.transaction.last.physicalCommits === 1);
  gate('advance-day real cai para um stringify/temp/rename', afterCounts.stringify === 1 && afterCounts.tempWrites === 1 && afterCounts.renames === 1);
  gate('primitivas de Storage caem drasticamente', afterCounts.primitiveCalls < beforeCounts.primitiveCalls);
  gate('storage do commit carrega id/nome/depth da transação', after.storage.operations.some((item) => item.transactionName === 'advance-day-benchmark' && item.transactionDepth === 1));

  async function countRealRangeCommits(days) {
    activeCareerAdapter.setActiveCareer(initialSnapshot);
    activeCareerAdapter.lastRoutineBackupAt = Date.now();
    activeCareerAdapter.lastIndexSyncAt = Date.now();
    benchmarkMemory.files.set(careerPath, `${JSON.stringify(initialSnapshot)}\n`);
    saveCallers = [];
    const originalRandom = Math.random;
    Math.random = createSeededRandom(3701);
    try {
      const startProfile = await localGame.entities.PlayerProfile.get('m3-7-player');
      const result = await fixedDateScope('2030-01-02T03:04:05.000Z', () => (
        advanceCareerDays(startProfile, days, { stopBeforeCriticalEvent: false })
      ));
      const commitsBeforeCompatibilityCall = saveCallers.length;
      await finalizeCareerAdvanceRange(result.profile, result.rangeStartDate, result.profile.career_date);
      return {
        daysAdvanced: result.daysAdvanced,
        commits: commitsBeforeCompatibilityCall,
        commitsAfterCompatibilityCall: saveCallers.length,
      };
    } finally {
      Math.random = originalRandom;
    }
  }

  const threeDayRange = await countRealRangeCommits(3);
  const sevenDayRange = await countRealRangeCommits(7);
  gate('+3 dias real confirma exatamente um commit por dia', threeDayRange.daysAdvanced === 3 && threeDayRange.commits === 3);
  gate('+7 dias real confirma exatamente um commit por dia', sevenDayRange.daysAdvanced === 7 && sevenDayRange.commits === 7);
  gate('finalizador legado de range detecta estado já processado e não duplica commit', threeDayRange.commitsAfterCompatibilityCall === 3 && sevenDayRange.commitsAfterCompatibilityCall === 7);

  const commitsBeforeThreeDays = manager.saves;
  for (let day = 0; day < 3; day += 1) {
    await game.withPersistenceTransaction(`multi-day:${day + 1}`, async () => {
      await game.updatePlayerProfile('player', { coins: 61 + day });
    });
  }
  gate('+3 dias usa uma transação/commit por dia', manager.saves - commitsBeforeThreeDays === 3);

  const beforeByCaller = Object.entries(before.callers.reduce((out, caller) => {
    out[caller] = (out[caller] || 0) + 1;
    return out;
  }, {})).sort((a, b) => b[1] - a[1]);
  const beforeByStage = Object.entries(before.storage.operations
    .filter((item) => item.operation === 'stringify' && item.key === careerPath)
    .reduce((out, item) => {
      const stage = item.transactionStage || 'core/unscoped';
      out[stage] = (out[stage] || 0) + item.count;
      return out;
    }, {})).sort((a, b) => b[1] - a[1]);
  console.log('\nM3.7 BENCHMARK ADVANCE-DAY (pipeline real, seed fixa)');
  console.log(JSON.stringify({
    before: { logicalMutations: before.callers.length, physicalCommits: before.callers.length, ...beforeCounts },
    after: { logicalMutations: after.transaction.last.logicalMutations, physicalCommits: after.transaction.last.physicalCommits, commitIOms: after.transaction.last.commitIOms, ...afterCounts },
    durationsMs: { before: before.durationMs, after: after.durationMs },
    beforeStages: before.stageBreakdown?.stageDetails,
    afterStages: after.stageBreakdown?.stageDetails,
    beforeByCaller,
    beforeByStage,
    afterLogicalByStage: after.transaction.last.stages,
  }, null, 2));

  console.log(`\n${gates} gates executados, todos PASS — Mobile M3.7 Transactional Persistence.`);
} finally {
  await vite.close();
  setStorageProbeEnabledForTests(null);
}
