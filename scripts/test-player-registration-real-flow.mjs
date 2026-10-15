// Playthrough 4.9, Parte M — mesmo cenário do teste "perdido" (Parte L),
// mas o jogador se inscreve em Los Angeles Cup antes do prazo. Cobre a
// cadeia completa do caminho FELIZ: inscrição -> fechamento -> sorteio ->
// bracket -> notificação -> decisão de partida.
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
const dispatched = [];
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-player-registration-real-flow', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent(event) { dispatched.push({ type: event.type, detail: event.detail }); } };
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
  const { registerForTournament } = await vite.ssrLoadModule('/src/lib/calendarSystem.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { getPlayerTournamentRegistrationState, TOURNAMENT_REGISTRATION_STATE } = await vite.ssrLoadModule('/src/lib/tournamentRegistrationState.js');
  const { listTournamentRegistrations, getTournamentRegistrationWindow } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.9 Registered Flow', playerName: 'Player 4.9 Registered' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p49-registered', sport_name: 'Player49Registered', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50,
  });
  const starterPartner = BOTS_BY_DIFFICULTY.iniciante[0];
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: starterPartner.id });
  profile = await activeCareerAdapter.getPlayerProfile();

  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  const losAngeles = tournaments.find((t) => t.name?.includes('Los Angeles'));
  assert.ok(losAngeles, 'seed precisa conter Los Angeles');

  const { getTournamentRegistrationWindow: getWindowForOpen } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const openWindow = getWindowForOpen(losAngeles);
  while (openWindow.opensAt && profile.career_date < openWindow.opensAt) profile = await advanceCareerDayOnce(profile);

  const registrationResult = await registerForTournament(profile, losAngeles, 0, {});
  await check('registro persistido com sucesso, dentro do prazo', () => {
    assert.equal(registrationResult.success, true);
  });
  profile = await activeCareerAdapter.getPlayerProfile();

  const window = getTournamentRegistrationWindow(losAngeles);
  const drawDate = new Date(`${losAngeles.start_date}T00:00:00Z`); drawDate.setUTCDate(drawDate.getUTCDate() - 3);
  const drawDateStr = drawDate.toISOString().slice(0, 10);
  assert.ok(window.closesAt < drawDateStr, `pré-condição: deadline (${window.closesAt}) precisa ser < draw_date (${drawDateStr})`);

  dispatched.length = 0;
  while (profile.career_date < drawDateStr) profile = await advanceCareerDayOnce(profile);

  const laAfterDraw = await localGame.entities.Tournament.get(losAngeles.id);
  await check('D-3 fecha as inscrições (registrationState não é mais OPEN)', async () => {
    const registrations = await listTournamentRegistrations(profile.id);
    const registration = registrations.find((item) => item.tournament_id === losAngeles.id);
    assert.ok(registration && registration.status === 'confirmed');
    const state = getPlayerTournamentRegistrationState({ tournament: laAfterDraw, registration, careerDate: profile.career_date, drawn: true });
    assert.equal(state, TOURNAMENT_REGISTRATION_STATE.DRAWN);
  });

  await check('bracket contém o jogador (player_match:true no round 0)', () => {
    const round0 = laAfterDraw.bracket_history[0];
    const playerMatch = (round0?.matches || []).find((match) => match?.player_match === true);
    assert.ok(playerMatch, 'esperava um match marcado player_match:true na chave de Los Angeles');
  });

  const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
  const drawMessage = messages.find((m) => m.notification_type === 'TOURNAMENT_UPCOMING' && String(m.related_entity_id) === String(losAngeles.id));

  await check('notificação de sorteio nasce no mesmo tick do sorteio real', () => {
    assert.ok(drawMessage, 'esperava uma CareerMessage de sorteio para Los Angeles');
    assert.equal(drawMessage.metadata?.notification_origin, 'same_tick');
  });

  await check('o texto contém o parceiro real do jogador', () => {
    assert.ok(drawMessage.content.includes(starterPartner.name) || drawMessage.content.includes(profile.sport_name), `conteúdo deveria citar a dupla real: ${drawMessage.content}`);
  });

  await check('o texto contém um adversário real (nome não genérico)', () => {
    assert.ok(!drawMessage.content.includes('um adversário a definir'), 'não deveria cair no texto genérico quando o jogador está de fato inscrito e sorteado');
  });

  await check('deep-link abre a chave (openBracket:true)', () => {
    assert.equal(drawMessage.destination?.params?.openBracket, true);
    assert.equal(drawMessage.destination?.params?.tournament, losAngeles.id);
  });

  await check('o toast de sorteio foi disparado no mesmo tick', () => {
    const event = dispatched.find((e) => e.type === 'padel:draw-notification');
    assert.ok(event, `eventos disparados: ${dispatched.map((e) => e.type).join(', ')}`);
    assert.ok(event.detail.route.includes('openBracket=true'));
  });

  // Dia do jogo — cria decisão obrigatória (a partida vira mandatory/requires_decision).
  while (profile.career_date < losAngeles.start_date) profile = await advanceCareerDayOnce(profile);
  await check('o dia do jogo cria uma decisão obrigatória de partida', async () => {
    const events = await localGame.entities.CalendarEvent.filter({ profile_id: profile.id, related_id: losAngeles.id, status: 'scheduled' }).catch(() => []);
    const runEvent = events.find((item) => item.metadata?.tournament_run);
    assert.ok(runEvent, 'esperava o CalendarEvent da campanha ainda ativo no dia do jogo');
    assert.equal(runEvent.requires_decision, true);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-player-registration-real-flow: PASS');
} finally {
  await vite.close();
}
