// Playthrough 5.0, Parte W (Invariante 10) — reload precisa preservar
// pontos e posições EXATAMENTE: nenhuma duplicação, nenhum recálculo
// divergente só por reabrir o app.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-ranking-reload-idempotency', search: '' };
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
  const { prepareTournamentFinalization } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');

  const disk = new Map();
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage(disk))));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.0 Reload', playerName: 'Player 5.0 Reload' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'reload-ranking-player', sport_name: 'ReloadPlayer', career_date: '2026-03-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });
  const partner = { id: 'reload-partner', name: 'Bot Parceiro' };
  await localGame.entities.AthleteProfile.create({ id: 'ap-reload-opp', bot_id: 'bot-reload-opp', name: 'Alvo Reload', overall_rating: 85, race_points: 0, world_ranking_points: 0 });

  const tournament = await localGame.entities.Tournament.create({ id: 'reload-tournament', name: 'Reload Cup', tier: 'Gold', main_draw_size: 4, start_date: '2026-03-05', end_date: '2026-03-05' });
  const run = { matches: [{ round: 'R0', roundIndex: 0, opponent: [{ id: 'filler', name: 'Filler' }] }, { round: 'Final', roundIndex: 1, opponent: [{ id: 'bot-reload-opp', name: 'Alvo Reload' }] }] };
  const result = await prepareTournamentFinalization({
    profile, tournament, partner, roundsWon: 2, totalRounds: 2, run,
    bracketHistory: [{ round: 'Final', is_final: true, matches: [{ match_id: 'm1', team_a: 'A', team_b: 'B', winner: 'A' }] }],
  });
  await localGame.batch([...result.operations, { type: 'playerUpdate', id: profile.id, data: result.playerPatch }]);

  const beforeReload = {
    player: await localGame.entities.PlayerProfile.get(profile.id),
    opponent: await localGame.entities.AthleteProfile.get('ap-reload-opp'),
    results: await localGame.entities.AthleteRankingResult.filter({ tournament_id: tournament.id }).catch(() => []),
  };

  // "Reload" — novo CareerManager/CareerRepository/GameStorage por cima do
  // MESMO storage (mesmo padrão já usado nas fases 4.6C/4.9).
  activeCareerAdapter.clearActiveCareer();
  const manager2 = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage(disk))));
  activeCareerAdapter.careerManager = manager2;
  const reloaded = await manager2.loadCareer(career.career_id || career.id);
  activeCareerAdapter.setActiveCareer(reloaded.career || reloaded);

  await check('race_points/world_ranking_points do jogador sobrevivem EXATAMENTE ao reload', async () => {
    const after = await localGame.entities.PlayerProfile.get(profile.id);
    assert.equal(after.race_points, beforeReload.player.race_points);
    assert.equal(after.world_ranking_points, beforeReload.player.world_ranking_points);
  });

  await check('race_points/world_ranking_points do adversário creditado sobrevivem EXATAMENTE ao reload', async () => {
    const after = await localGame.entities.AthleteProfile.get('ap-reload-opp');
    assert.equal(after.race_points, beforeReload.opponent.race_points);
    assert.equal(after.world_ranking_points, beforeReload.opponent.world_ranking_points);
  });

  await check('nenhum AthleteRankingResult duplicado depois do reload', async () => {
    const after = await localGame.entities.AthleteRankingResult.filter({ tournament_id: tournament.id }).catch(() => []);
    assert.equal(after.length, beforeReload.results.length);
    const ids = after.map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-ranking-reload-idempotency: PASS');
} finally {
  await vite.close();
}
