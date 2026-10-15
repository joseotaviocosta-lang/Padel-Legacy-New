// Playthrough 4.6B, itens 1/2/3/16 — o painel "Próximo adversário" e o
// pipeline de conquistas mostravam o número de SEED/SLOT do sorteio
// sintético (computeSeededOpponentRanksForMainDraw, tournamentDraw.js) como
// se fosse a posição real no ranking mundial (ex.: Hugo Ortega/Clément
// Fontaine como "#1" em Roma, sem nenhuma relação com um ranking factual).
// getCanonicalTeamWorldRank() (teamRanking.js) é a nova fonte ÚNICA: rank
// FACTUAL por IDs de atleta (via TeamRanking, a mesma fonte que getTeamRank
// já usa pra dupla do jogador), nunca nome/seed/slot/fórmula. Sem dado real,
// devolve unranked — nunca inventa um valor.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-opponent-world-rank-authority', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

let passed = 0;
let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
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
  const { getCanonicalTeamWorldRank } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const { buildOpponentAnalysis } = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6B World Rank Authority', playerName: 'Player 4.6B' });
  activeCareerAdapter.setActiveCareer(career);

  // Popula um TeamRanking real: pair #1 (mais pontos), pair #2, ..., pair
  // "meio de tabela" — igual à fonte que getTeamRank já usa.
  const teams = [
    { id: 'p1', a: 'real-a1', b: 'real-b1', points: 5000 },
    { id: 'p2', a: 'real-a2', b: 'real-b2', points: 4800 },
    { id: 'p3', a: 'real-a3', b: 'real-b3', points: 3000 },
    { id: 'p4', a: 'real-a4', b: 'real-b4', points: 2000 },
    { id: 'p-mid', a: 'real-a-mid', b: 'real-b-mid', points: 500 },
  ];
  for (const t of teams) {
    await localGame.entities.TeamRanking.create({
      team_key: [t.a, t.b].sort().join('_'), player1_id: t.a, player1_name: t.a, player2_id: t.b, player2_name: t.b,
      ranking_points: t.points, matches_played: 5, wins: 4, losses: 1, titles: [],
    });
  }

  await check('1/2. pair com rank #1 real é identificada corretamente (world rank #1)', async () => {
    const result = await getCanonicalTeamWorldRank(['real-a1', 'real-b1']);
    assert.equal(result.unranked, false);
    assert.equal(result.rank, 1);
  });

  await check('1/2. pair com menos pontos fica atrás da #1 real (nunca reaproveita a mesma posição)', async () => {
    const top = await getCanonicalTeamWorldRank(['real-a1', 'real-b1']);
    const mid = await getCanonicalTeamWorldRank(['real-a-mid', 'real-b-mid']);
    assert.equal(mid.unranked, false);
    assert.ok(mid.rank > top.rank, `dupla com menos pontos (${mid.points}) deve ter posição pior que a #1 (${JSON.stringify({ top, mid })})`);
  });

  await check('1/2. pair sem nenhum dado de TeamRanking mostra "sem ranking" — nunca inventa um valor', async () => {
    const result = await getCanonicalTeamWorldRank(['bot-fictional-1', 'bot-fictional-2']);
    assert.equal(result.unranked, true);
    assert.equal(result.rank, 0);
    assert.equal(result.displayRank, '—');
  });

  await check('2. IDs insuficientes (< 2) nunca lançam exceção, sempre "sem ranking"', async () => {
    const result = await getCanonicalTeamWorldRank(['only-one-id']);
    assert.equal(result.unranked, true);
  });

  await check('3. buildOpponentAnalysis usa SOMENTE o worldRank factual passado — nunca um id/seed do array de membros', () => {
    const opponent = [{ id: 'x1', name: 'Fulano' }, { id: 'x2', name: 'Sicrano' }];
    const withRealRank = buildOpponentAnalysis(opponent, { worldRank: 7 });
    assert.equal(withRealRank.ranking, 7);
    const withoutRank = buildOpponentAnalysis(opponent, { worldRank: null });
    assert.equal(withoutRank.ranking, null, 'sem worldRank real, nunca deve fabricar um número (nem 0 nem um fallback arbitrário)');
  });

  await check('16. seed #1 (sintético) mas world rank #7 real -> mostra #7, nunca #1 (seed != world rank)', () => {
    // Simula exatamente o cenário do item 16: um adversário que o motor de
    // seeding tratou como cabeça de chave #1 (posição no sorteio), mas cujo
    // rank mundial FACTUAL é #7. `buildOpponentAnalysis` nunca deveria saber
    // ou se importar com "seed" — só recebe `worldRank`, que é sempre o
    // canônico.
    const opponent = [{ id: 'seed1-a', name: 'Cabeça de Chave' }, { id: 'seed1-b', name: 'Parceiro' }];
    const analysis = buildOpponentAnalysis(opponent, { worldRank: 7 });
    assert.equal(analysis.ranking, 7, 'seed #1 sintético não pode vazar como "#1" de ranking mundial');
    assert.notEqual(analysis.ranking, 1);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-opponent-world-rank-authority: PASS');
} finally {
  await vite.close();
}
