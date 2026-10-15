// Playthrough 5.12 (continuação), Partes A/B/C/F/H — a dupla do JOGADOR
// precisa ser reprojetada pela passada periódica do circuito, igual às
// duplas de IA.
//
// Bug reproduzido antes da correção: o segundo laço de
// `circuitLifecycle.updateTeamRankings` resolve os dois membros em `byId`,
// que só contém AthleteProfile. A dupla do jogador é
// PlayerProfile + AthleteProfile, então o membro jogador nunca resolve e a
// linha inteira é ignorada — ficando com os pontos de quando foi escrita.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-player-team-ranking-circuit-reprojection-v512', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(p) { this.directories.add(p); }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list(dir = '.') { const p = dir === '.' ? '' : `${dir}/`; return [...this.files.keys()].filter((k) => k.startsWith(p)).map((k) => ({ name: k.slice(p.length), isDirectory: false })); }
  async stat() { return { size: 0 }; }
}

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
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { startPartnership } = await vite.ssrLoadModule('/src/lib/partnershipSystem.js');
  const { processWorldCircuit } = await vite.ssrLoadModule('/src/game-core/circuitLifecycle.js');
  const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
  const { teamKey, computeCanonicalTeamRankingPoints, getTeamRank } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.12 Reprojection', playerName: 'P512X' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p512x', sport_name: 'P512X', career_date: '2026-06-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 20000, xp: 0, morale: 70, form: 50, energy: 100,
    rank_points: 0, world_ranking_points: 0, race_points: 0,
  });
  await ensureWorldSeed2025();

  const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
  let profile = await localGame.entities.PlayerProfile.get('p512x');
  await startPartnership(profile, bot, 90, 50);
  const key = teamKey('p512x', bot.id);

  // A linha da dupla do jogador NÃO nasce em startPartnership: ela é criada
  // na primeira finalização de torneio (tournamentLifecycle). Uma dupla sem
  // partida nenhuma simplesmente não tem linha — coerente com a convenção
  // "sem ranking" de getTeamRank. Então o cenário do briefing ("sem
  // disputar NOVO torneio") começa depois deste primeiro.
  const partnerAthlete = (await localGame.entities.AthleteProfile.filter({ id: bot.id }, null, 1))[0];
  const seedTournament = await localGame.entities.Tournament.create({
    id: 'p512x-seed', name: 'Copa Inicial', tier: 'Silver', start_date: '2026-06-01', status: 'em_andamento',
  });
  profile = await localGame.entities.PlayerProfile.get('p512x');
  await finalizeTournamentRun({ profile, tournament: seedTournament, partner: partnerAthlete, roundsWon: 1, totalRounds: 3 });

  const initialRow = ((await localGame.entities.TeamRanking.filter({ team_key: key })) || [])[0];

  // Agora os rolling points do PARCEIRO mudam — SEM a dupla disputar novo
  // torneio (é exatamente o cenário do briefing). Os pontos entram como
  // RESULTADOS DATADOS, que é o que o circuito de fato consome: escrever
  // `world_ranking_points` na mão não adianta, porque a passada seguinte
  // recalcula tudo pela janela rolante. Assim os dois membros ficam com
  // valores grandes e DIFERENTES, e a reprojeção tem o que provar.
  const partnerResults = [
    { id: `${bot.id}:hist-1`, tournament_id: 'hist-1', tier: 'Masters', date: '2026-05-20', points: 1000 },
    { id: `${bot.id}:hist-2`, tournament_id: 'hist-2', tier: 'Elite', date: '2026-05-27', points: 1800 },
    { id: `${bot.id}:hist-3`, tournament_id: 'hist-3', tier: 'Crown', date: '2026-06-03', points: 2500 },
  ];
  for (const row of partnerResults) {
    await localGame.entities.AthleteRankingResult.create({
      ...row, athlete_id: bot.id, tournament_name: row.tournament_id, finish: 'champion',
    });
  }

  const expected = computeCanonicalTeamRankingPoints(4000, 9000);
  const storedBefore = Number(initialRow?.ranking_points) || 0;
  console.log(`dupla criada com ${storedBefore} pts | após novos rolling, o canônico seria ${expected}`);

  await check('pré-condição: a linha da dupla existe e está defasada', () => {
    assert.ok(initialRow, 'linha da dupla não criada');
    assert.notEqual(storedBefore, expected, 'o cenário não produziu defasagem');
  });

  // ---- a passada do circuito ----
  profile = await localGame.entities.PlayerProfile.get('p512x');
  await processWorldCircuit(profile, '2026-06-01', '2026-06-15');
  const afterCircuit = ((await localGame.entities.TeamRanking.filter({ team_key: key })) || [])[0];
  const storedAfter = Number(afterCircuit?.ranking_points) || 0;

  // O circuito RECALCULA os rolling points dos dois membros a partir dos
  // resultados datados — ele não preserva os valores crus escritos acima.
  // A invariante real (Parte H) é: o que ficou guardado na dupla é o
  // canônico sobre os pontos que os membros têm AGORA.
  const playerAfter = await localGame.entities.PlayerProfile.get('p512x');
  const partnerAfter = (await localGame.entities.AthleteProfile.filter({ id: bot.id }, null, 1))[0];
  const playerRolling = Number(playerAfter.world_ranking_points ?? playerAfter.rank_points) || 0;
  const partnerRolling = Number(partnerAfter.world_ranking_points ?? partnerAfter.rank_points) || 0;
  const expectedAfter = computeCanonicalTeamRankingPoints(playerRolling, partnerRolling);

  console.log(`após processWorldCircuit: armazenado=${storedAfter}`);
  console.log(`  rolling jogador=${playerRolling} parceiro=${partnerRolling} -> canônico=${expectedAfter}`);

  await check('Parte A/H: a dupla do jogador É reprojetada pela passada do circuito', () => {
    assert.equal(storedAfter, expectedAfter,
      `armazenado ${storedAfter} != canônico ${expectedAfter} — a dupla do jogador ficou fora da reprojeção`);
  });

  await check('Parte A: a reprojeção realmente MOVEU a linha (não foi coincidência de 0)', () => {
    assert.ok(storedAfter > 0, `armazenado ${storedAfter}`);
    assert.notEqual(storedAfter, storedBefore, `continuou em ${storedBefore}`);
  });

  await check('Parte E: a reprojeção usa os DOIS membros, com valores distintos', () => {
    // Se os dois membros tivessem o mesmo valor, a asserção acima não
    // distinguiria "resolveu os dois" de "resolveu um e repetiu".
    assert.notEqual(playerRolling, partnerRolling,
      `os dois membros ficaram iguais (${playerRolling}) — o cenário não prova a resolução`);
    assert.ok(partnerRolling > 1000, `parceiro com apenas ${partnerRolling} pts`);
    // Playthrough 5.22-F — sob a SOMA, o guardado é exatamente
    // jogador + parceiro: soma os dois, portanto fica ACIMA do membro mais
    // forte, nunca abaixo (a antiga regra da média geométrica ficava abaixo).
    assert.equal(storedAfter, playerRolling + partnerRolling,
      `armazenado ${storedAfter} != soma ${playerRolling} + ${partnerRolling}`);
    assert.ok(storedAfter > playerRolling, 'a dupla deveria estar acima do membro mais fraco');
    assert.ok(storedAfter > partnerRolling, 'a dupla deveria somar, não valer menos que o membro mais forte');
  });

  await check('Parte F: atualizou SEM disputar novo torneio e sem abrir a tela Ranking', () => {
    assert.notEqual(storedAfter, storedBefore, 'os pontos não mudaram');
  });

  await check('Parte C: usa o helper canônico da 5.11 (nenhuma fórmula paralela)', () => {
    assert.equal(storedAfter, computeCanonicalTeamRankingPoints(playerRolling, partnerRolling));
  });

  await check('Parte D: NENHUM AthleteProfile do jogador foi criado', async () => {
    const rows = await localGame.entities.AthleteProfile.filter({ id: 'p512x' }, null, 1).catch(() => []);
    assert.equal(rows.length, 0, 'criou um AthleteProfile duplicado para o jogador');
    const all = await localGame.entities.AthleteProfile.list(null, 5000);
    const impostors = all.filter((a) => (a.name || a.sport_name) === 'P512X');
    assert.equal(impostors.length, 0, 'existe um atleta com o nome do jogador');
  });

  await check('Parte F: a leitura pós-recarga devolve o valor reprojetado', async () => {
    const reread = ((await localGame.entities.TeamRanking.filter({ team_key: key })) || [])[0];
    assert.equal(Number(reread.ranking_points), expectedAfter);
  });

  await check('Parte F: getTeamRank reflete os pontos reprojetados', async () => {
    const fresh = await localGame.entities.PlayerProfile.get('p512x');
    const partner = (await localGame.entities.AthleteProfile.filter({ id: bot.id }, null, 1))[0];
    const rank = await getTeamRank(fresh, partner);
    console.log(`   [registro] dupla em #${rank.rank} com ${rank.points} pts`);
    assert.equal(Number(rank.points), expectedAfter);
    assert.ok(rank.rank > 0, 'sem posição');
  });

  await check('Parte A: a linha NÃO foi duplicada pela reprojeção', async () => {
    const rows = await localGame.entities.TeamRanking.filter({ team_key: key });
    assert.equal(rows.length, 1, `${rows.length} linhas para a mesma dupla`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-player-team-ranking-circuit-reprojection-v512: PASS');
} finally {
  await vite.close();
}
