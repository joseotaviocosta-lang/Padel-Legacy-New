// Playthrough 4.6C, itens 5/12/13 — auditoria factual D-3 -> D0 -> final
// para DUAS ondas consecutivas de torneios (janeiro: Londres/Madri/Cidade
// do Cabo/Doha; fevereiro: Los Angeles/Barcelona), rodadas pelo pipeline
// real de produção (advanceCareerDayOnce), NUNCA abrindo nenhuma tela.
// Numa carreira saudável, zero torneios devem chegar ao end_date com
// bracket_origin='retroactive-recovery' (chave nunca sorteada a tempo,
// reconstruída só no settlement) — todos devem ter D-3 com chave OU
// cancelamento factual explícito, e final com champion/runner_up.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-two-wave-draw-lifecycle', search: '' };
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
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { getTournamentDrawState, TOURNAMENT_DRAW_STATES } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6C Two Wave Lifecycle', playerName: 'Player 4.6C' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'two-wave-player', sport_name: 'Player46C', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });
  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  let profile = await activeCareerAdapter.getPlayerProfile();

  // Nenhuma tela é aberta neste teste — só o pipeline real de avanço de dia.
  const WAVE1_NAMES = ['Londres', 'Madri', 'Cidade do Cabo', 'Doha'];
  const WAVE2_NAMES = ['Los Angeles', 'Barcelona'];
  const trackedIds = new Set();
  for (let day = 0; day < 45; day += 1) {
    if (profile.career_date >= '2026-02-15') break;
    const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
    for (const t of tournaments) {
      if (t.start_date >= '2026-01-20' && t.start_date <= '2026-02-12' && t.world_tour_event) trackedIds.add(t.id);
    }
    profile = await advanceCareerDayOnce(profile);
  }

  const finalTournaments = await localGame.entities.Tournament.list('start_date', 2000);
  const tracked = [...trackedIds].map((id) => finalTournaments.find((t) => t.id === id)).filter(Boolean);
  console.log(`\n--- ${tracked.length} torneios rastreados nas duas ondas ---`);
  console.table(tracked.map((t) => ({
    name: t.name, tier: t.tier, start: t.start_date, drawState: getTournamentDrawState(t, profile.career_date),
    bracket_origin: t.bracket_origin || null, champion: t.champion || null, runner_up: t.runner_up || null,
  })));

  await check('12. primeira onda de janeiro (Londres/Madri/Cidade do Cabo/Doha) inteira presente e sorteada', () => {
    for (const name of WAVE1_NAMES) {
      const t = tracked.find((row) => row.name.includes(name));
      assert.ok(t, `${name} deveria estar entre os torneios rastreados`);
      const state = getTournamentDrawState(t, profile.career_date);
      assert.ok([TOURNAMENT_DRAW_STATES.COMPLETED, TOURNAMENT_DRAW_STATES.IN_PROGRESS].includes(state), `${name} deveria ter chave (COMPLETED ou IN_PROGRESS), estado real: ${state}`);
    }
  });

  await check('13. segunda onda de fevereiro (Los Angeles/Barcelona) sorteia normalmente na semana seguinte', () => {
    for (const name of WAVE2_NAMES) {
      const t = tracked.find((row) => row.name.includes(name));
      assert.ok(t, `${name} deveria estar entre os torneios rastreados`);
      const state = getTournamentDrawState(t, profile.career_date);
      assert.notEqual(state, TOURNAMENT_DRAW_STATES.CANCELLED, `${name} não deveria cancelar`);
      assert.notEqual(state, TOURNAMENT_DRAW_STATES.PENDING, `${name} não deveria ficar pendente sem chave`);
    }
  });

  await check('5/6/7. todos os torneios concluídos (data já passou o suficiente) têm champion E runner_up — nenhum "encerrado" fantasma', () => {
    const shouldBeDone = tracked.filter((t) => t.end_date && t.end_date < profile.career_date);
    assert.ok(shouldBeDone.length > 0, 'pré-condição: pelo menos um torneio já deveria ter terminado');
    for (const t of shouldBeDone) {
      const state = getTournamentDrawState(t, profile.career_date);
      assert.equal(state, TOURNAMENT_DRAW_STATES.COMPLETED, `${t.name} deveria estar COMPLETED (champion+runner_up), estado real: ${state}`);
      assert.ok(t.champion, `${t.name}: champion ausente`);
      assert.ok(t.runner_up, `${t.name}: runner_up ausente`);
    }
  });

  await check('5. ZERO ocorrências de bracket_origin="retroactive-recovery" numa carreira saudável', () => {
    const recovered = tracked.filter((t) => t.bracket_origin === 'retroactive-recovery');
    assert.equal(recovered.length, 0, `torneios com chave recuperada retroativamente (não deveria acontecer numa carreira saudável): ${recovered.map((t) => t.name).join(', ')}`);
  });

  await check('5. nenhum torneio chega ao D0 (início) sem chave e sem cancelamento explícito', () => {
    const stuckAtStart = tracked.filter((t) => {
      const state = getTournamentDrawState(t, t.start_date);
      return state === TOURNAMENT_DRAW_STATES.PENDING;
    });
    assert.equal(stuckAtStart.length, 0, `torneios sem chave no próprio D0, sem cancelamento: ${stuckAtStart.map((t) => t.name).join(', ')}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-two-wave-draw-lifecycle: PASS');
} finally {
  await vite.close();
}
