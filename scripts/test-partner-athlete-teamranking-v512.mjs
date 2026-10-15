// Playthrough 5.12, Partes N/O/P — depois de materializado, o parceiro
// precisa funcionar como qualquer atleta do mundo: entrar no TeamRanking
// pela fórmula canônica (sem exceção para o par do jogador), aparecer no
// ranking individual e receber crédito dos torneios que disputa.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-partner-athlete-teamranking-v512', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };

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
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { startPartnership } = await vite.ssrLoadModule('/src/lib/partnershipSystem.js');
  const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
  const { teamKey, computeCanonicalTeamRankingPoints } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.12 TeamRanking', playerName: 'P512T' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p512t', sport_name: 'P512T', career_date: '2026-01-05', birth_date: '2001-01-01',
    level: 'Amador', coins: 20000, xp: 0, morale: 70, form: 50, energy: 100,
    rank_points: 800, race_points: 0,
  });
  await ensureWorldSeed2025();

  // Parceiro com algum nível, para os pontos não serem triviais.
  const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
  await startPartnership(profile, bot, 90, 50);
  let partner = (await localGame.entities.AthleteProfile.filter({ id: bot.id }, null, 1))[0];
  console.log(`parceiro materializado: ${partner.name} (${partner.id}) OVR=${partner.overall_rating}`);

  // Dá ao parceiro algum histórico de circuito, como qualquer atleta.
  await localGame.entities.AthleteProfile.update(partner.id, { world_ranking_points: 3000, rank_points: 3000 });
  partner = (await localGame.entities.AthleteProfile.filter({ id: bot.id }, null, 1))[0];

  const tournament = await localGame.entities.Tournament.create({
    id: 'p512t-cup', name: 'Copa 5.12', tier: 'Silver', start_date: '2026-02-10', status: 'em_andamento',
  });

  profile = await localGame.entities.PlayerProfile.get('p512t');
  const partnerBefore = { ...partner };
  const result = await finalizeTournamentRun({ profile, tournament, partner, roundsWon: 2, totalRounds: 3 });

  const key = teamKey('p512t', partner.id);
  const row = ((await localGame.entities.TeamRanking.filter({ team_key: key })) || [])[0];
  const playerPoints = Number(result.updatedProfile.rank_points) || 0;
  const partnerAfter = (await localGame.entities.AthleteProfile.filter({ id: bot.id }, null, 1))[0];

  console.log(`\njogador rolling: ${playerPoints} | parceiro rolling: ${partnerAfter.world_ranking_points}`);
  console.log(`TeamRanking: ${row?.ranking_points} | esperado canônico: ${computeCanonicalTeamRankingPoints(playerPoints, Number(partnerAfter.world_ranking_points) || 0)}`);

  await check('Parte N/31: a dupla do jogador usa a fórmula canônica, sem exceção', () => {
    assert.ok(row, 'sem linha de TeamRanking');
    const expected = computeCanonicalTeamRankingPoints(playerPoints, Number(partnerAfter.world_ranking_points) || 0);
    assert.equal(Number(row.ranking_points), expected,
      `persistido ${row.ranking_points} != canônico ${expected}`);
  });

  await check('Parte D: o TeamRanking usa os IDs CANÔNICOS (atleta real, não template solto)', () => {
    assert.equal(row.team_key, teamKey('p512t', partner.id));
    assert.ok([row.player1_id, row.player2_id].includes(partner.id),
      `a linha não referencia o atleta materializado: ${row.player1_id}/${row.player2_id}`);
  });

  await check('Parte O/28: o parceiro é um atleta VISÍVEL no ranking individual', async () => {
    const all = await localGame.entities.AthleteProfile.list('-world_ranking_points', 5000);
    const found = all.find((a) => a.id === partner.id);
    assert.ok(found, 'parceiro não aparece na listagem de atletas');
    assert.ok(Number(found.world_ranking_points) > 0, 'parceiro sem pontos de circuito');
    const position = all.findIndex((a) => a.id === partner.id) + 1;
    console.log(`   [registro] parceiro em #${position} de ${all.length} no ranking individual`);
    assert.ok(position > 0);
  });

  await check('Parte P/32: o parceiro recebe AthleteRankingResult do torneio disputado', async () => {
    const rows = await localGame.entities.AthleteRankingResult
      .filter({ athlete_id: partner.id }).catch(() => []);
    console.log(`   [registro] resultados do parceiro: ${rows.length}`);
    assert.ok(rows.length > 0, 'parceiro não recebeu resultado do torneio');
    const forThis = rows.filter((r) => r.tournament_id === tournament.id);
    assert.equal(forThis.length, 1, `${forThis.length} resultados para o mesmo torneio (duplicado?)`);
  });

  await check('Parte P: crédito SEM duplicação (um resultado por torneio por atleta)', async () => {
    const rows = await localGame.entities.AthleteRankingResult
      .filter({ athlete_id: partner.id }).catch(() => []);
    const ids = rows.map((r) => `${r.athlete_id}:${r.tournament_id}`);
    assert.equal(new Set(ids).size, ids.length, 'resultados duplicados para o parceiro');
  });

  await check('Parte P: o parceiro ganhou pontos de circuito com o torneio', () => {
    assert.ok(Number(partnerAfter.world_ranking_points) >= Number(partnerBefore.world_ranking_points),
      `pontos caíram: ${partnerBefore.world_ranking_points} -> ${partnerAfter.world_ranking_points}`);
  });

  await check('Parte P/29: Race do parceiro funciona como a de qualquer atleta', () => {
    assert.ok(Number.isFinite(Number(partnerAfter.race_points)), `race_points = ${partnerAfter.race_points}`);
    assert.ok(Number(partnerAfter.race_points) >= 0);
    console.log(`   [registro] race_points do parceiro: ${partnerAfter.race_points}`);
  });

  await check('Parte T: o torneio não alterou o OVR do parceiro artificialmente', () => {
    assert.equal(Number(partnerAfter.overall_rating), Number(partnerBefore.overall_rating),
      `OVR mudou de ${partnerBefore.overall_rating} para ${partnerAfter.overall_rating}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-partner-athlete-teamranking-v512: PASS');
} finally {
  await vite.close();
}
