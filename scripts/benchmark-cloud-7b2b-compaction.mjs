// CLOUD-7B2B — A/B de tamanho e custo de persistência: formato expandido (baseline) × compacto.
// Mesmo save, mesma máquina, repetições alternadas. Mede só Node (backend em memória): não é Tauri nem Android.
// Uso: node scripts/benchmark-cloud-7b2b-compaction.mjs --save=<save.json> [--runs=9] [--output=<arquivo.json>]
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const RUNS = Number(args.runs) || 9;
const text = fs.readFileSync(args.save, 'utf8');
const original = JSON.parse(text);
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const stat = (xs) => ({ median: Number(pct(xs, 0.5).toFixed(1)), p95: Number(pct(xs, 0.95).toFixed(1)) });

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const codec = await vite.ssrLoadModule('/src/careers/tournamentHistoryCodec.js');
  const files = new Map();
  const backend = {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); }, async readText(p) { return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(a, b) { files.set(b, files.get(a)); return b; }, async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
    async list() { return []; }, async stat(p) { return { size: files.get(p)?.length || 0 }; }, getDataDirectoryDescription: () => 'memória',
  };
  const repo = new CareerRepository(new GameStorage(backend));
  const careerId = original.career_id;
  const path = `careers/${careerId}.json`;
  const tournaments = original.entities.Tournament;
  const finished = tournaments.filter((t) => t.status === 'finalizado');
  const settled = finished.filter(codec.isTournamentSettled);

  const out = { save: args.save, runs: RUNS, nodeVersion: process.version, tournaments: tournaments.length, finished: finished.length, settled: settled.length, modes: {} };
  const samples = { off: { write: [], load: [], pack: [], clone: [] }, on: { write: [], load: [], pack: [], clone: [] } };
  for (let run = 0; run < RUNS + 1; run += 1) { // 1ª rodada = aquecimento, descartada
    for (const mode of run % 2 ? ['off', 'on'] : ['on', 'off']) {
      const compactHistory = mode === 'on';
      const state = structuredClone(original);
      let t0 = performance.now();
      await repo.writeCareer(careerId, state, { compactHistory, backup: false, validated: true });
      const write = performance.now() - t0;
      t0 = performance.now();
      const loaded = await repo.readCareer(careerId);
      const load = performance.now() - t0;
      t0 = performance.now();
      codec.packCareerForStorage(state);
      const pack = compactHistory ? performance.now() - t0 : 0;
      t0 = performance.now();
      structuredClone(loaded);
      const cloneMs = performance.now() - t0;
      if (run > 0) { samples[mode].write.push(write); samples[mode].load.push(load); samples[mode].pack.push(pack); samples[mode].clone.push(cloneMs); }
      out.modes[mode] = { bytes: files.get(path).length, equivalentAfterLoad: JSON.stringify({ ...loaded, last_played_at: 0 }) === JSON.stringify({ ...original, last_played_at: 0 }) };
    }
  }
  for (const mode of ['off', 'on']) for (const k of Object.keys(samples[mode])) out.modes[mode][`${k}Ms`] = stat(samples[mode][k]);
  out.sizeReductionPct = Number(((1 - out.modes.on.bytes / out.modes.off.bytes) * 100).toFixed(2));
  const finBytes = (list) => JSON.stringify(list).length;
  out.finishedTournamentBytes = { before: finBytes(finished), after: finBytes(codec.packCareerForStorage({ entities: { Tournament: finished } }).entities.Tournament) };
  out.tournamentEntityShareOfSavePct = Number((JSON.stringify(tournaments).length / text.length * 100).toFixed(1));
  fs.writeFileSync(args.output || 'reports/cloud-phase-7b2b-historical-compaction/data/ab.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
} finally { await vite.close(); }
