// Playthrough 4.7, item 8 — isolamento entre torneios simultâneos. Londres
// (com o jogador, W.O. por lesão) não pode travar Madri/Cidade do
// Cabo/Doha (AI-only) — a causa raiz já comprovada em fases anteriores
// (finalizeTournamentFromBracket lançando "Fatos insuficientes" e
// derrubando a semana inteira) é resolvida na origem por
// resolveUnavailablePlayerMatch: o bracket do jogador nunca fica sem
// vencedor, então o settlement nunca mais tenta (e falha) resolvê-lo pela
// fila AI-only.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-walkover-does-not-block-parallel-events', search: '' };
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
  const { getTournamentDrawState, TOURNAMENT_DRAW_STATES } = await vite.ssrLoadModule('/src/lib/tournamentBracketView.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.7 Parallel Isolation', playerName: 'Player 4.7' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'parallel-isolation-player', sport_name: 'Player47', career_date: '2026-01-01', birth_date: '2001-01-01',
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
  const siblings = tournaments.filter((t) => t.start_date === londres.start_date && t.id !== londres.id);
  assert.ok(siblings.length >= 2, `pré-condição: precisa de torneios simultâneos AI-only na mesma semana de Londres: encontrados ${siblings.length}`);
  await registerForTournament(profile, londres, 0, {});

  const eve = new Date(`${londres.start_date}T00:00:00Z`);
  eve.setUTCDate(eve.getUTCDate() - 1);
  const eveDate = eve.toISOString().slice(0, 10);
  while (profile.career_date < eveDate) profile = await advanceCareerDayOnce(profile);

  await localGame.entities.PlayerProfile.update(profile.id, {
    injury_status: 'lesionado', injury_type: 'Sobrecarga muscular', injury_severity: 'leve', injury_days_remaining: 3,
  });
  profile = await activeCareerAdapter.getPlayerProfile();
  const skipResult = await advanceCareerUntilRecovered(profile);
  profile = skipResult.profile;
  assert.ok(skipResult.recovered, `pré-condição: precisa recuperar: ${JSON.stringify(skipResult)}`);

  const latestEnd = [londres, ...siblings].reduce((max, t) => (t.end_date > max ? t.end_date : max), londres.end_date);
  const afterEnd = new Date(`${latestEnd}T00:00:00Z`);
  afterEnd.setUTCDate(afterEnd.getUTCDate() + 2);
  const targetDate = afterEnd.toISOString().slice(0, 10);
  let guard = 0;
  while (profile.career_date < targetDate && guard < 40) { profile = await advanceCareerDayOnce(profile); guard += 1; }

  const finalLondres = await localGame.entities.Tournament.get(londres.id);
  await check('8. Londres (com W.O. do jogador) conclui normalmente', () => {
    assert.equal(getTournamentDrawState(finalLondres, profile.career_date), TOURNAMENT_DRAW_STATES.COMPLETED);
  });

  for (const sibling of siblings) {
    const finalSibling = await localGame.entities.Tournament.get(sibling.id);
    await check(`8. ${sibling.name} (AI-only, mesma semana) NÃO é bloqueado pelo W.O. de Londres — conclui normalmente`, () => {
      assert.equal(getTournamentDrawState(finalSibling, profile.career_date), TOURNAMENT_DRAW_STATES.COMPLETED, `estado real: ${getTournamentDrawState(finalSibling, profile.career_date)}`);
      assert.ok(finalSibling.champion, `${sibling.name} deveria ter campeão`);
    });
  }

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-walkover-does-not-block-parallel-events: PASS');
} finally {
  await vite.close();
}
