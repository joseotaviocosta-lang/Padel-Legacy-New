// Playthrough 4.9, Parte B (invariante 1) / P — jogador só pode aparecer em
// draw_pair_ids se REGISTERED. Teste focado (sem o backstory de Roma/Londres
// do teste completo, test-player-missed-registration-real-flow.mjs): uma
// carreira nova, nunca se inscreve em nada, avança até depois do sorteio
// AI-only de um torneio qualquer, e confirma que nem o jogador nem seu
// parceiro aparecem em draw_pair_ids.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-unregistered-player-not-in-draw', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.9 Not In Draw', playerName: 'Player 4.9 NotInDraw' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p49-notindraw', sport_name: 'Player49NotInDraw', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50,
  });
  const starterPartner = BOTS_BY_DIFFICULTY.iniciante[0];
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: starterPartner.id });
  profile = await activeCareerAdapter.getPlayerProfile();

  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  // Los Angeles Cup (evento de circuito de verdade, world_tour_event, não
  // exibição de pré-temporada) — mesmo torneio do bug real relatado.
  const losAngeles = tournaments.find((t) => t.name?.includes('Los Angeles'));
  assert.ok(losAngeles, 'seed precisa conter Los Angeles');

  // Nunca se inscreve em nada. Avança até depois do sorteio AI-only.
  const afterDraw = new Date(`${losAngeles.start_date}T00:00:00Z`); afterDraw.setUTCDate(afterDraw.getUTCDate() - 1);
  const afterDrawStr = afterDraw.toISOString().slice(0, 10);
  while (profile.career_date < afterDrawStr) profile = await advanceCareerDayOnce(profile);

  const laAfterDraw = await localGame.entities.Tournament.get(losAngeles.id);
  assert.ok(Array.isArray(laAfterDraw.draw_pair_ids) && laAfterDraw.draw_pair_ids.length > 0, 'pré-condição: Los Angeles deveria ter sido sorteada AI-only, com draw_pair_ids preenchido');

  assert.ok(!laAfterDraw.draw_pair_ids.includes(profile.id), 'o jogador nunca pode aparecer em draw_pair_ids sem estar REGISTERED');
  assert.ok(!laAfterDraw.draw_pair_ids.includes(starterPartner.id), 'o parceiro do jogador nunca pode aparecer em draw_pair_ids sem uma inscrição real');

  console.log('test-unregistered-player-not-in-draw: PASS');
} finally {
  await vite.close();
}
