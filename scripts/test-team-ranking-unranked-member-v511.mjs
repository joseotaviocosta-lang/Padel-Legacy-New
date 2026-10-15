// Playthrough 5.11, Parte J — comportamento canônico quando um membro tem
// 0 pontos / está unranked, no caminho REAL de produção.
//
// Playthrough 5.22-F — a autoridade vigente é a SOMA (A + B). A antiga
// proibição de "herdar quase todo o ranking do parceiro" foi superada pela
// regra aprovada: com 0 + x = x o membro zerado simplesmente NÃO reduz o
// valor da dupla, e a única convenção de "sem ranking" que resta é
// 0 + 0 = 0. Não pode haver NaN, Infinity, divisão por zero nem rank
// absurdo.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-team-ranking-unranked-member-v511', search: '' };
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
  const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
  const { teamKey, getTeamRank, computeCanonicalTeamRankingPoints } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.11 Unranked', playerName: 'P511U' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p511u', sport_name: 'P511U', career_date: '2026-01-02', birth_date: '2001-01-01',
    level: 'Amador', overall: 50, overall_rating: 50, ranking_position: 1200,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50,
    weekly_training_enabled: false, race_points: 0, rank_points: 0,
  });

  await check('Parte J: helper com um membro zerado devolve o OUTRO membro (não NaN, não Infinity)', () => {
    // Playthrough 5.22-F: 0 + x = x. O membro sem pontos não zera a dupla.
    assert.equal(computeCanonicalTeamRankingPoints(0, 25000), 25000);
    assert.equal(computeCanonicalTeamRankingPoints(25000, 0), 25000);
    // 0 + 0 = 0 continua sendo o único estado "sem ranking".
    assert.equal(computeCanonicalTeamRankingPoints(0, 0), 0);
    for (const [a, b] of [[0, 25000], [25000, 0], [0, 0]]) {
      const r = computeCanonicalTeamRankingPoints(a, b);
      assert.ok(Number.isFinite(r), `f(${a},${b}) = ${r}`);
      assert.ok(r >= 0, `f(${a},${b}) = ${r}`);
    }
  });

  // Parceiro de elite + jogador literalmente sem pontos, pelo caminho real.
  const elite = await localGame.entities.AthleteProfile.create({
    id: 'p511u-elite', bot_id: 'p511u-elite', name: 'Elite 511',
    world_ranking_points: 25000, ranking_points: 25000, race_points: 0,
  });
  const tournament = await localGame.entities.Tournament.create({
    id: 'p511u-cup', name: 'Copa Unranked', tier: 'Silver', start_date: '2026-02-10', status: 'em_andamento',
  });

  const profile = await localGame.entities.PlayerProfile.get('p511u');
  const result = await finalizeTournamentRun({ profile, tournament, partner: elite, roundsWon: 0, totalRounds: 3 });
  const key = teamKey('p511u', 'p511u-elite');
  const row = ((await localGame.entities.TeamRanking.filter({ team_key: key })) || [])[0];
  const playerPoints = Number(result.updatedProfile.rank_points) || 0;

  console.log(`\n  jogador após 1ª rodada perdida .. ${playerPoints} pts`);
  console.log(`  parceiro ........................ 25000 pts`);
  console.log(`  dupla persistida ................ ${row?.ranking_points} pts`);
  console.log(`  esperado pelo helper ............ ${computeCanonicalTeamRankingPoints(playerPoints, 25000)}`);

  await check('Parte J: o caminho real grava valor finito e não-negativo', () => {
    assert.ok(row, 'linha não criada');
    const pts = Number(row.ranking_points);
    assert.ok(Number.isFinite(pts) && pts >= 0, `ranking_points = ${row.ranking_points}`);
  });

  await check('Parte J: produção usa o helper canônico também no caso zerado', () => {
    assert.equal(Number(row.ranking_points), computeCanonicalTeamRankingPoints(playerPoints, 25000));
  });

  await check('Parte J: a dupla herda EXATAMENTE parceiro + jogador (soma canônica)', () => {
    // Playthrough 5.22-F: com 0 + x = x a dupla nunca fica abaixo do membro
    // que pontuou; com o jogador pontuando, vale a soma dos dois.
    assert.equal(Number(row.ranking_points), computeCanonicalTeamRankingPoints(playerPoints, 25000));
    assert.equal(Number(row.ranking_points), 25000 + playerPoints,
      `dupla ${row.ranking_points} != 25000 (parceiro) + ${playerPoints} (jogador)`);
    console.log(`   [registro] dupla = 25000 (parceiro) + ${playerPoints} (jogador) = ${row.ranking_points}`);
  });

  await check('Parte J: getTeamRank não devolve NaN nem posição absurda', async () => {
    const fresh = await localGame.entities.PlayerProfile.get('p511u');
    const rank = await getTeamRank(fresh, elite);
    console.log(`   [registro] getTeamRank -> rank=${rank.rank} displayRank=${rank.displayRank} unranked=${rank.unranked}`);
    assert.ok(Number.isFinite(rank.rank), `rank = ${rank.rank}`);
    assert.ok(Number.isFinite(rank.points), `points = ${rank.points}`);
    assert.ok(rank.rank >= 0, 'rank negativo');
    assert.ok(typeof rank.displayRank === 'string');
  });

  await check('Parte J: dupla com AMBOS zerados vale 0 e é tratada como sem ranking', async () => {
    const nobody = await localGame.entities.AthleteProfile.create({
      id: 'p511u-nobody', bot_id: 'p511u-nobody', name: 'Ninguém',
      world_ranking_points: 0, ranking_points: 0, race_points: 0,
    });
    assert.equal(computeCanonicalTeamRankingPoints(0, 0), 0);
    const fresh = await localGame.entities.PlayerProfile.get('p511u');
    const rank = await getTeamRank(fresh, nobody);
    assert.equal(rank.unranked, true, 'dupla sem pontos deveria ser unranked');
    assert.equal(rank.displayRank, '—');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-team-ranking-unranked-member-v511: PASS');
} finally {
  await vite.close();
}
