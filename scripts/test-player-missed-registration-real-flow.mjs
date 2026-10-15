// Playthrough 4.9, Parte L — reprodução exata do bug real relatado:
// jogador completa Roma e Londres, avança dias, NUNCA se inscreve em Los
// Angeles Cup, mesmo assim recebia "Sorteio definido — Los Angeles Cup"
// com "Sua dupla, Franco López & Pablo López" (uma dupla de IA qualquer).
// Este teste cobre a cadeia inteira: inscrição -> prazo -> sorteio ->
// participação -> notificação, exatamente como a Parte L pede.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-player-missed-registration-real-flow', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
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
  const { registerForTournament, processCalendarEvents } = await vite.ssrLoadModule('/src/lib/calendarSystem.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { resolveUnavailablePlayerMatch } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { getPlayerOpeningMatchFromCanonicalBracket } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');
  const { getPlayerTournamentRegistrationState, TOURNAMENT_REGISTRATION_STATE, canPlayerRegisterNow } = await vite.ssrLoadModule('/src/lib/tournamentRegistrationState.js');
  const { listTournamentRegistrations } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.9 Missed Registration', playerName: 'Player 4.9' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p49-missed', sport_name: 'Player49Missed', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50,
  });
  const starterPartner = BOTS_BY_DIFFICULTY.iniciante[0];
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: starterPartner.id });
  profile = await activeCareerAdapter.getPlayerProfile();

  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  const roma = tournaments.find((t) => t.name?.includes('Roma'));
  const londres = tournaments.find((t) => t.name?.includes('Londres'));
  const losAngeles = tournaments.find((t) => t.name?.includes('Los Angeles'));
  assert.ok(roma && londres && losAngeles, 'seed precisa conter Roma, Londres e Los Angeles');

  // 1/2/3/4 — forma dupla (já feito acima), Roma e Londres "concluídos"
  // (via o mecanismo de W.O./ausência já validado na Playthrough 4.7 —
  // reaproveitado aqui só como atalho de cenário, nunca reimplementado).
  async function registerAndConclude(tournament) {
    const reg = await registerForTournament(profile, tournament, 0, {});
    assert.ok(reg.success, `inscrição em ${tournament.name} deveria funcionar`);
    profile = await activeCareerAdapter.getPlayerProfile();
    while (profile.career_date < tournament.start_date) profile = await advanceCareerDayOnce(profile);
    const event = (await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: tournament.id }).catch(() => []))
      .find((item) => item.event_type === 'tournament' && item.metadata?.tournament_run);
    assert.ok(event, `${tournament.name} deveria ter tournament_run no dia de início`);
    const freshTournament = await localGame.entities.Tournament.get(tournament.id);
    await resolveUnavailablePlayerMatch({ profile, tournament: freshTournament, calendarEvent: event, reason: 'Cenário de teste' });
  }
  await registerAndConclude(roma);
  await registerAndConclude(londres);

  // 5 — NÃO se inscrever em Los Angeles. 6 — avançar até D-3 (dia do sorteio).
  const drawDate = new Date(`${losAngeles.start_date}T00:00:00Z`); drawDate.setUTCDate(drawDate.getUTCDate() - 3);
  const drawDateStr = drawDate.toISOString().slice(0, 10);
  while (profile.career_date < drawDateStr) profile = await advanceCareerDayOnce(profile);

  const laAfterDraw = await localGame.entities.Tournament.get(losAngeles.id);

  await check('a chave AI de Los Angeles existe normalmente (bracket_history persistido)', () => {
    assert.equal(Number(laAfterDraw.bracket_schema_version), 2);
    assert.ok(Array.isArray(laAfterDraw.bracket_history) && laAfterDraw.bracket_history.length > 0);
  });

  await check('jogador NÃO consta em nenhum match como player_match (nunca entrou na chave)', () => {
    const anyPlayerMatch = laAfterDraw.bracket_history.some((round) => (round.matches || []).some((match) => match?.player_match === true));
    assert.equal(anyPlayerMatch, false, 'nenhum match de Los Angeles deveria estar marcado como do jogador');
  });

  await check('NÃO existe CalendarEvent/tournament_run do jogador para Los Angeles', async () => {
    const events = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: losAngeles.id }).catch(() => []);
    const withRun = events.filter((item) => item.event_type === 'tournament' && item.metadata?.tournament_run);
    assert.equal(withRun.length, 0);
  });

  await check('NÃO existe TournamentRegistration confirmada para Los Angeles', async () => {
    const registrations = await listTournamentRegistrations(profile.id);
    const confirmed = registrations.filter((item) => item.tournament_id === losAngeles.id && item.status === 'confirmed');
    assert.equal(confirmed.length, 0);
  });

  await check('getPlayerOpeningMatchFromCanonicalBracket nunca fabrica um match sem run', () => {
    const opening = getPlayerOpeningMatchFromCanonicalBracket({ tournament: laAfterDraw, run: null });
    assert.equal(opening, null, 'sem run (sem inscrição), a função precisa retornar null — nunca matches[0]');
  });

  await check('NÃO existe nenhuma CareerMessage "Sua dupla..." / "Sorteio definido" para Los Angeles', async () => {
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const laMessages = messages.filter((m) => String(m.related_entity_id) === String(losAngeles.id));
    const personalizedDraw = laMessages.filter((m) => m.notification_type === 'TOURNAMENT_UPCOMING');
    assert.equal(personalizedDraw.length, 0, `não deveria existir "Sorteio definido" personalizada para Los Angeles: ${JSON.stringify(personalizedDraw.map((m) => m.title))}`);
    const mentionsSuaDupla = messages.some((m) => String(m.content || '').includes('Sua dupla') && String(m.related_entity_id) === String(losAngeles.id));
    assert.equal(mentionsSuaDupla, false, 'nenhuma mensagem pode dizer "Sua dupla" sobre um torneio em que o jogador não está inscrito');
  });

  await check('registrationState do jogador para Los Angeles é REGISTRATION_CLOSED (nunca REGISTERED/DRAWN)', async () => {
    const registrations = await listTournamentRegistrations(profile.id);
    const registration = registrations.find((item) => item.tournament_id === losAngeles.id) || null;
    const state = getPlayerTournamentRegistrationState({ tournament: laAfterDraw, registration, careerDate: profile.career_date, drawn: true });
    assert.equal(state, TOURNAMENT_REGISTRATION_STATE.REGISTRATION_CLOSED);
    assert.equal(canPlayerRegisterNow(state), false, 'botão Inscrever não pode existir depois do prazo');
  });

  await check('o jogador recebeu avisos prévios razoáveis antes do fechamento (Parte I — não é surpresa)', async () => {
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const reminders = messages.filter((m) => m.notification_type === 'TOURNAMENT_REGISTRATION_REMINDER' && String(m.related_entity_id) === String(losAngeles.id));
    assert.ok(reminders.length > 0, 'esperava ao menos um lembrete de inscrição antes do fechamento de Los Angeles');
  });

  // Torneio segue AI-only normalmente: avança até o início sem gerar
  // nenhuma decisão obrigatória de partida para o jogador.
  while (profile.career_date < losAngeles.start_date) profile = await advanceCareerDayOnce(profile);
  await check('jogador não recebe decisão obrigatória de partida em Los Angeles (torneio segue AI-only)', async () => {
    const events = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: losAngeles.id, status: 'scheduled' }).catch(() => []);
    assert.equal(events.length, 0);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-player-missed-registration-real-flow: PASS');
} finally {
  await vite.close();
}
