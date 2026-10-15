// Playthrough 4.6E — teste de integração "entrega real", cobrindo a cadeia
// completa pedida na Parte A/Objetivo, do jeito que o playtest real
// experimenta: advanceCareerDayOnce -> processCalendarEvents ->
// ensureTournamentDraw -> persist Tournament -> ensureTournamentDrawNotification
// -> CareerMessage -> evento de refresh/alerta -> (camada que o
// CommunicationBell/toast consumiriam). Tudo no MESMO tick do D-3 real,
// sem abrir nenhuma tela.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-real-delivery', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent(event) { dispatched.push({ type: event.type, detail: event.detail }); } };
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
  const { listCareerCommunications } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');
  const { countUnreadCareerMessages } = await vite.ssrLoadModule('/src/lib/notificationSelectors.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6E Real Delivery', playerName: 'Player 4.6E' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'real-delivery-player', sport_name: 'Player46E', career_date: '2026-01-01', birth_date: '2001-01-01',
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
  while (profile.career_date < '2026-01-25') profile = await advanceCareerDayOnce(profile);

  // Estado ANTES do dia do sorteio (cenário real equivalente ao relatado:
  // career_date=2026-01-26 é D-3, tournament.start_date=2026-01-29).
  const beforeDraw = await localGame.entities.Tournament.get(londres.id);
  assert.equal(Array.isArray(beforeDraw.bracket_history) ? beforeDraw.bracket_history.length : 0, 0, 'pré-condição: chave ainda não existe em 2026-01-25');

  dispatched.length = 0;
  profile = await advanceCareerDayOnce(profile); // 2026-01-26, D-3 real.

  const afterDraw = await localGame.entities.Tournament.get(londres.id);
  await check('1. bracket_history é persistido no D-3 (bracket_schema_version=2, length>0, draw_date=2026-01-26)', () => {
    assert.equal(Number(afterDraw.bracket_schema_version), 2);
    assert.ok(afterDraw.bracket_history.length > 0);
    assert.equal(afterDraw.draw_date, '2026-01-26');
    assert.equal(afterDraw.status, 'chaveamento');
  });

  const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
  const notif = messages.find((m) => m.notification_type === 'TOURNAMENT_UPCOMING' && String(m.related_entity_id) === String(londres.id));

  await check('2. a CareerMessage nasce no MESMO tick (mesmo advanceCareerDayOnce) em que a chave é persistida', () => {
    assert.ok(notif, 'notificação deveria existir já neste avanço');
    assert.equal(notif.is_read, false);
  });

  await check('4/D. o evento de alerta (padel:draw-notification) foi emitido neste mesmo tick, com conteúdo pronto pro toast', () => {
    const event = dispatched.find((e) => e.type === 'padel:draw-notification');
    assert.ok(event, `eventos disparados: ${dispatched.map((e) => e.type).join(', ')}`);
    assert.ok(event.detail.title.includes('Londres Challenge'));
    assert.ok(event.detail.route.includes(`tournament=${londres.id}`));
    assert.ok(event.detail.route.includes('openBracket=true'));
  });

  await check('3/C. o refresh do sino (padel:communications-refresh) foi emitido no mesmo avanço', () => {
    assert.ok(dispatched.some((e) => e.type === 'padel:communications-refresh'));
  });

  await check('5/6. a Central de Mensagens (mesma fonte, listCareerCommunications) já enxerga a notificação, com contador de não lidas correto', async () => {
    const rows = await listCareerCommunications(profile.id, 200);
    const rowInCentral = rows.find((m) => m.id === notif.id);
    assert.ok(rowInCentral, 'a Central precisa enxergar a mesma mensagem, mesma fonte que o sino usa');
    assert.ok(countUnreadCareerMessages(rows) >= 1);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-real-delivery: PASS');
} finally {
  await vite.close();
}
