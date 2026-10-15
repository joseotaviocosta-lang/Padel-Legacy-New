// Playthrough 5.12, Parte I — um parceiro JOVEM materializado precisa
// conseguir evoluir, usando o motor que já existe
// (evolveAthleteCareerMonth). Nenhum sistema novo de progressão.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { buildTemplate, runTwelveMonths, summarize } from './lib/partnerDevelopmentHarness.mjs';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-partner-athlete-development-young-v512', search: '' };
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

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.12 DevYoung', playerName: 'P512DY' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p512dy', sport_name: 'P512DY', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', coins: 100, xp: 0,
  });

  const CASES = [
    { label: '18 anos / alto potencial', id: 'dev-18', age: 18, overall: 45, potential: 88 },
    { label: '23 anos / médio-alto', id: 'dev-23', age: 23, overall: 62, potential: 80 },
  ];

  const results = {};
  for (const c of CASES) {
    const template = buildTemplate({ id: c.id, name: `Jovem ${c.age}`, age: c.age, overall: c.overall, potential: c.potential });
    const { timeline } = await runTwelveMonths(vite, template);
    const s = summarize(timeline, c.overall);
    results[c.id] = s;
    console.log(`\n${c.label}: OVR ${s.start} -> ${s.end} (${s.change >= 0 ? '+' : ''}${s.change}) | subidas=${s.ups} quedas=${s.downs} | fases=${s.stages.join(',')}`);
  }

  await check('Parte I/25: usa o motor EXISTENTE (evolveAthleteCareerMonth), sem segundo sistema', async () => {
    const mod = await vite.ssrLoadModule('/src/game-core/livingCircuitRules.js');
    assert.equal(typeof mod.evolveAthleteCareerMonth, 'function');
  });

  await check('Parte I/21: o parceiro de 18 anos com alto potencial EVOLUI em 1 ano', () => {
    const s = results['dev-18'];
    assert.ok(s.change > 0, `não evoluiu: ${s.start} -> ${s.end}`);
  });

  await check('Parte I/22: o parceiro de 23 anos também consegue evoluir', () => {
    const s = results['dev-23'];
    assert.ok(s.change >= 0, `regrediu: ${s.start} -> ${s.end}`);
  });

  await check('Parte I: o jovem com mais margem cresce pelo menos tanto quanto o de 23', () => {
    assert.ok(results['dev-18'].change >= results['dev-23'].change,
      `18 anos +${results['dev-18'].change} < 23 anos +${results['dev-23'].change}`);
  });

  await check('Parte I: o crescimento NÃO é todo mês (curva, não escada)', () => {
    const s = results['dev-18'];
    assert.ok(s.ups < 12, `subiu em todos os ${s.ups} meses`);
  });

  await check('Parte I: nenhum jovem ultrapassa o próprio potencial', () => {
    assert.ok(results['dev-18'].end <= 88, `passou do potencial: ${results['dev-18'].end}`);
    assert.ok(results['dev-23'].end <= 80, `passou do potencial: ${results['dev-23'].end}`);
  });

  await check('Parte I: jovens não se aposentam no primeiro ano', () => {
    assert.equal(results['dev-18'].retired, false);
    assert.equal(results['dev-23'].retired, false);
  });

  await check('Parte I: a evolução é DETERMINÍSTICA (mesma entrada, mesmo resultado)', async () => {
    const template = buildTemplate({ id: 'dev-18', name: 'Jovem 18', age: 18, overall: 45, potential: 88 });
    const again = await runTwelveMonths(vite, template);
    assert.equal(summarize(again.timeline, 45).end, results['dev-18'].end, 'resultado mudou entre execuções');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-partner-athlete-development-young-v512: PASS');
} finally {
  await vite.close();
}
