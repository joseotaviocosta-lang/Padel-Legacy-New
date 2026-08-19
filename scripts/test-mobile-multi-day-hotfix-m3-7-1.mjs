// Mobile M3.7.1 — avanço multi-day, interrupção e persistência por dia.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

function clone(value) { return structuredClone(value); }

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function deterministicScope(task) {
  const RealDate = globalThis.Date;
  const originalRandom = Math.random;
  const fixedMs = RealDate.parse('2030-01-02T03:04:05.000Z');
  class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixedMs])); }
    static now() { return fixedMs; }
  }
  globalThis.Date = FixedDate;
  Math.random = seededRandom(371);
  try { return await task(); }
  finally { globalThis.Date = RealDate; Math.random = originalRandom; }
}

class MemoryStorage {
  constructor() {
    this.files = new Map();
    this.directories = new Set();
  }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async ensureDirectory(path) { this.directories.add(path); return true; }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) {
    const parent = path.includes('/') ? path.split('/').slice(0, -1).join('/') : null;
    if (parent) await this.ensureDirectory(parent);
    this.files.set(path, String(content));
  }
  async readText(path) {
    if (!this.files.has(path)) {
      const error = new Error(`missing: ${path}`);
      error.code = 'FILE_NOT_FOUND';
      throw error;
    }
    return this.files.get(path);
  }
  async remove(path) { return this.files.delete(path); }
  async rename(source, destination) {
    if (!this.files.has(source)) throw new Error(`rename source missing: ${source}`);
    this.files.set(destination, this.files.get(source));
    this.files.delete(source);
    return destination;
  }
  async copy(source, destination) {
    if (!this.files.has(source)) throw new Error(`copy source missing: ${source}`);
    this.files.set(destination, this.files.get(source));
    return destination;
  }
  async list(directory = '.') {
    return [...this.files.keys()]
      .filter((path) => directory === '.' || path.startsWith(`${directory}/`))
      .map((path) => ({ name: path.split('/').pop(), isDirectory: false }));
  }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter, gameRepository } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { advanceCareerDays } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const transactionProbe = await vite.ssrLoadModule('/src/dev/persistenceTransactionProbe.js');

  const memory = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(memory)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ career_id: 'm3-7-1-audit', career_name: 'M3.7.1 Audit' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'm3-7-1-player',
    sport_name: 'Audit',
    career_date: '2026-01-06',
    birth_date: '2001-01-01',
    energy: 100,
    fatigue: 0,
    morale: 70,
    form: 50,
    coins: 25000,
    xp: 0,
    level: 'Amador',
    court_side: 'direita',
    play_style: 'controle',
    weekly_training_enabled: true,
    weekly_training_plan: {
      qua: { activity_id: 'serve_drill', intensity: 'leve' },
    },
  });
  const seeded = await activeCareerAdapter.getActiveCareer({ cloneResult: false });
  seeded.entities.CalendarEvent = [];
  await activeCareerAdapter.saveActiveCareer(seeded);

  const initialCareer = clone(await activeCareerAdapter.getActiveCareer());
  const careerPath = `careers/${initialCareer.career_id}.json`;
  const originalSaveCareer = manager.saveCareer.bind(manager);
  let commits = 0;
  let commitAttempts = 0;
  let failCommitAttempt = null;
  manager.saveCareer = async (...args) => {
    const transactionCommit = String(args[2]?.caller || '').startsWith('transaction-commit:');
    if (transactionCommit) {
      commitAttempts += 1;
      if (commitAttempts === failCommitAttempt) throw new Error('falha injetada no commit diário');
    }
    const saved = await originalSaveCareer(...args);
    if (transactionCommit) commits += 1;
    return saved;
  };

  function tournamentEvent(date) {
    return {
      id: `miami-cup-${date}`,
      profile_id: 'm3-7-1-player',
      title: 'Miami Cup',
      event_type: 'tournament',
      start_date: date,
      end_date: date,
      status: 'scheduled',
      requires_decision: true,
      is_mandatory: true,
      decision_type: 'play_tournament',
    };
  }

  async function runScenario({
    days,
    startDate = '2026-01-06',
    eventDate = null,
    displayedStartDate = startDate,
    failAtCommit = null,
    snapshot = null,
  }) {
    const scenario = clone(snapshot || initialCareer);
    scenario.player.career_date = startDate;
    scenario.entities.CalendarEvent = eventDate ? [tournamentEvent(eventDate)] : [];
    activeCareerAdapter.setActiveCareer(scenario);
    activeCareerAdapter.lastRoutineBackupAt = Date.now();
    activeCareerAdapter.lastIndexSyncAt = Date.now();
    memory.files.set(careerPath, `${JSON.stringify(scenario)}\n`);
    commits = 0;
    commitAttempts = 0;
    failCommitAttempt = failAtCommit;
    transactionProbe.resetPersistenceTransactionStats();
    const start = await localGame.entities.PlayerProfile.get('m3-7-1-player');
    const result = await deterministicScope(() => advanceCareerDays(start, days, { displayedStartDate }));
    const confirmed = await localGame.entities.PlayerProfile.get('m3-7-1-player');
    return {
      result,
      confirmed,
      career: clone(await activeCareerAdapter.getActiveCareer()),
      commits,
      probe: transactionProbe.getPersistenceTransactionSnapshot(),
    };
  }

  const plus1 = await runScenario({ days: 1, eventDate: '2026-01-08' });
  const plus3Blocked = await runScenario({ days: 3, eventDate: '2026-01-08' });
  const plus7Blocked = await runScenario({ days: 7, eventDate: '2026-01-08' });
  const plus3Free = await runScenario({ days: 3 });
  const plus7Free = await runScenario({ days: 7 });
  const eventTomorrow = await runScenario({ days: 3, startDate: '2026-01-07', eventDate: '2026-01-08' });
  const eventToday = await runScenario({ days: 3, startDate: '2026-01-08', eventDate: '2026-01-08' });
  const secondDayFailure = await runScenario({ days: 3, failAtCommit: 2 });
  const deterministicA = await runScenario({ days: 3 });
  const deterministicB = await runScenario({ days: 3 });
  const staleDisplay = await runScenario({
    days: 3,
    startDate: '2026-01-07',
    displayedStartDate: '2026-01-06',
    eventDate: '2026-01-08',
  });

  gate('+1 avança 06/01→07/01 com uma transação/commit', plus1.result.processedDays === 1 && plus1.result.finalDate === '2026-01-07' && plus1.result.transactions === 1 && plus1.result.physicalCommits === 1);
  gate('+3 sem bloqueador avança três dias', plus3Free.result.processedDays === 3 && plus3Free.result.finalDate === '2026-01-09');
  gate('+7 sem bloqueador avança sete dias', plus7Free.result.processedDays === 7 && plus7Free.result.finalDate === '2026-01-13');
  gate('+3 livre mantém uma transação/commit por dia', plus3Free.result.transactions === 3 && plus3Free.result.physicalCommits === 3 && plus3Free.commits === 3);
  gate('+7 livre mantém uma transação/commit por dia', plus7Free.result.transactions === 7 && plus7Free.result.physicalCommits === 7 && plus7Free.commits === 7);
  gate('+3 com Miami em dois dias processa exatamente um dia', plus3Blocked.result.processedDays === 1 && plus3Blocked.result.remainingDays === 2 && plus3Blocked.result.finalDate === '2026-01-07');
  gate('+7 com Miami em dois dias processa exatamente um dia', plus7Blocked.result.processedDays === 1 && plus7Blocked.result.remainingDays === 6 && plus7Blocked.result.finalDate === '2026-01-07');
  gate('interrupção por torneio usa stopReason explícito', plus3Blocked.result.stopReason === 'upcomingTournament' && plus7Blocked.result.stopReason === 'upcomingTournament');
  gate('avanço parcial confirma somente uma transação/commit', plus3Blocked.result.transactions === 1 && plus3Blocked.result.physicalCommits === 1 && plus7Blocked.result.transactions === 1 && plus7Blocked.result.physicalCommits === 1);
  gate('evento amanhã bloqueia sem alterar data nem abrir transação', eventTomorrow.result.processedDays === 0 && eventTomorrow.result.finalDate === '2026-01-07' && eventTomorrow.result.transactions === 0 && eventTomorrow.result.physicalCommits === 0);
  gate('evento hoje bloqueia sem alterar data nem commit', eventToday.result.processedDays === 0 && eventToday.result.finalDate === '2026-01-08' && eventToday.result.physicalCommits === 0);
  gate('campos requested/processed/remaining não se confundem', plus3Blocked.result.requestedDays === 3 && plus3Blocked.result.processedDays === 1 && plus3Blocked.result.remainingDays === 2);
  gate('contador de treinos deriva somente dos dias confirmados', plus3Free.result.automaticTrainings === plus3Free.result.daily.filter((day) => day.automaticTraining).length && plus3Free.result.automaticTrainings <= plus3Free.result.processedDays);
  gate('falha no segundo dia conta somente o primeiro', secondDayFailure.result.processedDays === 1 && secondDayFailure.result.finalDate === '2026-01-07' && secondDayFailure.result.stopReason === 'transactionError');
  gate('falha no segundo dia faz rollback sem segundo commit', secondDayFailure.result.transactions === 2 && secondDayFailure.result.physicalCommits === 1 && secondDayFailure.commits === 1 && secondDayFailure.probe.totals.rollbacks === 1);
  gate('data confirmada e processedDays permanecem coerentes', secondDayFailure.confirmed.career_date === secondDayFailure.result.finalDate && plus3Blocked.confirmed.career_date === plus3Blocked.result.finalDate);

  const retrySnapshot = clone(plus3Blocked.career);
  retrySnapshot.entities.CalendarEvent = retrySnapshot.entities.CalendarEvent.map((event) => ({ ...event, status: 'completed', requires_decision: false }));
  const retry = await runScenario({ days: 2, startDate: '2026-01-07', snapshot: retrySnapshot });
  gate('retry após resolver interrupção processa os dias restantes', retry.result.processedDays === 2 && retry.result.finalDate === '2026-01-09' && retry.result.physicalCommits === 2);
  gate('mesma seed/data produz estado final determinístico', assert.deepEqual(deterministicA.career, deterministicB.career) === undefined);
  gate('perfdebug guarda o último multi-day completo', staleDisplay.probe.lastMultiDayAdvance?.requestedDays === 3 && staleDisplay.probe.lastMultiDayAdvance?.processedDays === 0 && staleDisplay.probe.lastMultiDayAdvance?.displayedStartDate === '2026-01-06');

  const calendarPageSource = readFileSync(new URL('../src/pages/CalendarPage.jsx', import.meta.url), 'utf8');
  gate('lock síncrono continua protegendo +3/+7 contra double click', calendarPageSource.includes('if (!profile || advanceLockRef.current) return;') && calendarPageSource.includes('advanceLockRef.current = true;'));

  const summary = ({ result }) => ({
    initialDate: result.initialDate,
    finalDate: result.finalDate,
    requestedDays: result.requestedDays,
    processedDays: result.processedDays,
    remainingDays: result.remainingDays,
    stopReason: result.stopReason,
    automaticTrainings: result.automaticTrainings,
    transactions: result.transactions,
    physicalCommits: result.physicalCommits,
  });
  console.log('\nCENÁRIOS M3.7.1');
  console.log(JSON.stringify({
    plus1: summary(plus1),
    plus3Blocked: summary(plus3Blocked),
    plus7Blocked: summary(plus7Blocked),
    plus3Free: summary(plus3Free),
    plus7Free: summary(plus7Free),
    eventTomorrow: summary(eventTomorrow),
    eventToday: summary(eventToday),
    secondDayFailure: summary(secondDayFailure),
  }, null, 2));
  console.log(`\n${gates} gates executados, todos PASS — Mobile M3.7.1 Multi-day Hotfix.`);
} finally {
  await vite.close();
}
