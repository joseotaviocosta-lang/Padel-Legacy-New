// CLOUD-7B2A — kit de reprodução/diagnóstico de determinismo. Só testes/diagnóstico; nada aqui entra no jogo.
// Uma "execução" = uma carreira nova (CareerManager + memória) avançada dia a dia pelo caminho de produção,
// com Math.random semeado, Date e crypto.randomUUID determinísticos. Checkpoints por dia: hash por coleção do save.
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

export const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 16);
export function hashSeed(value) { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// Serialização canônica: chaves de objeto ordenadas; ordem de arrays preservada (ordem de array é contratual aqui).
export function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]));
  return v;
}

export function installEnv(seed, { clockStart = '2026-01-01T00:00:00.000Z' } = {}) {
  const orig = globalThis.__7b2aOrig || (globalThis.__7b2aOrig = { random: Math.random, Date, uuid: Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID') || null });
  let rng = hashSeed(seed);
  Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; };
  const RealDate = orig.Date;
  let fake = new RealDate(clockStart).getTime() + (hashSeed(seed) % 100000);
  const tick = () => { fake += 1000; return fake; };
  globalThis.__7b2aClock = { get: () => fake, set: (v) => { fake = v; } };
  globalThis.Date = class DeterministicDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(tick()); else super(...a); }
    static now() { return tick(); }
  };
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, writable: true, value: () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}` });
}
export function restoreEnv() {
  const o = globalThis.__7b2aOrig; if (!o) return;
  Math.random = o.random; globalThis.Date = o.Date;
  if (o.uuid) Object.defineProperty(globalThis.crypto, 'randomUUID', o.uuid);
}

export function memoryBackend() {
  const files = new Map();
  return { files, isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
    async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'memória' };
}

export async function openServer() {
  globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
  globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
  const mods = {};
  const load = async (k, p) => { mods[k] = await server.ssrLoadModule(p); };
  await load('storage', '/src/storage/GameStorage.js'); await load('repo', '/src/careers/CareerRepository.js'); await load('mgr', '/src/careers/CareerManager.js');
  await load('rt', '/src/gameplay/services/runtime.js'); await load('lg', '/src/api/localGameClient.js'); await load('day', '/src/game-core/dayAdvanceCoordinator.js'); await load('bots', '/src/lib/bots.js'); await load('ent', '/src/gameplay/repositories/CareerEntityRepository.js');
  return { server, mods };
}

const quiet = async (fn) => { const w = console.warn; const d = console.debug; const l = console.log; console.warn = () => {}; console.debug = () => {}; try { return await fn(); } finally { console.warn = w; console.debug = d; console.log = l; } };

export function resetSharedState({ rt, ent }) {
  ent.resetIdCollisionSequence();
  const a = rt.activeCareerAdapter;
  a.clearActiveCareer(); a.lastRoutineBackupAt = 0; a.lastIndexSyncAt = 0; a.writeChain = Promise.resolve(); a.pendingWriteCount = 0; a.activePersistenceTransaction = null;
}

// Cria uma carreira e devolve um "runner" com advance(), checkpoints e acesso ao save.
export async function createRun({ mods }, { seed, name = 'Cloud 7B2A', backend = memoryBackend(), loadText = null, isolate = true } = {}) {
  installEnv(seed);
  const { GameStorage } = mods.storage; const { CareerRepository } = mods.repo; const { CareerManager } = mods.mgr;
  const { activeCareerAdapter } = mods.rt; const { localGame } = mods.lg; const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = mods.day;
  const manager = new CareerManager(new CareerRepository(new GameStorage(backend)));
  activeCareerAdapter.careerManager = manager;
  // Isolamento: `activeCareerAdapter` é singleton e guarda limitadores baseados em Date.now() (backup de rotina 5 min,
  // sync do índice 15 s). Com o mesmo seed o career_id se repete, então o estado da execução anterior vazaria.
  if (isolate) resetSharedState(mods);
  const { career } = await manager.createCareer({ playerName: name });
  let profileId = 'c7b2a-player';
  if (loadText) {
    const external = JSON.parse(loadText); external.career_id = career.career_id;
    await manager.saveCareer(career.career_id, external);
    activeCareerAdapter.clearActiveCareer();
    activeCareerAdapter.setActiveCareer(await manager.loadCareer(career.career_id));
    profileId = external.player.id;
  } else {
    activeCareerAdapter.setActiveCareer(career);
    const partner = mods.bots.BOTS_BY_DIFFICULTY.iniciante[0];
    await activeCareerAdapter.createPlayerProfile({
      id: profileId, sport_name: name, career_date: '2026-01-05', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle', court_side: 'direita',
      energy: 100, fatigue: 0, coins: 20000, xp: 0, morale: 70, form: 50, partner_id: partner.id, weekly_training_enabled: false,
    });
  }
  const careerId = (await activeCareerAdapter.getActiveCareer({ fresh: true })).career_id;
  const run = { backend, manager, careerId, day: 0, profile: await localGame.entities.PlayerProfile.get(profileId), blocked: [] };
  const key = () => [...backend.files.keys()].find((k) => k.includes(careerId) && !k.includes('backup') && k.endsWith('.json'));
  run.saveText = () => backend.files.get(key());
  run.advance = async () => {
    const before = run.profile.career_date;
    try {
      await quiet(async () => { await advanceCareerDayOnce(run.profile); await waitForCareerDaySecondaryWork(); });
    } catch (e) { run.blocked.push({ day: run.day + 1, error: String(e?.message || e).slice(0, 120) }); }
    run.profile = await localGame.entities.PlayerProfile.get(profileId);
    run.day += 1;
    return run.profile.career_date !== before;
  };
  // Resumo por coleção: hash canônico por coleção e contagem. `career_id` e metadados de gravação são excluídos dos hashes de nível raiz.
  run.checkpoint = () => summarizeSave(JSON.parse(run.saveText()));
  // A recarga lê/grava metadados e consumiria ticks do relógio simulado; restaura-se o relógio para manter as mesmas condições do contínuo.
  run.reload = async () => { const clock = globalThis.__7b2aClock.get(); activeCareerAdapter.clearActiveCareer(); const loaded = await quiet(() => manager.loadCareer(careerId)); activeCareerAdapter.setActiveCareer(loaded.career || loaded); run.profile = await localGame.entities.PlayerProfile.get(profileId); globalThis.__7b2aClock.set(clock); };
  return run;
}

export function summarizeSave(save) {
  const out = {};
  const walk = (obj, prefix) => {
    for (const k of Object.keys(obj).sort()) {
      const v = obj[k]; const p = prefix ? `${prefix}.${k}` : k;
      if (Array.isArray(v)) out[p] = { n: v.length, h: sha(canon(v)) };
      else if (v && typeof v === 'object' && prefix.split('.').length < 2 && Object.keys(v).length > 0 && Object.values(v).some((x) => Array.isArray(x))) walk(v, p);
      else if (v && typeof v === 'object') out[p] = { n: Object.keys(v).length, h: sha(canon(v)) };
      else out[p] = { n: 1, h: sha(String(v)) };
    }
  };
  walk(save, '');
  return out;
}
export function firstDiff(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}
// Única exceção justificada: `generation.durationMs` do AnnualCareerReport é medição de performance.now() (metadado de telemetria, não estado de jogo).
export function stripTelemetry(save) {
  for (const r of save.entities?.AnnualCareerReport || []) if (r?.generation) delete r.generation.durationMs;
  return save;
}
export function canonicalSave(text) { return sha(canon(stripTelemetry(JSON.parse(text)))); }
