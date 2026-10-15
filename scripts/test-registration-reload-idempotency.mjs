// Playthrough 4.9, Parte O — reload do repository/adapter não pode
// duplicar inscrição, mensagens de lembrete/sorteio, nem recalcular a
// deadline de um jeito diferente, nem re-sortear.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

class MemoryStorage {
  constructor(files) { this.files = files || new Map(); this.directories = new Set(); }
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-registration-reload-idempotency', search: '' };
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
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { listTournamentRegistrations, getTournamentRegistrationWindow } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');

  const disk = new Map();
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage(disk))));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.9 Reload', playerName: 'Player 4.9 Reload' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p49-reload', sport_name: 'Player49Reload', career_date: '2026-01-01', birth_date: '2001-01-01',
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

  const window = getTournamentRegistrationWindow(losAngeles);
  while (window.opensAt && profile.career_date < window.opensAt) profile = await advanceCareerDayOnce(profile);
  const reg = await registerForTournament(profile, losAngeles, 0, {});
  assert.ok(reg.success, 'inscrição inicial precisa funcionar');
  profile = await activeCareerAdapter.getPlayerProfile();

  // Avança até D-5 (dispara pelo menos um lembrete) antes do "reload".
  const dMinus5 = new Date(`${losAngeles.start_date}T00:00:00Z`); dMinus5.setUTCDate(dMinus5.getUTCDate() - 5);
  const dMinus5Str = dMinus5.toISOString().slice(0, 10);
  while (profile.career_date < dMinus5Str) profile = await advanceCareerDayOnce(profile);

  const registrationsBefore = await listTournamentRegistrations(profile.id);
  const messagesBefore = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
  const deadlineBefore = getTournamentRegistrationWindow(losAngeles).closesAt;
  const dateAfterFirstPass = profile.career_date;

  // "Reload" — novo CareerManager/CareerRepository/GameStorage por cima do
  // MESMO backing storage (mesmo padrão de test-tournament-draw-reload-idempotency.mjs).
  activeCareerAdapter.clearActiveCareer();
  const manager2 = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage(disk))));
  activeCareerAdapter.careerManager = manager2;
  const reloaded = await manager2.loadCareer(career.career_id || career.id);
  activeCareerAdapter.setActiveCareer(reloaded.career || reloaded);

  await check('nenhuma inscrição duplicada depois do reload', async () => {
    const registrationsAfter = await listTournamentRegistrations(profile.id);
    const activeForLA = registrationsAfter.filter((item) => item.tournament_id === losAngeles.id && (item.status === 'confirmed' || item.status === 'pending'));
    assert.equal(activeForLA.length, 1);
    assert.equal(registrationsAfter.length, registrationsBefore.length);
  });

  await check('nenhum deadline recalculado diferente depois do reload', async () => {
    const freshTournament = await localGame.entities.Tournament.get(losAngeles.id);
    const deadlineAfter = getTournamentRegistrationWindow(freshTournament).closesAt;
    assert.equal(deadlineAfter, deadlineBefore);
  });

  // Reprocessa o MESMO dia de novo depois do "reload" — idempotência do
  // pipeline de lembretes/sorteio, não só da inscrição.
  const reloadedProfileRow = await localGame.entities.PlayerProfile.get(profile.id);
  await processCalendarEvents(reloadedProfileRow, dateAfterFirstPass);
  await check('nenhuma mensagem duplicada depois de reprocessar o mesmo dia pós-reload', async () => {
    const messagesAfter = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    assert.equal(messagesAfter.length, messagesBefore.length, `esperava ${messagesBefore.length} mensagens, obtido ${messagesAfter.length}`);
    const ids = messagesAfter.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, 'nenhum id de mensagem duplicado');
  });

  // Avança até depois do sorteio e confirma que não há re-sorteio (bracket estável).
  let advancingProfile = reloadedProfileRow;
  const drawDate = new Date(`${losAngeles.start_date}T00:00:00Z`); drawDate.setUTCDate(drawDate.getUTCDate() - 3);
  const drawDateStr = drawDate.toISOString().slice(0, 10);
  while (advancingProfile.career_date < drawDateStr) advancingProfile = await advanceCareerDayOnce(advancingProfile);
  const bracketAfterFirstDraw = (await localGame.entities.Tournament.get(losAngeles.id)).bracket_history;

  activeCareerAdapter.clearActiveCareer();
  const manager3 = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage(disk))));
  activeCareerAdapter.careerManager = manager3;
  const reloaded2 = await manager3.loadCareer(career.career_id || career.id);
  activeCareerAdapter.setActiveCareer(reloaded2.career || reloaded2);
  const reloadedProfileRow2 = await localGame.entities.PlayerProfile.get(profile.id);
  await processCalendarEvents(reloadedProfileRow2, reloadedProfileRow2.career_date);
  await check('nenhum re-sorteio depois do reload (bracket_history estável)', async () => {
    const bracketAfterReload = (await localGame.entities.Tournament.get(losAngeles.id)).bracket_history;
    assert.deepEqual(bracketAfterReload, bracketAfterFirstDraw);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-registration-reload-idempotency: PASS');
} finally {
  await vite.close();
}
