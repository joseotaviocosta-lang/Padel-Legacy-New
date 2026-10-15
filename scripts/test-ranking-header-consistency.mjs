// Playthrough 5.0, Parte M/W (Invariante 7) — o ranking individual exibido
// no header (getWorldRank, AppLayout.jsx/CareerHud.jsx) precisa ser
// IDÊNTICO ao mesmo snapshot lido por qualquer outra tela (nunca uma
// segunda fórmula/campo persistido divergente).
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-ranking-header-consistency', search: '' };
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
  const { getWorldRank, buildWorldRankingSnapshot } = await vite.ssrLoadModule('/src/lib/padel.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.0 Header Consistency', playerName: 'Player 5.0' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'header-consistency-player', sport_name: 'HeaderPlayer', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0, world_ranking_points: 4200, rank_points: 4200,
  });

  // Popula alguns concorrentes pra dar uma posição real, não "sem ranking".
  for (let i = 0; i < 10; i += 1) {
    await localGame.entities.AthleteProfile.create({ id: `hc-rival-${i}`, name: `Rival ${i}`, world_ranking_points: 5000 - i * 200, overall_rating: 70 });
  }

  await check('getWorldRank (header) e buildWorldRankingSnapshot (Ranking.jsx/Athletes.jsx) produzem o MESMO rank pro jogador no mesmo instante', async () => {
    const headerRank = await getWorldRank(profile);
    const snapshot = await buildWorldRankingSnapshot(profile);
    assert.equal(headerRank.rank, snapshot.playerRank, 'header e snapshot precisam concordar — mesma fonte, mesmo cálculo');
    assert.equal(headerRank.points, snapshot.playerPoints);
    assert.equal(headerRank.unranked, snapshot.unranked);
  });

  await check('chamar getWorldRank duas vezes seguidas (sem nenhuma mudança de dados) produz o MESMO valor — determinístico, nunca "salta"', async () => {
    const first = await getWorldRank(profile);
    const second = await getWorldRank(profile);
    assert.deepEqual(first, second);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-ranking-header-consistency: PASS');
} finally {
  await vite.close();
}
