// Playthrough 5.0, Parte F/X — Race precisa SOMAR resultados sucessivos,
// nunca sobrescrever o anterior. Testa combinações pedidas na Parte F
// (eliminação inicial + título; vice + semifinal) usando o caminho
// corrigido (prepareTournamentFinalization credita o adversário real via
// run.matches[].opponent — Playthrough 5.0, Parte A).
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-race-multi-result-accumulation', search: '' };
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
  const { getTournamentRewards } = await vite.ssrLoadModule('/src/lib/career.js');

  async function freshCareer(id) {
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ saveName: id, playerName: id });
    activeCareerAdapter.setActiveCareer(career);
    const profile = await activeCareerAdapter.createPlayerProfile({ id: `${id}-player`, sport_name: id, career_date: '2026-03-01', birth_date: '2001-01-01', level: 'Amador', coins: 1000, xp: 0 });
    const partner = { id: `${id}-partner`, name: 'Bot Parceiro' };
    await localGame.entities.AthleteProfile.create({ id: `ap-${id}`, bot_id: `bot-${id}`, name: `Alvo ${id}`, overall_rating: 85, race_points: 0, world_ranking_points: 0, ranking_points: 0 });
    return { profile, partner, id };
  }

  // Torneio onde o jogador enfrenta o "alvo" numa rodada específica e o
  // resultado (jogador vence -> alvo eliminado nessa rodada; jogador perde
  // na FINAL -> alvo campeão) decide o crédito do alvo, via o mesmo
  // mecanismo real de prepareTournamentFinalization.
  async function playTournament({ profile, partner, id }, tIndex, { totalRounds, meetRoundIndex, playerWinsMeet }) {
    const tournament = await localGame.entities.Tournament.create({
      id: `t-${id}-${tIndex}`, name: `Torneio ${tIndex}`, tier: 'Gold', main_draw_size: 2 ** totalRounds,
      start_date: `2026-03-${String(tIndex).padStart(2, '0')}`, end_date: `2026-03-${String(tIndex).padStart(2, '0')}`,
    });
    const matches = Array.from({ length: totalRounds }, (_, k) => ({
      round: `R${k}`, roundIndex: k,
      opponent: k === meetRoundIndex ? [{ id: `bot-${id}`, name: `Alvo ${id}` }] : [{ id: `filler-${id}-${tIndex}-${k}`, name: 'Filler' }],
    }));
    const roundsWon = playerWinsMeet ? totalRounds : meetRoundIndex;
    const result = await prepareTournamentFinalization({
      profile, tournament, partner, roundsWon, totalRounds, run: { matches },
      bracketHistory: [{ round: 'Final', is_final: true, matches: [{ match_id: `m-${id}-${tIndex}`, team_a: 'A', team_b: 'B', winner: playerWinsMeet ? 'A' : 'B' }] }],
    });
    await localGame.batch(result.operations);
  }

  await check('eliminação inicial + título: o total após o título é a SOMA dos dois, nunca só o título sozinho', async () => {
    const ctx = await freshCareer('elim-titulo');
    // T1: jogador vence a rodada 0 contra o alvo -> alvo eliminado cedo (roundsWon do alvo = 0).
    await playTournament(ctx, 1, { totalRounds: 2, meetRoundIndex: 0, playerWinsMeet: true });
    const afterFirst = await localGame.entities.AthleteProfile.get(`ap-${ctx.id}`);
    const eliminationPoints = Number(afterFirst.race_points);

    // T2: jogador perde a FINAL contra o alvo -> alvo campeão.
    await playTournament(ctx, 2, { totalRounds: 2, meetRoundIndex: 1, playerWinsMeet: false });
    const afterSecond = await localGame.entities.AthleteProfile.get(`ap-${ctx.id}`);
    const titleRewards = getTournamentRewards('Gold', 2);
    assert.equal(Number(afterSecond.race_points), eliminationPoints + titleRewards.rankPoints, 'precisa ser a SOMA dos dois resultados');
    assert.notEqual(Number(afterSecond.race_points), titleRewards.rankPoints, 'nunca pode "esquecer" o primeiro resultado (eliminationPoints deveria ser > 0 aqui, então a soma difere do título isolado)');
  });

  await check('vice + semifinal: o total após a semifinal é a SOMA, nunca sobrescreve o vice anterior', async () => {
    const ctx = await freshCareer('vice-semi');
    // T1: jogador vence rodada 0 e 1, perde a FINAL (rodada 2) contra o alvo -> alvo vice (roundsWon=2 de 3).
    await playTournament(ctx, 1, { totalRounds: 3, meetRoundIndex: 2, playerWinsMeet: false });
    const afterFirst = await localGame.entities.AthleteProfile.get(`ap-${ctx.id}`);
    const runnerUpPoints = Number(afterFirst.race_points);
    assert.ok(runnerUpPoints > 0, 'vice precisa valer pontos');

    // T2: jogador vence a semifinal (rodada 1 de 3) contra o alvo -> alvo eliminado na semifinal (roundsWon=1).
    await playTournament(ctx, 2, { totalRounds: 3, meetRoundIndex: 1, playerWinsMeet: true });
    const afterSecond = await localGame.entities.AthleteProfile.get(`ap-${ctx.id}`);
    const semiRewards = getTournamentRewards('Gold', 1);
    assert.equal(Number(afterSecond.race_points), runnerUpPoints + semiRewards.rankPoints, 'precisa somar ao vice anterior, nunca substituir');
  });

  await check('reload não duplica: aplicar as mesmas operations duas vezes (idempotência do batch, nunca dobra o crédito)', async () => {
    const ctx = await freshCareer('reload-check');
    const tournament = await localGame.entities.Tournament.create({ id: 't-reload-1', name: 'T1', tier: 'Gold', main_draw_size: 4, start_date: '2026-03-01', end_date: '2026-03-01' });
    const run = { matches: [{ round: 'R0', roundIndex: 0, opponent: [{ id: 'filler', name: 'Filler' }] }, { round: 'Final', roundIndex: 1, opponent: [{ id: `bot-${ctx.id}`, name: `Alvo ${ctx.id}` }] }] };
    const result = await prepareTournamentFinalization({
      profile: ctx.profile, tournament, partner: ctx.partner, roundsWon: 1, totalRounds: 2, run,
      bracketHistory: [{ round: 'Final', is_final: true, matches: [{ match_id: 'm1', team_a: 'A', team_b: 'B', winner: 'B' }] }],
    });
    await localGame.batch(result.operations);
    const once = Number((await localGame.entities.AthleteProfile.get(`ap-${ctx.id}`)).race_points);
    // O patch de cada operation já é um DELTA congelado (calculado uma
    // única vez a partir do race_points ANTES desta chamada) — reaplicar o
    // MESMO array de operations (ex.: um reload que reexecuta a última
    // transação) tem que convergir pro MESMO valor final, nunca somar de
    // novo por cima.
    await localGame.batch(result.operations);
    const twice = Number((await localGame.entities.AthleteProfile.get(`ap-${ctx.id}`)).race_points);
    const rows = await localGame.entities.AthleteRankingResult.filter({ athlete_id: `ap-${ctx.id}`, tournament_id: tournament.id }).catch(() => []);
    assert.equal(rows.length, 1, 'nunca duplica a linha de resultado datado');
    assert.equal(once, twice, 'reaplicar a mesma transação precisa convergir pro mesmo valor, nunca dobrar o crédito');
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-race-multi-result-accumulation: PASS');
} finally {
  await vite.close();
}
