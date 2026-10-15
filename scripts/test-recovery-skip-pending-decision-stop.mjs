// Playthrough 4.7, item 14 — "Avançar até recuperação" NÃO pode atravessar
// uma decisão obrigatória que não seja de torneio (contrato, decisão
// médica, evento bloqueante) silenciosamente. getInjuryAutoResolution só
// resolve torneio/atividade-planejada/treino — qualquer outro
// requires_decision:true deve continuar parando o skip
// (getCriticalEventBeforeAdvance/blockedBy).
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-recovery-skip-pending-decision-stop', search: '' };
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
  const { advanceCareerUntilRecovered } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.7 Pending Decision Stop', playerName: 'Player 4.7' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'pending-decision-player', sport_name: 'Player47', career_date: '2026-03-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0, coins: 1000, xp: 0, morale: 70, form: 50,
    injury_status: 'lesionado', injury_type: 'Sobrecarga muscular', injury_severity: 'leve', injury_days_remaining: 10,
  });

  // Decisão obrigatória NÃO relacionada a torneio, lesão ou treino — o tipo
  // de evento que getInjuryAutoResolution nunca auto-resolve. Marcada para
  // amanhã (não hoje): getCriticalEventBeforeAdvance checa eventos não-torneio
  // pela perspectiva de amanhã (mesma janela que resolveInjuryCalendarConflicts
  // usa) — é esse o caminho garantido a interceptar ANTES de tentar avançar,
  // devolvendo blockedBy de forma controlada em vez de propagar exceção.
  const blockingEvent = await localGame.entities.CalendarEvent.create({
    id: 'sponsor-decision-blocking', profile_id: profile.id, event_type: 'sponsor_event',
    title: 'Decisão de patrocínio pendente', start_date: '2026-03-02', end_date: '2026-03-02',
    status: 'scheduled', is_mandatory: true, requires_decision: true,
  });

  await check('14. o skip PARA na decisão obrigatória não relacionada a lesão/torneio, nunca a atravessa silenciosamente', async () => {
    const result = await advanceCareerUntilRecovered(profile, { maxDays: 30 });
    assert.equal(result.recovered, false, 'não deveria reportar recuperado — parou antes');
    assert.ok(result.blockedBy, 'deveria reportar blockedBy');
    assert.equal(result.blockedBy.id, blockingEvent.id, 'blockedBy deveria ser a decisão de patrocínio, não outra coisa');
  });

  await check('14. a decisão bloqueante continua scheduled/requires_decision — não foi resolvida por engano', async () => {
    const row = await localGame.entities.CalendarEvent.get(blockingEvent.id);
    assert.equal(row.status, 'scheduled');
    assert.equal(row.requires_decision, true);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-recovery-skip-pending-decision-stop: PASS');
} finally {
  await vite.close();
}
