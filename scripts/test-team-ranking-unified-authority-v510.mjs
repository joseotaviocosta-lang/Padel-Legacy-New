// Playthrough 5.10, Parte A — INVENTÁRIO DE AUTORIDADE de TeamRanking.
//
// A 5.9 concluiu "132x de escala heterogênea" medindo a dupla do jogador
// via `teamRanking.js:updateTeamRanking` (+50/+20). Este teste reabre essa
// conclusão porque ela foi obtida chamando a função DIRETAMENTE, e o
// próprio código afirma (tournamentLifecycle.js:483-485) que essa função
// "nunca é chamada em nenhum lugar — código morto".
//
// Aqui se prova, pelo caminho REAL de produção (finalizeTournamentRun),
// qual fórmula grava a linha da dupla do jogador.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-team-ranking-unified-authority-v510', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(path) { this.directories.add(path); }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) { this.files.set(path, String(content)); }
  async readText(path) { if (!this.files.has(path)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(path); }
  async remove(path) { this.files.delete(path); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list(directory = '.') { const p = directory === '.' ? '' : `${directory}/`; return [...this.files.keys()].filter((k) => k.startsWith(p)).map((k) => ({ name: k.slice(p.length), isDirectory: false })); }
  async stat() { return { size: 0 }; }
}

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
async function check(label, fn) {
  try { await fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

// ---------------------------------------------------------------------------
// Parte A.1 — varredura estática: quem CHAMA cada writer de TeamRanking.
// ---------------------------------------------------------------------------
const SRC = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}
const sourceFiles = walk(SRC);
// Remove comentários antes de procurar chamadas — o projeto documenta
// nomes de função em comentários longos, e isso não é uma chamada.
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function callSitesOf(fnName) {
  const hits = [];
  for (const file of sourceFiles) {
    const code = stripComments(readFileSync(file, 'utf8'));
    const re = new RegExp(`(?<![\\w.])${fnName}\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(code))) {
      const before = code.slice(Math.max(0, m.index - 260), m.index);
      // Ignora a própria declaração (export function X(...) / function X(...)).
      if (/(?:export\s+)?(?:async\s+)?function\s*$/.test(before)) continue;
      hits.push(file.replace(SRC, 'src/').replace(/\\/g, '/'));
    }
  }
  return [...new Set(hits)];
}

const LEGACY_WRITERS = ['updateTeamRanking', 'addTeamRankingPoints', 'addTeamTitle', 'updateLocalTeamRanking'];
console.log('=== Parte A: call sites dos writers incrementais (fora de comentários) ===');
const legacyCallers = {};
for (const fn of LEGACY_WRITERS) {
  legacyCallers[fn] = callSitesOf(fn);
  console.log(`  ${fn.padEnd(24)} -> ${legacyCallers[fn].length ? legacyCallers[fn].join(', ') : 'NENHUM CHAMADOR (código morto)'}`);
}

await check('Parte A/1: os writers incrementais (+50/+20/título) são CÓDIGO MORTO em produção', () => {
  for (const fn of LEGACY_WRITERS) {
    assert.equal(legacyCallers[fn].length, 0,
      `${fn} tem chamador(es) de produção: ${legacyCallers[fn].join(', ')} — a premissa da 5.9 mudaria`);
  }
});

// ---------------------------------------------------------------------------
// Parte A.2 — caminho REAL: finalizeTournamentRun.
// ---------------------------------------------------------------------------
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
  const { teamKey, computeCanonicalTeamRankingPoints } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.10 Unified', playerName: 'P510' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p510-player', sport_name: 'P510', career_date: '2026-01-02', birth_date: '2001-01-01',
    level: 'Amador', overall: 52, overall_rating: 52, ranking_position: 900,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50,
    weekly_training_enabled: false, race_points: 0, rank_points: 1000,
  });
  const profile = await localGame.entities.PlayerProfile.get('p510-player');

  const PARTNER_POINTS = 4000;
  const partner = await localGame.entities.AthleteProfile.create({
    id: 'p510-partner', bot_id: 'p510-partner', name: 'Parceiro 510',
    world_ranking_points: PARTNER_POINTS, ranking_points: PARTNER_POINTS, race_points: 0,
  });
  const tournament = await localGame.entities.Tournament.create({
    id: 'p510-cup', name: 'Copa 5.10', tier: 'Silver', start_date: '2026-02-10', status: 'em_andamento',
  });

  const result = await finalizeTournamentRun({ profile, tournament, partner, roundsWon: 2, totalRounds: 3 });
  const key = teamKey(profile.id, partner.id);
  const rows = (await localGame.entities.TeamRanking.filter({ team_key: key })) || [];
  const row = rows[0] || null;

  const playerRolling = Number(result.updatedProfile.rank_points) || 0;
  // Playthrough 5.22-E — a fórmula canônica é a SOMA (A + B). O teste consome
  // o HELPER único em vez de replicar qualquer fórmula, para continuar
  // verificando "produção usa a autoridade canônica" e não um número
  // congelado (a fórmula já mudou de média para soma sem reescrever o teste).
  const canonicalExpected = computeCanonicalTeamRankingPoints(playerRolling, PARTNER_POINTS);
  const incrementalExpected = 50; // o que a fórmula morta teria gravado

  console.log('\n=== Parte A: o que o caminho REAL de produção gravou ===');
  console.log(`  rank_points do jogador após o torneio .. ${playerRolling}`);
  console.log(`  world_ranking_points do parceiro ....... ${PARTNER_POINTS}`);
  console.log(`  TeamRanking.ranking_points PERSISTIDO .. ${row?.ranking_points}`);
  console.log(`  esperado pela fórmula CANÔNICA (soma) .. ${canonicalExpected}`);
  console.log(`  esperado pela fórmula morta (+50) ...... ${incrementalExpected}`);

  await check('Parte A/2: finalizeTournamentRun grava a linha da dupla do jogador', () => {
    assert.ok(row, 'nenhuma linha de TeamRanking criada pelo caminho real');
  });

  await check('Parte A/3: a dupla do JOGADOR usa a SOMA DOS ROLLING — a mesma unidade das duplas de IA', () => {
    assert.equal(Number(row.ranking_points), canonicalExpected,
      `persistido=${row.ranking_points} != soma canônica ${canonicalExpected}`);
  });

  await check('Parte A/4: a fórmula incremental +50/+20 NÃO é o que produção grava', () => {
    assert.notEqual(Number(row.ranking_points), incrementalExpected,
      'a linha foi gravada pela fórmula morta — a 5.9 estaria certa e a premissa da 5.10 muda');
  });

  await check('Parte A/5: os campos estatísticos continuam sendo mantidos (Parte D/E do briefing)', () => {
    assert.equal(Number(row.matches_played), 1, `matches_played=${row.matches_played}`);
    assert.ok(Number(row.wins) + Number(row.losses) === 1, 'wins+losses deve somar 1 torneio');
    assert.ok(Array.isArray(row.titles), 'titles deve existir como array');
  });

  await check('Parte A/6: identidade canônica gravada por IDs de atleta (não por nome)', () => {
    assert.equal(row.team_key, teamKey(profile.id, partner.id));
    assert.ok(row.player1_id && row.player2_id, 'player ids ausentes');
    assert.equal(row.team_key, [row.player1_id, row.player2_id].sort().join('_'));
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-team-ranking-unified-authority-v510: PASS');
} finally {
  await vite.close();
}
