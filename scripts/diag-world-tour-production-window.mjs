/**
 * Playthrough 4.3B - diagnóstico real do lifecycle da primeira onda World Tour.
 *
 * O script carrega o mesmo grafo de módulos do app através do servidor Vite
 * em middleware. A única diferença para APK/desktop é o storage físico:
 * GameStorage recebe um storage em memória, mas o CareerManager, localGame,
 * geração da temporada, avanço do dia e Living World são os mesmos.
 *
 * Uso: node scripts/diag-world-tour-production-window.mjs
 */
import assert from 'node:assert/strict';
import { createServer } from 'vite';

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(path) { this.directories.add(path); return true; }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) { this.files.set(path, String(content)); }
  async readText(path) {
    if (!this.files.has(path)) { const error = new Error(`Missing ${path}`); error.code = 'FILE_NOT_FOUND'; throw error; }
    return this.files.get(path);
  }
  async remove(path) { this.files.delete(path); return true; }
  async rename(source, destination) { this.files.set(destination, this.files.get(source)); this.files.delete(source); return destination; }
  async copy(source, destination) { this.files.set(destination, this.files.get(source)); return destination; }
  async list(directory = '.') {
    const prefix = directory && directory !== '.' ? `${directory}/` : '';
    return [...this.files.keys()]
      .filter((path) => path.startsWith(prefix))
      .map((path) => ({ name: path.slice(prefix.length), isDirectory: false }));
  }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}

globalThis.location = { hostname: '127.0.0.1', pathname: '/headless-diagnostic' };
globalThis.window = { dispatchEvent() {}, location: globalThis.location };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const START_DATE = '2026-01-01';
const EARLY_CHECKPOINTS = ['2026-02-01', '2026-02-03', '2026-02-05', '2026-02-07'];
const TIER_PRIORITY = { Crown: 0, Elite: 1, Masters: 2, Platinum: 3, Gold: 4, Silver: 5, Bronze: 6 };

function datePlusOne(date) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function roundStats(tournament) {
  const rounds = Array.isArray(tournament.bracket_history) ? tournament.bracket_history : [];
  const matches = rounds.reduce((sum, round) => sum + (Array.isArray(round.matches) ? round.matches.length : 0), 0);
  const actualDrawSize = Array.isArray(tournament.placements)
    ? tournament.placements.length
    : (rounds[0]?.matches?.length || 0) * 2;
  return {
    rounds: rounds.length,
    matches,
    drawSize: Number(tournament.main_draw_size || 0),
    expectedMatches: Math.max(0, Number(tournament.main_draw_size || 0) - 1),
    actualDrawSize,
    actualExpectedMatches: Math.max(0, actualDrawSize - 1),
  };
}

function formatTournament(tournament, getTier) {
  const tier = getTier(tournament.tier);
  return {
    id: tournament.id,
    name: tournament.name,
    tier: tournament.tier,
    tier_label: tournament.tier_label || tier.label,
    start_date: tournament.start_date,
    end_date: tournament.end_date,
    draw_size: tournament.main_draw_size,
  };
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { getTournamentTierConfig } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { getTournamentRegistrationWindow } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { getTournamentDrawAnchorDate } = await vite.ssrLoadModule('/src/lib/tournamentDraw.js');
  const { generateJournal } = await vite.ssrLoadModule('/src/lib/journal.js');
  const { RANKING_RESULT_ENTITY } = await vite.ssrLoadModule('/src/game-core/rankingWindow.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: 'Playthrough 4.3A', playerName: 'Diagnóstico Real' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'playthrough-43a-player',
    sport_name: 'Diagnóstico Real',
    career_date: START_DATE,
    birth_date: '2001-01-01',
    level: 'Amador',
    play_style: 'controle',
    court_side: 'direita',
    preferred_side: 'right',
    handedness: 'right',
    tactical_role: 'controlador',
    overall: 52,
    overall_rating: 52,
    ranking_position: 900,
    energy: 100,
    fatigue: 0,
    coins: 5000,
    xp: 0,
    morale: 70,
    form: 50,
    weekly_training_enabled: false,
    trainings_today: 0,
    practice_matches_today: 0,
    tournament_matches_today: 0,
  });

  await ensureWorldSeed2025();
  await ensureFutureTournaments(START_DATE);
  const player = await activeCareerAdapter.getPlayerProfile();
  const allBefore = await localGame.entities.Tournament.list('start_date', 2000);
  const firstTwenty = allBefore.slice(0, 20);
  assert(firstTwenty.length >= 20, `esperava 20 torneios, encontrei ${firstTwenty.length}`);

  console.log('\n=== Playthrough 4.3B - Bootstrap real ===\n');
  console.log(`Carreira: ${career.career_id}`);
  console.log(`Perfil: ${player.id} | data inicial: ${player.career_date}`);
  console.log('\n--- Primeiros 20 Tournament gerados pelo app ---');
  console.table(firstTwenty.map((tournament) => formatTournament(tournament, getTournamentTierConfig)));
  const london = firstTwenty.find((tournament) => tournament.name === 'Londres Challenge');
  if (london) console.log(`Londres Challenge tier real: ${london.tier} (${london.tier_label})`);
  else console.log('Londres Challenge: não está entre os 20 primeiros Tournament gerados.');

  const firstWaveStart = firstTwenty
    .filter((tournament) => tournament.world_tour_event && !tournament.is_exhibition)
    .map((tournament) => tournament.start_date)
    .sort()[0];
  const firstWave = allBefore.filter((tournament) => tournament.world_tour_event && tournament.start_date === firstWaveStart);
  const maxWaveEnd = firstWave.reduce((max, tournament) => tournament.end_date > max ? tournament.end_date : max, firstWaveStart);
  const finalTargetDate = [maxWaveEnd, ...EARLY_CHECKPOINTS].sort().at(-1);
  const trackedIds = new Set(firstWave.map((tournament) => tournament.id));
  const statusSnapshots = new Map();
  const dailyReports = new Map();
  const readWave = async () => {
    const currentTournaments = await localGame.entities.Tournament.list('start_date', 2000);
    const profileSnapshot = await activeCareerAdapter.getPlayerProfile();
    return {
      tournaments: currentTournaments.filter((tournament) => trackedIds.has(tournament.id)),
      report: profileSnapshot?.game_state_last_report?.livingWorld?.worldTour || profileSnapshot?.game_state_last_report?.worldTour || null,
    };
  };
  const recordCheckpoint = async (date) => {
    const snapshot = await readWave();
    statusSnapshots.set(date, new Map(snapshot.tournaments.map((tournament) => [tournament.id, tournament.status])));
    dailyReports.set(date, snapshot.report);
  };

  let current = player;
  let steps = 0;
  while (current.career_date < finalTargetDate) {
    const before = current.career_date;
    current = await advanceCareerDayOnce(current);
    steps += 1;
    assert(current.career_date === datePlusOne(before), `coordinator não avançou de ${before}`);
    if (EARLY_CHECKPOINTS.includes(current.career_date) || firstWave.some((tournament) => datePlusOne(tournament.end_date) === current.career_date)) {
      await recordCheckpoint(current.career_date);
    }
  }
  await recordCheckpoint(current.career_date);
  assert.equal(current.career_date, finalTargetDate);
  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  const windowTournaments = tournaments.filter((tournament) => (
    tournament.world_tour_event
    && trackedIds.has(tournament.id)
  ));
  const results = await localGame.entities[RANKING_RESULT_ENTITY].list(null, 10000);
  const events = await localGame.entities.WorldEvent.list('event_date', 10000);
  const journal = await generateJournal();
  const journalTournamentNames = new Set((journal.recentResults || []).filter((row) => row.scope === 'circuit').map((row) => row.tournament));

  console.log(`\n--- Avanço real ---\nDias processados: ${steps}\nData confirmada: ${current.career_date}\nPrimeira onda: ${firstWaveStart}\nFim máximo da onda: ${maxWaveEnd}\nValidação end_date + 2: ${datePlusOne(datePlusOne(maxWaveEnd))}`);
  console.log('\n--- Datas e status reais da onda ---');
  console.table(windowTournaments.map((tournament) => {
    const registration = getTournamentRegistrationWindow(tournament);
    return {
      id: tournament.id,
      name: tournament.name,
      start_date: tournament.start_date,
      end_date: tournament.end_date,
      registration_deadline: registration.closesAt,
      draw_date: null,
      draw_anchor_date: getTournamentDrawAnchorDate(null, tournament),
      tier: tournament.tier,
      draw_size: tournament.main_draw_size,
      status_01_02: statusSnapshots.get('2026-02-01')?.get(tournament.id) || '-',
      status_03_02: statusSnapshots.get('2026-02-03')?.get(tournament.id) || '-',
      status_05_02: statusSnapshots.get('2026-02-05')?.get(tournament.id) || '-',
      status_07_02: statusSnapshots.get('2026-02-07')?.get(tournament.id) || '-',
      status_end_plus_1: statusSnapshots.get(datePlusOne(tournament.end_date))?.get(tournament.id) || '-',
      status_final: tournament.status,
    };
  }));
  windowTournaments.forEach((tournament) => {
    const registration = getTournamentRegistrationWindow(tournament);
    console.log(`STATUS ${tournament.name} | id=${tournament.id} | start=${tournament.start_date} | end=${tournament.end_date} | deadline=${registration.closesAt || '-'} | draw_date=- | draw_anchor=${getTournamentDrawAnchorDate(null, tournament) || '-'} | 01/02=${statusSnapshots.get('2026-02-01')?.get(tournament.id) || '-'} | 03/02=${statusSnapshots.get('2026-02-03')?.get(tournament.id) || '-'} | 05/02=${statusSnapshots.get('2026-02-05')?.get(tournament.id) || '-'} | 07/02=${statusSnapshots.get('2026-02-07')?.get(tournament.id) || '-'} | end+1=${statusSnapshots.get(datePlusOne(tournament.end_date))?.get(tournament.id) || '-'} | final=${tournament.status} | cancelled=${Boolean(tournament.world_tour_cancelled)}`);
  });
  console.log('\n--- Relatório World Tour por checkpoint ---');
  for (const [date, report] of dailyReports) console.log(`REPORT ${date} | pending=${report?.pending ?? '-'} | resolved=${report?.resolved ?? '-'} | errors=${JSON.stringify(report?.errors || [])} | raw=${JSON.stringify(report || null)}`);
  console.log('\n--- Janela oficial real ---');
  const rows = windowTournaments.map((tournament) => {
    const bracket = roundStats(tournament);
    const tournamentResults = results.filter((result) => result.tournament_id === tournament.id);
    const tournamentEvents = events.filter((event) => event.related_tournament_id === tournament.id && ['tournament_result', 'tournament_cancelled'].includes(event.event_type));
    const athletesScored = new Set(tournamentResults.map((result) => result.athlete_id));
    const racePoints = tournamentResults.reduce((sum, result) => sum + Number(result.points || 0), 0);
    const journalEligible = Boolean(tournament.champion && tournament.runner_up);
    const row = {
      id: tournament.id,
      name: tournament.name,
      tier: tournament.tier,
      tier_label: tournament.tier_label || getTournamentTierConfig(tournament.tier).label,
      start_date: tournament.start_date,
      end_date: tournament.end_date,
      draw_size: tournament.main_draw_size,
      status: tournament.status,
      bracket_schema_version: tournament.bracket_schema_version || null,
      bracket_rounds: bracket.rounds,
      bracket_matches: bracket.matches,
      expected_matches: bracket.expectedMatches,
      actual_draw_size: bracket.actualDrawSize,
      actual_expected_matches: bracket.actualExpectedMatches,
      champion: tournament.champion || null,
      runner_up: tournament.runner_up || null,
      world_tour_resolved: Boolean(tournament.world_tour_resolved),
      race_points_distributed: racePoints,
      athletes_scored: athletesScored.size,
      WorldEvent_id: tournamentEvents[0]?.id || null,
      WorldEvent_event_type: tournamentEvents[0]?.event_type || null,
      journal_eligible: journalEligible,
      cancellation_consistent: Boolean(tournament.world_tour_cancelled && tournament.status === 'cancelado' && tournament.current_phase === 'cancelado'),
      resolution_consistent: Boolean(
        (tournament.world_tour_cancelled && tournament.status === 'cancelado' && tournament.current_phase === 'cancelado' && tournamentEvents.length > 0)
        || (tournament.world_tour_resolved && tournament.champion && tournament.runner_up && bracket.matches === bracket.actualExpectedMatches && tournamentEvents.length > 0 && racePoints > 0)
      ),
    };
    assert.equal(bracket.matches, bracket.actualExpectedMatches, `${tournament.name}: partidas não fecham a chave efetiva`);
    return row;
  });
  console.table(rows);
  rows.forEach((row) => console.log(`TOURNAMENT ${row.id} | ${row.name} | ${row.tier} | ${row.tier_label} | ${row.start_date}..${row.end_date} | draw=${row.draw_size} | status=${row.status} | schema=${row.bracket_schema_version} | rounds=${row.bracket_rounds} | matches=${row.bracket_matches} | expected=${row.expected_matches} | actual_draw=${row.actual_draw_size} | champion=${row.champion || '-'} | runner_up=${row.runner_up || '-'} | resolved=${row.world_tour_resolved} | race=${row.race_points_distributed} | athletes=${row.athletes_scored} | event=${row.WorldEvent_id || '-'} | journal=${row.journal_eligible}`));
  const unresolved = rows.filter((row) => !row.resolution_consistent);
  if (unresolved.length) {
    console.log('\n--- Inconsistências reais encontradas ---');
    console.table(unresolved.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      world_tour_resolved: row.world_tour_resolved,
      champion: row.champion,
      race_points_distributed: row.race_points_distributed,
      WorldEvent_id: row.WorldEvent_id,
    })));
  }

  const realRaceTotal = rows.reduce((sum, row) => sum + row.race_points_distributed, 0);
  console.log('\n--- Race real ---');
  console.table(rows.map((row) => ({ Tournament: row.name, Tier: row.tier, 'Athletes Scored': row.athletes_scored, 'Race Points': row.race_points_distributed })));
  rows.forEach((row) => console.log(`RACE ${row.name} | ${row.tier} | athletes=${row.athletes_scored} | points=${row.race_points_distributed}`));
  console.log(`TOTAL DA JANELA: ${realRaceTotal}`);

  console.log('\n--- WorldEvents entregues ao Jornal ---');
  const journalEvents = events
    .filter((event) => event.event_type === 'tournament_result' && rows.some((row) => row.id === event.related_tournament_id))
    .sort((a, b) => (TIER_PRIORITY[a.tier] ?? 99) - (TIER_PRIORITY[b.tier] ?? 99));
  console.table(journalEvents.map((event, index) => ({
    tournament_id: event.related_tournament_id,
    champion_cited: event.title?.split(' conquista o ')[0] || null,
    tier: event.tier,
    impact: event.impact ?? null,
    editorial_priority: index + 1,
    journal_circuit_result: journalTournamentNames.has(rows.find((row) => row.id === event.related_tournament_id)?.name),
  })));
  journalEvents.forEach((event, index) => console.log(`JOURNAL ${event.related_tournament_id} | champion=${event.title?.split(' conquista o ')[0] || '-'} | tier=${event.tier} | impact=${event.impact ?? '-'} | priority=${index + 1}`));
  console.log(`Eventos de torneios distintos no conjunto do Jornal: ${new Set(journalEvents.map((event) => event.related_tournament_id)).size}`);
  console.log(`\n${PASS} Diagnóstico real concluído.`);
} catch (error) {
  console.error(`${FAIL} Diagnóstico real falhou:`, error);
  process.exitCode = 1;
} finally {
  await vite.close();
}
