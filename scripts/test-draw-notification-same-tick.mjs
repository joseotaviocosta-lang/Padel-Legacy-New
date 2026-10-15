// Playthrough 4.6D, item 12.1 — reproduz o cenário exato do bug relatado:
// carreira nova real, jogador inscrito em Londres, avança até D-3 SEM abrir
// nenhuma tela (TournamentModal/Tournaments/refresh manual). No MESMO
// avanço de dia em que o bracket nasce, a CareerMessage de sorteio já deve
// existir — provando que a notificação é consequência do lifecycle do dia,
// não da UI.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-same-tick', search: '' };
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
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6D Same Tick', playerName: 'Player 4.6D' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'same-tick-player', sport_name: 'Player46D', career_date: '2026-01-01', birth_date: '2001-01-01',
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
  const regResult = await registerForTournament(profile, londres, 0, {});
  assert.ok(regResult?.success, `pré-condição: inscrição precisa funcionar: ${JSON.stringify(regResult)}`);

  let messageAppearedOnDay = null;
  let bracketAppearedOnDay = null;
  while (profile.career_date < '2026-01-27' && !(messageAppearedOnDay && bracketAppearedOnDay)) {
    profile = await advanceCareerDayOnce(profile);
    const row = await localGame.entities.Tournament.get(londres.id);
    const hasDraw = Number(row.bracket_schema_version) >= 2 && Array.isArray(row.bracket_history) && row.bracket_history.length > 0;
    if (hasDraw && !bracketAppearedOnDay) bracketAppearedOnDay = profile.career_date;
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const notif = messages.find((m) => m.notification_type === 'TOURNAMENT_UPCOMING' && String(m.related_entity_id) === String(londres.id));
    if (notif && !messageAppearedOnDay) messageAppearedOnDay = profile.career_date;
  }

  await check('2. bracket nasce em D-3 sem NENHUMA tela aberta', () => {
    assert.equal(bracketAppearedOnDay, '2026-01-26', `chave deveria nascer em D-3 (26/01): nasceu em ${bracketAppearedOnDay}`);
  });

  await check('1/2/6. a CareerMessage de sorteio nasce no MESMO avanço de dia em que o bracket nasce (sem UI)', () => {
    assert.equal(messageAppearedOnDay, bracketAppearedOnDay, `notificação deveria aparecer no MESMO dia da chave (${bracketAppearedOnDay}), apareceu em ${messageAppearedOnDay}`);
  });

  await check('2. a mensagem aponta pro tournament_id correto, unread e com deep-link', async () => {
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const notif = messages.find((m) => m.notification_type === 'TOURNAMENT_UPCOMING' && String(m.related_entity_id) === String(londres.id));
    assert.ok(notif, 'notificação deveria existir');
    assert.equal(notif.is_read, false, 'notificação deve nascer não lida');
    assert.equal(notif.destination?.params?.tournament, londres.id, 'deep-link deve apontar pro torneio correto');
  });

  await check('2. não há duplicata', async () => {
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const matches = messages.filter((m) => m.notification_type === 'TOURNAMENT_UPCOMING' && String(m.related_entity_id) === String(londres.id));
    assert.equal(matches.length, 1, `deveria haver exatamente 1 notificação, encontrado ${matches.length}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-same-tick: PASS');
} finally {
  await vite.close();
}
