// CLOUD-7B1 — benchmark A/B isolado: carregamento, avanço diário e gravação lógica sobre um save existente.
// Sem patches em structuredClone/JSON (ao contrário de profile-cloud-7b1-save-pipeline.mjs): só relógio.
// Rode o MESMO comando no commit-base (git worktree) e no commit otimizado, em processos separados e
// sem outra carga na máquina, alternando as execuções.
//
// Uso: node scripts/benchmark-cloud-7b1-ab.mjs --save=<save.json> [--storage=memory|tauri-mock] [--loads=5] [--days=10] [--writes=5]
//        [--label=base|7b1] [--output=<arquivo.json>]
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { installTauriMock } from './lib/cloud7b1TauriMock.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
if (!args.save) { console.error('Informe --save=<save.json>'); process.exit(1); }
const LOADS = Number(args.loads ?? 5); const DAYS = Number(args.days ?? 10); const WRITES = Number(args.writes ?? 5);
const STORAGE = args.storage || 'memory';
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const sum = (xs) => ({ n: xs.length, median: Number(pct(xs, 0.5).toFixed(1)), p95: Number(pct(xs, 0.95).toFixed(1)), min: xs.length ? Number(Math.min(...xs).toFixed(1)) : null, max: xs.length ? Number(Math.max(...xs).toFixed(1)) : null, samples: xs.map((x) => Number(x.toFixed(1))) });

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
function hashSeed(value) { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
let rng = hashSeed('7b1-ab');
Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; };
{ const RealDate = Date; let fake = new RealDate('2026-01-01T00:00:00.000Z').getTime();
  globalThis.Date = class DeterministicDate extends RealDate { constructor(...a) { if (a.length === 0) super((fake += 1000)); else super(...a); } static now() { return (fake += 1000); } }; }

function memoryBackend() {
  const files = new Map();
  return { files, isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
    async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'memória' };
}

const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await server.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');

  const mock = STORAGE === 'tauri-mock' ? installTauriMock() : null;
  const backend = mock ? null : memoryBackend();
  const manager = new CareerManager(new CareerRepository(mock ? new GameStorage() : new GameStorage(backend)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'Cloud 7B1 AB' });
  const external = JSON.parse(fs.readFileSync(path.resolve(String(args.save)), 'utf8'));
  external.career_id = career.career_id;
  await manager.saveCareer(career.career_id, external);
  const files = mock ? mock.files : backend.files;
  const saveBytes = files.get(`careers/${career.career_id}.json`).length;
  const profileId = external.player.id;
  const quiet = async (fn) => { const w = console.warn; const d = console.debug; console.warn = () => {}; console.debug = () => {}; try { return await fn(); } finally { console.warn = w; console.debug = d; } };

  // carregamento (abrir a carreira)
  const loadMs = [];
  mock?.reset();
  for (let i = 0; i < LOADS; i += 1) {
    activeCareerAdapter.clearActiveCareer();
    const t = performance.now();
    await quiet(() => activeCareerAdapter.getActiveCareer({ fresh: false }));
    loadMs.push(performance.now() - t);
  }
  const loadInvokes = mock ? { ...mock.counters.byCommand } : null;

  // avanço diário (caminho de produção do botão)
  let profile = await localGame.entities.PlayerProfile.get(profileId);
  const dayMs = [];
  mock?.reset();
  for (let i = 0; i < DAYS; i += 1) {
    const t = performance.now();
    await quiet(async () => { await advanceCareerDayOnce(profile); await waitForCareerDaySecondaryWork(); });
    dayMs.push(performance.now() - t);
    profile = await localGame.entities.PlayerProfile.get(profileId);
  }
  const dayInvokes = mock ? Object.fromEntries(Object.entries(mock.counters.byCommand).map(([k, v]) => [k, v / DAYS])) : null;

  // gravação lógica isolada (proxy do núcleo da finalização de partida: 1 lote = 1 gravação do save)
  const writeMs = [];
  for (let i = 0; i < WRITES; i += 1) {
    const t = performance.now();
    await quiet(() => localGame.entities.Post.create({ author_name: 'ab', content: `ab-${i}` }));
    writeMs.push(performance.now() - t);
  }
  const out = {
    label: args.label || null, storage: STORAGE, node: process.version, saveBytes, saveFile: path.basename(String(args.save)),
    loadMs: sum(loadMs), loadFirstMs: loadMs.length ? Number(loadMs[0].toFixed(1)) : null, dayMs: sum(dayMs), writeMs: sum(writeMs), tauriInvokesPerDay: dayInvokes, tauriInvokesPerLoadTotal: loadInvokes,
  };
  if (args.output) { fs.mkdirSync(path.dirname(path.resolve(String(args.output))), { recursive: true }); fs.writeFileSync(path.resolve(String(args.output)), JSON.stringify(out, null, 2)); }
  console.log(JSON.stringify({ ...out, loadMs: { median: out.loadMs.median }, dayMs: { median: out.dayMs.median, p95: out.dayMs.p95 }, writeMs: { median: out.writeMs.median } }));
} finally {
  await server.close();
}
