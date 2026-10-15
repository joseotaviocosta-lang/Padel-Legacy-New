// Playthrough 5.10, Partes J/L/P — reparo idempotente de saves antigos.
//
// Um save criado ANTES da correção de ordem (Parte K) tem linhas de
// TeamRanking cujos membros são `ranking-bot-NNNN`. O reparo deve remapear
// pelo vínculo determinístico já existente (AthleteProfile.bot_id), nunca
// inventar membro, nunca somar pontos de duplicata.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-team-ranking-legacy-repair-v510', search: '' };
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
  const { career } = await manager.createCareer({ saveName: '5.10 Legacy Repair', playerName: 'P510Rep' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p510-rep', sport_name: 'P510Rep', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', coins: 1000, xp: 0,
  });

  // Atletas com bot_id — o vínculo determinístico que o reparo usa.
  const athletes = [];
  for (let i = 1; i <= 6; i += 1) {
    athletes.push(await localGame.entities.AthleteProfile.create({
      id: `athlete-real-${i}`, bot_id: `ranking-bot-${String(i).padStart(4, '0')}`,
      name: `Atleta ${i}`, world_ranking_points: 1000 - i * 10, ranking_points: 1000 - i * 10,
    }));
  }

  // Save "antigo": linhas gravadas com bot_id como identidade.
  await localGame.entities.TeamRanking.create({
    id: 'legacy-1', team_key: 'ranking-bot-0001_ranking-bot-0002',
    player1_id: 'ranking-bot-0001', player2_id: 'ranking-bot-0002',
    player1_name: 'Atleta 1', player2_name: 'Atleta 2',
    ranking_points: 800, matches_played: 10, wins: 6, losses: 4, titles: ['Velho Título'],
  });
  // Duplicata do MESMO par, já em formato canônico, com mais pontos.
  await localGame.entities.TeamRanking.create({
    id: 'legacy-1-dup', team_key: teamKey('athlete-real-1', 'athlete-real-2'),
    player1_id: 'athlete-real-1', player2_id: 'athlete-real-2',
    player1_name: 'Atleta 1', player2_name: 'Atleta 2',
    ranking_points: 950, matches_played: 12, wins: 7, losses: 5, titles: [],
  });
  // Linha legada com key divergente (mas membros já canônicos).
  await localGame.entities.TeamRanking.create({
    id: 'legacy-2', team_key: 'chave-totalmente-errada',
    player1_id: 'athlete-real-3', player2_id: 'athlete-real-4',
    player1_name: 'Atleta 3', player2_name: 'Atleta 4',
    ranking_points: 500, matches_played: 4, wins: 2, losses: 2, titles: [],
  });
  // Linha irresolvível: bot_id que não existe em nenhum atleta.
  await localGame.entities.TeamRanking.create({
    id: 'legacy-3', team_key: 'ranking-bot-9998_ranking-bot-9999',
    player1_id: 'ranking-bot-9998', player2_id: 'ranking-bot-9999',
    player1_name: 'Fantasma A', player2_name: 'Fantasma B',
    ranking_points: 300, matches_played: 2, wins: 1, losses: 1, titles: [],
  });

  const before = await localGame.entities.TeamRanking.list(null, 5000);
  const summary = await repairLegacyTeamRankings();
  const after = await localGame.entities.TeamRanking.list(null, 5000);

  console.log('\n=== Reparo ===');
  console.log(`  linhas antes ........ ${before.length}`);
  console.log(`  linhas depois ....... ${after.length}`);
  console.log(`  checked=${summary.checked} remapped=${summary.remapped} keyNormalized=${summary.keyNormalized} duplicatesMerged=${summary.duplicatesMerged} unresolved=${summary.unresolved}`);

  await check('Parte J: membros bot_id foram remapeados para o id real do AthleteProfile', () => {
    const repaired = after.find((r) => r.id === 'legacy-1' || r.id === 'legacy-1-dup');
    assert.ok(repaired, 'a linha do par 1+2 sumiu');
    const survivors = after.filter((r) => ['legacy-1', 'legacy-1-dup'].includes(r.id));
    for (const row of survivors) {
      assert.ok(!/^ranking-bot-/.test(String(row.player1_id)), `player1_id ainda é bot_id: ${row.player1_id}`);
      assert.ok(!/^ranking-bot-/.test(String(row.player2_id)), `player2_id ainda é bot_id: ${row.player2_id}`);
    }
  });

  await check('Parte P: duplicata do mesmo par foi resolvida mantendo UMA linha, sem somar as duplicatas', () => {
    const pairRows = after.filter((r) => {
      const ids = [r.player1_id, r.player2_id].sort().join('_');
      return ids === teamKey('athlete-real-1', 'athlete-real-2');
    });
    assert.equal(pairRows.length, 1, `${pairRows.length} linhas para o mesmo par após o reparo`);
    // Playthrough 5.22-E, Parte U — o reparo agora recalcula a linha
    // sobrevivente para a autoridade vigente (soma dos membros: 990 + 980 =
    // 1970). O que NÃO pode acontecer é somar as duas linhas duplicadas
    // (800 + 950 = 1750).
    assert.equal(Number(pairRows[0].ranking_points), 1970, `canônico esperado 1970, obtido ${pairRows[0].ranking_points}`);
    assert.notEqual(Number(pairRows[0].ranking_points), 1750, 'somou as duplicatas');
  });

  await check('Parte N: team_key divergente foi normalizado, a linha NÃO sumiu', () => {
    const row = after.find((r) => r.id === 'legacy-2');
    assert.ok(row, 'linha com key divergente foi apagada');
    assert.equal(row.team_key, teamKey('athlete-real-3', 'athlete-real-4'));
    // 970 + 960 = 1930 pela autoridade vigente (Parte U).
    assert.equal(Number(row.ranking_points), 1930, 'pontos devem convergir para a soma dos membros');
  });

  await check('Parte J: linha irresolvível NÃO é apagada nem recebe membro inventado', () => {
    const row = after.find((r) => r.id === 'legacy-3');
    assert.ok(row, 'linha irresolvível foi apagada — o dado bruto deve permanecer');
    assert.equal(row.player1_id, 'ranking-bot-9998', 'membro foi reescrito/inventado');
    assert.equal(summary.unresolved, 1, `unresolved=${summary.unresolved}, esperado 1`);
  });

  await check('Parte V: a linha irresolvível fica FORA da classificação exibida', () => {
    // Ela tem ids de membro, então sobrevive ao dedupe estrutural; o filtro
    // de exibição é por resolubilidade contra AthleteProfile.
    const ranked = after.filter((r) => ['athlete-real-1', 'athlete-real-2', 'athlete-real-3', 'athlete-real-4']
      .includes(r.player1_id));
    assert.ok(ranked.length >= 2, 'as linhas reparadas precisam estar disponíveis para o ranking');
  });

  await check('Parte L: o reparo é IDEMPOTENTE (segunda passada não muda nada)', async () => {
    const second = await repairLegacyTeamRankings();
    const afterSecond = await localGame.entities.TeamRanking.list(null, 5000);
    assert.equal(afterSecond.length, after.length, 'a segunda passada mudou a contagem de linhas');
    assert.equal(second.remapped, 0, `segunda passada remapeou ${second.remapped}`);
    assert.equal(second.keyNormalized, 0, `segunda passada normalizou ${second.keyNormalized}`);
    assert.equal(second.duplicatesMerged, 0, `segunda passada fundiu ${second.duplicatesMerged}`);
  });

  await check('getTeamRankings não devolve duplicata canônica após o reparo', async () => {
    const board = await getTeamRankings(5000);
    const counts = new Map();
    for (const r of board) {
      const k = [r.player1_id, r.player2_id].sort().join('_');
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    assert.equal([...counts.values()].filter((n) => n > 1).length, 0);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-team-ranking-legacy-repair-v510: PASS');
} finally {
  await vite.close();
}
