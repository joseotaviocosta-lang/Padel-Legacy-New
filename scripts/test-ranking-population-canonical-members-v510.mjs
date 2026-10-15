// Playthrough 5.10, Partes I/K/V — a população suplementar precisa gravar
// TeamRanking com membros CANÔNICOS (id de AthleteProfile), nunca
// `ranking-bot-NNNN`.
//
// Achado da 5.9 (Parte E): ~395 linhas irresolvíveis porque os pares eram
// formados antes de o bulkCreate atribuir ids. A correção é de ORDEM
// (saveFoundation.js), não de identidade inventada.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-ranking-population-canonical-members-v510', search: '' };
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

const BOT_ID_RE = /^ranking-bot-\d+$/;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { buildSupplementalTeamRows } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');

  await check('Parte K: buildSupplementalTeamRows usa `id` quando ele existe', () => {
    const athletes = [
      { id: 'real-1', bot_id: 'ranking-bot-0001', name: 'A', world_ranking_points: 100 },
      { id: 'real-2', bot_id: 'ranking-bot-0002', name: 'B', world_ranking_points: 90 },
    ];
    const rows = buildSupplementalTeamRows(athletes, []);
    assert.ok(rows.length > 0, 'nenhuma dupla gerada');
    const first = rows[0];
    assert.ok(!BOT_ID_RE.test(first.player1_id), `player1_id ainda é bot_id: ${first.player1_id}`);
    assert.ok(!BOT_ID_RE.test(first.player2_id), `player2_id ainda é bot_id: ${first.player2_id}`);
    assert.equal(first.team_key, [first.player1_id, first.player2_id].sort().join('_'));
  });

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.10 Population', playerName: 'P510Pop' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p510-pop', sport_name: 'P510Pop', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });
  await ensureWorldSeed2025();

  const [teams, athletes] = await Promise.all([
    localGame.entities.TeamRanking.list(null, 5000),
    localGame.entities.AthleteProfile.list(null, 5000),
  ]);
  const athleteIds = new Set(athletes.map((a) => a.id));
  const botIdIndex = new Set(athletes.map((a) => a.bot_id).filter(Boolean));

  const botLike = teams.filter((t) => BOT_ID_RE.test(String(t.player1_id)) || BOT_ID_RE.test(String(t.player2_id)));
  const unresolved = teams.filter((t) => !athleteIds.has(t.player1_id) || !athleteIds.has(t.player2_id));

  console.log(`\n=== População semeada ===`);
  console.log(`  atletas ................................. ${athletes.length}`);
  console.log(`  linhas de TeamRanking ................... ${teams.length}`);
  console.log(`  linhas com membro ranking-bot-NNNN ...... ${botLike.length}`);
  console.log(`  linhas com membro irresolvível por id ... ${unresolved.length}`);
  if (unresolved.length) {
    const sample = unresolved.slice(0, 3).map((t) => `${t.player1_id}+${t.player2_id}`).join(' | ');
    console.log(`  amostra ................................. ${sample}`);
    const rescuableByBotId = unresolved.filter((t) => botIdIndex.has(t.player1_id) && botIdIndex.has(t.player2_id));
    console.log(`  (dessas, mapeáveis por bot_id) .......... ${rescuableByBotId.length}`);
  }

  await check('Parte I/K: ZERO linhas de TeamRanking com membro `ranking-bot-NNNN`', () => {
    assert.equal(botLike.length, 0,
      `${botLike.length} linhas ainda usam bot_id como identidade de membro`);
  });

  await check('Parte V: ZERO linhas com membro irresolvível contra AthleteProfile', () => {
    assert.equal(unresolved.length, 0,
      `${unresolved.length} linhas não resolvem os dois membros por id`);
  });

  await check('Parte I: toda linha semeada tem team_key canônico (ids ordenados)', () => {
    const bad = teams.filter((t) => t.player1_id && t.player2_id
      && t.team_key !== [t.player1_id, t.player2_id].sort().join('_'));
    assert.equal(bad.length, 0, `${bad.length} linhas com team_key não canônico`);
  });

  await check('zero duplicatas canônicas na população semeada', () => {
    const counts = new Map();
    for (const t of teams) {
      if (!t.player1_id || !t.player2_id) continue;
      const k = [t.player1_id, t.player2_id].sort().join('_');
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const dups = [...counts.values()].filter((n) => n > 1);
    assert.equal(dups.length, 0, `${dups.length} pares duplicados`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-ranking-population-canonical-members-v510: PASS');
} finally {
  await vite.close();
}
