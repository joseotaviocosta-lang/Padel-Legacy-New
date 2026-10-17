// CLOUD-5 — benchmark de estado estável do avanço de dias.
// Diferente de benchmark-time-advance-rc.mjs (que mede o 1º dia de uma carreira
// recém-criada e, por isso, inclui a semeadura única do mundo), aqui o mundo é
// semeado UMA vez (fora da medição) e depois N dias consecutivos são medidos
// com o pipeline de produção (core + secundário), com contagem de escritas.
//
// Uso: node scripts/benchmark-phase5-steady-state.mjs [--days=10] [--athletes=800] [--date=2026-11-10] [--output=...]
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value === undefined ? true : value];
}));
const DAYS = Math.max(3, Number(args.days) || 10);
const ATHLETES = Number(args.athletes) || 800;
const START = args.date || '2026-11-10';
const OUTPUT = args.output || 'reports/cloud-phase-5-performance-optimization/data/steady-state.json';

globalThis.window = globalThis.window || { location: { pathname: '/', hostname: 'bench' }, dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

// Math.random determinístico (LCG fixo) para que o digest do mundo semeado seja
// reproduzível entre execuções; não afeta o código de produção.
let rngState = 20261017;
Math.random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 2 ** 32; };

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };
const round = (n) => Number(n.toFixed(2));

function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true, async initialize() {}, async ensureDirectory() { return true; },
    async writeText(p, c) { files.set(p, String(c)); },
    async readText(p) { if (!files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return files.get(p); },
    async exists(p) { return files.has(p); }, async remove(p) { return files.delete(p); },
    async copy(a, b) { files.set(b, files.get(a)); return b; },
    async rename(a, b) { files.set(b, files.get(a)); files.delete(a); return b; },
    async list() { return [...files.keys()]; }, async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
  };
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { careerWriteStats, resetCareerWriteStats } = await server.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');
  const { advanceCareerDays } = await server.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { advanceCareerDayOnce, waitForCareerDaySecondaryWork } = await server.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { processGameStateDay } = await server.ssrLoadModule('/src/game-core/gameStateLifecycle.js');
  const { createAdvanceProfiler } = await server.ssrLoadModule('/src/game-core/advanceProfiler.js');
  const { generateFictionalAthletes } = await server.ssrLoadModule('/src/players/athleteGenerator.js');
  const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025, verifySaveFoundation } = await server.ssrLoadModule('/src/lib/saveFoundation.js');

  const storage = createMemoryStorage();
  activeCareerAdapter.careerManager = new CareerManager(new CareerRepository(new GameStorage(storage)));

  // Contagem de gravações físicas (saveCareer) por origem (`caller`), por dia.
  const saveCallers = {};
  const originalSave = activeCareerAdapter.careerManager.saveCareer.bind(activeCareerAdapter.careerManager);
  activeCareerAdapter.careerManager.saveCareer = (id, data, options = {}) => {
    const key = String(options.caller || 'sem-caller').replace(/:\d+$/, '');
    saveCallers[key] = (saveCallers[key] || 0) + 1;
    return originalSave(id, data, options);
  };

  if (args.stacks) {
    const origUpdate = activeCareerAdapter.updatePlayerProfile.bind(activeCareerAdapter);
    activeCareerAdapter.updatePlayerProfile = (...a) => {
      console.log('[updatePlayerProfile]', Object.keys(a[1] || {}).join(','), '\n  ', new Error().stack.split('\n').slice(2, 6).map((l) => l.trim().replace(/\(.*Padel-Legacy-New\//, '(')).join('\n   '));
      return origUpdate(...a);
    };
  }

  const careerId = 'bench-steady';
  const { career } = await activeCareerAdapter.careerManager.createCareer({ career_id: careerId, career_name: 'Steady' });
  const athletes = generateFictionalAthletes({ count: ATHLETES, seed: 'bench-steady' }).map((a, i) => ({
    ...a, id: a.id || `bench-athlete-${i}`, ranking_position: i + 1,
    ranking_points: Math.max(50, 4000 - i * 3), world_ranking_points: Math.max(50, 4000 - i * 3),
  }));
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'bench-player', sport_name: 'Jogador Benchmark', career_date: START, birth_date: '2003-05-10',
    energy: 70, fatigue: 35, morale: 65, form: 55, coins: 25000, xp: 8000, level: 'Amador',
    court_side: 'direita', play_style: 'controle', career_difficulty: 'hard',
    trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
  });
  const active = await activeCareerAdapter.getActiveCareer({ fresh: false, cloneResult: false });
  active.entities.AthleteProfile = athletes;
  active.entities.Match = []; active.entities.CalendarEvent = [];
  await activeCareerAdapter.saveActiveCareer(active);

  const seedStart = performance.now();
  resetCareerWriteStats();
  await ensureWorldSeed2025();
  const seed = { ms: round(performance.now() - seedStart), writes: careerWriteStats.count, foundationOk: (await verifySaveFoundation()).ok };

  // Digest canônico do mundo semeado: remove ids aleatórios/timestamps e troca
  // referências de id por chaves estáveis, para comparar antes/depois.
  const listAll = (entity) => localGame.entities[entity].list('id', 100000);
  const athleteRows = await listAll('AthleteProfile');
  const teamRows = await listAll('TeamRanking');
  const keyOf = new Map(athleteRows.map((r) => [r.id, `${r.bot_id ?? ''}|${r.name}|${r.country ?? ''}`]));
  const strip = (row, idFields) => {
    const out = {};
    for (const k of Object.keys(row).sort()) {
      if (['id', 'created_date', 'updated_date', 'team_key'].includes(k)) continue;
      out[k] = idFields.includes(k) ? (keyOf.get(row[k]) ?? row[k]) : row[k];
    }
    return JSON.stringify(out);
  };
  if (args.dump) fs.writeFileSync(args.dump, [...athleteRows.map((r) => strip(r, ['ai_partner_id'])).sort(), '--', ...teamRows.map((r) => strip(r, ['player1_id', 'player2_id'])).sort()].join('\n'));
  // A formação de duplas dos bots procedurais já é não-determinística entre
  // execuções (pré-existente, independente desta fase), então o digest cobre
  // somente a parte determinística: atletas reais do registro e duplas semeadas.
  const realRows = athleteRows.filter((r) => !String(r.bot_id || '').startsWith('ranking-bot')).map((r) => strip(r, ['ai_partner_id'])).sort();
  const seededTeams = teamRows.filter((r) => String(r.origin || '').startsWith('seed-')).map((r) => strip(r, ['player1_id', 'player2_id'])).sort();
  const seedDigest = {
    athletes: athleteRows.length, teams: teamRows.length, realAthletes: realRows.length, seededTeams: seededTeams.length,
    sha256: createHash('sha256').update([...realRows, '--', ...seededTeams].join('\n')).digest('hex'),
  };

  const days = [];
  let profile = await localGame.entities.PlayerProfile.get('bench-player');
  // Seed consome o primeiro dia (reparos/sorteios iniciais); descartado da estatística.
  const WARMUP = 1;
  for (let i = 0; i < DAYS + WARMUP; i += 1) {
    resetCareerWriteStats();
    for (const key of Object.keys(saveCallers)) delete saveCallers[key];
    const t0 = performance.now();
    // Caminho de produção do botão "Avançar": transação única (core + estado do jogo).
    const next = await advanceCareerDayOnce(profile);
    await waitForCareerDaySecondaryWork();
    const ms = performance.now() - t0;
    const sec = Object.values(saveCallers).reduce((a, b) => a + b, 0);
    if (i >= WARMUP) days.push({ date: next.career_date, ms: round(ms), physicalSaves: sec, saveCallers: { ...saveCallers } });
    profile = await localGame.entities.PlayerProfile.get('bench-player');
  }
  // +7 dias em lote (caminho de produção "Avançar 7 dias")
  resetCareerWriteStats();
  for (const key of Object.keys(saveCallers)) delete saveCallers[key];
  const t7 = performance.now();
  await advanceCareerDays(profile, 7);
  const sevenDays = { ms: round(performance.now() - t7), physicalSaves: Object.values(saveCallers).reduce((a, b) => a + b, 0), saveCallers: { ...saveCallers } };
  const report = {
    environment: { node: process.version, cpus: 4, athletes: ATHLETES, startDate: START, days: DAYS, storage: 'memória (sem I/O de disco)' },
    seed: { ...seed, ...seedDigest }, days, sevenDays,
    summary: {
      oneDayMsMedian: median(days.map((d) => d.ms)),
      oneDayMsMin: Math.min(...days.map((d) => d.ms)),
      oneDayMsMax: Math.max(...days.map((d) => d.ms)),
      oneDayPhysicalSavesMedian: median(days.map((d) => d.physicalSaves)),
    },
  };
  fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUTPUT), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ seed: report.seed, summary: report.summary }, null, 1));
} finally {
  await server.close();
}
