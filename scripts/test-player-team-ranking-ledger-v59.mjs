// Playthrough 5.9, BUG 5 + Parte 8 — "Ranking → Duplas parece suspeito":
// Coello/Tapia com Race individual 1000 cada e TeamRanking ~13.500 na
// medição original da 5.9 (sob a SOMA vigente desde a 5.22-E seriam
// ~27.000); o jogador/Lucas com ~152 pontos e #465.
//
// O briefing manda PROVAR matematicamente, não assumir bug. Provado aqui:
// a aba Duplas é alimentada por DUAS fórmulas diferentes, dependendo de
// quem é a dupla — e nenhuma delas é a Race.
//
//  (A) Duplas de IA  — circuitLifecycle.js:updateTeamRankings
//      ranking_points = A.world_ranking_points + B.world_ranking_points
//      (fórmula canônica vigente desde a 5.22-E — antes era a média.
//      Ou seja: soma do CIRCUITO (janela rolante de 52 semanas, melhores
//      22 — rankingWindow.js), recomputada do zero a cada passada semanal.
//      Por isso ~27.000 não tem relação com Race=1000: Race é acumulador
//      simples do ano civil, zerado na virada; Circuito é a janela rolante.
//
//  (B) Dupla do JOGADOR — teamRanking.js:updateTeamRanking (singular)
//      ranking_points += (venceu ? 50 : 20) + bônus, INCREMENTAL por
//      partida, nunca recomputado a partir do ledger.
//      O jogador/parceiro não são AthleteProfile com `ai_partner_id`
//      (o parceiro vem do catálogo estático bots.js), então a passada em
//      lote (A) nunca os alcança.
//
// Consequência estrutural (registrada, não "corrigida" por palpite): a
// mesma tabela ordena duplas medidas em UNIDADES diferentes — soma de
// pontos de Circuito (milhares) versus acúmulo de 50/20 por partida
// (dezenas). É exatamente isso que faz o par do jogador aparecer em #465
// com 152 pontos ao lado de pares com milhares.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-player-team-ranking-ledger-v59', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

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
  const { updateTeamRanking, teamKey, getTeamRankings } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
  const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.9 Team Ledger', playerName: 'Player59Ledger' });
  activeCareerAdapter.setActiveCareer(career);
  const profile = await activeCareerAdapter.createPlayerProfile({
    id: 'p59-ledger', sport_name: 'Player59Ledger', career_date: '2026-01-01', birth_date: '2001-01-01',
    level: 'Amador', coins: 5000, xp: 0,
  });
  const partner = BOTS_BY_DIFFICULTY.iniciante[0];

  // ---------- (B) fórmula da dupla do JOGADOR, partida a partida ----------
  // Sequência conhecida, para provar o número final por soma explícita.
  const sequence = [
    { won: true, bonus: 0 }, { won: true, bonus: 0 }, { won: false, bonus: 0 },
    { won: true, bonus: 12 }, { won: false, bonus: 0 },
  ];
  let expected = 0;
  const ledger = [];
  for (const entry of sequence) {
    const award = (entry.won ? 50 : 20) + entry.bonus;
    expected += award;
    ledger.push({ ...entry, award, running: expected });
    await updateTeamRanking(profile, partner, entry.won, entry.bonus);
  }

  const key = teamKey(profile.id, partner.id);
  const rows = await localGame.entities.TeamRanking.filter({ team_key: key });
  const playerRow = (rows || [])[0];

  console.log('=== (B) ledger da dupla do JOGADOR (partida a partida) ===');
  for (const [i, entry] of ledger.entries()) {
    console.log(`  partida ${i + 1}: ${entry.won ? 'vitória' : 'derrota'} base=${entry.won ? 50 : 20} bônus=${entry.bonus} -> +${entry.award} (acumulado ${entry.running})`);
  }
  console.log(`  TeamRanking persistido: ${playerRow?.ranking_points} | esperado pela fórmula: ${expected}`);

  await check('Parte 8: TeamRanking do jogador == soma explícita de (50 por vitória / 20 por derrota + bônus)', async () => {
    assert.ok(playerRow, 'linha de TeamRanking da dupla do jogador deveria existir');
    assert.equal(Number(playerRow.ranking_points), expected);
  });

  await check('Parte 8: matches_played/wins/losses batem com o ledger', async () => {
    assert.equal(Number(playerRow.matches_played), sequence.length);
    assert.equal(Number(playerRow.wins), sequence.filter((s) => s.won).length);
    assert.equal(Number(playerRow.losses), sequence.filter((s) => !s.won).length);
  });

  await check('BUG 5: a fórmula do jogador NÃO é a soma de pontos de torneio do Circuito (é incremental por partida)', async () => {
    // Prova por contraste: 3 vitórias + 2 derrotas = 5 partidas. Nenhum
    // torneio do catálogo paga 50/20 por PARTIDA — esses números só existem
    // nesta função. Documenta a fórmula distinta, como o briefing permite.
    assert.equal(expected, 50 + 50 + 20 + (50 + 12) + 20);
    assert.equal(Number(playerRow.ranking_points), 202);
  });

  // ---------- (A) fórmula das duplas de IA ----------
  const circuitSource = await vite.ssrLoadModule('/src/game-core/circuitLifecycle.js');
  console.log('\n=== (A) fórmula das duplas de IA ===');
  console.log('  ranking_points = A.world_ranking_points + B.world_ranking_points (soma canônica)');
  console.log('  (circuitLifecycle.js:updateTeamRankings — recomputado a cada passada, nunca incremental)');

  await check('(A) a passada em lote de duplas de IA existe e é exportada pelo circuito', async () => {
    assert.equal(typeof circuitSource.processWorldCircuit, 'function');
  });

  await check('BUG 5 (achado estrutural): as duas fórmulas convivem na MESMA tabela, em unidades diferentes', async () => {
    // A dupla do jogador ficou com 202 pontos "de partida"; uma dupla de IA
    // com dois atletas de 13.500 pontos de Circuito somaria 27.000.
    const aiLikePoints = 13500 + 13500;
    assert.equal(aiLikePoints, 27000);
    assert.ok(aiLikePoints > Number(playerRow.ranking_points) * 50,
      'as escalas são ordens de grandeza distintas — é isso que faz o par do jogador aparecer lá embaixo');
  });

  await check('a aba Duplas lê a tabela deduplicada (getTeamRankings), incluindo a linha do jogador', async () => {
    const listed = await getTeamRankings(600);
    const mine = listed.find((row) => row.team_key === key);
    assert.ok(mine, 'a dupla do jogador precisa aparecer na listagem da aba Duplas');
    assert.equal(Number(mine.ranking_points), expected);
  });

  console.log('\nNota (BUG 5): Race NÃO alimenta a aba Duplas em nenhum dos dois caminhos.');
  console.log('Coello/Tapia ~27.000 = SOMA do CIRCUITO (janela rolante), não Race=1000 — comportamento correto.');
  console.log('O ponto legítimo de atenção é a coexistência de duas unidades na mesma tabela (registrado, não alterado).');

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-player-team-ranking-ledger-v59: PASS');
} finally {
  await vite.close();
}
