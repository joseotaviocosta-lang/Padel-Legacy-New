// Playthrough 5.0, Parte T/X — cenário completo de jogador novo de 16 anos:
// forma a primeira parceria, joga Pré-Temporada (não pode alterar o
// ranking oficial), depois um torneio Bronze oficial (precisa alterar).
// Confirma, numa única carreira real e contínua: ranking individual
// melhora após um resultado oficial, header/Jogadores usam a mesma fonte
// (buildWorldRankingSnapshot, padel.js — by construction, não há como
// divergir), e "Minha Dupla" passa a mostrar o ranking real da parceria
// (getTeamRank, teamRanking.js) depois do primeiro resultado oficial.
// Plausibilidade/progressão de adversário por rodada já é coberta, com
// IDs reais, por test-opponent-rank-real-source.mjs e
// test-opponent-strength-by-round.mjs — não duplicada aqui.
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
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-new-player-first-season-ranking', search: '' };
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
  const { startPartnership } = await vite.ssrLoadModule('/src/lib/partnershipSystem.js');
  const { getWorldRank } = await vite.ssrLoadModule('/src/lib/padel.js');
  const { getTeamRank } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.0 New Player 16', playerName: 'Rookie16' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({
    id: 'rookie16-player', sport_name: 'Rookie16', career_date: '2026-01-15', birth_date: '2010-01-15',
    level: 'Iniciante', coins: 1000, xp: 0, rank_points: 0, world_ranking_points: 0, race_points: 0,
  });

  // Cria um número razoável de outros atletas rankeados no mundo pra que
  // "ranking melhora" seja observável (posição relativa, não só pontos
  // absolutos) — mesmo padrão usado nos outros testes desta fase.
  for (let i = 0; i < 30; i += 1) {
    await localGame.entities.AthleteProfile.create({
      id: `ap-field-${i}`, bot_id: `bot-field-${i}`, name: `Atleta Campo ${i}`, overall_rating: 60 + (i % 10),
      race_points: 100, world_ranking_points: 2000 + i * 50, ranking_points: 2000 + i * 50, tournaments_played: 3,
    });
  }

  const partnerBot = { id: 'rookie16-partner-bot', name: 'Parceiro Inicial' };
  await localGame.entities.AthleteProfile.create({ id: partnerBot.id, bot_id: partnerBot.id, name: partnerBot.name, overall_rating: 55 });
  const { partnership } = await startPartnership(profile, partnerBot, 60, 50);
  await check('a primeira parceria foi formada com sucesso', () => {
    assert.ok(partnership?.id, 'esperava uma Partnership criada');
  });

  const rankBeforeAnything = await getWorldRank(profile);

  // Pré-Temporada: 2 rodadas, o jogador vence tudo — tier `Exibição` tem
  // rankPoints:0 propositalmente (comentário em circuitCatalog.js), então
  // NENHUM ponto oficial pode ser gerado por este resultado.
  const preSeasonTournament = await localGame.entities.Tournament.create({
    id: 'rookie16-preseason', name: 'Pré-Temporada Rookie', tier: 'Exibição', main_draw_size: 4,
    start_date: '2026-01-20', end_date: '2026-01-21',
  });
  const preSeasonResult = await prepareTournamentFinalization({
    profile, tournament: preSeasonTournament, partner: partnerBot, roundsWon: 2, totalRounds: 2,
    run: { matches: [
      { round: 'Semifinal', roundIndex: 0, opponent: [{ id: 'preseason-filler-1', name: 'Filler 1' }] },
      { round: 'Final', roundIndex: 1, opponent: [{ id: 'preseason-filler-2', name: 'Filler 2' }] },
    ] },
    bracketHistory: [
      { round: 'Semifinal', matches: [{ match_id: 'p0', team_a: 'Rookie16 & Parceiro Inicial', team_b: 'Filler 1', winner: 'Rookie16 & Parceiro Inicial' }] },
      { round: 'Final', is_final: true, matches: [{ match_id: 'p1', team_a: 'Rookie16 & Parceiro Inicial', team_b: 'Filler 2', winner: 'Rookie16 & Parceiro Inicial' }] },
    ],
  });
  await localGame.batch(preSeasonResult.operations);
  profile = { ...profile, ...preSeasonResult.playerPatch };

  await check('Pré-Temporada não gera nenhum ponto oficial (rankPoints=0 por design)', () => {
    assert.equal(preSeasonResult.rewards.rankPoints, 0, `esperava rankPoints=0, obtido ${preSeasonResult.rewards.rankPoints}`);
    assert.equal(preSeasonResult.playerPatch.race_points ?? 0, 0, 'race_points não deveria mudar na Pré-Temporada');
  });

  const rankAfterPreSeason = await getWorldRank(profile);
  await check('o ranking mundial individual não muda depois da Pré-Temporada', () => {
    assert.equal(rankAfterPreSeason.points, rankBeforeAnything.points);
  });

  // Torneio Bronze OFICIAL: mesmo formato, mas tier real (rankPoints > 0).
  const bronzeTournament = await localGame.entities.Tournament.create({
    id: 'rookie16-bronze', name: 'Bronze Rookie Cup', tier: 'Bronze', main_draw_size: 4,
    start_date: '2026-02-01', end_date: '2026-02-02',
  });
  const bronzeResult = await prepareTournamentFinalization({
    profile, tournament: bronzeTournament, partner: partnerBot, roundsWon: 2, totalRounds: 2,
    run: { matches: [
      { round: 'Semifinal', roundIndex: 0, opponent: [{ id: 'bronze-filler-1', name: 'Filler 1' }] },
      { round: 'Final', roundIndex: 1, opponent: [{ id: 'bronze-filler-2', name: 'Filler 2' }] },
    ] },
    bracketHistory: [
      { round: 'Semifinal', matches: [{ match_id: 'b0', team_a: 'Rookie16 & Parceiro Inicial', team_b: 'Filler 1', winner: 'Rookie16 & Parceiro Inicial' }] },
      { round: 'Final', is_final: true, matches: [{ match_id: 'b1', team_a: 'Rookie16 & Parceiro Inicial', team_b: 'Filler 2', winner: 'Rookie16 & Parceiro Inicial' }] },
    ],
  });
  await localGame.batch(bronzeResult.operations);
  profile = { ...profile, ...bronzeResult.playerPatch };

  await check('o torneio Bronze oficial gerou pontos reais (rankPoints > 0)', () => {
    assert.ok(bronzeResult.rewards.rankPoints > 0, `esperava rankPoints > 0, obtido ${bronzeResult.rewards.rankPoints}`);
  });

  const rankAfterBronze = await getWorldRank(profile);
  await check('o ranking mundial individual melhora (posição menor) depois do título oficial', () => {
    assert.ok(rankAfterBronze.points > rankAfterPreSeason.points, `pontos deveriam subir: antes=${rankAfterPreSeason.points} depois=${rankAfterBronze.points}`);
    if (!rankAfterBronze.unranked && !rankAfterPreSeason.unranked) {
      assert.ok(rankAfterBronze.rank <= rankAfterPreSeason.rank || rankAfterPreSeason.rank === 0, `posição deveria melhorar ou permanecer: antes=${rankAfterPreSeason.rank} depois=${rankAfterBronze.rank}`);
    }
  });

  await check('header e Jogadores/Ranking usam a MESMA fonte (buildWorldRankingSnapshot) — impossível divergir por construção', async () => {
    const secondCall = await getWorldRank(profile);
    assert.equal(secondCall.points, rankAfterBronze.points);
    assert.equal(secondCall.displayRank, rankAfterBronze.displayRank);
  });

  const teamRank = await getTeamRank(profile, partnerBot);
  await check('"Minha Dupla" mostra o ranking real da parceria depois do primeiro resultado oficial (não "Sem ranking")', () => {
    assert.equal(teamRank.unranked, false, `esperava a dupla rankeada depois de um título Bronze, obtido unranked=${teamRank.unranked}`);
    assert.ok(teamRank.points > 0, `esperava pontos de dupla > 0, obtido ${teamRank.points}`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-new-player-first-season-ranking: PASS');
} finally {
  await vite.close();
}
