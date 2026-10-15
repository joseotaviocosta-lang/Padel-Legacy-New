// Playthrough 5.15, Partes D/Q/R — integridade das duplas reais.
//
// O inventário achou 75 duplas RR para 100 atletas reais. 100 atletas só
// podem formar 50 duplas: alguém está em mais de uma. Este teste mede
// exatamente isso e verifica se as duplas CURADAS (Coello/Tapia etc.)
// existem com identidade única.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { buildOriginIndex, classifyPair, ORIGIN, PAIR_ORIGIN } from './lib/originClassifier.mjs';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-real-pair-formation-v515', search: '' };
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
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
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

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.15 PairForm', playerName: 'P515P' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p515p', sport_name: 'P515P', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });
  await ensureWorldSeed2025();

  const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
  const teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
  const { originById } = await buildOriginIndex(vite, athletes);
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const real = athletes.filter((a) => originById.get(a.id) === ORIGIN.REAL);

  // Quantas linhas de TeamRanking cada atleta real ocupa?
  const appearances = new Map();
  for (const t of teams) {
    for (const id of [t.player1_id, t.player2_id]) {
      if (originById.get(id) !== ORIGIN.REAL) continue;
      const list = appearances.get(id) || [];
      list.push(t);
      appearances.set(id, list);
    }
  }
  const multi = [...appearances.entries()].filter(([, rows]) => rows.length > 1);

  console.log('=== Parte R: atletas reais em MAIS DE UMA dupla ===');
  console.log(`  reais com 1 dupla ..... ${[...appearances.values()].filter((r) => r.length === 1).length}`);
  console.log(`  reais com 2+ duplas ... ${multi.length}`);
  for (const [id, rows] of multi.slice(0, 5)) {
    const name = byId.get(id)?.name || id;
    console.log(`    ${name}: ${rows.map((r) => `${r.player1_name}/${r.player2_name}`).join('  |  ')}`);
  }

  // A parceria CANÔNICA declarada pelo próprio atleta.
  const canonicalPartner = new Map();
  for (const a of real) {
    if (a.ai_partner_id) canonicalPartner.set(a.id, a.ai_partner_id);
  }
  const curatedRows = teams.filter((t) => canonicalPartner.get(t.player1_id) === t.player2_id
    || canonicalPartner.get(t.player2_id) === t.player1_id);
  const phantomRows = teams.filter((t) => classifyPair(originById, t.player1_id, t.player2_id) === PAIR_ORIGIN.RR
    && !(canonicalPartner.get(t.player1_id) === t.player2_id || canonicalPartner.get(t.player2_id) === t.player1_id));

  console.log('\n=== Parte Q/R: duplas RR curadas vs fantasmas ===');
  console.log(`  RR que correspondem ao ai_partner_id ... ${curatedRows.length}`);
  console.log(`  RR SEM parceria declarada (fantasma) ... ${phantomRows.length}`);
  for (const row of phantomRows.slice(0, 5)) {
    console.log(`    ${row.player1_name} / ${row.player2_name} — ${row.ranking_points} pts (origin: ${row.origin || 'n/d'})`);
  }

  check('Parte D: as duplas curadas existem como TeamRanking', () => {
    const CONTROLS = [[/coello/i, /tapia/i], [/gal[aá]n/i, /chingotto/i], [/lebr[oó]n/i, /augsburger/i],
      [/stupa/i, /yanguas/i], [/nieto/i, /di nenno/i]];
    let found = 0;
    for (const [reA, reB] of CONTROLS) {
      const row = teams.find((t) => {
        const a = byId.get(t.player1_id); const b = byId.get(t.player2_id);
        if (!a || !b) return false;
        return (reA.test(a.name) && reB.test(b.name)) || (reA.test(b.name) && reB.test(a.name));
      });
      if (row) {
        found += 1;
        const rank = teams.findIndex((t) => t.team_key === row.team_key) + 1;
        console.log(`   [registro] ${row.player1_name}/${row.player2_name}: #${rank}, ${row.ranking_points} pts`);
      }
    }
    assert.ok(found >= 4, `só ${found} duplas curadas encontradas`);
  });

  check('Parte R/31 (achado): um atleta real não pode estar em DUAS duplas ativas', () => {
    assert.equal(multi.length, 0,
      `${multi.length} atletas reais aparecem em mais de uma dupla — duplas fantasma competem pelas mesmas vagas`);
  });

  check('Parte R: toda dupla RR corresponde a uma parceria declarada', () => {
    assert.equal(phantomRows.length, 0,
      `${phantomRows.length} duplas RR sem ai_partner_id correspondente`);
  });

  check('Parte Q: nenhuma dupla existe como Partnership E profile-pair ao mesmo tempo', async () => {
    const partnerships = await localGame.entities.Partnership.list(null, 5000).catch(() => []);
    const keys = new Map();
    for (const p of partnerships || []) {
      const a = p.athlete_a_id; const b = p.athlete_b_id;
      if (!a || !b) continue;
      const key = [a, b].sort().join('_');
      keys.set(key, (keys.get(key) || 0) + 1);
    }
    const dups = [...keys.entries()].filter(([, n]) => n > 1);
    assert.equal(dups.length, 0, `${dups.length} parcerias duplicadas`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-real-pair-formation-v515: PASS');
} finally {
  await vite.close();
}
