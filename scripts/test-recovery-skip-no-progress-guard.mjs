// Playthrough 4.7, itens 11/12 — "Avançar até recuperação" precisa abortar
// com segurança se um dia de avanço não progredir a career_date (hipótese
// #6 do briefing: "advanceCareerDayOnce não incrementa careerDate em algum
// branch"). O código já tem essa proteção
// (calendarLifecycle.js:advanceCareerUntilRecovered — `if (!next?.career_date
// || next.career_date === fresh?.career_date) return {..., calendarFailed:
// true}`), verificada aqui tanto por leitura de código (a string exata do
// guard precisa continuar existindo) quanto por um cenário real de data
// corrompida, que precisa terminar rápido e sem lançar exceção não tratada.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-recovery-skip-no-progress-guard', search: '' };
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

check('12. o guard de zero-progresso continua presente no código-fonte (calendarFailed)', () => {
  const source = readFileSync(new URL('../src/game-core/calendarLifecycle.js', import.meta.url), 'utf8');
  assert.ok(/next\.career_date === fresh\??\.career_date/.test(source), 'a checagem de zero-progresso não pode ser removida sem substituto');
  assert.ok(/calendarFailed:\s*true/.test(source), 'o retorno calendarFailed precisa continuar existindo');
});

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { advanceCareerUntilRecovered } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.7 No Progress Guard', playerName: 'Player 4.7' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'no-progress-player', sport_name: 'Player47', career_date: '9999-12-31', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 1000, xp: 0, morale: 70, form: 50,
    injury_status: 'lesionado', injury_type: 'Lesão de teste', injury_severity: 'grave', injury_days_remaining: 15,
  });

  await check('11/12. career_date num limite degenerado (9999-12-31): o skip termina rápido, sem exceção não tratada, sem travar', async () => {
    const start = Date.now();
    const result = await advanceCareerUntilRecovered(profile, { maxDays: 5 });
    const elapsedMs = Date.now() - start;
    assert.ok(result && typeof result === 'object', 'deveria devolver um resultado bem formado, nunca lançar');
    assert.ok(elapsedMs < 15000, `deveria terminar rápido (< 15s), levou ${elapsedMs}ms`);
    assert.ok(result.daysAdvanced <= 5, 'nunca pode exceder o maxDays passado');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-recovery-skip-no-progress-guard: PASS');
} finally {
  await vite.close();
}
