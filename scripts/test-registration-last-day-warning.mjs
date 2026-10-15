// Playthrough 4.9, Parte D/E/P — o aviso "último dia" do CARD e o lembrete
// "Última chance" da COMUNICAÇÃO precisam concordar no MESMO dia (os dois
// derivados da mesma janela canônica, tournamentRegistration.js — nunca
// recalculados diferente em cada lugar, Parte C).
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-registration-last-day-warning', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureTournamentRegistrationReminders } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { getTournamentRegistrationWindow, daysBetweenGameDates } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { getPlayerTournamentRegistrationState, buildRegistrationCardNotice } = await vite.ssrLoadModule('/src/lib/tournamentRegistrationState.js');
  const { REGISTRATION_REMINDER_MILESTONES } = await vite.ssrLoadModule('/src/lib/tournamentNotifications.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.9 Last Day', playerName: 'Player 4.9 Last Day' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p49-lastday', sport_name: 'Player49LastDay', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50,
  });
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: BOTS_BY_DIFFICULTY.iniciante[0].id });
  profile = await activeCareerAdapter.getPlayerProfile();

  const tournament = {
    id: 'last-day-tournament', name: 'Last Day Cup', tier: 'Silver', start_date: '2026-03-10', end_date: '2026-03-13',
    entry_fee: 0, max_participants: 16, prize_coins: 1500, rank_points: 90,
  };
  await localGame.entities.Tournament.create(tournament);

  const window = getTournamentRegistrationWindow(tournament);
  assert.equal(window.closesAt, REGISTRATION_REMINDER_MILESTONES.LAST_DAY.daysBeforeStart === 4
    ? new Date(new Date(`${tournament.start_date}T00:00:00Z`).getTime() - 4 * 86400000).toISOString().slice(0, 10)
    : window.closesAt, 'pré-condição: deadline precisa ser exatamente D-4');

  // No dia do deadline: card diz "Último dia", lembrete diz "Última chance" — mesmo dia.
  const cardState = getPlayerTournamentRegistrationState({ tournament, registration: null, careerDate: window.closesAt });
  const daysToDeadline = daysBetweenGameDates(window.closesAt, window.closesAt);
  const cardNotice = buildRegistrationCardNotice(cardState, { daysToDeadline });
  assert.equal(cardNotice.code, 'LAST_DAY', `card deveria mostrar "último dia" em ${window.closesAt}`);

  const created = await ensureTournamentRegistrationReminders({ ...profile, career_date: window.closesAt }, tournament);
  const lastDayReminder = created.find((m) => m.metadata.milestone === 'registration_last_day');
  assert.ok(lastDayReminder, `esperava o lembrete registration_last_day no MESMO dia (${window.closesAt}) em que o card mostra "último dia"`);

  // No dia seguinte, os dois concordam que fechou.
  const dayAfter = new Date(`${window.closesAt}T00:00:00Z`); dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  const dayAfterStr = dayAfter.toISOString().slice(0, 10);
  const cardStateAfter = getPlayerTournamentRegistrationState({ tournament, registration: null, careerDate: dayAfterStr });
  const cardNoticeAfter = buildRegistrationCardNotice(cardStateAfter, { drawHappened: false, isPast: false });
  assert.equal(cardNoticeAfter.code, 'REGISTRATION_CLOSED', 'no dia seguinte ao "último dia", o card precisa dizer que já fechou, nunca mais "último dia"');
  const createdAfter = await ensureTournamentRegistrationReminders({ ...profile, career_date: dayAfterStr }, tournament);
  assert.equal(createdAfter.length, 0, 'depois do fechamento, nenhum lembrete novo pode nascer');

  console.log('test-registration-last-day-warning: PASS');
} finally {
  await vite.close();
}
