// Playthrough 5.12, Parte I — um parceiro VETERANO materializado precisa
// estabilizar ou declinar, usando o mesmo motor
// (evolveAthleteCareerMonth). O briefing é explícito: não se exige queda
// todo mês, e o caso Lucas Martins (36 anos, OVR baixo) NÃO pode virar
// crescimento artificial só por ter virado persistente.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { buildTemplate, runTwelveMonths, summarize } from './lib/partnerDevelopmentHarness.mjs';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-partner-athlete-development-veteran-v512', search: '' };
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
  const { career } = await manager.createCareer({ saveName: '5.12 DevVet', playerName: 'P512DV' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p512dv', sport_name: 'P512DV', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', coins: 100, xp: 0,
  });

  const CASES = [
    { label: '30 anos / estável', id: 'dev-30', age: 30, overall: 70, potential: 74 },
    { label: '36 anos / veterano', id: 'dev-36', age: 36, overall: 66, potential: 68 },
    // O caso real do playtest: veterano de OVR muito baixo.
    { label: '36 anos / OVR 13 (caso Lucas Martins)', id: 'dev-36-low', age: 36, overall: 13, potential: 16 },
  ];

  const results = {};
  for (const c of CASES) {
    // Nome único por caso: dois templates homônimos seriam reconciliados
    // como a MESMA pessoa (e foi assim que o defeito do fallback por nome
    // apareceu).
    const template = buildTemplate({ id: c.id, name: `Veterano ${c.id}`, age: c.age, overall: c.overall, potential: c.potential });
    const { timeline } = await runTwelveMonths(vite, template);
    const s = summarize(timeline, c.overall);
    results[c.id] = s;
    console.log(`\n${c.label}: OVR ${s.start} -> ${s.end} (${s.change >= 0 ? '+' : ''}${s.change}) | subidas=${s.ups} quedas=${s.downs} | fases=${s.stages.join(',')}`);
  }

  await check('Parte I/25: usa o motor EXISTENTE (evolveAthleteCareerMonth), sem segundo sistema', async () => {
    const mod = await vite.ssrLoadModule('/src/game-core/livingCircuitRules.js');
    assert.equal(typeof mod.evolveAthleteCareerMonth, 'function');
  });

  await check('Parte I/23: o parceiro de 30 anos NÃO dispara para cima (estável/moderado)', () => {
    const s = results['dev-30'];
    assert.ok(s.change <= 3, `subiu ${s.change} — crescimento de jovem, não de 30 anos`);
  });

  await check('Parte I/24: o veterano de 36 anos estabiliza ou DECLINA (nunca cresce)', () => {
    const s = results['dev-36'];
    assert.ok(s.change <= 0, `veterano cresceu ${s.change}`);
    assert.ok(s.ups === 0, `veterano teve ${s.ups} subidas`);
  });

  await check('Parte T: o caso Lucas Martins (36/OVR 13) NÃO vira crescimento artificial', () => {
    const s = results['dev-36-low'];
    console.log(`   [registro] 36 anos OVR 13 -> ${s.end} em 12 meses (${s.change >= 0 ? '+' : ''}${s.change})`);
    assert.ok(s.change <= 0, `OVR subiu ${s.change} só por ter virado persistente`);
  });

  await check('Parte I: o declínio NÃO acontece todo mês (curva, não despencar)', () => {
    for (const id of ['dev-36', 'dev-36-low']) {
      assert.ok(results[id].downs < 12, `${id} caiu em todos os meses`);
    }
  });

  await check('Parte I: a fase de carreira reportada é coerente com a idade', () => {
    const vet = results['dev-36'].stages.join(',');
    console.log(`   [registro] fases 30 anos: ${results['dev-30'].stages.join(',')} | 36 anos: ${vet}`);
    assert.ok(!results['dev-36'].stages.includes('prospect'), `36 anos marcado como prospect`);
  });

  await check('Parte I: nenhum veterano fica com OVR inválido (<1)', () => {
    for (const id of ['dev-30', 'dev-36', 'dev-36-low']) {
      assert.ok(results[id].end >= 1, `${id} terminou com ${results[id].end}`);
    }
  });

  await check('Parte I: a evolução é DETERMINÍSTICA (mesma entrada, mesmo resultado)', async () => {
    const template = buildTemplate({ id: 'dev-36', name: 'Veterano dev-36', age: 36, overall: 66, potential: 68 });
    const again = await runTwelveMonths(vite, template);
    assert.equal(summarize(again.timeline, 66).end, results['dev-36'].end, 'resultado mudou entre execuções');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-partner-athlete-development-veteran-v512: PASS');
} finally {
  await vite.close();
}
