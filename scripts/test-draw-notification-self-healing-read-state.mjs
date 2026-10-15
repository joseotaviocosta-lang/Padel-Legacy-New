// Playthrough 4.6E, Parte I/K / Teste 7 — self-healing distinto de alerta
// novo, e política de leitura correta.
// Teste 7: apaga só a CareerMessage, preserva o Tournament com bracket;
// reconciliar deve trazer a mensagem de volta (notification_origin:
// 'self_healing', sem toast), sem duplicar.
// Parte K: (1) nasce unread; (2) contador de não lidas soma +1; (3) listar
// a Central não marca nada como lida sozinha; (4) abrir a mensagem
// específica marca como lida; (5) self-healing nunca reverte uma mensagem
// já lida de volta pra unread.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-draw-notification-self-healing-read-state', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent(event) { dispatched.push(event.type); } };
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
  const { ensureTournamentDrawNotification, resolveAndOpenNotification, listCareerCommunications, isCareerMessageUnread } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');
  const { countUnreadCareerMessages } = await vite.ssrLoadModule('/src/lib/notificationSelectors.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6E Self Healing Read State', playerName: 'Player 4.6E' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'self-healing-read-player', sport_name: 'Player46E', career_date: '2026-01-26', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 1000, xp: 0, morale: 70, form: 50,
  });
  const tournament = await localGame.entities.Tournament.create({
    id: 'self-healing-read-tournament', name: 'Londres Challenge', tier: 'Bronze',
    start_date: '2026-01-29', end_date: '2026-02-01', bracket_schema_version: 2, draw_date: '2026-01-26',
    bracket_history: [{ round: 'Rodada de 16', date: '2026-01-29', matches: [{ match_id: 'm1', team_a: 'A', team_b: 'B', player_match: true }] }],
  });
  // Playthrough 4.9, Parte B/F — ensureTournamentDrawNotification exige uma
  // inscrição real antes de personalizar qualquer mensagem.
  await localGame.entities.TournamentRegistration.create({
    id: `registration-${profile.id}-${tournament.id}`, profile_id: profile.id, tournament_id: tournament.id,
    status: 'confirmed', registered_at: profile.career_date,
  });

  const notif = await ensureTournamentDrawNotification(profile, tournament);

  await check('K.1. a mensagem nasce unread', () => {
    assert.equal(isCareerMessageUnread(notif), true);
  });

  await check('K.2. o contador de não lidas soma a nova mensagem', async () => {
    const rows = await listCareerCommunications(profile.id, 200);
    const before = countUnreadCareerMessages(rows);
    assert.ok(before >= 1, `contador deveria incluir a mensagem nova: ${before}`);
  });

  await check('K.3. listar a Central (listCareerCommunications) NÃO marca a mensagem como lida sozinho', async () => {
    await listCareerCommunications(profile.id, 200);
    await listCareerCommunications(profile.id, 200);
    const stored = await localGame.entities.CareerMessage.get(notif.id);
    assert.equal(stored.is_read, false, 'só listar não pode marcar como lida — precisa de uma ação explícita do jogador');
  });

  await check('I. a mensagem nasce com notification_origin:same_tick (sorteio aconteceu HOJE)', () => {
    assert.equal(notif.metadata.notification_origin, 'same_tick');
  });

  await check('K.4. abrir a mensagem específica (resolveAndOpenNotification) marca como lida', async () => {
    await resolveAndOpenNotification(notif, { navigate: () => {} });
    const stored = await localGame.entities.CareerMessage.get(notif.id);
    assert.equal(stored.is_read, true);
  });

  await check('K.5. reconciliar de novo uma mensagem que já existe e já foi lida NUNCA a reverte pra unread', async () => {
    const beforeRead = await localGame.entities.CareerMessage.get(notif.id);
    assert.equal(beforeRead.is_read, true, 'pré-condição: a mensagem já está lida (item K.4 acima)');
    const result = await ensureTournamentDrawNotification(profile, tournament);
    assert.equal(result, null, 'reconciliar uma mensagem já existente não deve reescrevê-la');
    const afterReconcile = await localGame.entities.CareerMessage.get(notif.id);
    assert.equal(afterReconcile.is_read, true, 'reconciliação NUNCA pode desfazer o estado de leitura já existente');
  });

  // Teste 7 — apaga SÓ a CareerMessage, preserva o Tournament com bracket.
  await localGame.entities.CareerMessage.delete(notif.id).catch(() => localGame.entities.CareerMessage.update(notif.id, { _deleted: true }));
  const afterDelete = await localGame.entities.CareerMessage.get(notif.id).catch(() => null);
  await check('7. pré-condição: a mensagem realmente não existe mais (Tournament preservado)', async () => {
    assert.ok(!afterDelete, 'a mensagem deveria ter sido removida pro teste de self-healing');
    const row = await localGame.entities.Tournament.get(tournament.id);
    assert.ok(row.bracket_history.length > 0, 'o Tournament/chave nunca deveriam ser afetados');
  });

  dispatched.length = 0;
  // Avança a "data" simbolicamente: reconciliar em um dia DIFERENTE do
  // draw_date original simula exatamente o cenário "D0 reparando uma
  // mensagem perdida de D-3" (Parte I) — nunca mais same_tick.
  const healedProfile = { ...profile, career_date: '2026-01-29' };
  const healed = await ensureTournamentDrawNotification(healedProfile, tournament);

  await check('7. self-healing traz a mensagem de volta, sem duplicar', async () => {
    assert.ok(healed, 'o reparo deveria criar a mensagem de novo');
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const matches = messages.filter((m) => String(m.related_entity_id) === tournament.id);
    assert.equal(matches.length, 1, `exatamente 1 mensagem depois do reparo, encontrado ${matches.length}`);
  });

  await check('I. a mensagem reparada é marcada notification_origin:self_healing (nunca same_tick, já se passaram 3 dias do sorteio real)', () => {
    assert.equal(healed.metadata.notification_origin, 'self_healing');
  });

  await check('I/D. self-healing NUNCA dispara o toast (padel:draw-notification) — não é "acabou de sair" 3 dias depois', () => {
    assert.ok(!dispatched.includes('padel:draw-notification'), `self-healing não pode disparar o toast: ${dispatched.join(', ')}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-draw-notification-self-healing-read-state: PASS');
} finally {
  await vite.close();
}
