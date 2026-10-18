// CLOUD-7A — crescimento de custo do avanço de calendário e do save ao longo das temporadas.
// Avança dia a dia, pelo caminho de produção do botão "Avançar" (advanceCareerDayOnce, transação única),
// uma carreira real criada pelo CareerManager, com armazenamento em memória INSTRUMENTADO
// (conta escritas/leituras/bytes e tempo de I/O) e Math.random determinístico.
// Apenas mede; não altera nenhum módulo de produção. O jogador não se inscreve em torneios
// (o mundo/IA, mercado, rankings e eventos continuam rodando).
//
// Uso: node scripts/benchmark-cloud-7a-career-growth.mjs [--days=365] [--seed=7a] [--sample=30]
//        [--reloadAt=365,1825] [--output=reports/cloud-phase-7a-performance-audit/data/growth.json]
//        [--storage=tauri-mock] (CLOUD-7B1: TauriStorage real sobre invoke simulado; padrão = memória instrumentada)
//        [--dumpAt=365,1825 --dumpDir=<dir>] (grava o save nesses dias; para os benchmarks A/B por tamanho)
//        [--fakeClock] [--dumpSave=<arquivo>] (grava o JSON final do save, para os benchmarks de armazenamento; não versionar)
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { installTauriMock } from './lib/cloud7b1TauriMock.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value === undefined ? true : value];
}));
const DAYS = Number(args.days) || 365;
const SEED = String(args.seed || '7a');
const SAMPLE = Number(args.sample) || 30;
const DUMP_AT = new Set(String(args.dumpAt || '').split(',').filter(Boolean).map(Number));
const RELOAD_AT = new Set(String(args.reloadAt || '').split(',').filter(Boolean).map(Number));
const OUTPUT = args.output || 'reports/cloud-phase-7a-performance-audit/data/growth.json';
const START = args.date || '2026-01-05';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

function hashSeed(value) { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
let rng = hashSeed(SEED);
Math.random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32; };

// --fakeClock: relógio determinístico (mesmo padrão de installDeterminism em audit-real-athletes-simulation.mjs).
// Os ids de entidade usam Date.now() e alimentam o hash FNV de selectPair; sem isso, duas execuções
// com a mesma seed divergem (comportamento pré-existente, documentado na CLOUD-5).
if (args.fakeClock) {
  const RealDate = Date;
  let fake = new RealDate('2026-01-01T00:00:00.000Z').getTime() + (hashSeed(SEED) % 100000);
  const tick = () => { fake += 1000; return fake; };
  globalThis.Date = class DeterministicDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(tick()); else super(...a); }
    static now() { return tick(); }
  };
  // career_id vem de crypto.randomUUID(); sem fixá-lo a execução não é reprodutível (CLOUD-7B1).
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, writable: true, value: () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}` });
}

const sorted = (xs) => [...xs].sort((a, b) => a - b);
const pct = (xs, p) => { const s = sorted(xs); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const r2 = (n) => Number(n.toFixed(2));
const stats = (xs) => ({ n: xs.length, median: r2(pct(xs, 0.5)), p95: r2(pct(xs, 0.95)), max: r2(Math.max(0, ...xs)), total: r2(xs.reduce((a, b) => a + b, 0)) });

const io = { writes: 0, writeBytes: 0, writeMs: 0, reads: 0, readBytes: 0, readMs: 0, copies: 0, renames: 0 };
const resetIo = () => Object.keys(io).forEach((k) => { io[k] = 0; });
function createInstrumentedStorage() {
  const files = new Map();
  return {
    files,
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { const t = performance.now(); const s = String(c); files.set(p, s); io.writes += 1; io.writeBytes += s.length; io.writeMs += performance.now() - t; },
    async readText(p) { const t = performance.now(); if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } const s = files.get(p); io.reads += 1; io.readBytes += s.length; io.readMs += performance.now() - t; return s; },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(a, b) { io.copies += 1; files.set(b, files.get(a)); return b; },
    async rename(a, b) { io.renames += 1; files.set(b, files.get(a)); files.delete(a); return b; },
    async list() { return [...files.keys()]; }, async stat(p) { return { size: files.get(p)?.length || 0 }; },
    getDataDirectoryDescription: () => 'memória instrumentada',
  };
}

const dupes = (ids) => ids.length - new Set(ids).size;
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
  const storage = tauriMock ? { files: tauriMock.files } : createInstrumentedStorage();
  const manager = new CareerManager(new CareerRepository(tauriMock ? new GameStorage() : new GameStorage(storage)));
  activeCareerAdapter.careerManager = manager;

  const t0 = performance.now();
  const { career } = await manager.createCareer({ playerName: 'Cloud 7A' });
  activeCareerAdapter.setActiveCareer(career);
  const createMs = performance.now() - t0;
  const partner = BOTS_BY_DIFFICULTY.iniciante[0];
  resetIo();
  const tInit = performance.now();
  await activeCareerAdapter.createPlayerProfile({
    id: 'c7a-player', sport_name: 'Cloud 7A', career_date: START, birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 20000, xp: 0, morale: 70, form: 50, partner_id: partner.id, weekly_training_enabled: false,
  });
  const initMs = performance.now() - tInit;
  const initIo = { ...io };
  let careerId = (await activeCareerAdapter.getActiveCareer({ fresh: true })).career_id;
  const saveKey = () => [...storage.files.keys()].find((k) => k.includes(careerId) && !k.includes('backup') && k.endsWith('.json'));

  const entityCounts = async () => {
    const out = {};
    for (const name of ['AthleteProfile', 'TeamRanking', 'Tournament', 'CalendarEvent', 'Match', 'WorldEvent', 'Post', 'PressArticle', 'CareerMessage', 'AnalyticsEvent']) {
      try { out[name] = (await localGame.entities[name].filter({})).length; } catch { out[name] = null; }
    }
    return out;
  };

  let wall = performance.now();
  const daily = [];
  const blocked = [];
  const checkpoints = [];
  let profile = await localGame.entities.PlayerProfile.get('c7a-player');
  const snapshot = async (day) => {
    const key = saveKey();
    const bytes = key ? storage.files.get(key).length : 0;
    const counts = await entityCounts();
    const tournaments = await localGame.entities.Tournament.filter({});
    const events = await localGame.entities.CalendarEvent.filter({ profile_id: 'c7a-player' });
    const tSave = performance.now();
    const cur = await activeCareerAdapter.getActiveCareer({ fresh: true });
    await manager.saveCareer(careerId, cur);
    const saveMs = performance.now() - tSave;
    let loadMs = null;
    if (RELOAD_AT.has(day)) {
      activeCareerAdapter.clearActiveCareer();
      const tLoad = performance.now();
      const loaded = await manager.loadCareer(careerId);
      loadMs = performance.now() - tLoad;
      activeCareerAdapter.setActiveCareer(loaded.career || loaded);
      profile = await localGame.entities.PlayerProfile.get('c7a-player');
    }
    if (DUMP_AT.has(day) && args.dumpDir && key) fs.writeFileSync(path.join(path.resolve(String(args.dumpDir)), `save-day-${day}.json`), storage.files.get(key));
    checkpoints.push({
      day, date: profile.career_date, saveBytes: bytes, saveMs: r2(saveMs), loadMs: loadMs === null ? null : r2(loadMs), counts,
      duplicateTournamentIds: dupes(tournaments.map((t) => t.id)), duplicateEventIds: dupes(events.map((e) => e.id)),
      rankingPosition: profile.ranking_position ?? null, rankPoints: profile.rank_points ?? null, coins: profile.coins,
    });
    const c = checkpoints.at(-1);
    console.log(`dia ${String(day).padStart(5)} ${c.date} save=${(bytes / 1e6).toFixed(2)}MB saveMs=${c.saveMs} loadMs=${c.loadMs ?? '-'} atletas=${counts.AthleteProfile} torneios=${counts.Tournament} eventos=${counts.CalendarEvent} partidas=${counts.Match} dupT=${c.duplicateTournamentIds} dupE=${c.duplicateEventIds}`);
  };

  const buildReport = async (final) => {
  // agregação por temporada (janelas de 365 dias)
  const seasons = [];
  for (let s = 0; s * 365 < daily.length; s += 1) {
    const slice = daily.slice(s * 365, (s + 1) * 365).filter((d) => d.ok);
    if (!slice.length) continue;
    const first = slice.filter((d) => d.dom !== 1);
    const monthStart = slice.filter((d) => d.dom === 1);
    seasons.push({
      season: s + 1, days: slice.length, ms: stats(slice.map((d) => d.ms)), msOrdinaryDays: stats(first.map((d) => d.ms)), msMonthBoundary: stats(monthStart.map((d) => d.ms)),
      writesPerDay: stats(slice.map((d) => d.writes)), bytesWrittenPerDay: stats(slice.map((d) => d.writeBytes)), readsPerDay: stats(slice.map((d) => d.reads)),
      ioMsPerDay: stats(slice.map((d) => d.ioMs)),
    });
  }
  const slowest = [...daily].sort((a, b) => b.ms - a.ms).slice(0, 10).map(({ day, date, ms, writes }) => ({ day, date, ms, writes }));
  const finalCounts = await entityCounts();
  const digest = createHash('sha256').update(JSON.stringify({
    date: profile.career_date, rank: profile.ranking_position, pts: profile.rank_points, coins: profile.coins, xp: profile.xp,
    counts: finalCounts, ok: daily.filter((d) => d.ok).length,
  })).digest('hex');

  if (final && args.dumpSave) {
    const key = saveKey();
    if (key) fs.writeFileSync(path.resolve(String(args.dumpSave)), storage.files.get(key));
  }

  const report = {
    environment: { node: process.version, platform: process.platform, storage: 'memória instrumentada (sem I/O de disco real)', seed: SEED, startDate: START, days: DAYS, path: 'advanceCareerDayOnce (transação única)' },
    creation: { createCareerMs: r2(createMs), createPlayerProfileMs: r2(initMs), io: initIo },
    wallMs: r2(performance.now() - wall), advancedOk: daily.filter((d) => d.ok).length, blocked,
    overall: { ms: stats(daily.filter((d) => d.ok).map((d) => d.ms)), writesPerDay: stats(daily.map((d) => d.writes)) },
    seasons, slowest, checkpoints, finalCounts, determinismDigest: digest,
  };
    return report;
  };
  const writePartial = async () => {
    const partial = await buildReport(false);
    fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUTPUT), JSON.stringify({ ...partial, partial: true }, null, 2));
  };
  await snapshot(0);
  wall = performance.now();
  for (let day = 1; day <= DAYS; day += 1) {
    resetIo();
    tauriMock?.reset();
    const before = profile.career_date;
    const t = performance.now();
    let ok = true;
    try {
      const next = await advanceCareerDayOnce(profile);
      await waitForCareerDaySecondaryWork();
      profile = await localGame.entities.PlayerProfile.get('c7a-player');
      if (!next || profile.career_date === before) ok = false;
    } catch (error) {
      ok = false;
      blocked.push({ day, date: before, error: String(error?.message || error).slice(0, 160) });
      profile = await localGame.entities.PlayerProfile.get('c7a-player');
    }
    const ms = performance.now() - t;
    if (tauriMock) { const c = tauriMock.counters; io.writes = c.byCommand.storage_write_text || 0; io.reads = c.byCommand.storage_read_text || 0; io.writeBytes = c.writeBytes; io.readBytes = c.readBytes; }
    daily.push({ day, date: before, ok, ms: r2(ms), writes: io.writes, writeBytes: io.writeBytes, reads: io.reads, invokes: tauriMock ? tauriMock.counters.calls : null, ioMs: r2(io.writeMs + io.readMs), month: before.slice(5, 7), dom: Number(before.slice(8, 10)) });
    if (!ok && blocked.length >= 20) { console.log('muitos bloqueios consecutivos; interrompendo'); break; }
    if (day % SAMPLE === 0 && (day % 365 === 0 || RELOAD_AT.has(day) || DUMP_AT.has(day) || day === DAYS)) { await snapshot(day); await writePartial(); }
  }

  const report = await buildReport(true);
  fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUTPUT), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ wallMs: report.wallMs, advancedOk: report.advancedOk, blocked: blocked.length, overall: report.overall, seasons: report.seasons.map((s) => ({ season: s.season, median: s.ms.median, p95: s.ms.p95, max: s.ms.max, writesMed: s.writesPerDay.median })), digest: report.determinismDigest }, null, 1));
} finally {
  await server.close();
}
