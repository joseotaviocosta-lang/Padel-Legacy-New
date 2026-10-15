// Playthrough 4.6B, itens 4/5 — Roma Pré-Temporada gerava "Primeira vitória
// oficial", "Sua estreia oficial" e até "Você venceu o #1 do mundo"/"Top
// 10", porque `is_official:true` (gravado em TODA partida de torneio,
// mesmo a Exibição — decisão do Tutorial 4.0) era o ÚNICO filtro que
// achievementContext.js usava. isOfficialRankedTournament() (circuitCatalog.js)
// agora distingue Pré-Temporada/Exibição (world_tour_event:false/
// is_exhibition/tier==='Exibição') de um evento realmente ranqueado — usado
// dentro de fetchOfficialMatchStats antes de contar played/won/beatTop10/
// beatRank1. Este teste prova isolamento nos dois sentidos: Pré-Temporada
// nunca conta, um torneio oficial real sempre conta.
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

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-preseason-achievement-isolation', search: '' };
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
  const { buildAchievementContext } = await vite.ssrLoadModule('/src/lib/achievementContext.js');
  const { isOfficialRankedTournament } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

  await check('4/5. isOfficialRankedTournament: Pré-Temporada/Exibição nunca conta como oficial ranqueado', () => {
    assert.equal(isOfficialRankedTournament({ tier: 'Exibição', world_tour_event: false, is_exhibition: true }), false);
    assert.equal(isOfficialRankedTournament({ is_exhibition: true }), false);
    assert.equal(isOfficialRankedTournament({ tier: 'Exibição' }), false);
    assert.equal(isOfficialRankedTournament({ world_tour_event: false }), false);
  });

  await check('4/5. isOfficialRankedTournament: qualquer torneio real do circuito conta (Bronze..Legacy Finals)', () => {
    assert.equal(isOfficialRankedTournament({ tier: 'Bronze', world_tour_event: true }), true);
    assert.equal(isOfficialRankedTournament({ tier: 'Gold', world_tour_event: true }), true);
    assert.equal(isOfficialRankedTournament({ tier: 'Legacy Finals', world_tour_event: true }), true);
    // Save legado sem o campo (pré-existente antes deste flag existir): não
    // pode retroativamente apagar conquistas já ganhas de torneios reais.
    assert.equal(isOfficialRankedTournament({ tier: 'Gold' }), true);
  });

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '4.6B Preseason Isolation', playerName: 'Player 4.6B' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'preseason-isolation-player', sport_name: 'Player 4.6B', career_date: '2026-01-14',
    birth_date: '2001-01-01', level: 'Amador', play_style: 'controle', court_side: 'direita',
    energy: 100, fatigue: 0, coins: 1000, xp: 0, morale: 70, form: 50,
  });

  // Roma Pré-Temporada: vitória contra um "seed #1" sintético (o próprio bug
  // 1) — mesmo que opponent_rank tivesse vazado errado aqui, isso NUNCA
  // deveria contar como oficial, por ser Exibição.
  await localGame.entities.Match.create({
    id: 'preseason-match-1', profile_id: profile.id, competition_type: 'tournament', is_official: true,
    result: 'vitória', opponent_rank: 1, world_tour_event: false, tournament_name: 'Roma Pré-Temporada',
  });

  await check('4/5. Pré-Temporada isolada: nenhuma conquista oficial dispara com só a Exibição jogada', async () => {
    const context = await buildAchievementContext(profile);
    assert.equal(context.officialMatches.played, 0, 'Pré-Temporada não conta como partida oficial');
    assert.equal(context.officialMatches.won, 0, 'Pré-Temporada não conta como vitória oficial (nem "estreia oficial")');
    assert.equal(context.officialMatches.beatRank1, false, 'Pré-Temporada não pode disparar "venceu o #1 do mundo"');
    assert.equal(context.officialMatches.beatTop10, false, 'Pré-Temporada não pode disparar "venceu um Top 10"');
  });

  // Torneio oficial real (Silver, world_tour_event:true) com vitória sobre
  // um rank #1 FACTUAL — este SIM deve contar em tudo.
  await localGame.entities.Match.create({
    id: 'official-match-1', profile_id: profile.id, competition_type: 'tournament', is_official: true,
    result: 'vitória', opponent_rank: 1, world_tour_event: true, tournament_name: 'Torneio Oficial',
  });

  await check('4/5. Torneio oficial real conta normalmente: primeira vitória oficial + venceu o #1', async () => {
    const context = await buildAchievementContext(profile);
    assert.equal(context.officialMatches.played, 1, 'só a partida oficial conta, a de Exibição continua fora');
    assert.equal(context.officialMatches.won, 1);
    assert.equal(context.officialMatches.beatRank1, true);
    assert.equal(context.officialMatches.beatTop10, true);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-preseason-achievement-isolation: PASS');
} finally {
  await vite.close();
}
