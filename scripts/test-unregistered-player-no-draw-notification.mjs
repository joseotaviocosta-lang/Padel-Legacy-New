// Playthrough 4.9, Parte B (invariante 2) / F / P — ensureTournamentDrawNotification
// nunca pode criar uma CareerMessage personalizada de sorteio para um
// jogador não inscrito, mesmo que o torneio já tenha bracket_history
// (chave AI-only) pronto. Teste unitário e direto, sem simular a carreira
// inteira.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-unregistered-player-no-draw-notification', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureTournamentDrawNotification } = await vite.ssrLoadModule('/src/lib/careerCommunications.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.9 No Draw Notification', playerName: 'Player 4.9 NoDrawNotif' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p49-nodrawnotif', sport_name: 'Player49NoDrawNotif', career_date: '2026-04-02', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });

  // Torneio AI-only já sorteado (exatamente o cenário do bug: "Los Angeles
  // Cup" — nome real do relato), sem NENHUMA TournamentRegistration nem
  // CalendarEvent para este jogador.
  const tournament = await localGame.entities.Tournament.create({
    id: 'no-notif-tournament', name: 'Los Angeles Cup', tier: 'Silver',
    start_date: '2026-04-05', end_date: '2026-04-08', bracket_schema_version: 2, draw_date: '2026-04-02',
    bracket_history: [{ round: 'Rodada de 16', date: '2026-04-05', matches: [
      { match_id: 'm1', team_a: 'Franco López & Pablo López', team_b: 'Outra Dupla', winner: null },
    ] }],
  });

  const result = await ensureTournamentDrawNotification(profile, tournament, null);
  assert.equal(result, null, 'sem inscrição real, ensureTournamentDrawNotification precisa retornar null');

  const messagesAboutTournament = (msgs) => (msgs || []).filter((m) => String(m.related_entity_id) === String(tournament.id));
  const messages = messagesAboutTournament(await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []));
  assert.equal(messages.length, 0, 'nenhuma CareerMessage sobre este torneio pode ter sido criada');

  // Mesmo chamando de novo (self-healing tentando "reparar"), continua null —
  // nunca cria a mensagem tardiamente pra quem não está inscrito.
  const result2 = await ensureTournamentDrawNotification({ ...profile, career_date: '2026-04-06' }, tournament, null);
  assert.equal(result2, null);
  const messagesAfter = messagesAboutTournament(await localGame.entities.CareerMessage.filter({ profile_id: profile.id }).catch(() => []));
  assert.equal(messagesAfter.length, 0);

  console.log('test-unregistered-player-no-draw-notification: PASS');
} finally {
  await vite.close();
}
