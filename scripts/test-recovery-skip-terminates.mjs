// Playthrough 4.7, itens 11-13 — "Avançar até recuperação" precisa parar
// EXATAMENTE quando a fonte médica canônica (injury_days_remaining, nunca
// energy===100/fatigue===0 como proxy) indica recuperação — nunca antes,
// nunca depois, nunca esgotando o cap de segurança por engano. Antes da
// correção desta fase, o loop NUNCA decrementava injury_days_remaining
// (deferGameState:true suprimia processInjuryRecoveryDay o tempo todo) e
// sempre esgotava maxDays. Testa duas durações diferentes pra confirmar
// que não é coincidência.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-recovery-skip-terminates', search: '' };
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

async function runScenario(vite, { id, days }) {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { advanceCareerUntilRecovered } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: `4.7 Terminates ${id}`, playerName: `Player ${id}` });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: `terminates-${id}`, sport_name: `Player${id}`, career_date: '2026-04-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 1000, xp: 0, morale: 70, form: 50,
    injury_status: 'lesionado', injury_type: 'Lesão de teste', injury_severity: 'moderada', injury_days_remaining: days,
  });
  return advanceCareerUntilRecovered(profile);
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  await check('13. fonte médica canônica: recovery date definida em 4 dias -> para em exatamente 4 dias', async () => {
    const result = await runScenario(vite, { id: 'four', days: 4 });
    assert.equal(result.recovered, true, JSON.stringify(result));
    assert.equal(result.daysAdvanced, 4);
  });

  await check('13. recovery date definida em 11 dias -> para em exatamente 11 dias (não é coincidência do primeiro caso)', async () => {
    const result = await runScenario(vite, { id: 'eleven', days: 11 });
    assert.equal(result.recovered, true, JSON.stringify(result));
    assert.equal(result.daysAdvanced, 11);
  });

  await check('12. nunca esgota o cap de segurança (60) quando a lesão é curta', async () => {
    const result = await runScenario(vite, { id: 'short', days: 3 });
    assert.ok(result.daysAdvanced < 60, `não deveria chegar perto do cap: ${result.daysAdvanced} dias`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-recovery-skip-terminates: PASS');
} finally {
  await vite.close();
}
