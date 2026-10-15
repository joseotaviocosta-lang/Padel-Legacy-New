// Playthrough 5.0, Parte O/P/X — TeamRanking precisa ter 1 linha por par
// canônico (IDs ordenados, nunca nome/posição); duplicatas de corrida são
// deduplicadas na leitura (mantém a melhor linha, nunca soma as duas);
// dissolver uma parceria remove sua linha sem afetar a nova dupla.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-team-ranking-canonical-identity', search: '' };
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
  const { teamKey, canonicalPairId, dedupeTeamRankingsByCanonicalPair, getTeamRankings } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const { deleteTeamRankingForPair } = await vite.ssrLoadModule('/src/lib/partnershipSystem.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.0 TeamRanking Identity', playerName: 'Player 5.0' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({ id: 'tri-player', sport_name: 'TRIPlayer', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', coins: 1000, xp: 0 });

  await check('teamKey/canonicalPairId são order-independent (A+B == B+A)', () => {
    assert.equal(teamKey('athlete-a', 'athlete-b'), teamKey('athlete-b', 'athlete-a'));
    assert.equal(canonicalPairId('athlete-a', 'athlete-b'), canonicalPairId('athlete-b', 'athlete-a'));
  });

  await check('duplicata de corrida (mesmo par, duas linhas) é deduplicada na leitura, mantendo a de mais pontos — nunca soma as duas', () => {
    const rows = [
      { id: 'row-1', player1_id: 'x', player2_id: 'y', ranking_points: 400, updated_date: '2026-01-01' },
      { id: 'row-2', player1_id: 'x', player2_id: 'y', ranking_points: 900, updated_date: '2026-01-02' },
    ];
    const deduped = dedupeTeamRankingsByCanonicalPair(rows);
    assert.equal(deduped.length, 1, 'duas linhas do MESMO par canônico precisam virar uma só');
    assert.equal(deduped[0].ranking_points, 900, 'mantém a linha de mais pontos — nunca 400+900=1300');
  });

  await check('getTeamRankings() nunca retorna duas linhas para o mesmo par canônico', async () => {
    await localGame.entities.TeamRanking.create({ id: 'dup-a', team_key: 'race-dup', player1_id: 'race-a', player2_id: 'race-b', player1_name: 'A', player2_name: 'B', ranking_points: 300, matches_played: 1, wins: 1, losses: 0, titles: [] });
    await localGame.entities.TeamRanking.create({ id: 'dup-b', team_key: 'race-dup-2', player1_id: 'race-a', player2_id: 'race-b', player1_name: 'A', player2_name: 'B', ranking_points: 750, matches_played: 2, wins: 1, losses: 1, titles: [] });
    const rankings = await getTeamRankings(600);
    const matches = rankings.filter((row) => row.player1_id === 'race-a' && row.player2_id === 'race-b');
    assert.equal(matches.length, 1, 'mesmo com dois documentos fisicamente distintos, o consumidor precisa ver só 1');
    assert.equal(matches[0].ranking_points, 750);
  });

  await check('dissolver uma parceria remove sua linha de TeamRanking (hard delete), sem afetar outras duplas', async () => {
    await localGame.entities.TeamRanking.create({ id: 'diss-row', team_key: teamKey('diss-a', 'diss-b'), player1_id: 'diss-a', player2_id: 'diss-b', player1_name: 'Diss A', player2_name: 'Diss B', ranking_points: 500, matches_played: 3, wins: 2, losses: 1, titles: ['Título X'] });
    const removed = await deleteTeamRankingForPair('diss-a', 'diss-b');
    assert.equal(removed, 1);
    const remaining = await localGame.entities.TeamRanking.filter({ team_key: teamKey('diss-a', 'diss-b') }).catch(() => []);
    assert.equal(remaining.length, 0, 'a linha da parceria dissolvida precisa desaparecer do ranking');
  });

  await check('nova dupla (A+C, depois de A+B dissolver) nunca herda pontos da antiga — começa do zero real', async () => {
    await localGame.entities.TeamRanking.create({ id: 'old-pair', team_key: teamKey('inherit-a', 'inherit-b'), player1_id: 'inherit-a', player2_id: 'inherit-b', player1_name: 'A', player2_name: 'B', ranking_points: 5000, matches_played: 10, wins: 8, losses: 2, titles: ['Grande Título'] });
    await deleteTeamRankingForPair('inherit-a', 'inherit-b');
    // A nova dupla (A+C) tem uma team_key DIFERENTE — nunca colide com a antiga.
    const newKey = teamKey('inherit-a', 'inherit-c');
    assert.notEqual(newKey, teamKey('inherit-a', 'inherit-b'));
    const existing = await localGame.entities.TeamRanking.filter({ team_key: newKey }).catch(() => []);
    assert.equal(existing.length, 0, 'a nova dupla não deveria ter nenhuma linha pré-existente pra "herdar"');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-team-ranking-canonical-identity: PASS');
} finally {
  await vite.close();
}
