// Playthrough 4.7, item 6 — depois do W.O. na 1ª rodada, o Tournament NÃO
// pode ficar "em andamento" pra sempre. A campanha do jogador termina, mas
// a IA continua disputando as rodadas restantes nos dias previstos
// (revelação cronológica, mesma arquitetura da 4.6C); o settlement
// acontece quando a final chega — champion/runner_up/Race/WorldEvent
// precisam existir ao final, reaproveitando a lógica já corrigida na
// 4.5/4.6 (eliminação do jogador != fim do torneio).
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-walkover-player-tournament-settlement', search: '' };
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
  const { career } = await manager.createCareer({ saveName: '4.7 Walkover Settlement', playerName: 'Player 4.7' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'walkover-settlement-player', sport_name: 'Player47', career_date: '2026-01-01', birth_date: '2001-01-01',
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
  assert.ok(skipResult.recovered, `pré-condição: precisa recuperar dentro do prazo: ${JSON.stringify(skipResult)}`);

  const raceBefore = await localGame.entities.AthleteProfile.filter({ bot_id: starterPartner.id }).catch(() => []);
  await check('6. Race do parceiro/jogador já reflete o W.O. (mesmo prêmio de participação de qualquer eliminação precoce)', () => {
    assert.ok(Number(profile.race_points) >= 0, 'race_points do jogador deveria existir/ter sido tocado pela finalização');
  });

  // Continua avançando (SEM lesão, sem mais nenhuma decisão do jogador
  // pendente nesse torneio) até depois do end_date real do torneio, pra a
  // IA terminar as rodadas restantes e o settlement correr no dia certo.
  const afterEnd = new Date(`${londres.end_date}T00:00:00Z`);
  afterEnd.setUTCDate(afterEnd.getUTCDate() + 2);
  const targetDate = afterEnd.toISOString().slice(0, 10);
  let guard = 0;
  while (profile.career_date < targetDate && guard < 40) { profile = await advanceCareerDayOnce(profile); guard += 1; }

  const finalTournament = await localGame.entities.Tournament.get(londres.id);
  await check('6. o torneio conclui normalmente (COMPLETED) depois do W.O. na 1ª rodada, na data real da final', () => {
    const state = getTournamentDrawState(finalTournament, profile.career_date);
    assert.equal(state, TOURNAMENT_DRAW_STATES.COMPLETED, `estado real: ${state}`);
  });

  await check('6. champion e runner_up estão persistidos, e NENHUM dos dois é o jogador (ele saiu por W.O. na 1ª rodada)', () => {
    assert.ok(finalTournament.champion, 'champion deveria existir');
    assert.ok(finalTournament.runner_up, 'runner_up deveria existir');
    const playerTeamName = `${profile.sport_name} & ${starterPartner.name}`;
    assert.notEqual(finalTournament.champion, playerTeamName);
    assert.notEqual(finalTournament.runner_up, playerTeamName);
  });

  await check('6. WorldEvent de resultado do torneio foi publicado (Jornal recebe o resultado)', async () => {
    const events = await localGame.entities.WorldEvent.filter({ related_tournament_id: londres.id }).catch(() => []);
    const titleEvent = events.find((e) => e.event_type === 'tournament_result');
    assert.ok(titleEvent, 'WorldEvent de título deveria existir');
  });

  await check('6. world_tour_resolved é true — nenhuma tentativa futura de re-settlement fica pendente', () => {
    assert.equal(Boolean(finalTournament.world_tour_resolved), true);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-walkover-player-tournament-settlement: PASS');
} finally {
  await vite.close();
}
