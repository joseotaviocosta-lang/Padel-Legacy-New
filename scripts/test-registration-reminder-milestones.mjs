// Playthrough 4.9, Parte E/P — os 3 marcos nomeados de lembrete de
// inscrição (registration_open/registration_reminder/registration_last_day),
// dedup por tournament_id + marco, nunca duplicado, nunca antes/depois da
// janela certa.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-registration-reminder-milestones', search: '' };
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
  const { ensureTournamentRegistrationReminders } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.9 Reminder Milestones', playerName: 'Player 4.9 Reminders' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p49-reminders', sport_name: 'Player49Reminders', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50,
  });
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: BOTS_BY_DIFFICULTY.iniciante[0].id });
  profile = await activeCareerAdapter.getPlayerProfile();

  const tournament = {
    id: 'reminder-tournament', name: 'Reminder Open Cup', tier: 'Silver', start_date: '2026-02-08', end_date: '2026-02-11',
    entry_fee: 0, max_participants: 16, prize_coins: 2000, rank_points: 120,
  };
  await localGame.entities.Tournament.create(tournament);

  await check('D-8 (antes de D-7) ainda não gera nenhum lembrete', async () => {
    const created = await ensureTournamentRegistrationReminders({ ...profile, career_date: '2026-01-31' }, tournament);
    assert.equal(created.length, 0);
  });

  await check('D-7 gera exatamente o marco registration_open', async () => {
    const created = await ensureTournamentRegistrationReminders({ ...profile, career_date: '2026-02-01' }, tournament);
    assert.equal(created.length, 1);
    assert.equal(created[0].metadata.milestone, 'registration_open');
    assert.match(created[0].title, /Inscrições abertas/);
  });

  await check('chamar de novo no MESMO dia D-7 não duplica (dedup por tournament_id+milestone)', async () => {
    const created = await ensureTournamentRegistrationReminders({ ...profile, career_date: '2026-02-01' }, tournament);
    assert.equal(created.length, 0, 'já existe — nenhuma nova mensagem deveria nascer');
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const openMsgs = messages.filter((m) => m.metadata?.milestone === 'registration_open');
    assert.equal(openMsgs.length, 1);
  });

  await check('D-5 gera exatamente o marco registration_reminder (sem duplicar o registration_open)', async () => {
    const created = await ensureTournamentRegistrationReminders({ ...profile, career_date: '2026-02-03' }, tournament);
    assert.equal(created.length, 1);
    assert.equal(created[0].metadata.milestone, 'registration_reminder');
  });

  await check('D-4 (último dia) gera exatamente o marco registration_last_day', async () => {
    const created = await ensureTournamentRegistrationReminders({ ...profile, career_date: '2026-02-04' }, tournament);
    assert.equal(created.length, 1);
    assert.equal(created[0].metadata.milestone, 'registration_last_day');
    assert.match(created[0].title, /Última chance/);
    assert.equal(created[0].priority, 'alta');
  });

  await check('depois do fechamento (D-3, sorteio) nenhum lembrete novo nasce', async () => {
    const created = await ensureTournamentRegistrationReminders({ ...profile, career_date: '2026-02-05' }, tournament);
    assert.equal(created.length, 0);
  });

  await check('ao todo, exatamente 3 lembretes existem pra este torneio (nunca dezenas repetidas)', async () => {
    const messages = await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []);
    const reminders = messages.filter((m) => m.notification_type === 'TOURNAMENT_REGISTRATION_REMINDER' && String(m.related_entity_id) === tournament.id);
    assert.equal(reminders.length, 3);
    const milestones = reminders.map((m) => m.metadata.milestone).sort();
    assert.deepEqual(milestones, ['registration_last_day', 'registration_open', 'registration_reminder']);
  });

  await check('depois de já inscrito, nenhum lembrete novo nasce (o jogador já agiu)', async () => {
    const tournament2 = { ...tournament, id: 'reminder-tournament-2', name: 'Reminder Cup 2' };
    await localGame.entities.Tournament.create(tournament2);
    await localGame.entities.TournamentRegistration.create({ id: 'reg-reminder-2', profile_id: profile.id, tournament_id: tournament2.id, status: 'confirmed', registered_at: '2026-01-01' });
    const created = await ensureTournamentRegistrationReminders({ ...profile, career_date: '2026-02-01' }, tournament2);
    assert.equal(created.length, 0);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-registration-reminder-milestones: PASS');
} finally {
  await vite.close();
}
