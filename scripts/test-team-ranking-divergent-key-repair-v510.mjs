// Playthrough 5.10, Partes M/X — linha com player ids válidos e team_key
// DIVERGENTE (gravada por um caminho antigo), num save real: a autoridade é
// canonicalPairId(player1_id, player2_id), então a key precisa ser
// normalizada e a linha JAMAIS pode desaparecer da classificação.
//
// Era exatamente este o bug provado na 5.9: divergent key -> dedupeKeeps=0.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-team-ranking-divergent-key-repair-v510', search: '' };
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
  const { career } = await manager.createCareer({ saveName: '5.10 DivergentKey', playerName: 'P510DK' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p510-dk', sport_name: 'P510DK', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', coins: 1000, xp: 0,
  });

  await localGame.entities.AthleteProfile.create({ id: 'dk-a', bot_id: 'dk-a', name: 'DK A', world_ranking_points: 900, ranking_points: 900 });
  await localGame.entities.AthleteProfile.create({ id: 'dk-b', bot_id: 'dk-b', name: 'DK B', world_ranking_points: 700, ranking_points: 700 });

  const DIVERGENT_KEY = 'jogador__parceiro-formato-antigo';
  await localGame.entities.TeamRanking.create({
    id: 'dk-row', team_key: DIVERGENT_KEY, player1_id: 'dk-a', player2_id: 'dk-b',
    player1_name: 'DK A', player2_name: 'DK B',
    ranking_points: 640, matches_played: 9, wins: 5, losses: 4, titles: ['Aberto DK'],
  });

  const created = await localGame.entities.TeamRanking.get('dk-row');
  console.log(`team_key gravado originalmente: ${JSON.stringify(created.team_key)}`);

  await check('pré-condição: a linha existe com team_key DIVERGENTE do canônico', () => {
    assert.equal(created.team_key, DIVERGENT_KEY);
    assert.notEqual(created.team_key, teamKey('dk-a', 'dk-b'));
  });

  await check('Parte M/X: a linha NÃO desaparece da leitura (era o bug da 5.9)', async () => {
    const board = await getTeamRankings(600);
    const row = board.find((r) => r.player1_id === 'dk-a' && r.player2_id === 'dk-b');
    assert.ok(row, 'linha sem team_key sumiu da leitura');
    assert.equal(row.team_key, teamKey('dk-a', 'dk-b'), 'key não foi reconstruída na leitura');
  });

  const summary = await repairLegacyTeamRankings();
  const repaired = await localGame.entities.TeamRanking.get('dk-row');

  console.log(`reparo: ${JSON.stringify(summary)}`);
  console.log(`team_key após reparo: ${repaired.team_key}`);

  await check('Parte M: o reparo PERSISTE a team_key canônica sobre a divergente', () => {
    assert.equal(repaired.team_key, teamKey('dk-a', 'dk-b'));
    assert.notEqual(repaired.team_key, DIVERGENT_KEY);
    assert.ok(summary.keyNormalized >= 1, `keyNormalized=${summary.keyNormalized}`);
  });

  await check('Parte L: estatísticas intactas e pontos na autoridade vigente (900 + 700 = 1600)', () => {
    assert.equal(Number(repaired.ranking_points), 1600);
    assert.equal(Number(repaired.matches_played), 9);
    assert.equal(Number(repaired.wins), 5);
    assert.deepEqual(repaired.titles, ['Aberto DK']);
  });

  await check('Parte L: reparar de novo não muda nada', async () => {
    const second = await repairLegacyTeamRankings();
    assert.equal(second.keyNormalized, 0, `segunda passada normalizou ${second.keyNormalized}`);
    const again = await localGame.entities.TeamRanking.get('dk-row');
    assert.equal(again.team_key, repaired.team_key);
    assert.equal(Number(again.ranking_points), 1600);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-team-ranking-divergent-key-repair-v510: PASS');
} finally {
  await vite.close();
}
