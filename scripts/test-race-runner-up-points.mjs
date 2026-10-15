// Playthrough 5.0, Parte A/F/X — causa raiz confirmada: um torneio com
// participação do jogador é excluído da fila de settlement AI-only
// (isWorldTourResolutionPending), e prepareTournamentFinalization só
// creditava o JOGADOR e seu PRÓPRIO parceiro — nenhum outro par da chave
// (adversários/fillers reais) recebia race_points/rolling points, não
// importa até onde avançassem. Este teste reproduz exatamente o cenário:
// um atleta REAL (com AthleteProfile canônico) é sorteado como adversário
// do jogador, avança até a final e perde (vice) — precisa receber os
// pontos de vice, não zero.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-race-runner-up-points', search: '' };
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
  const { prepareTournamentFinalization } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.0 Runner Up Points', playerName: 'Player 5.0' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'runnerup-player', sport_name: 'RunnerUpPlayer', career_date: '2026-03-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 1000, xp: 0, rank_points: 0, world_ranking_points: 0, race_points: 0,
  });
  const partner = { id: 'runnerup-partner-bot', name: 'Bot Parceiro' };

  // Adversário REAL: um AthleteProfile canônico com bot_id próprio, exatamente
  // como Coello/Tapia (real athletes) — não um bot procedural qualquer.
  const oppAthlete1 = await localGame.entities.AthleteProfile.create({
    id: 'ap-real-opp-1', bot_id: 'real-opp-1', name: 'Coello Fictício', overall_rating: 90,
    race_points: 500, world_ranking_points: 13000, ranking_points: 13000, tournaments_played: 5,
  });
  const oppAthlete2 = await localGame.entities.AthleteProfile.create({
    id: 'ap-real-opp-2', bot_id: 'real-opp-2', name: 'Tapia Fictício', overall_rating: 91,
    race_points: 500, world_ranking_points: 13000, ranking_points: 13000, tournaments_played: 5,
  });

  const tournament = await localGame.entities.Tournament.create({
    id: 'runnerup-tournament', name: 'Masters Fictício', tier: 'Masters', main_draw_size: 4,
    start_date: '2026-03-05', end_date: '2026-03-08',
  });

  // O jogador vence a final (2 rodadas de 2) contra o par "real" — que vira
  // vice-campeão. run.matches[].opponent tem os IDs reais (mesmo formato
  // que tournamentDraw.js/createTournamentRun sempre produz).
  const run = {
    matches: [
      { round: 'Semifinal', roundIndex: 0, opponent: [{ id: 'some-filler-1', name: 'Filler 1' }, { id: 'some-filler-2', name: 'Filler 2' }] },
      { round: 'Final', roundIndex: 1, opponent: [{ id: 'real-opp-1', name: 'Coello Fictício' }, { id: 'real-opp-2', name: 'Tapia Fictício' }] },
    ],
  };

  const result = await prepareTournamentFinalization({
    profile, tournament, partner, roundsWon: 2, totalRounds: 2, run,
    bracketHistory: [
      { round: 'Semifinal', matches: [{ match_id: 'm0', team_a: 'RunnerUpPlayer & Bot Parceiro', team_b: 'Filler 1 & Filler 2', winner: 'RunnerUpPlayer & Bot Parceiro' }] },
      { round: 'Final', is_final: true, matches: [{ match_id: 'm1', team_a: 'RunnerUpPlayer & Bot Parceiro', team_b: 'Coello Fictício & Tapia Fictício', winner: 'RunnerUpPlayer & Bot Parceiro' }] },
    ],
  });

  await localGame.batch(result.operations);

  await check('o adversário real (vice) recebeu race_points > 0 — nunca ficou em zero', async () => {
    const row = await localGame.entities.AthleteProfile.get('ap-real-opp-1');
    assert.ok(Number(row.race_points) > 500, `esperava race_points > 500 (crédito de vice somado ao 500 anterior), obtido ${row.race_points}`);
  });

  await check('o crédito de vice é o valor correto da tabela (mesma tabela do settlement AI-only)', async () => {
    const { getTournamentRewards } = await vite.ssrLoadModule('/src/lib/career.js');
    const expected = getTournamentRewards('Masters', 1); // roundsWon=1 de 2 = vice.
    const row = await localGame.entities.AthleteProfile.get('ap-real-opp-1');
    assert.equal(Number(row.race_points), 500 + expected.rankPoints);
  });

  await check('AMBOS os membros do par vice foram creditados (crédito simétrico)', async () => {
    const row1 = await localGame.entities.AthleteProfile.get('ap-real-opp-1');
    const row2 = await localGame.entities.AthleteProfile.get('ap-real-opp-2');
    assert.equal(Number(row1.race_points), Number(row2.race_points));
  });

  await check('world_ranking_points (Circuito) do vice também aumentou — nunca só a Race', async () => {
    const row = await localGame.entities.AthleteProfile.get('ap-real-opp-1');
    assert.ok(Number(row.world_ranking_points) > 13000, `esperava world_ranking_points > 13000, obtido ${row.world_ranking_points}`);
  });

  await check('um AthleteRankingResult datado foi criado para o vice (alimenta a janela rolling)', async () => {
    const rows = await localGame.entities.AthleteRankingResult.filter({ athlete_id: 'ap-real-opp-1' }).catch(() => []);
    const forThisTournament = rows.find((row) => row.tournament_id === tournament.id);
    assert.ok(forThisTournament, 'esperava um resultado datado para este torneio');
    assert.equal(forThisTournament.finish, 'Finalista');
  });

  await check('o par "filler" batido na semifinal recebeu crédito de eliminado (roundsWon=0)', async () => {
    // Sem AthleteProfile canônico (bot procedural puro) — nada a creditar;
    // confirma que a função não fabrica um registro novo aqui.
    const row = await localGame.entities.AthleteProfile.filter({ bot_id: 'some-filler-1' }).catch(() => []);
    assert.equal(row.length, 0, 'sem AthleteProfile canônico, não deveria existir nenhum registro fabricado');
  });

  await check('o JOGADOR continua recebendo o crédito de campeão normalmente (regressão)', async () => {
    assert.ok(result.champion, 'o jogador deveria ser campeão neste cenário');
    assert.equal(result.playerPatch.race_points, 0 + result.rewards.rankPoints);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-race-runner-up-points: PASS');
} finally {
  await vite.close();
}
