// Playthrough 5.0, Parte L/N/X — "Minha Dupla" precisa distinguir ranking
// INDIVIDUAL do jogador (getWorldRank) do ranking da DUPLA (getTeamRank) —
// nunca confundir os dois, nunca inventar um valor quando não há fonte
// canônica real.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-player-team-ranking-authority', search: '' };
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
  const { getTeamRank } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const { getWorldRank } = await vite.ssrLoadModule('/src/lib/padel.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.0 Team Rank Authority', playerName: 'Player 5.0' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'team-authority-player', sport_name: 'TeamAuthorityPlayer', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0, world_ranking_points: 0, race_points: 0,
  });
  const partner = { id: 'team-authority-partner', name: 'Parceiro Autoridade' };

  await check('dupla sem nenhum torneio disputado -> Sem ranking (nunca um número fabricado)', async () => {
    const rank = await getTeamRank(profile, partner);
    assert.equal(rank.unranked, true);
    assert.equal(rank.displayRank, '—');
  });

  await check('jogador sem nenhum resultado -> ranking individual "Sem ranking" (1000+), nunca confundido com o da dupla', async () => {
    const individual = await getWorldRank(profile);
    assert.equal(individual.unranked, true);
  });

  // Cria uma linha de TeamRanking real (a dupla já disputou torneios).
  await check('dupla com TeamRanking real -> getTeamRank resolve uma posição real, distinta do ranking individual', async () => {
    await localGame.entities.TeamRanking.create({
      team_key: [profile.id, partner.id].sort().join('_'),
      player1_id: profile.id, player1_name: profile.sport_name,
      player2_id: partner.id, player2_name: partner.name,
      ranking_points: 1240, matches_played: 5, wins: 3, losses: 2, titles: [],
    });
    const teamRank = await getTeamRank(profile, partner);
    assert.equal(teamRank.unranked, false);
    assert.ok(teamRank.rank >= 1);
    assert.equal(teamRank.points, 1240);

    // O ranking individual do jogador continua vindo de outra fonte
    // (AthleteProfile/PlayerProfile.world_ranking_points), nunca copiado
    // do ranking da dupla.
    const individual = await getWorldRank(profile);
    assert.notEqual(individual.rank, teamRank.rank, 'os dois ranks vêm de fontes DIFERENTES — não deveriam coincidir por acidente de implementação (aqui, o jogador continua sem ranking individual mesmo com a dupla já ranqueada)');
  });

  await check('A+B e B+A resolvem a MESMA linha de TeamRanking (order-independent)', async () => {
    const rankAB = await getTeamRank(profile, partner);
    const rankBA = await getTeamRank(partner, profile);
    assert.equal(rankAB.points, rankBA.points);
    assert.equal(rankAB.rank, rankBA.rank);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-player-team-ranking-authority: PASS');
} finally {
  await vite.close();
}
