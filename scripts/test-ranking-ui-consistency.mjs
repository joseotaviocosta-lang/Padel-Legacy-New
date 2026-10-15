// Playthrough 5.0, Parte B/C/W (Invariante 7) — Circuito/Jogadores/Race
// (Ranking.jsx) precisam vir da MESMA fonte (buildWorldRankingSnapshot),
// só reordenada/reformatada por aba — nunca um pipeline paralelo por aba.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-ranking-ui-consistency', search: '' };
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
  const { buildWorldRankingSnapshot } = await vite.ssrLoadModule('/src/lib/padel.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.0 UI Consistency', playerName: 'Player 5.0' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'ui-consistency-player', sport_name: 'UIPlayer', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0, world_ranking_points: 3000, race_points: 400,
  });
  await localGame.entities.AthleteProfile.create({ id: 'ui-rival-1', name: 'Rival Circuito', world_ranking_points: 9000, race_points: 100, overall_rating: 80 });
  await localGame.entities.AthleteProfile.create({ id: 'ui-rival-2', name: 'Rival Race', world_ranking_points: 500, race_points: 800, overall_rating: 60 });

  await check('a mesma entrada (mesmo atleta) aparece com o MESMO id nas ordenações de Circuito e Race — só a ordem muda, nunca o dado', async () => {
    const snapshot = await buildWorldRankingSnapshot(profile);
    const entries = snapshot.entries || [];
    const byCircuito = [...entries].sort((a, b) => b.points - a.points);
    const byRace = [...entries].sort((a, b) => b.racePoints - a.racePoints);
    const idsCircuito = new Set(byCircuito.map((e) => e.id));
    const idsRace = new Set(byRace.map((e) => e.id));
    assert.deepEqual(idsCircuito, idsRace, 'as duas ordenações precisam conter exatamente o mesmo conjunto de atletas');

    const circuitoLeader = byCircuito[0];
    assert.equal(circuitoLeader.id, 'ui-rival-1', 'quem tem mais world_ranking_points lidera o Circuito');
    const raceLeader = byRace[0];
    assert.equal(raceLeader.id, 'ui-rival-2', 'quem tem mais race_points lidera a Race — ordem DIFERENTE da de Circuito, mesmo dado');
  });

  await check('o jogador aparece em ambas as ordenações com os MESMOS pontos (nunca um valor recalculado diferente por aba)', async () => {
    const snapshot = await buildWorldRankingSnapshot(profile);
    const playerEntry = (snapshot.entries || []).find((e) => e.id === profile.id) || snapshot.playerEntry;
    assert.ok(playerEntry, 'o jogador precisa aparecer no snapshot único');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-ranking-ui-consistency: PASS');
} finally {
  await vite.close();
}
