// M4.1.1 — continuidade temporal de torneios e bloqueio na data oficial.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const clone = (value) => structuredClone(value);
let gates = 0;
function gate(label, condition) {
  gates += 1;
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
  console.log(`PASS — ${label}`);
}

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
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

function buildRun({ dates = ['2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'], currentRound = 1 } = {}) {
  const rounds = ['R16', 'QF', 'SF', 'F'];
  return {
    version: 2,
    tournamentId: 'miami-cup',
    tournamentName: 'Miami Cup',
    status: currentRound === 0 ? 'scheduled' : 'between_rounds',
    currentRound,
    meetingsCompleted: { preTournament: true, rounds: [] },
    matches: dates.map((date, index) => ({
      id: `miami-${rounds[index]}`,
      stage: 'main',
      stageRoundIndex: index,
      roundIndex: index,
      round: rounds[index],
      short: rounds[index],
      date,
      opponent: [],
      status: index < currentRound ? 'completed' : 'scheduled',
      preparationCompleted: true,
      result: index < currentRound ? { won: true, score: '6-3 6-4' } : null,
    })),
  };
}

function tournamentEvent({ officialDate = '2026-01-09', outerDate = '2026-01-08', run = null } = {}) {
  const tournamentRun = run || buildRun({ dates: ['2026-01-08', officialDate, '2026-01-10', '2026-01-11'] });
  return {
    id: 'miami-calendar-event',
    profile_id: 'm4-1-1-player',
    title: 'Miami Cup',
    event_type: 'tournament',
    related_id: 'miami-cup',
    start_date: outerDate,
    end_date: outerDate,
    status: 'scheduled',
    requires_decision: true,
    is_mandatory: true,
    decision_type: 'play_tournament',
    metadata: { tournament_run: tournamentRun, next_round_date: officialDate },
  };
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { advanceCareerDays } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const policy = await vite.ssrLoadModule('/src/game-core/calendarAdvancePolicy.js');
  const runManager = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const transactionProbe = await vite.ssrLoadModule('/src/dev/persistenceTransactionProbe.js');

  const memory = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(memory)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ career_id: 'm4-1-1-audit', career_name: 'M4.1.1 Audit' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'm4-1-1-player',
    sport_name: 'Continuity',
    career_date: '2026-01-08',
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
    weekly_training_enabled: false,
  });
  const seeded = await activeCareerAdapter.getActiveCareer({ cloneResult: false });
  seeded.entities.CalendarEvent = [];
  await activeCareerAdapter.saveActiveCareer(seeded);
  const initialCareer = clone(await activeCareerAdapter.getActiveCareer());
  const careerPath = `careers/${initialCareer.career_id}.json`;

  const originalSaveCareer = manager.saveCareer.bind(manager);
  let commits = 0;
  manager.saveCareer = async (...args) => {
    const transactionCommit = String(args[2]?.caller || '').startsWith('transaction-commit:');
    const saved = await originalSaveCareer(...args);
    if (transactionCommit) commits += 1;
    return saved;
  };

  async function runScenario({ startDate, days, event, singleDay = false }) {
    const scenario = clone(initialCareer);
    scenario.player.career_date = startDate;
    scenario.entities.CalendarEvent = event ? [clone(event)] : [];
    activeCareerAdapter.setActiveCareer(scenario);
    activeCareerAdapter.lastRoutineBackupAt = Date.now();
    activeCareerAdapter.lastIndexSyncAt = Date.now();
    memory.files.set(careerPath, `${JSON.stringify(scenario)}\n`);
    commits = 0;
    transactionProbe.resetPersistenceTransactionStats();
    const start = await localGame.entities.PlayerProfile.get('m4-1-1-player');
    if (singleDay) {
      try {
        const profile = await advanceCareerDayOnce(start);
        const probe = transactionProbe.getPersistenceTransactionSnapshot();
        return { profile, blocked: false, transactions: probe.totals.transactions, physicalCommits: probe.totals.physicalCommits, commits };
      } catch (error) {
        const profile = await localGame.entities.PlayerProfile.get('m4-1-1-player');
        const probe = transactionProbe.getPersistenceTransactionSnapshot();
        return { profile, blocked: true, error, transactions: probe.totals.transactions, physicalCommits: probe.totals.physicalCommits, commits };
      }
    }
    const result = await advanceCareerDays(start, days);
    return { result, profile: result.profile, commits };
  }

  const staleQuarterFinal = tournamentEvent();
  gate('save legado resolve a QF pelo tournament_run, não pelo start_date antigo', policy.getTournamentCommitmentDate(staleQuarterFinal) === '2026-01-09');
  gate('08/01 diante da QF de 09/01 é future', policy.getCalendarDecisionState(staleQuarterFinal, '2026-01-08') === 'future');
  gate('09/01 diante da QF de 09/01 é dueToday', policy.getCalendarDecisionState(staleQuarterFinal, '2026-01-09') === 'dueToday');
  gate('10/01 diante de QF não resolvida é overdue', policy.getCalendarDecisionState(staleQuarterFinal, '2026-01-10') === 'overdue');

  const plus1 = await runScenario({ startDate: '2026-01-08', days: 1, event: staleQuarterFinal, singleDay: true });
  gate('+1 em 08/01 chega a 09/01 e confirma um commit', !plus1.blocked && plus1.profile.career_date === '2026-01-09' && plus1.physicalCommits === 1 && plus1.commits === 1);
  const eventAfterLanding = (await activeCareerAdapter.getActiveCareer()).entities.CalendarEvent[0];
  gate('chegar à data oficial não marca a QF como perdida', eventAfterLanding.status === 'scheduled' && eventAfterLanding.requires_decision === true);

  const plus3 = await runScenario({ startDate: '2026-01-08', days: 3, event: staleQuarterFinal });
  gate('+3 em 08/01 para na QF de 09/01 após um dia', plus3.result.finalDate === '2026-01-09' && plus3.result.processedDays === 1 && plus3.result.stopReason === 'upcomingTournament');
  gate('+3 parcial mantém uma transação/commit por dia confirmado', plus3.result.transactions === 1 && plus3.result.physicalCommits === 1 && plus3.commits === 1);

  const matchOn09 = tournamentEvent({ outerDate: '2026-01-06' });
  const plus7 = await runScenario({ startDate: '2026-01-06', days: 7, event: matchOn09 });
  gate('+7 em 06/01 para na partida de 09/01 após três dias', plus7.result.finalDate === '2026-01-09' && plus7.result.processedDays === 3 && plus7.result.stopReason === 'upcomingTournament');
  gate('+7 parcial confirma três transações/commits físicos', plus7.result.transactions === 3 && plus7.result.physicalCommits === 3 && plus7.commits === 3);

  const dueToday = await runScenario({ startDate: '2026-01-09', days: 1, event: staleQuarterFinal, singleDay: true });
  gate('partida hoje bloqueia +1 sem alterar a data nem confirmar commit', dueToday.blocked && dueToday.profile.career_date === '2026-01-09' && dueToday.physicalCommits === 0);

  const nextRoundRun = buildRun({ currentRound: 2 });
  const semiFinalEvent = tournamentEvent({ officialDate: '2026-01-10', outerDate: '2026-01-08', run: nextRoundRun });
  const afterCompletedQf = await runScenario({ startDate: '2026-01-09', days: 3, event: semiFinalEvent });
  gate('QF concluída libera 09/01 e para na SF de 10/01', afterCompletedQf.result.finalDate === '2026-01-10' && afterCompletedQf.result.processedDays === 1);

  let continuityRun = buildRun({ currentRound: 0 });
  const reachedRounds = [];
  for (const expectedRound of ['R16', 'QF', 'SF', 'F']) {
    const currentMatch = runManager.getCurrentTournamentMatch(continuityRun);
    reachedRounds.push(currentMatch?.round);
    const recorded = runManager.recordTournamentMatchResult(continuityRun, {
      matchId: currentMatch.id,
      won: true,
      score: '6-3 6-4',
      now: new Date('2030-01-02T03:04:05.000Z'),
    });
    continuityRun = recorded.run;
  }
  gate('continuidade preserva R16 → QF → SF → F sem saltos', assert.deepEqual(reachedRounds, ['R16', 'QF', 'SF', 'F']) === undefined);
  gate('vitória na final encerra o run sem pendência fantasma', continuityRun.status === 'champion' && policy.getTournamentCommitmentDate(tournamentEvent({ run: continuityRun })) === null);

  const rolloverRun = buildRun({ dates: ['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'], currentRound: 1 });
  const rolloverEvent = tournamentEvent({ officialDate: '2027-01-01', outerDate: '2026-12-31', run: rolloverRun });
  const rollover = await runScenario({ startDate: '2026-12-31', days: 3, event: rolloverEvent });
  gate('mudança de mês/ano chega a 01/01 sem bloqueio antecipado', rollover.result.finalDate === '2027-01-01' && rollover.result.processedDays === 1);
  gate('comparação canônica é segura para timestamp UTC e independe do fuso local', policy.getCalendarDecisionState({ ...rolloverEvent, metadata: { ...rolloverEvent.metadata, tournament_run: { ...rolloverRun, matches: rolloverRun.matches.map((match, index) => index === 1 ? { ...match, date: '2027-01-01T00:00:00.000Z' } : match) } } }, '2027-01-01') === 'dueToday');

  const policySource = readFileSync(new URL('../src/game-core/calendarAdvancePolicy.js', import.meta.url), 'utf8');
  gate('resolver temporal não usa Date/toISOString nem conversão de timezone', !policySource.includes('new Date(') && !policySource.includes('toISOString('));

  console.log(`\n${gates} gates executados, todos PASS — Tournament Date Continuity Hotfix M4.1.1.`);
} finally {
  await vite.close();
}
