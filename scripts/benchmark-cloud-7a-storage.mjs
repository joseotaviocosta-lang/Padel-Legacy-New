// CLOUD-7A — custo de gravar/ler um save completo pelo GameStorage real, por backend:
//   memória (isola serialização + validação + protocolo de escrita atômica)
//   IndexedDB (BrowserStorage sobre fake-indexeddb; a implementação fake é MAIS LENTA que a do Chrome,
//   então serve para contar operações/bytes e comparar proporções, não para prever tempos reais)
// O backend Tauri (TauriStorage -> IPC + disco do Android/Windows) NÃO é executável fora do app:
// aqui só se contam as operações/bytes que ele receberia (iguais às do backend em memória).
//
// Uso: node scripts/benchmark-cloud-7a-storage.mjs --save=<arquivo.json> [--runs=7]
//        [--output=reports/cloud-phase-7a-performance-audit/data/storage.json]
import 'fake-indexeddb/auto';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
if (!args.save) { console.error('Informe --save=<arquivo.json> (gerado por benchmark-cloud-7a-career-growth.mjs --dumpSave=...)'); process.exit(1); }
const RUNS = Number(args.runs) || 7;
const OUTPUT = args.output || 'reports/cloud-phase-7a-performance-audit/data/storage.json';
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const r2 = (n) => Number(n.toFixed(2));
const summary = (xs) => ({ n: xs.length, median: r2(pct(xs, 0.5)), p95: r2(pct(xs, 0.95)), max: r2(Math.max(0, ...xs)) });

const raw = fs.readFileSync(path.resolve(String(args.save)), 'utf8');
const payload = JSON.parse(raw);
const rawBytes = Buffer.byteLength(raw);

function counting(storage) {
  const ops = { writeText: 0, readText: 0, copy: 0, rename: 0, remove: 0, exists: 0, writeBytes: 0, readBytes: 0 };
  return new Proxy(storage, {
    get(target, prop) {
      if (prop === 'ops') return ops;
      if (prop === 'reset') return () => Object.keys(ops).forEach((k) => { ops[k] = 0; });
      const value = target[prop];
      if (typeof value !== 'function') return value;
      return async (...a) => {
        if (prop in ops) ops[prop] += 1;
        const result = await value.apply(target, a);
        if (prop === 'writeText') ops.writeBytes += String(a[1]).length;
        if (prop === 'readText') ops.readBytes += String(result).length;
        return result;
      };
    },
  });
}

function memoryBackend() {
  const files = new Map();
  return {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(a, b) { files.set(b, files.get(a)); return b; },
    async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
    async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; },
    getDataDirectoryDescription: () => 'memória',
  };
}

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { BrowserStorage } = await vite.ssrLoadModule('/src/storage/BrowserStorage.js');

  const cpu = { stringify: [], parse: [] };
  for (let i = 0; i < RUNS; i += 1) {
    let t = performance.now(); const s = JSON.stringify(payload); cpu.stringify.push(performance.now() - t);
    t = performance.now(); JSON.parse(s); cpu.parse.push(performance.now() - t);
  }

  const backends = {
    memoria: () => counting(memoryBackend()),
    indexeddb_fake: () => counting(new BrowserStorage()),
  };
  const result = { environment: { node: process.version, platform: process.platform, saveBytes: rawBytes, runs: RUNS }, jsonCpuMs: { stringify: summary(cpu.stringify), parse: summary(cpu.parse) }, backends: {} };

  for (const [name, make] of Object.entries(backends)) {
    const counted = make();
    const gs = new GameStorage(counted);
    await gs.initialize();
    const key = 'careers/bench-7a.json';
    const writes = []; const firstWrite = {}; const readsMs = [];
    // primeira escrita (sem destino prévio => sem backup) e escritas seguintes (com backup do save anterior)
    counted.reset();
    let t = performance.now(); await gs.writeJson(key, payload, { caller: 'bench7a' }); writes.push(performance.now() - t);
    firstWrite.ops = { ...counted.ops };
    const steady = [];
    for (let i = 0; i < RUNS; i += 1) {
      counted.reset();
      t = performance.now(); await gs.writeJson(key, payload, { caller: 'bench7a' }); writes.push(performance.now() - t);
      steady.push({ ...counted.ops });
    }
    for (let i = 0; i < RUNS; i += 1) { t = performance.now(); await gs.readJson(key); readsMs.push(performance.now() - t); }
    result.backends[name] = {
      firstWriteMs: r2(writes[0]), firstWriteOps: firstWrite.ops,
      steadyWriteMs: summary(writes.slice(1)), steadyWriteOps: steady.at(-1),
      readJsonMs: summary(readsMs),
      amplification: { bytesWrittenPerSave: steady.at(-1).writeBytes, bytesReadPerSave: steady.at(-1).readBytes, ratioWrittenToSave: r2(steady.at(-1).writeBytes / rawBytes) },
    };
    console.log(name, JSON.stringify(result.backends[name].steadyWriteMs), JSON.stringify(result.backends[name].steadyWriteOps));
  }
  fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUTPUT), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 1));
} finally {
  await vite.close();
}
