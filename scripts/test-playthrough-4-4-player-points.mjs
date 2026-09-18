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

globalThis.location = { hostname: '127.0.0.1', pathname: '/playthrough-44-player-points' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { buildPlayerTournamentBracket } = await vite.ssrLoadModule('/src/gameplay/worldTour/tournamentSettlement.js');
  const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.4 Player Points', playerName: 'Player 4.4' });
  activeCareerAdapter.setActiveCareer(career);
  const partner = BOTS_BY_DIFFICULTY.iniciante[0];
  await activeCareerAdapter.createPlayerProfile({
    id: 'playthrough-44-player', sport_name: 'Player 4.4', career_date: '2026-01-29',
    birth_date: '2001-01-01', level: 'Amador', play_style: 'controle', court_side: 'direita',
    partner_id: partner.id, partner_name: partner.name, energy: 100, fatigue: 0, coins: 5000,
    xp: 0, morale: 70, form: 50, ranking_position: 1000, weekly_training_enabled: false,
  });
  const worldPartner = await localGame.entities.AthleteProfile.create({
    id: 'world-partner-44', bot_id: partner.id, name: partner.name, sport_name: partner.name,
    overall_rating: 60, ranking_position: 900, world_ranking_points: 100, ranking_points: 100, race_points: 0,
  });
  const tournament = await localGame.entities.Tournament.create({
    id: 'tournament-44-player-points', name: '4.4 Player Points', tier: 'Bronze', status: 'chaveamento',
    start_date: '2026-01-29', end_date: '2026-02-01', world_tour_event: true,
    main_draw_size: 16, bracket_schema_version: 2,
  });
  const bracket = buildPlayerTournamentBracket({
    tournamentId: tournament.id,
    date: tournament.start_date,
    playerTeamName: 'Player 4.4 & ' + partner.name,
    mainOpponents: [{ name: 'Opp R16' }, { name: 'Opp QF' }, { name: 'Opp SF' }, { name: 'Opp F' }],
    fillerFactory: (count) => Array.from({ length: count }, (_, index) => ({ name: `Filler ${index}`, strength: 40 + index })),
  });
  await activeCareerAdapter.getPlayerProfile();
  await finalizeTournamentRun({
    profile: await activeCareerAdapter.getPlayerProfile(),
    tournament: { ...tournament, bracket_schema_version: 2 },
    partner,
    roundsWon: bracket.length,
    totalRounds: bracket.length,
    bracketHistory: bracket,
  });
  const playerRows = await localGame.entities.AthleteRankingResult.filter({ athlete_id: 'playthrough-44-player' });
  const partnerRows = await localGame.entities.AthleteRankingResult.filter({ athlete_id: worldPartner.id });
  const partnerAfter = await localGame.entities.AthleteProfile.get(worldPartner.id);
  assert.equal(playerRows[0]?.points, partnerRows[0]?.points, 'player e parceiro devem receber os mesmos pontos');
  assert.equal(partnerAfter.race_points, partnerRows[0].points, 'Race do parceiro deve ser projetada no AthleteProfile canônico');
  console.log(`player_points=${playerRows[0].points} partner_points=${partnerRows[0].points} partner_race=${partnerAfter.race_points}`);
  console.log('test-playthrough-4-4-player-points: PASS');
} finally { await vite.close(); }
