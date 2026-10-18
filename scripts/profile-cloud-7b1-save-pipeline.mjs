// CLOUD-7B1 — instrumentação reproduzível do pipeline de persistência (somente diagnóstico; opt-in).
// Substitui, APENAS dentro deste processo de teste, structuredClone / JSON.stringify / JSON.parse por
// wrappers que contam chamadas, tempo e bytes e atribuem cada chamada ao primeiro frame de `src/`.
// O código de produção não é modificado e nada disso existe fora deste script.
//   FULL_SAVE = valor com `career_id` + `entities` (a carreira inteira).
//
// Uso: node scripts/profile-cloud-7b1-save-pipeline.mjs [--warm=365] [--days=14] [--seed=7b1] [--fakeClock]
//        [--storage=tauri-mock] (usa o TauriStorage real sobre um invoke simulado em memória)
//        [--loadSave=<save.json>] (parte de um save existente; use --warm=0)
//        [--output=reports/cloud-phase-7b1-save-pipeline/data/pipeline-ops.json]
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { installTauriMock } from './lib/cloud7b1TauriMock.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const WARM = Number(args.warm ?? 365);
const DAYS = Number(args.days ?? 14);
const SEED = String(args.seed || '7b1');
const OUTPUT = args.output || 'reports/cloud-phase-7b1-save-pipeline/data/pipeline-ops.json';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
function hashSeed(value) { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
let rng = hashSeed(SEED);
Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; };
if (args.fakeClock) {
  const RealDate = Date;
  let fake = new RealDate('2026-01-01T00:00:00.000Z').getTime() + (hashSeed(SEED) % 100000);
  const tick = () => { fake += 1000; return fake; };
  globalThis.Date = class DeterministicDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(tick()); else super(...a); }
    static now() { return tick(); }
  };
}

// ---------- wrappers ----------
let probing = false;
const sites = new Map();
const totals = { clone: { n: 0, ms: 0, fullN: 0, fullMs: 0 }, stringify: { n: 0, ms: 0, bytes: 0, fullN: 0, fullMs: 0, fullBytes: 0 }, parse: { n: 0, ms: 0, bytes: 0, fullN: 0, fullMs: 0 } };
const isFull = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.career_id === 'string' && v.entities && typeof v.entities === 'object';
function site() {
  const lines = new Error().stack.split('\n').slice(2);
  const out = [];
  for (const line of lines) {
    if (!line.includes('/src/')) continue;
    const m = line.match(/at (?:async )?(?:(\S+) \()?.*\/src\/([^:)]+):(\d+)/);
    if (m) out.push(`${m[1] && m[1] !== 'Object.<anonymous>' ? `${m[1]} ` : ''}${m[2]}:${m[3]}`);
    if (out.length >= 3) break;
  }
  return out.join(' < ') || '(fora de src)';
}
function record(op, full, ms, bytes) {
  const t = totals[op];
  t.n += 1; t.ms += ms; if (bytes) t.bytes += bytes;
  if (full) { t.fullN += 1; t.fullMs += ms; if (bytes && 'fullBytes' in t) t.fullBytes += bytes; }
  const key = `${op}${full ? ' [FULL_SAVE]' : ''} @ ${site()}`;
  const s = sites.get(key) || { op, full, site: key, n: 0, ms: 0, bytes: 0 };
  s.n += 1; s.ms += ms; s.bytes += bytes || 0;
  sites.set(key, s);
}
const realClone = globalThis.structuredClone;
const realStringify = JSON.stringify;
const realParse = JSON.parse;
globalThis.structuredClone = function patchedClone(value, ...rest) {
  if (!probing) return realClone(value, ...rest);
  const full = isFull(value);
  const t = performance.now();
  const result = realClone(value, ...rest);
  const ms = performance.now() - t;
  probing = false; record('clone', full, ms, 0); probing = true;
  return result;
};
JSON.stringify = function patchedStringify(value, ...rest) {
  if (!probing) return realStringify(value, ...rest);
  const full = isFull(value);
  const t = performance.now();
  const result = realStringify(value, ...rest);
  const ms = performance.now() - t;
  probing = false; record('stringify', full, ms, typeof result === 'string' ? result.length : 0); probing = true;
  return result;
};
JSON.parse = function patchedParse(text, ...rest) {
  if (!probing) return realParse(text, ...rest);
  const t = performance.now();
  const result = realParse(text, ...rest);
  const ms = performance.now() - t;
  const full = typeof text === 'string' && text.length > 1_000_000 && isFull(result);
  probing = false; record('parse', full, ms, typeof text === 'string' ? text.length : 0); probing = true;
  return result;
};

// TextEncoder.encode: usado só para MÉTRICA de bytes pelo código de armazenamento (GameStorage/TauriStorage).
const encTotals = { n: 0, ms: 0, chars: 0 };
const realEncode = TextEncoder.prototype.encode;
TextEncoder.prototype.encode = function patchedEncode(input) {
  if (!probing) return realEncode.call(this, input);
  const t = performance.now();
  const out = realEncode.call(this, input);
  const ms = performance.now() - t;
  if (typeof input === 'string' && input.length > 100_000) {
    probing = false; encTotals.n += 1; encTotals.ms += ms; encTotals.chars += input.length;
    const key = `encode @ ${site()}`;
    const e = sites.get(key) || { op: 'encode', full: false, site: key, n: 0, ms: 0, bytes: 0 };
    e.n += 1; e.ms += ms; e.bytes += input.length; sites.set(key, e);
    probing = true;
  }
  return out;
};

const io = { writeText: 0, readText: 0, copy: 0, rename: 0, remove: 0, exists: 0, writeBytes: 0, readBytes: 0 };
function storage() {
  const files = new Map();
  return {
    files, isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { if (probing) { io.writeText += 1; io.writeBytes += String(c).length; } files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } const s = files.get(p); if (probing) { io.readText += 1; io.readBytes += s.length; } return s; },
    async exists(p) { if (probing) io.exists += 1; return files.has(p); }, async remove(p) { if (probing) io.remove += 1; return files.delete(p); },
    async copy(a, b) { if (probing) io.copy += 1; files.set(b, files.get(a)); return b; },
    async rename(a, b) { if (probing) io.rename += 1; files.set(b, files.get(a)); files.delete(a); return b; },
    async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; },
    getDataDirectoryDescription: () => 'memória',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await server.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { BOTS_BY_DIFFICULTY } = await server.ssrLoadModule('/src/lib/bots.js');

  const tauriMock = args.storage === 'tauri-mock' ? installTauriMock() : null;
  const memStorage = tauriMock ? null : storage();
  const manager = new CareerManager(new CareerRepository(tauriMock ? new GameStorage() : new GameStorage(memStorage)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'Cloud 7B1' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'c7b-player', sport_name: 'Cloud 7B1', career_date: '2026-01-05', birth_date: '2001-01-01', level: 'Amador', play_style: 'controle',
    court_side: 'direita', energy: 100, fatigue: 0, coins: 20000, xp: 0, morale: 70, form: 50, partner_id: BOTS_BY_DIFFICULTY.iniciante[0].id, weekly_training_enabled: false,
  });
  let profileId = 'c7b-player';
  if (args.loadSave) {
    // Carrega um save gerado ANTES da alteração (ex.: dump da CLOUD-7A) sobre a carreira recém-criada.
    const external = JSON.parse(fs.readFileSync(path.resolve(String(args.loadSave)), 'utf8'));
    const currentId = (await activeCareerAdapter.getActiveCareer({ fresh: true })).career_id;
    external.career_id = currentId;
    await manager.saveCareer(currentId, external);
    activeCareerAdapter.clearActiveCareer();
    const reloaded = await manager.loadCareer(currentId);
    activeCareerAdapter.setActiveCareer(reloaded.career || reloaded);
    profileId = external.player.id;
  }
  let profile = await localGame.entities.PlayerProfile.get(profileId);
  const step = async () => {
    await advanceCareerDayOnce(profile);
    await waitForCareerDaySecondaryWork();
    profile = await localGame.entities.PlayerProfile.get(profileId);
  };
  for (let i = 0; i < WARM; i += 1) await step();
  const fileMap = tauriMock ? tauriMock.files : memStorage.files;
  const saveKey = [...fileMap.keys()].find((k) => k.startsWith('careers/') && k.endsWith('.json') && !k.includes('backup'));
  const saveBytes = saveKey ? fileMap.get(saveKey).length : null;

  const dayMs = [];
  tauriMock?.reset();
  probing = true;
  for (let i = 0; i < DAYS; i += 1) {
    const t = performance.now();
    await step();
    dayMs.push(performance.now() - t);
  }
  probing = false;
  // ---- fase de carregamento (abrir a carreira: caminho getActiveCareer -> CareerManager.loadCareer) ----
  const daySites = new Map(sites);
  const dayTotals = JSON.parse(JSON.stringify(totals));
  const dayEnc = { ...encTotals };
  sites.clear();
  for (const t of Object.values(totals)) for (const k of Object.keys(t)) t[k] = 0;
  encTotals.n = 0; encTotals.ms = 0; encTotals.chars = 0;
  const LOADS = Number(args.loads ?? 3);
  const loadMs = [];
  tauriMock?.reset();
  probing = true;
  for (let i = 0; i < LOADS; i += 1) {
    activeCareerAdapter.clearActiveCareer();
    const t = performance.now();
    await activeCareerAdapter.getActiveCareer({ fresh: false });
    loadMs.push(performance.now() - t);
  }
  probing = false;
  const perLoad = (x) => Number((x / LOADS).toFixed(2));
  const loadSites = [...sites.values()].sort((a, b) => b.ms - a.ms).slice(0, 12).map((x) => ({ ...x, ms: Number(x.ms.toFixed(1)), perLoadN: perLoad(x.n), perLoadMs: perLoad(x.ms) }));
  const loadReport = {
    loadMsMedian: Number([...loadMs].sort((a, b) => a - b)[Math.floor(loadMs.length / 2)].toFixed(1)), loads: LOADS,
    structuredClone: { calls: perLoad(totals.clone.n), ms: perLoad(totals.clone.ms), fullSaveCalls: perLoad(totals.clone.fullN), fullSaveMs: perLoad(totals.clone.fullMs) },
    stringify: { calls: perLoad(totals.stringify.n), ms: perLoad(totals.stringify.ms) },
    parse: { calls: perLoad(totals.parse.n), ms: perLoad(totals.parse.ms), fullSaveCalls: perLoad(totals.parse.fullN), bytes: perLoad(totals.parse.bytes) },
    textEncoderLarge: { calls: perLoad(encTotals.n), ms: perLoad(encTotals.ms) },
    tauriInvokes: tauriMock ? Object.fromEntries(Object.entries(tauriMock.counters.byCommand).map(([k, v]) => [k, perLoad(v)])) : null,
    topSites: loadSites,
  };
  sites.clear(); daySites.forEach((v, k) => sites.set(k, v));
  Object.assign(totals.clone, dayTotals.clone); Object.assign(totals.stringify, dayTotals.stringify); Object.assign(totals.parse, dayTotals.parse);
  Object.assign(encTotals, dayEnc);
  const per = (x) => Number((x / DAYS).toFixed(2));
  const top = [...sites.values()].sort((a, b) => b.ms - a.ms).slice(0, 25).map((s) => ({ ...s, ms: Number(s.ms.toFixed(1)), perDayN: per(s.n), perDayMs: per(s.ms) }));
  const report = {
    environment: { node: process.version, warmDays: WARM, measuredDays: DAYS, saveBytesBeforeProbe: saveBytes, seed: SEED, fakeClock: Boolean(args.fakeClock), storage: tauriMock ? 'TauriStorage real + invoke simulado' : 'memória' },
    perDay: {
      dayMsMedian: Number([...dayMs].sort((a, b) => a - b)[Math.floor(dayMs.length / 2)].toFixed(1)),
      structuredClone: { calls: per(totals.clone.n), ms: per(totals.clone.ms), fullSaveCalls: per(totals.clone.fullN), fullSaveMs: per(totals.clone.fullMs) },
      stringify: { calls: per(totals.stringify.n), ms: per(totals.stringify.ms), fullSaveCalls: per(totals.stringify.fullN), fullSaveMs: per(totals.stringify.fullMs), fullSaveBytes: per(totals.stringify.fullBytes), bytes: per(totals.stringify.bytes) },
      textEncoderLarge: { calls: per(encTotals.n), ms: per(encTotals.ms), chars: per(encTotals.chars) },
      parse: { calls: per(totals.parse.n), ms: per(totals.parse.ms), fullSaveCalls: per(totals.parse.fullN), bytes: per(totals.parse.bytes) },
      storageOps: tauriMock ? Object.fromEntries(Object.entries(tauriMock.counters.byCommand).map(([k, v]) => [k, per(v)])) : Object.fromEntries(Object.entries(io).map(([k, v]) => [k, per(v)])),
    },
    load: loadReport,
    topSitesByMs: top,
  };
  fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUTPUT), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.perDay, null, 1));
  console.log('LOAD', JSON.stringify({ ...loadReport, topSites: undefined }));
  for (const x of loadSites.slice(0, 8)) console.log(`   load ${String(x.perLoadMs).padStart(8)} ms  ${String(x.perLoadN).padStart(5)} calls  ${x.site}`);
  for (const s of top.slice(0, 12)) console.log(`${String(s.perDayMs).padStart(8)} ms/dia  ${String(s.perDayN).padStart(8)} calls/dia  ${s.site}`);
} finally {
  TextEncoder.prototype.encode = realEncode; globalThis.structuredClone = realClone; JSON.stringify = realStringify; JSON.parse = realParse;
  await server.close();
}
