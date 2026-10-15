// Playthrough 5.0, Parte A/X — segundo gap encontrado pela mesma auditoria:
// resolvePendingPlayerCanonicalTournaments (retomador de dia, quando a
// FINAL chega depois de o jogador já ter sido eliminado antes) também só
// gravava Tournament/WorldEvent — nunca creditava o par que vira campeão
// real. Este teste cobre esse caminho separadamente do settlement síncrono
// (prepareTournamentFinalization).
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-race-early-elimination-champion-credit', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

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
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { resolvePendingPlayerCanonicalTournaments } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.0 Early Elim Champion', playerName: 'Player 5.0' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'early-elim-player', sport_name: 'EarlyElimPlayer', career_date: '2026-03-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0,
  });

  await localGame.entities.AthleteProfile.create({ id: 'ap-final-champion', bot_id: 'bot-final-champion', name: 'Campeão Real', overall_rating: 92, race_points: 200, world_ranking_points: 8000 });

  // Torneio de 3 rodadas (QF/SF/F). O jogador foi eliminado na rodada 0
  // (QF) — seu próprio prepareTournamentFinalization já rodou nesse
  // momento (fora do escopo deste teste). A chave completa já existe
  // (bracket_schema_version 2), com a final decidida (vencedor real) mas
  // sua DATA ainda não tinha chegado até agora.
  const tournament = await localGame.entities.Tournament.create({
    id: 'early-elim-tournament', name: 'Torneio Retomada', tier: 'Gold', main_draw_size: 8,
    start_date: '2026-03-05', end_date: '2026-03-08', bracket_schema_version: 2,
    bracket_history: [
      { round: 'Quartas de Final', date: '2026-03-05', matches: [{ match_id: 'm0', team_a: 'EarlyElimPlayer & Parceiro', team_b: 'Adversário QF', winner: 'Adversário QF' }] },
      { round: 'Semifinal', date: '2026-03-06', matches: [{ match_id: 'm1', team_a: 'X', team_b: 'Y', winner: 'X' }] },
      { round: 'Final', date: '2026-03-08', is_final: true, matches: [{ match_id: 'm2', team_a: 'X', team_b: 'Campeão Real & Parceiro', winner: 'Campeão Real & Parceiro' }] },
    ],
    player_participated: true,
  });

  // CalendarEvent do jogador com o run completo (criado no sorteio,
  // mesmo formato real de tournamentDraw.js) — a final aponta pro par
  // "Campeão Real" via IDs reais.
  await localGame.entities.CalendarEvent.create({
    id: 'early-elim-event', profile_id: profile.id, event_type: 'tournament', related_id: tournament.id, status: 'completed',
    metadata: {
      tournament_run: {
        status: 'eliminated',
        matches: [
          { round: 'Quartas de Final', roundIndex: 0, opponent: [{ id: 'bot-qf-opp', name: 'Adversário QF' }] },
          { round: 'Semifinal', roundIndex: 1, opponent: [{ id: 'bot-sf-opp', name: 'Y' }] },
          { round: 'Final', roundIndex: 2, opponent: [{ id: 'bot-final-champion', name: 'Campeão Real' }] },
        ],
      },
    },
  });

  const result = await resolvePendingPlayerCanonicalTournaments('2026-03-08', profile);

  await check('o torneio foi resolvido (a final chegou na data certa)', () => {
    assert.equal(result.resolved, 1);
  });

  await check('o campeão real (não-jogador) recebeu crédito de título — nunca ficou de fora', async () => {
    const row = await localGame.entities.AthleteProfile.get('ap-final-champion');
    assert.ok(Number(row.race_points) > 200, `esperava race_points > 200, obtido ${row.race_points}`);
  });

  await check('o par que eliminou o jogador nas quartas (destino desconhecido depois disso) NÃO recebeu crédito fabricado', async () => {
    const rows = await localGame.entities.AthleteProfile.filter({ bot_id: 'bot-qf-opp' }).catch(() => []);
    assert.equal(rows.length, 0, 'sem AthleteProfile canônico pra esse bot procedural — nada deveria ter sido criado');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-race-early-elimination-champion-credit: PASS');
} finally {
  await vite.close();
}
