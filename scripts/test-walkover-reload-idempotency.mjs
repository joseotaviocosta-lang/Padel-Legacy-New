// Playthrough 4.7, item 16 — lesão + W.O. persistido, fecha o app, reabre:
// o match continua terminal, o adversário continua classificado, nenhum
// segundo W.O. é gerado, a chave é idêntica, o torneio continua normal.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-walkover-reload-idempotency', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

let passed = 0;
let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
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
  const { advanceCareerUntilRecovered } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { resolveUnavailablePlayerMatch } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const disk = new Map();
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage(disk))));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.7 Walkover Reload', playerName: 'Player 4.7' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'walkover-reload-player', sport_name: 'Player47', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });
  const starterPartner = BOTS_BY_DIFFICULTY.iniciante[0];
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: starterPartner.id });
  profile = await activeCareerAdapter.getPlayerProfile();

  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  const londres = tournaments.find((t) => t.name?.includes('Londres'));
  await registerForTournament(profile, londres, 0, {});

  const eve = new Date(`${londres.start_date}T00:00:00Z`);
  eve.setUTCDate(eve.getUTCDate() - 1);
  const eveDate = eve.toISOString().slice(0, 10);
  while (profile.career_date < eveDate) profile = await advanceCareerDayOnce(profile);

  await localGame.entities.PlayerProfile.update(profile.id, {
    injury_status: 'lesionado', injury_type: 'Sobrecarga muscular', injury_severity: 'leve', injury_days_remaining: 3,
  });
  profile = await activeCareerAdapter.getPlayerProfile();
  const skipResult = await advanceCareerUntilRecovered(profile);
  profile = skipResult.profile;
  assert.ok(skipResult.recovered);

  const bracketBeforeReload = JSON.stringify((await localGame.entities.Tournament.get(londres.id)).bracket_history);
  const careerIdSnapshot = career.career_id || career.id;

  // Fecha e reabre o app: novo adapter/repository sobre o MESMO storage.
  activeCareerAdapter.clearActiveCareer();
  const manager2 = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage(disk))));
  activeCareerAdapter.careerManager = manager2;
  const reloaded = await manager2.loadCareer(careerIdSnapshot);
  activeCareerAdapter.setActiveCareer(reloaded.career || reloaded);

  await check('16. depois do reload, o match continua terminal (mesmo vencedor, mesma chave)', async () => {
    const row = await localGame.entities.Tournament.get(londres.id);
    assert.equal(JSON.stringify(row.bracket_history), bracketBeforeReload, 'bracket_history deveria ser idêntico após reload');
    const round0 = row.bracket_history[0];
    const playerMatch = round0.matches.find((m) => m.player_match === true);
    assert.equal(playerMatch.status, 'completed');
    assert.ok(playerMatch.winner);
  });

  await check('16. chamar resolveUnavailablePlayerMatch de novo após o reload NÃO gera um segundo W.O. (idempotente)', async () => {
    const reloadedProfile = await activeCareerAdapter.getPlayerProfile();
    const reloadedTournament = await localGame.entities.Tournament.get(londres.id);
    const events = await localGame.entities.CalendarEvent.filter({ profile_id: reloadedProfile.id });
    const event = events.find((e) => e.event_type === 'tournament' && String(e.related_id) === String(londres.id));
    const result = await resolveUnavailablePlayerMatch({ profile: reloadedProfile, tournament: reloadedTournament, calendarEvent: event, reason: 'W.O. repetido' });
    assert.equal(result, null, 'não pode gerar um segundo W.O. sobre uma campanha já eliminated');
    const afterRow = await localGame.entities.Tournament.get(londres.id);
    assert.equal(JSON.stringify(afterRow.bracket_history), bracketBeforeReload, 'chave não pode mudar numa segunda tentativa');
  });

  await check('16. nenhuma notificação de W.O. duplicada', async () => {
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const walkoverMessages = messages.filter((m) => m.notification_type === 'TOURNAMENT_WALKOVER' && String(m.related_entity_id) === String(londres.id));
    assert.equal(walkoverMessages.length, 1, `esperado 1 notificação de W.O., encontrado ${walkoverMessages.length}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-walkover-reload-idempotency: PASS');
} finally {
  await vite.close();
}
