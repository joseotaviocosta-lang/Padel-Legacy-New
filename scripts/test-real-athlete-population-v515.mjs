// Playthrough 5.15, Partes A/B/C/D/H — INVENTÁRIO da população no mundo
// recém-semeado. Auditoria pura: nada é alterado aqui.
//
// Pergunta central da fase: "os bots estão preenchendo o mundo ou
// substituindo a elite real?"
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { buildOriginIndex, classifyPair, originMix, formatMix, ORIGIN } from './lib/originClassifier.mjs';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-real-athlete-population-v515', search: '' };
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
  const { career } = await manager.createCareer({ saveName: '5.15 Population', playerName: 'P515' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p515', sport_name: 'P515', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });
  await ensureWorldSeed2025();

  const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
  const teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
  const index = await buildOriginIndex(vite, athletes);
  const { originById, registrySize } = index;

  const real = athletes.filter((a) => originById.get(a.id) === ORIGIN.REAL);
  const procedural = athletes.filter((a) => originById.get(a.id) === ORIGIN.PROCEDURAL);
  const realPaired = real.filter((a) => a.ai_partner_id);
  const realUnpaired = real.filter((a) => !a.ai_partner_id);
  const procPaired = procedural.filter((a) => a.ai_partner_id);

  console.log('=== PARTE B: inventário da população ===');
  console.log(`  registro curado ............ ${registrySize} atletas`);
  console.log(`  AthleteProfile total ....... ${athletes.length}`);
  console.log(`  reais ...................... ${real.length}`);
  console.log(`  procedurais ................ ${procedural.length}`);
  console.log(`  reais COM parceiro ......... ${realPaired.length}`);
  console.log(`  reais SEM parceiro ......... ${realUnpaired.length}`);
  console.log(`  procedurais COM parceiro ... ${procPaired.length}`);

  const resolvable = teams.filter((t) => originById.has(t.player1_id) && originById.has(t.player2_id));
  const byClass = { RR: 0, RP: 0, PP: 0, UNKNOWN: 0 };
  for (const t of teams) byClass[classifyPair(originById, t.player1_id, t.player2_id)] += 1;

  console.log('\n=== PARTE B: duplas por origem ===');
  console.log(`  linhas de TeamRanking ...... ${teams.length} (resolvíveis: ${resolvable.length})`);
  console.log(`  RR (real + real) ........... ${byClass.RR}`);
  console.log(`  RP (real + procedural) ..... ${byClass.RP}`);
  console.log(`  PP (proc + proc) ........... ${byClass.PP}`);

  console.log('\n=== PARTE E/H: composição por faixa de DUPLAS ===');
  for (const limit of [10, 20, 50, 100]) {
    console.log(`  ${formatMix(`Top${limit}`, originMix(teams, originById, { limit }))}`);
  }

  // Ranking INDIVIDUAL por faixa.
  const byPoints = [...athletes].sort((a, b) => (Number(b.world_ranking_points) || 0) - (Number(a.world_ranking_points) || 0));
  console.log('\n=== PARTE H: composição por faixa INDIVIDUAL ===');
  for (const limit of [10, 25, 50, 100]) {
    const slice = byPoints.slice(0, limit);
    const r = slice.filter((a) => originById.get(a.id) === ORIGIN.REAL).length;
    console.log(`  Top${String(limit).padEnd(4)} reais=${String(r).padStart(3)} (${((r / slice.length) * 100).toFixed(0).padStart(3)}%)  procedurais=${String(slice.length - r).padStart(3)}`);
  }

  check('Parte B/2: os atletas reais do registro estão todos presentes', () => {
    assert.equal(real.length, registrySize,
      `${real.length} reais presentes de ${registrySize} no registro`);
  });

  check('Parte C/4: a grande maioria dos reais está PAREADA', () => {
    const pct = (realPaired.length / Math.max(1, real.length)) * 100;
    console.log(`   [registro] ${realPaired.length}/${real.length} reais pareados (${pct.toFixed(0)}%)`);
    assert.ok(pct >= 80, `só ${pct.toFixed(0)}% dos reais têm parceiro`);
  });

  check('Parte D/6: existem duplas RR em número compatível com o registro', () => {
    const expected = Math.floor(realPaired.length / 2);
    console.log(`   [registro] RR=${byClass.RR}, esperado ~${expected}`);
    assert.ok(byClass.RR >= expected * 0.8,
      `só ${byClass.RR} duplas RR para ${realPaired.length} reais pareados`);
  });

  check('Parte E/9 (achado): o Top10 de duplas é dominado por duplas REAIS', () => {
    const mix = originMix(teams, originById, { limit: 10 });
    console.log(`   [registro] Top10: RR=${mix.RR} RP=${mix.RP} PP=${mix.PP}`);
    assert.ok(mix.RR >= 8, `só ${mix.RR} duplas reais no Top10`);
  });

  check('Parte E/10 (achado): o Top20 ainda é majoritariamente real', () => {
    const mix = originMix(teams, originById, { limit: 20 });
    console.log(`   [registro] Top20: RR=${mix.RR} RP=${mix.RP} PP=${mix.PP}`);
    assert.ok(mix.pctRR >= 50, `só ${mix.pctRR.toFixed(0)}% de duplas reais no Top20`);
  });

  check('Parte W/11 (achado): o Top50 reflete a intenção do modelo de população', () => {
    const mix = originMix(teams, originById, { limit: 50 });
    console.log(`   [registro] Top50: RR=${mix.RR} RP=${mix.RP} PP=${mix.PP}`);
    // O registro tem ~50 duplas reais possíveis; o Top50 deveria conter a
    // maior parte delas, não ser tomado por procedurais sem resultados.
    assert.ok(mix.RR >= 20,
      `apenas ${mix.RR} duplas reais no Top50 — procedurais estariam ocupando o topo`);
  });

  check('Parte R/20: nenhuma dupla canônica duplicada', () => {
    const counts = new Map();
    for (const t of teams) {
      if (!t.player1_id || !t.player2_id) continue;
      const key = [t.player1_id, t.player2_id].sort().join('_');
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const dups = [...counts.values()].filter((n) => n > 1).length;
    assert.equal(dups, 0, `${dups} pares duplicados`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-real-athlete-population-v515: PASS');
} finally {
  await vite.close();
}
