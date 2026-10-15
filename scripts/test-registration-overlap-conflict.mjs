// Playthrough 4.9, Parte K/P — duas competições sobrepostas continuam
// bloqueadas (regra já validada, preservada sem alteração), mas a UI
// precisa EXPLICAR o conflito: nomear o torneio já inscrito e o período.
// "Manter a inscrição atual" (não confirmar a troca) precisa deixar a
// inscrição original intacta.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-registration-overlap-conflict', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { registerForTournament } = await vite.ssrLoadModule('/src/lib/calendarSystem.js');
  const { listTournamentRegistrations } = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.9 Overlap', playerName: 'Player 4.9 Overlap' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p49-overlap', sport_name: 'Player49Overlap', career_date: '2026-01-10', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50,
  });
  const partner = BOTS_BY_DIFFICULTY.iniciante[0];
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: partner.id });
  profile = await activeCareerAdapter.getPlayerProfile();

  const tournamentA = await localGame.entities.Tournament.create({
    id: 'overlap-a', name: 'Los Angeles Cup', tier: 'Silver', start_date: '2026-02-05', end_date: '2026-02-08', entry_fee: 0, max_participants: 16,
  });
  const tournamentB = await localGame.entities.Tournament.create({
    id: 'overlap-b', name: 'San Diego Open', tier: 'Silver', start_date: '2026-02-06', end_date: '2026-02-09', entry_fee: 0, max_participants: 16,
  });

  const regA = await registerForTournament(profile, tournamentA, 0, {});
  assert.ok(regA.success, 'inscrição em Los Angeles Cup precisa funcionar');
  profile = await activeCareerAdapter.getPlayerProfile();

  const regB = await registerForTournament(profile, tournamentB, 0, {});
  assert.equal(regB.success, false, 'San Diego Open se sobrepõe a Los Angeles Cup — precisa ser bloqueado');
  const conflictReason = (regB.reasons || []).find((item) => item.code === 'DATE_CONFLICT');
  assert.ok(conflictReason, `esperava um motivo DATE_CONFLICT, obtido ${JSON.stringify(regB.reasons)}`);
  assert.ok(conflictReason.message.includes('Los Angeles Cup'), `a mensagem precisa nomear o torneio já inscrito: ${conflictReason.message}`);
  assert.ok(conflictReason.message.includes('2026-02-05') || conflictReason.message.includes('2026-02-08'), `a mensagem precisa citar o período do conflito: ${conflictReason.message}`);

  // "Manter a inscrição atual" — não confirmar a troca. A inscrição
  // original permanece intacta, San Diego Open continua sem inscrição.
  const registrations = await listTournamentRegistrations(profile.id);
  const activeA = registrations.find((item) => item.tournament_id === tournamentA.id && item.status === 'confirmed');
  const activeB = registrations.find((item) => item.tournament_id === tournamentB.id && (item.status === 'confirmed' || item.status === 'pending'));
  assert.ok(activeA, 'a inscrição original em Los Angeles Cup precisa continuar ativa');
  assert.ok(!activeB, 'nenhuma inscrição parcial/pendente pode ter sido criada para San Diego Open');

  console.log('test-registration-overlap-conflict: PASS');
} finally {
  await vite.close();
}
