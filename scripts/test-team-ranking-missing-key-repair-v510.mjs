// Playthrough 5.10, Parte N — linha com player ids válidos e team_key
// AUSENTE, num save real: precisa ser reconstruída (sorted(p1,p2)) e
// continuar válida. Nunca sumir.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-team-ranking-missing-key-repair-v510', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(p) { this.directories.add(p); }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list(dir = '.') { const p = dir === '.' ? '' : `${dir}/`; return [...this.files.keys()].filter((k) => k.startsWith(p)).map((k) => ({ name: k.slice(p.length), isDirectory: false })); }
  async stat() { return { size: 0 }; }
}

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
  const { repairLegacyTeamRankings, getTeamRankings, teamKey } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.10 MissingKey', playerName: 'P510MK' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p510-mk', sport_name: 'P510MK', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', coins: 1000, xp: 0,
  });

  await localGame.entities.AthleteProfile.create({ id: 'mk-a', bot_id: 'mk-a', name: 'MK A', world_ranking_points: 900, ranking_points: 900 });
  await localGame.entities.AthleteProfile.create({ id: 'mk-b', bot_id: 'mk-b', name: 'MK B', world_ranking_points: 700, ranking_points: 700 });

  await localGame.entities.TeamRanking.create({
    id: 'mk-row', player1_id: 'mk-a', player2_id: 'mk-b',
    player1_name: 'MK A', player2_name: 'MK B',
    ranking_points: 640, matches_played: 9, wins: 5, losses: 4, titles: ['Aberto MK'],
  });

  const created = await localGame.entities.TeamRanking.get('mk-row');
  console.log(`team_key gravado originalmente: ${JSON.stringify(created.team_key)}`);

  await check('pré-condição: a linha existe sem team_key utilizável', () => {
    assert.ok(!created.team_key, `team_key deveria estar ausente, veio ${created.team_key}`);
  });

  await check('Parte N: a linha aparece na leitura mesmo ANTES do reparo (dedupe normaliza)', async () => {
    const board = await getTeamRankings(600);
    const row = board.find((r) => r.player1_id === 'mk-a' && r.player2_id === 'mk-b');
    assert.ok(row, 'linha sem team_key sumiu da leitura');
    assert.equal(row.team_key, teamKey('mk-a', 'mk-b'), 'key não foi reconstruída na leitura');
  });

  const summary = await repairLegacyTeamRankings();
  const repaired = await localGame.entities.TeamRanking.get('mk-row');

  console.log(`reparo: ${JSON.stringify(summary)}`);
  console.log(`team_key após reparo: ${repaired.team_key}`);

  await check('Parte N: o reparo PERSISTE a team_key reconstruída', () => {
    assert.equal(repaired.team_key, teamKey('mk-a', 'mk-b'));
    assert.ok(summary.keyNormalized >= 1, `keyNormalized=${summary.keyNormalized}`);
  });

  await check('Parte L: estatísticas intactas e pontos na autoridade vigente (900 + 700 = 1600)', () => {
    assert.equal(Number(repaired.ranking_points), 1600);
    assert.equal(Number(repaired.matches_played), 9);
    assert.equal(Number(repaired.wins), 5);
    assert.deepEqual(repaired.titles, ['Aberto MK']);
  });

  await check('Parte L: reparar de novo não muda nada', async () => {
    const second = await repairLegacyTeamRankings();
    assert.equal(second.keyNormalized, 0, `segunda passada normalizou ${second.keyNormalized}`);
    const again = await localGame.entities.TeamRanking.get('mk-row');
    assert.equal(again.team_key, repaired.team_key);
    assert.equal(Number(again.ranking_points), 1600);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-team-ranking-missing-key-repair-v510: PASS');
} finally {
  await vite.close();
}
