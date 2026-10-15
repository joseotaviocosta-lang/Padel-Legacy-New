// Playthrough 4.5C, itens 7/8 — "Top duplas" (Journal.jsx) mostrando
// Coello/Tapia e Galán/Chingotto duplicados. Prova a causa (duas linhas de
// TeamRanking para o mesmo par, mesmo team_key, id diferente — a mesma
// classe de corrida de escrita já corrigida para ai_partner_id na
// Playthrough 4.5A) e valida a deduplicação por identidade canônica
// (ids ordenados via teamKey, nunca por string/nome).
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-top-pairs-canonical-dedupe', search: '' };
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
  const {
    teamKey, canonicalPairId, dedupeTeamRankingsByCanonicalPair, getTeamRankings,
  } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  // ── Invariante pura: pair(A,B) == pair(B,A) ──
  await check('8. canonicalPairId(A,B) == canonicalPairId(B,A)', () => {
    assert.equal(canonicalPairId('real_arturo_coello', 'real_agustin_tapia'), canonicalPairId('real_agustin_tapia', 'real_arturo_coello'));
    assert.equal(canonicalPairId('real_arturo_coello', 'real_agustin_tapia'), teamKey('real_arturo_coello', 'real_agustin_tapia'));
  });

  // ── Dedupe puro: A+B e B+A colapsam numa única entrada; pontos nunca são
  // somados nem perdidos (mantém a linha mais completa).
  await check('7/8. dedupeTeamRankingsByCanonicalPair colapsa A+B e B+A numa única entrada, sem somar pontos', () => {
    const rows = [
      { id: 'row-1', team_key: 'a_b', player1_id: 'a', player2_id: 'b', player1_name: 'A', player2_name: 'B', ranking_points: 500, updated_date: '2026-01-01T00:00:00Z' },
      { id: 'row-2', team_key: 'b_a', player1_id: 'b', player2_id: 'a', player1_name: 'B', player2_name: 'A', ranking_points: 500, updated_date: '2026-02-01T00:00:00Z' },
    ];
    const deduped = dedupeTeamRankingsByCanonicalPair(rows);
    assert.equal(deduped.length, 1, 'A+B e B+A são a MESMA dupla lógica — apenas uma entrada final');
    assert.equal(deduped[0].ranking_points, 500, 'pontos representam a dupla, nunca dobrados (500+500=1000 seria o bug)');
  });

  await check('dedupe mantém a linha mais completa (mais pontos) em caso de divergência, nunca soma', () => {
    const rows = [
      { id: 'row-1', player1_id: 'x', player2_id: 'y', ranking_points: 300, updated_date: '2026-01-01T00:00:00Z' },
      { id: 'row-2', player1_id: 'y', player2_id: 'x', ranking_points: 850, updated_date: '2026-01-02T00:00:00Z' },
    ];
    const deduped = dedupeTeamRankingsByCanonicalPair(rows);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].ranking_points, 850);
    assert.equal(deduped[0].id, 'row-2');
  });

  await check('dedupe não afeta pares distintos (bot+bot, player+partner, outra dupla real)', () => {
    const rows = [
      { id: 'coello-tapia', player1_id: 'real_arturo_coello', player2_id: 'real_agustin_tapia', ranking_points: 9000 },
      { id: 'galan-chingotto', player1_id: 'real_alejandro_galan', player2_id: 'real_federico_chingotto', ranking_points: 8500 },
      { id: 'bot-bot', player1_id: 'bot-1', player2_id: 'bot-2', ranking_points: 120 },
      { id: 'player-partner', player1_id: 'player-1', player2_id: 'partner-1', ranking_points: 60 },
    ];
    const deduped = dedupeTeamRankingsByCanonicalPair(rows);
    assert.equal(deduped.length, 4, 'quatro pares distintos continuam quatro entradas — dedupe não apaga ninguém indevidamente');
  });

  // ── Reprodução da corrida real: setup de carreira, depois DUAS gravações
  // "concorrentes" de TeamRanking para o MESMO par (mesma classe de bug:
  // dois pontos de escrita, cada um sem ver o outro, criam uma linha cada).
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.5C Top Pairs Dedupe', playerName: 'Player 4.5C' });
  activeCareerAdapter.setActiveCareer(career);

  await check('9. Coello/Tapia: duas linhas concorrentes (mesmo par, ids em ordem diferente) colapsam em uma só na leitura', async () => {
    const key = teamKey('real_arturo_coello', 'real_agustin_tapia');
    // Simula a corrida: dois pontos de escrita diferentes, cada um sem ver
    // a gravação do outro, criam uma linha cada para o mesmo par.
    await localGame.entities.TeamRanking.create({
      team_key: key, player1_id: 'real_arturo_coello', player1_name: 'Arturo Coello',
      player2_id: 'real_agustin_tapia', player2_name: 'Agustín Tapia', ranking_points: 9500, titles: [],
    });
    await localGame.entities.TeamRanking.create({
      team_key: key, player1_id: 'real_agustin_tapia', player1_name: 'Agustín Tapia',
      player2_id: 'real_arturo_coello', player2_name: 'Arturo Coello', ranking_points: 9500, titles: [],
    });
    const raw = await localGame.entities.TeamRanking.filter({ team_key: key });
    assert.equal(raw.length, 2, 'pré-condição: a corrupção real (2 linhas) está reproduzida no storage');

    const rankings = await getTeamRankings(10);
    const coelloTapiaEntries = rankings.filter((row) => canonicalPairId(row.player1_id, row.player2_id) === key);
    assert.equal(coelloTapiaEntries.length, 1, 'getTeamRankings() — a mesma fonte de "Top duplas" e da aba Duplas — devolve Coello/Tapia UMA única vez');
  });

  await check('9. Galán/Chingotto: mesma prova', async () => {
    const key = teamKey('real_alejandro_galan', 'real_federico_chingotto');
    await localGame.entities.TeamRanking.create({
      team_key: key, player1_id: 'real_alejandro_galan', player1_name: 'Alejandro Galán',
      player2_id: 'real_federico_chingotto', player2_name: 'Federico Chingotto', ranking_points: 8800, titles: [],
    });
    await localGame.entities.TeamRanking.create({
      team_key: key, player1_id: 'real_federico_chingotto', player1_name: 'Federico Chingotto',
      player2_id: 'real_alejandro_galan', player2_name: 'Alejandro Galán', ranking_points: 8800, titles: [],
    });
    const rankings = await getTeamRankings(10);
    const entries = rankings.filter((row) => canonicalPairId(row.player1_id, row.player2_id) === key);
    assert.equal(entries.length, 1);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-top-pairs-canonical-dedupe: PASS');
} finally {
  await vite.close();
}
