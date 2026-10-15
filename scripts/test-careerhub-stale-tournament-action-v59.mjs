// Playthrough 5.9, BUG 1 — Centro da Carreira mostrava "Jogar Semifinal —
// Roma Pré-Temporada" para sempre, mesmo depois do torneio encerrado, do
// jogador eliminado e de vários dias avançados (relato do playtest real).
//
// Cadeia de autoridade errada (localizada por auditoria de código, provada
// abaixo com carreira REAL):
//   1. CareerHub.jsx carrega `CalendarEvent.filter({profile_id, event_type:
//      'tournament'})` — SEM filtro de status: traz todo evento de torneio
//      que a carreira já teve, inclusive concluídos/missed.
//   2. `setActiveTournamentEvent(events.find(e => e.metadata?.tournament_run))`
//      — pega o PRIMEIRO evento com run, sem checar status terminal nem
//      data. Numa lista em ordem de criação, o primeiro é justamente o
//      torneio MAIS ANTIGO da carreira (Roma, no playtest) — ele fica
//      "ativo" para sempre, mesmo depois de Londres e Dubai.
//   3. O CTA usa `getCurrentTournamentMatch(run)` CRU, que devolve
//      `matches[currentRound]` sem nenhuma guarda de status — ao contrário
//      de `getTournamentRunPhase`, que já trata 'eliminated'/'champion'/
//      'finished'/'missed' corretamente.
//   4. A condição de data é `match.date <= career_date` — aberta pra
//      sempre: uma vez que a data passou, continua verdadeira todo dia.
//
// Este teste reproduz o estado final REAL (run terminal + dias avançados) e
// exige que a autoridade nova (`selectActiveTournamentRun`) NÃO ofereça
// ação jogável. Também cobre reload (releitura do mesmo save).
import assert from 'node:assert/strict';
import { createServer } from 'vite';

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(path) { this.directories.add(path); }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) { this.files.set(path, String(content)); }
  async readText(path) { if (!this.files.has(path)) { const error = new Error('missing'); error.code = 'FILE_NOT_FOUND'; throw error; } return this.files.get(path); }
  async remove(path) { this.files.delete(path); }
  async rename(source, destination) { this.files.set(destination, this.files.get(source)); this.files.delete(source); }
  async copy(source, destination) { this.files.set(destination, this.files.get(source)); }
  async list(directory = '.') { const prefix = directory === '.' ? '' : `${directory}/`; return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ name: key.slice(prefix.length), isDirectory: false })); }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-careerhub-stale-tournament-action-v59', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

// Réplica EXATA do predicado que o CareerHub usava antes desta fase — serve
// só como evidência do bug (mostra o que a tela escolhia), nunca como
// autoridade nova.
function legacyCareerHubPick(events) {
  return (events || []).find((event) => event.metadata?.tournament_run) || null;
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
  const { registerForTournament } = await vite.ssrLoadModule('/src/lib/calendarSystem.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { getTournamentRegistrationWindow } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const runManager = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');
  const { getCurrentTournamentMatch, selectActiveTournamentRun } = runManager;

  const storage = new MemoryStorage();
  const manager = new CareerManager(new CareerRepository(new GameStorage(storage)));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.9 Stale Action', playerName: 'Player59Stale' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p59-stale', sport_name: 'Player59Stale', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50,
  });
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: BOTS_BY_DIFFICULTY.iniciante[0].id });
  profile = await activeCareerAdapter.getPlayerProfile();

  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');

  // Primeiro torneio da carreira (o "Roma" do playtest): o mais cedo em que
  // o jogador consegue se inscrever.
  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  const target = tournaments.find((t) => ['Exibição', 'Bronze', 'Silver'].includes(t.tier) && Number(t.main_draw_size) >= 4);
  assert.ok(target, 'pré-condição: precisa existir um torneio de entrada no calendário semeado');
  console.log(`torneio alvo: ${target.name} (${target.tier}, início ${target.start_date})`);

  const regWindow = getTournamentRegistrationWindow(target);
  if (regWindow.opensAt && profile.career_date < regWindow.opensAt) {
    profile = await activeCareerAdapter.updatePlayerProfile(profile.id, { career_date: regWindow.opensAt });
  }
  const reg = await registerForTournament(profile, target, 0, {});
  assert.ok(reg.success, `pré-condição: inscrição precisa ser aceita (${reg.message || 'sem mensagem'})`);
  profile = await activeCareerAdapter.getPlayerProfile();

  // Avança até o sorteio existir (o run do jogador nasce aí). O avanço
  // diário BLOQUEIA corretamente quando há partida pendente — por isso o
  // playtest só chegou a Londres/Dubai DEPOIS de Roma resolver.
  const drawDate = new Date(`${target.start_date}T00:00:00Z`); drawDate.setUTCDate(drawDate.getUTCDate() - 2);
  const drawDateStr = drawDate.toISOString().slice(0, 10);
  let guard = 0;
  while (profile.career_date < drawDateStr && guard < 60) {
    profile = await advanceCareerDayOnce(profile);
    guard += 1;
  }

  const findRunEvent = async () => (await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: target.id }))
    .find((e) => e.event_type === 'tournament' && e.metadata?.tournament_run);
  let runEvent = await findRunEvent();
  assert.ok(runEvent, 'pré-condição: o sorteio precisa ter criado um tournament_run para o jogador');

  // Reproduz "chegou até a semifinal e foi eliminado": vence as rodadas
  // iniciais e perde na penúltima — usando o motor REAL
  // (recordTournamentMatchResult), nunca um estado fabricado à mão.
  let run = runEvent.metadata.tournament_run;
  const totalRounds = run.matches.length;
  let reachedRound = null;
  for (let i = 0; i < totalRounds; i += 1) {
    const current = getCurrentTournamentMatch(run);
    if (!current) break;
    const isLastPlayed = i === Math.max(0, totalRounds - 2); // perde na penúltima (semifinal)
    const outcome = runManager.recordTournamentMatchResult(run, {
      matchId: current.id, won: !isLastPlayed, score: '6/4 6/4', tournament: target,
    });
    run = outcome.run;
    reachedRound = current.round;
    if (outcome.terminal) break;
  }
  console.log(`run levado até: ${reachedRound} | status final do run = ${run.status} | currentRound=${run.currentRound}`);
  assert.equal(run.status, 'eliminated', 'pré-condição: o run precisa terminar eliminado (como no playtest)');

  await localGame.entities.CalendarEvent.update(runEvent.id, {
    metadata: { ...(runEvent.metadata || {}), tournament_run: run },
    requires_decision: false,
  });

  // Agora sim: "continuou avançando os dias".
  const endDate = target.end_date || target.start_date;
  const stopDate = new Date(`${endDate}T00:00:00Z`); stopDate.setUTCDate(stopDate.getUTCDate() + 20);
  const stopDateStr = stopDate.toISOString().slice(0, 10);
  guard = 0;
  while (profile.career_date < stopDateStr && guard < 120) {
    profile = await advanceCareerDayOnce(profile);
    guard += 1;
  }
  console.log(`data final da carreira após avançar: ${profile.career_date} (torneio terminou em ${endDate})`);

  const events = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, event_type: 'tournament' });
  const withRun = (events || []).filter((e) => e.metadata?.tournament_run);
  console.log(`eventos de torneio: ${events?.length || 0} | com tournament_run: ${withRun.length}`);
  for (const e of withRun) {
    const run = e.metadata.tournament_run;
    const m = getCurrentTournamentMatch(run);
    console.log(`  evento=${e.related_name || e.title} status=${e.status} run.status=${run.status} currentRound=${run.currentRound} match=${m?.round || 'n/a'} matchDate=${m?.date || 'n/a'} matchStatus=${m?.status || 'n/a'}`);
  }

  // EVIDÊNCIA do bug: o predicado antigo ainda elege um evento "ativo".
  const legacyPick = legacyCareerHubPick(events);
  const legacyMatch = legacyPick ? getCurrentTournamentMatch(legacyPick.metadata.tournament_run) : null;
  const legacyWouldShowCta = Boolean(legacyMatch && legacyMatch.date <= profile.career_date);
  console.log(`\npredicado ANTIGO do CareerHub: evento=${legacyPick?.related_name || legacyPick?.title || 'nenhum'} | mostraria CTA="${legacyMatch ? `Jogar ${legacyMatch.round}` : 'nenhum'}" -> ${legacyWouldShowCta}`);

  await check('autoridade nova existe (selectActiveTournamentRun exportada por TournamentRunManager)', async () => {
    assert.equal(typeof selectActiveTournamentRun, 'function', 'selectActiveTournamentRun precisa ser exportada');
  });

  await check('BUG 1: depois do torneio encerrado e dias avançados, NENHUMA ação jogável de torneio é oferecida', async () => {
    const active = selectActiveTournamentRun(events, profile.career_date);
    assert.equal(active, null, `ainda ofereceu ação: ${active?.event?.related_name || active?.event?.title} / ${active?.match?.round}`);
  });

  await check('BUG 1 (reload): reler o mesmo save do zero mantém a ausência de ação jogável', async () => {
    const reloadManager = new CareerManager(new CareerRepository(new GameStorage(storage)));
    activeCareerAdapter.careerManager = reloadManager;
    activeCareerAdapter.clearActiveCareer();
    const reloaded = await reloadManager.readCareer(career.career_id);
    activeCareerAdapter.setActiveCareer(reloaded);
    const reloadedProfile = await activeCareerAdapter.getPlayerProfile();
    const reloadedEvents = await localGame.entities.CalendarEvent.filter({ profile_id: reloadedProfile.id, event_type: 'tournament' });
    const active = selectActiveTournamentRun(reloadedEvents, reloadedProfile.career_date);
    assert.equal(active, null, `após reload ainda ofereceu ação: ${active?.event?.related_name} / ${active?.match?.round}`);
  });

  await check('a autoridade nova AINDA oferece ação quando a partida é realmente jogável hoje (não virou um "nunca mostra")', async () => {
    const liveEvent = {
      id: 'synthetic-live', related_id: 'synthetic-tournament', related_name: 'Torneio Vivo',
      event_type: 'tournament', status: 'scheduled',
      metadata: {
        tournament_run: {
          status: 'between_rounds', currentRound: 0, tournamentName: 'Torneio Vivo',
          matches: [{ id: 'm1', round: 'Semifinal', date: '2026-03-10', status: 'scheduled', preparationCompleted: true, stage: 'main' }],
          meetingsCompleted: { preTournament: true, rounds: [] },
        },
      },
    };
    const active = selectActiveTournamentRun([liveEvent], '2026-03-10');
    assert.ok(active, 'deveria oferecer ação para uma partida agendada para HOJE com run vivo');
    assert.equal(active.match.round, 'Semifinal');
  });

  await check('a autoridade nova não oferece ação para partida de data FUTURA (não antecipa rodada)', async () => {
    const futureEvent = {
      id: 'synthetic-future', related_id: 'synthetic-tournament-2', related_name: 'Torneio Futuro',
      event_type: 'tournament', status: 'scheduled',
      metadata: {
        tournament_run: {
          status: 'between_rounds', currentRound: 0, tournamentName: 'Torneio Futuro',
          matches: [{ id: 'm1', round: 'Final', date: '2026-04-20', status: 'scheduled', preparationCompleted: true, stage: 'main' }],
          meetingsCompleted: { preTournament: true, rounds: [] },
        },
      },
    };
    const active = selectActiveTournamentRun([futureEvent], '2026-04-10');
    assert.equal(active, null, 'não deveria oferecer ação para partida ainda no futuro');
  });

  await check('run terminal (eliminado) nunca produz ação, mesmo com evento ainda "scheduled"', async () => {
    const eliminatedEvent = {
      id: 'synthetic-elim', related_id: 'synthetic-tournament-3', related_name: 'Torneio Encerrado',
      event_type: 'tournament', status: 'scheduled',
      metadata: {
        tournament_run: {
          status: 'eliminated', currentRound: 1, tournamentName: 'Torneio Encerrado',
          matches: [
            { id: 'm1', round: 'Quartas', date: '2026-02-01', status: 'completed', preparationCompleted: true, stage: 'main' },
            { id: 'm2', round: 'Semifinal', date: '2026-02-02', status: 'scheduled', preparationCompleted: true, stage: 'main' },
          ],
          meetingsCompleted: { preTournament: true, rounds: [] },
        },
      },
    };
    const active = selectActiveTournamentRun([eliminatedEvent], '2026-02-02');
    assert.equal(active, null, 'run eliminado jamais deveria produzir CTA de jogar');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-careerhub-stale-tournament-action-v59: PASS');
} finally {
  await vite.close();
}
