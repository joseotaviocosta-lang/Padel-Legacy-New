// Playthrough 4.7, item 9 (teste obrigatório #9) — cenário completo: jogador
// lesionado, "Avançar até recuperação" encontra uma partida de torneio
// pelo caminho, resolve o W.O. automaticamente SEM travar, e CONTINUA
// avançando (a lesão dura mais do que o tempo até a partida) até a
// recuperação real — nunca trava no meio do caminho, nunca fica preso na
// partida resolvida.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-recovery-skip-tournament-walkover', search: '' };
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
  const { registerForTournament } = await vite.ssrLoadModule('/src/lib/calendarSystem.js');
  const { advanceCareerDayOnce } = await vite.ssrLoadModule('/src/game-core/dayAdvanceCoordinator.js');
  const { advanceCareerUntilRecovered } = await vite.ssrLoadModule('/src/game-core/calendarLifecycle.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { getCurrentTournamentMatch } = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentRunManager.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.7 Skip Encounters Walkover', playerName: 'Player 4.7' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'skip-walkover-player', sport_name: 'Player47', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', energy: 100, fatigue: 0,
    coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });
  const starterPartner = BOTS_BY_DIFFICULTY.iniciante[0];
  await localGame.entities.PlayerProfile.update(profile.id, { partner_id: starterPartner.id });
  profile = await activeCareerAdapter.getPlayerProfile();

  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');
  const tournaments = await localGame.entities.Tournament.list('start_date', 2000);
  const londres = tournaments.find((t) => t.name?.includes('Londres'));
  await registerForTournament(profile, londres, 0, {});

  // Véspera da 1ª rodada — lesão dura bem mais do que o tempo até a
  // partida (o skip precisa ATRAVESSAR a rodada e continuar depois dela).
  const eve = new Date(`${londres.start_date}T00:00:00Z`);
  eve.setUTCDate(eve.getUTCDate() - 1);
  const eveDate = eve.toISOString().slice(0, 10);
  while (profile.career_date < eveDate) profile = await advanceCareerDayOnce(profile);

  await localGame.entities.PlayerProfile.update(profile.id, {
    injury_status: 'lesionado', injury_type: 'Distensão na panturrilha', injury_severity: 'grave', injury_days_remaining: 14,
  });
  profile = await activeCareerAdapter.getPlayerProfile();

  const start = Date.now();
  const skipResult = await advanceCareerUntilRecovered(profile);
  const elapsedMs = Date.now() - start;
  profile = skipResult.profile;

  await check('9. o skip não trava: termina dentro de um tempo razoável', () => {
    assert.ok(elapsedMs < 60000, `deveria terminar em menos de 60s, levou ${elapsedMs}ms`);
  });

  await check('9. o skip ATRAVESSA a rodada do torneio (resolve o W.O.) E CONTINUA até a recuperação real (14 dias, não trava na partida)', () => {
    assert.equal(skipResult.recovered, true, JSON.stringify(skipResult));
    assert.equal(skipResult.daysAdvanced, 14, `deveria avançar os 14 dias inteiros da lesão, mesmo atravessando o torneio: ${JSON.stringify(skipResult)}`);
  });

  const eventAfter = (await localGame.entities.CalendarEvent.filter({ profile_id: profile.id }))
    .find((e) => e.event_type === 'tournament' && String(e.related_id) === String(londres.id));
  await check('9. a rodada foi resolvida por W.O. no meio do caminho (campanha terminou, não ficou pendente bloqueando o resto do skip)', () => {
    assert.equal(getCurrentTournamentMatch(eventAfter?.metadata?.tournament_run)?.status === 'completed' || eventAfter?.metadata?.tournament_run?.status === 'eliminated', true);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-recovery-skip-tournament-walkover: PASS');
} finally {
  await vite.close();
}
