// Fase 15.5.2 — hotfix conservador: continuidade de rodadas/avanço do
// calendário, presença de campanha unificada (isTournamentParticipationConfirmed)
// e reconciliação de saves legados sem TournamentRegistration.
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

function buildRun({ dates = ['2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'], currentRound = 1, status = null } = {}) {
  const rounds = ['R16', 'QF', 'SF', 'F'];
  return {
    version: 2,
    tournamentId: 'phase1552-cup',
    tournamentName: 'Phase 15.5.2 Cup',
    status: status || (currentRound === 0 ? 'scheduled' : 'between_rounds'),
    currentRound,
    meetingsCompleted: { preTournament: true, rounds: [] },
    matches: dates.map((date, index) => ({
      id: `p1552-${rounds[index]}`,
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

function tournamentEvent({ officialDate = '2026-01-09', outerDate = '2026-01-08', run = null, status = 'scheduled' } = {}) {
  const tournamentRun = run || buildRun({ dates: ['2026-01-08', officialDate, '2026-01-10', '2026-01-11'] });
  return {
    id: 'phase1552-calendar-event',
    profile_id: 'phase1552-player',
    title: 'Phase 15.5.2 Cup',
    event_type: 'tournament',
    related_id: 'phase1552-cup',
    start_date: outerDate,
    end_date: outerDate,
    status,
    requires_decision: true,
    is_mandatory: true,
    decision_type: 'play_tournament',
    metadata: { tournament_run: tournamentRun, next_round_date: officialDate },
  };
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const registrationLib = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { isTournamentParticipationConfirmed } = registrationLib;
  const policy = await vite.ssrLoadModule('/src/game-core/calendarAdvancePolicy.js');
  const runManager = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');

  // ── A. isTournamentParticipationConfirmed — helper puro ──────────────────
  gate('registro confirmado -> true, independente do resto', isTournamentParticipationConfirmed({ registration: { status: 'confirmed' } }) === true);
  gate('sem registro e sem evento -> false', isTournamentParticipationConfirmed({}) === false);
  gate('sem registro, evento não é torneio -> false', isTournamentParticipationConfirmed({ event: { event_type: 'training_camp', status: 'scheduled' } }) === false);
  gate('sem registro, evento cancelado -> false (WO/desistência preservada)', isTournamentParticipationConfirmed({ event: { ...tournamentEvent(), status: 'cancelled' } }) === false);
  gate('sem registro, evento sem tournament_run -> false', isTournamentParticipationConfirmed({ event: { event_type: 'tournament', status: 'scheduled', metadata: {} } }) === false);
  gate('sem registro, run ativo no evento -> derivado true (save legado)', isTournamentParticipationConfirmed({ event: tournamentEvent() }) === true);
  gate('registro cancelado, mas run ativo no evento -> ainda deriva true (run canônico prevalece)', isTournamentParticipationConfirmed({ registration: { status: 'cancelled' }, event: tournamentEvent() }) === true);
  for (const terminal of ['eliminated', 'champion', 'finished']) {
    gate(`run terminal (${terminal}) sem registro -> false (zero compromisso fantasma)`, isTournamentParticipationConfirmed({ event: tournamentEvent({ run: buildRun({ status: terminal }) }) }) === false);
  }
  gate('tournamentRun explícito tem prioridade sobre o embutido no evento', isTournamentParticipationConfirmed({ event: { event_type: 'tournament', status: 'scheduled', metadata: {} }, tournamentRun: buildRun({ status: 'between_rounds' }) }) === true);

  // ── B. Guardas estáticas — a derivação está de fato conectada na UI ──────
  const tournamentModalSource = readFileSync(new URL('../src/components/tournaments/TournamentModal.jsx', import.meta.url), 'utf8');
  gate('TournamentModal.jsx busca o CalendarEvent ANTES de decidir se a presença está confirmada', tournamentModalSource.indexOf('CalendarEvent.filter') < tournamentModalSource.indexOf('isTournamentParticipationConfirmed({ event: calendarEvent })'));
  gate('TournamentModal.jsx usa isTournamentParticipationConfirmed como fallback do registro canônico', tournamentModalSource.includes('isTournamentParticipationConfirmed({ event: calendarEvent })'));

  const tournamentsPageSource = readFileSync(new URL('../src/pages/Tournaments.jsx', import.meta.url), 'utf8');
  gate('Tournaments.jsx (botão "Jogar" da lista) também deriva presença de activeRun antes de mandar para a inscrição', tournamentsPageSource.includes('isTournamentParticipationConfirmed({ event: activeRun })'));

  const calendarPageSource = readFileSync(new URL('../src/pages/CalendarPage.jsx', import.meta.url), 'utf8');
  gate('CalendarPage.jsx (avanço em lote +3/+7) usa describeCalendarBlock com CTA acionável, igual ao avanço de +1', calendarPageSource.includes('describeCalendarBlock(result.blockedBy)') && calendarPageSource.includes('handlePlayTournament(result.blockedBy)'));

  // ── C. R32 -> R16 -> QF -> SF -> F sem auto-start e sem reconfirmação ────
  let run = buildRun({ currentRound: 0, dates: ['2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11'] });
  const roundsSeen = [];
  let previousRegistrationStillConfirmed = true;
  for (const expectedRound of ['R16', 'QF', 'SF', 'F']) {
    const match = runManager.getCurrentTournamentMatch(run);
    roundsSeen.push(match.round);
    const dayBefore = policy.getCalendarDecisionState(tournamentEvent({ run }), addOneDayBack(match.date));
    gate(`${expectedRound}: um dia antes da data oficial a fase NÃO é playable/round_preparation`, runManager.getTournamentRunPhase(run, addOneDayBack(match.date)) === 'waiting');
    gate(`${expectedRound}: um dia antes, o bloqueio de calendário é "future" (nunca dueToday/overdue cedo demais)`, dayBefore === 'future');
    // A presença já foi confirmada na inscrição inicial; nenhuma rodada exige nova confirmação manual.
    const stillConfirmed = isTournamentParticipationConfirmed({ event: tournamentEvent({ run }) });
    gate(`${expectedRound}: presença de campanha continua confirmada sem ação manual`, stillConfirmed === true);
    previousRegistrationStillConfirmed = previousRegistrationStillConfirmed && stillConfirmed;
    const recorded = runManager.recordTournamentMatchResult(run, { matchId: match.id, won: true, score: '6-3 6-4' });
    run = recorded.run;
  }
  gate('Sequência completa R32 -> R16 -> QF -> SF -> F respeitou a ordem sem pular rodadas', assert.deepEqual(roundsSeen, ['R16', 'QF', 'SF', 'F']) === undefined);
  gate('Nenhuma rodada exigiu confirmação manual além da inscrição inicial', previousRegistrationStillConfirmed);
  gate('Vitória na final encerra como campeão', run.status === 'champion');
  gate('Torneio encerrado (campeão): isTournamentParticipationConfirmed cai para false (sem compromisso fantasma)', isTournamentParticipationConfirmed({ event: tournamentEvent({ run }) }) === false);

  // ── D. Jogador eliminado: nenhum blocker futuro daquele torneio ─────────
  let eliminationRun = buildRun({ currentRound: 1 });
  const eliminationMatch = runManager.getCurrentTournamentMatch(eliminationRun);
  const eliminated = runManager.recordTournamentMatchResult(eliminationRun, { matchId: eliminationMatch.id, won: false, score: '4-6 3-6' });
  eliminationRun = eliminated.run;
  gate('Derrota marca o run como eliminado', eliminationRun.status === 'eliminated');
  gate('run eliminado: getTournamentCommitmentDate não aponta mais nenhuma data pendente', policy.getTournamentCommitmentDate(tournamentEvent({ run: eliminationRun })) === null);
  gate('run eliminado: shouldBlockBeforeAdvance nunca bloqueia (mesmo na data que seria da próxima rodada)', policy.shouldBlockBeforeAdvance(tournamentEvent({ run: eliminationRun }), eliminationRun.matches[2].date) === false);
  gate('run eliminado: isTournamentParticipationConfirmed é false (sem exigir nada, sem fingir presença)', isTournamentParticipationConfirmed({ event: tournamentEvent({ run: eliminationRun }) }) === false);

  // ── E. +1 / +3 / +7 — avanço real via pipeline de carreira ──────────────
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { advanceCareerDays } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');

  const memory = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(memory)));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ career_id: 'phase1552-audit', career_name: 'Phase 15.5.2 Audit' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'phase1552-player',
    sport_name: 'Continuity 15.5.2',
    career_date: '2026-01-08',
    birth_date: '2001-01-01',
    energy: 100, fatigue: 0, morale: 70, form: 50, coins: 25000, xp: 0,
    level: 'Amador', court_side: 'direita', play_style: 'controle', weekly_training_enabled: false,
  });
  const seeded = await activeCareerAdapter.getActiveCareer({ cloneResult: false });
  seeded.entities.CalendarEvent = [];
  // Save legado: sem nenhuma linha em TournamentRegistration para este torneio.
  seeded.entities.TournamentRegistration = [];
  await activeCareerAdapter.saveActiveCareer(seeded);
  const initialCareer = clone(await activeCareerAdapter.getActiveCareer());

  async function runScenario({ startDate, days, event, singleDay = false }) {
    const scenario = clone(initialCareer);
    scenario.player.career_date = startDate;
    scenario.entities.CalendarEvent = event ? [clone(event)] : [];
    scenario.entities.TournamentRegistration = [];
    activeCareerAdapter.setActiveCareer(scenario);
    activeCareerAdapter.lastRoutineBackupAt = Date.now();
    activeCareerAdapter.lastIndexSyncAt = Date.now();
    const start = await localGame.entities.PlayerProfile.get('phase1552-player');
    if (singleDay) {
      try {
        const profile = await advanceCareerDayOnce(start);
        return { profile, blocked: false };
      } catch (error) {
        const profile = await localGame.entities.PlayerProfile.get('phase1552-player');
        return { profile, blocked: true, error };
      }
    }
    const result = await advanceCareerDays(start, days);
    return { result, profile: result.profile };
  }

  const qfEvent = tournamentEvent({ officialDate: '2026-01-09', outerDate: '2026-01-08' });
  const plus1 = await runScenario({ startDate: '2026-01-08', days: 1, event: qfEvent, singleDay: true });
  gate('+1 (save sem TournamentRegistration): avança até a data da partida sem exigir confirmação manual', !plus1.blocked && plus1.profile.career_date === '2026-01-09');

  const plus3 = await runScenario({ startDate: '2026-01-08', days: 3, event: qfEvent });
  gate('+3: avança até a data da partida e interrompe ali (processedDays correto)', plus3.result.finalDate === '2026-01-09' && plus3.result.processedDays === 1 && plus3.result.stopReason === 'upcomingTournament');

  const qfLater = tournamentEvent({ officialDate: '2026-01-09', outerDate: '2026-01-06' });
  const plus7 = await runScenario({ startDate: '2026-01-06', days: 7, event: qfLater });
  gate('+7: avança até a data da partida e interrompe ali (processedDays correto)', plus7.result.finalDate === '2026-01-09' && plus7.result.processedDays === 3 && plus7.result.stopReason === 'upcomingTournament');

  const dueToday = await runScenario({ startDate: '2026-01-09', days: 1, event: qfEvent, singleDay: true });
  gate('09/01 com QF pendente: tentar avançar 09->10 sem jogar bloqueia', dueToday.blocked);

  // ── F. Torneio encerrado: zero compromisso fantasma no avanço real ──────
  const championEvent = tournamentEvent({ run: { ...buildRun({ currentRound: 3 }), status: 'champion' }, status: 'completed' });
  const afterChampion = await runScenario({ startDate: '2026-01-11', days: 3, event: championEvent });
  gate('Torneio encerrado (evento completed): avanço de dias não é bloqueado por ele', afterChampion.result.finalDate === '2026-01-14' && afterChampion.result.processedDays === 3);

  // ── G. Simulação procedural de campanhas (presença/blocker, sem engine) ─
  let campaigns = 0;
  let prematureBlocks = 0;
  let prematureAutoStart = 0;
  let extraConfirmationsNeeded = 0;
  for (let seed = 0; seed < 100; seed += 1) {
    const totalRounds = 2 + (seed % 4); // 2..5 rounds
    const dates = Array.from({ length: totalRounds }, (_, index) => `2026-0${1 + Math.floor((8 + index) / 28)}-${String(((8 + index - 1) % 28) + 1).padStart(2, '0')}`);
    let campaignRun = { ...buildRun({ dates, currentRound: 0 }), matches: buildRun({ dates, currentRound: 0 }).matches };
    campaigns += 1;
    const loseAt = seed % 7 === 0 ? Math.floor(seed / 7) % totalRounds : -1; // ocasionalmente perde no meio
    for (let round = 0; round < totalRounds; round += 1) {
      const match = runManager.getCurrentTournamentMatch(campaignRun);
      if (!match) break;
      const dayBefore = addOneDayBack(match.date);
      if (runManager.getTournamentRunPhase(campaignRun, dayBefore) !== 'waiting') prematureAutoStart += 1;
      if (policy.shouldBlockBeforeAdvance(tournamentEvent({ run: campaignRun }), dayBefore)) prematureBlocks += 1;
      if (!isTournamentParticipationConfirmed({ event: tournamentEvent({ run: campaignRun }) })) extraConfirmationsNeeded += 1;
      const won = round !== loseAt;
      const recorded = runManager.recordTournamentMatchResult(campaignRun, { matchId: match.id, won, score: won ? '6-3 6-4' : '4-6 3-6' });
      campaignRun = recorded.run;
      if (!won) break;
    }
  }
  gate('Simulação de 100 campanhas: zero auto-start prematuro', prematureAutoStart === 0);
  gate('Simulação de 100 campanhas: zero blocker antecipado', prematureBlocks === 0);
  gate('Simulação de 100 campanhas: zero rodada exigindo confirmação manual após a inscrição inicial', extraConfirmationsNeeded === 0);
  gate('Simulação executou de fato 100 campanhas', campaigns === 100);

  console.log(`\n${gates} gates executados, todos PASS — Fase 15.5.2 Tournament Continuity Hotfix (100 campanhas simuladas).`);
} finally {
  await vite.close();
}

function addOneDayBack(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - 1));
  return date.toISOString().slice(0, 10);
}
