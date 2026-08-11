// Benchmark real do pipeline de avanço de tempo (Avançar / +1 / +3 / +7 / lesão).
// Roda as funções de produção de verdade (advanceCareerDay, advanceCareerDays,
// advanceCareerUntilRecovered, processGameStateDay) através do Vite SSR, com um
// armazenamento Tauri falso (em memória) injetado no lugar do disco real — assim
// medimos o custo de CPU real (clone, stringify, parse, contagem de escritas) da
// mesma pilha de produção, sem depender do shell desktop Tauri para rodar em CI.
//
// Uso:
//   node scripts/benchmark-time-advance-rc.mjs [--runs=20] [--output=reports/time-advance-benchmark.json]
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value === undefined ? true : value];
}));
const RUNS = Math.max(3, Number(args.runs) || 20);
const OUTPUT = args.output || 'reports/time-advance-benchmark.json';

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    avg: Number((sum / sorted.length).toFixed(2)),
    p50: Number(percentile(sorted, 0.5).toFixed(2)),
    p95: Number(percentile(sorted, 0.95).toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    min: Number(sorted[0].toFixed(2)),
  };
}

// ---- Armazenamento Tauri falso, em memória (mesmo contrato de método que
// src/storage/TauriStorage.js: isSupported/initialize/readText/writeText/
// exists/remove/copy/rename/list/ensureDirectory/stat/getDataDirectoryDescription) ----
function createMemoryStorage() {
  const files = new Map();
  return {
    isSupported: () => true,
    async initialize() {},
    async ensureDirectory() { return true; },
    async writeText(relativePath, content) { files.set(relativePath, String(content)); },
    async readText(relativePath) {
      if (!files.has(relativePath)) {
        const error = new Error('O arquivo não existe no armazenamento local.');
        error.code = 'FILE_NOT_FOUND';
        throw error;
      }
      return files.get(relativePath);
    },
    async exists(relativePath) { return files.has(relativePath); },
    async remove(relativePath) { return files.delete(relativePath); },
    async copy(sourcePath, destinationPath) {
      if (!files.has(sourcePath)) throw new Error(`copy: origem ausente ${sourcePath}`);
      files.set(destinationPath, files.get(sourcePath));
      return destinationPath;
    },
    async rename(sourcePath, destinationPath) {
      if (!files.has(sourcePath)) throw new Error(`rename: origem ausente ${sourcePath}`);
      files.set(destinationPath, files.get(sourcePath));
      files.delete(sourcePath);
      return destinationPath;
    },
    async list() { return [...files.keys()]; },
    async stat() { return { size: 0 }; },
    getDataDirectoryDescription: () => 'memory',
    _fileCount: () => files.size,
    _totalBytes: () => [...files.values()].reduce((total, value) => total + value.length, 0),
  };
}

async function buildScenarioCareer({
  careerManager, activeCareerAdapter, generateFictionalAthletes, createId,
  athleteCount, matchHistoryCount, seasonNumber, careerDate, injured,
}) {
  const careerId = createId();
  const { career } = await careerManager.createCareer({
    career_id: careerId,
    career_name: `Benchmark ${careerId}`,
  });

  const athletes = generateFictionalAthletes({ count: athleteCount, seed: `bench-${careerId}` }).map((athlete, index) => ({
    ...athlete,
    id: athlete.id || `bench-athlete-${careerId}-${index}`,
    ranking_position: index + 1,
    ranking_points: Math.max(50, 4000 - index * 3),
    world_ranking_points: Math.max(50, 4000 - index * 3),
  }));

  const matchHistory = Array.from({ length: matchHistoryCount }, (_, index) => ({
    id: `bench-match-${careerId}-${index}`,
    profile_id: 'bench-player',
    date: careerDate,
    tournament_name: `Torneio histórico ${index}`,
    result: index % 2 === 0 ? 'vitoria' : 'derrota',
  }));

  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'bench-player',
    sport_name: 'Jogador Benchmark',
    career_date: careerDate,
    birth_date: '2003-05-10',
    energy: 70,
    fatigue: 35,
    morale: 65,
    form: 55,
    coins: 25000,
    xp: 4200 + seasonNumber * 1800,
    level: 'Amador',
    court_side: 'direita',
    play_style: 'controle',
    career_difficulty: 'hard',
    trainings_today: 0,
    practice_matches_today: 0,
    tournament_matches_today: 0,
    injured_until: injured ? addDaysIso(careerDate, 6) : null,
    injury_status: injured ? 'lesionado' : null,
  });

  const activeCareer = await activeCareerAdapter.getActiveCareer({ fresh: false, cloneResult: false });
  activeCareer.entities.AthleteProfile = athletes;
  activeCareer.entities.Match = matchHistory;
  activeCareer.entities.CalendarEvent = [];
  await activeCareerAdapter.saveActiveCareer(activeCareer);

  return careerId;
}

function addDaysIso(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function timeCall(fn) {
  const startedAt = performance.now();
  const result = await fn();
  return { result, ms: Number((performance.now() - startedAt).toFixed(3)) };
}

async function run() {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { GameStorage } = await server.ssrLoadModule('/src/storage/GameStorage.js');
    const { CareerRepository } = await server.ssrLoadModule('/src/careers/CareerRepository.js');
    const { CareerManager } = await server.ssrLoadModule('/src/careers/CareerManager.js');
    const { activeCareerAdapter } = await server.ssrLoadModule('/src/gameplay/services/runtime.js');
    const { careerWriteStats, resetCareerWriteStats } = await server.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');
    const { advanceCareerDay, advanceCareerDays, advanceCareerUntilRecovered, finalizeCareerAdvanceRange } = await server.ssrLoadModule('/src/game-core/calendarLifecycle.js');
    const { processGameStateDay } = await server.ssrLoadModule('/src/game-core/gameStateLifecycle.js');
    const { createAdvanceProfiler } = await server.ssrLoadModule('/src/game-core/advanceProfiler.js');
    const { generateFictionalAthletes } = await server.ssrLoadModule('/src/players/athleteGenerator.js');
    const { localGame } = await server.ssrLoadModule('/src/api/localGameClient.js');

    // Injeta o armazenamento falso na MESMA instância singleton que todo o
    // app usa (activeCareerAdapter vem de runtime.js, o módulo que localGame
    // e todos os *Lifecycle.js consultam por baixo dos panos).
    const fakeStorage = createMemoryStorage();
    const careerManager = new CareerManager(new CareerRepository(new GameStorage(fakeStorage)));
    activeCareerAdapter.careerManager = careerManager;

    let idCounter = 0;
    const createId = () => `bench-${Date.now()}-${(idCounter += 1)}`;

    const scenarios = [
      { key: 'fresh', label: 'Carreira nova (temporada 1)', athleteCount: 500, matchHistoryCount: 5, seasonNumber: 1, careerDate: '2026-01-05', injured: false },
      { key: 'season3', label: '3 temporadas de histórico', athleteCount: 800, matchHistoryCount: 180, seasonNumber: 3, careerDate: '2026-11-10', injured: false },
      { key: 'heavy', label: 'Muito histórico/torneios', athleteCount: 1000, matchHistoryCount: 600, seasonNumber: 6, careerDate: '2028-06-18', injured: false },
      { key: 'injured', label: 'Com lesão ativa', athleteCount: 800, matchHistoryCount: 180, seasonNumber: 3, careerDate: '2026-11-10', injured: true },
      { key: 'monthBoundary', label: 'Virada de mês', athleteCount: 800, matchHistoryCount: 180, seasonNumber: 3, careerDate: '2026-11-30', injured: false },
    ];

    const report = { configuration: { runs: RUNS }, scenarios: {} };

    for (const scenario of scenarios) {
      const scenarioResult = { label: scenario.label, oneDay: { core: [], secondary: [], writesCore: [], writesSecondary: [] }, threeDays: { total: [], writes: [] }, sevenDays: { total: [], writes: [] } };

      for (let iteration = 0; iteration < RUNS; iteration += 1) {
        // ---- +1 dia: fase core (o que trava o botão) + fase secundária (mundo/circuito em segundo plano) ----
        await buildScenarioCareer({ careerManager, activeCareerAdapter, generateFictionalAthletes, createId, ...scenario });
        let profile = await localGame.entities.PlayerProfile.get('bench-player');
        resetCareerWriteStats();
        const coreProfiler = createAdvanceProfiler({ enabled: false });
        const core = await timeCall(() => advanceCareerDay(profile, { deferGameState: true, deferGlobalProcessing: true, profiler: coreProfiler }));
        const writesAfterCore = careerWriteStats.count;
        const secondaryProfiler = createAdvanceProfiler({ enabled: false });
        const secondary = await timeCall(() => processGameStateDay(core.result, profile.career_date, core.result.career_date, { profiler: secondaryProfiler }));
        const writesAfterSecondary = careerWriteStats.count;
        scenarioResult.oneDay.core.push(core.ms);
        scenarioResult.oneDay.secondary.push(secondary.ms);
        scenarioResult.oneDay.writesCore.push(writesAfterCore);
        scenarioResult.oneDay.writesSecondary.push(writesAfterSecondary - writesAfterCore);
        if (iteration === 0) {
          scenarioResult.oneDay.coreStages = coreProfiler.finish();
          scenarioResult.oneDay.secondaryStages = secondaryProfiler.finish();
        }

        // ---- +3 dias ----
        await buildScenarioCareer({ careerManager, activeCareerAdapter, generateFictionalAthletes, createId, ...scenario });
        profile = await localGame.entities.PlayerProfile.get('bench-player');
        resetCareerWriteStats();
        const threeDayStart = profile.career_date;
        const threeDays = await timeCall(() => advanceCareerDays(profile, 3));
        await finalizeCareerAdvanceRange(threeDays.result.profile, threeDayStart, threeDays.result.profile.career_date);
        scenarioResult.threeDays.total.push(threeDays.ms);
        scenarioResult.threeDays.writes.push(careerWriteStats.count);

        // ---- +7 dias ----
        await buildScenarioCareer({ careerManager, activeCareerAdapter, generateFictionalAthletes, createId, ...scenario });
        profile = await localGame.entities.PlayerProfile.get('bench-player');
        resetCareerWriteStats();
        const sevenDayStart = profile.career_date;
        const sevenDays = await timeCall(() => advanceCareerDays(profile, 7));
        await finalizeCareerAdvanceRange(sevenDays.result.profile, sevenDayStart, sevenDays.result.profile.career_date);
        scenarioResult.sevenDays.total.push(sevenDays.ms);
        scenarioResult.sevenDays.writes.push(careerWriteStats.count);
      }

      report.scenarios[scenario.key] = {
        label: scenario.label,
        oneDayCoreMs: summarize(scenarioResult.oneDay.core),
        oneDaySecondaryMs: summarize(scenarioResult.oneDay.secondary),
        oneDayWritesCore: summarize(scenarioResult.oneDay.writesCore),
        oneDayWritesSecondary: summarize(scenarioResult.oneDay.writesSecondary),
        oneDayCoreStages: scenarioResult.oneDay.coreStages,
        oneDaySecondaryStages: scenarioResult.oneDay.secondaryStages,
        threeDaysMs: summarize(scenarioResult.threeDays.total),
        threeDaysWrites: summarize(scenarioResult.threeDays.writes),
        sevenDaysMs: summarize(scenarioResult.sevenDays.total),
        sevenDaysWrites: summarize(scenarioResult.sevenDays.writes),
      };

      const s = report.scenarios[scenario.key];
      console.log(`\n[${scenario.label}]`);
      console.log(`  +1 dia (core, trava o botão)....... avg ${s.oneDayCoreMs.avg}ms  p50 ${s.oneDayCoreMs.p50}ms  p95 ${s.oneDayCoreMs.p95}ms  max ${s.oneDayCoreMs.max}ms  | writes avg ${s.oneDayWritesCore.avg}`);
      console.log(`  +1 dia (secundário, background).... avg ${s.oneDaySecondaryMs.avg}ms  p50 ${s.oneDaySecondaryMs.p50}ms  p95 ${s.oneDaySecondaryMs.p95}ms  max ${s.oneDaySecondaryMs.max}ms  | writes avg ${s.oneDayWritesSecondary.avg}`);
      console.log(`  +3 dias............................ avg ${s.threeDaysMs.avg}ms  p50 ${s.threeDaysMs.p50}ms  p95 ${s.threeDaysMs.p95}ms  max ${s.threeDaysMs.max}ms  | writes avg ${s.threeDaysWrites.avg}`);
      console.log(`  +7 dias............................ avg ${s.sevenDaysMs.avg}ms  p50 ${s.sevenDaysMs.p50}ms  p95 ${s.sevenDaysMs.p95}ms  max ${s.sevenDaysMs.max}ms  | writes avg ${s.sevenDaysWrites.avg}`);
    }

    // ---- Avançar até a recuperação (cenário com lesão) ----
    {
      const injuredScenario = scenarios.find((item) => item.key === 'injured');
      const injurySamples = { ms: [], writes: [], days: [] };
      for (let iteration = 0; iteration < Math.max(3, Math.round(RUNS / 3)); iteration += 1) {
        await buildScenarioCareer({ careerManager, activeCareerAdapter, generateFictionalAthletes, createId, ...injuredScenario });
        const profile = await localGame.entities.PlayerProfile.get('bench-player');
        resetCareerWriteStats();
        const result = await timeCall(() => advanceCareerUntilRecovered(profile));
        injurySamples.ms.push(result.ms);
        injurySamples.writes.push(careerWriteStats.count);
        injurySamples.days.push(result.result.daysAdvanced);
      }
      report.untilRecovered = {
        ms: summarize(injurySamples.ms),
        writes: summarize(injurySamples.writes),
        avgDaysAdvanced: Number((injurySamples.days.reduce((a, b) => a + b, 0) / injurySamples.days.length).toFixed(1)),
      };
      console.log(`\n[Avançar até a recuperação]`);
      console.log(`  total.............................. avg ${report.untilRecovered.ms.avg}ms  p50 ${report.untilRecovered.ms.p50}ms  p95 ${report.untilRecovered.ms.p95}ms  max ${report.untilRecovered.ms.max}ms  | writes avg ${report.untilRecovered.writes.avg}  | dias médios ${report.untilRecovered.avgDaysAdvanced}`);
    }

    const outputPath = path.resolve(process.cwd(), OUTPUT);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\nRelatório salvo em ${OUTPUT}`);
  } finally {
    await server.close();
  }
}

run().catch((error) => {
  console.error('[benchmark-time-advance-rc] falhou:', error);
  process.exitCode = 1;
});
