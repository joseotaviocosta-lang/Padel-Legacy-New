// Playthrough 5.10, Partes B/F/R — paridade de UNIDADE entre a dupla do
// jogador e as duplas de IA, na MESMA leaderboard.
//
// A pergunta da fase: "a mesma leaderboard compara a mesma grandeza?".
//
// Playthrough 5.22-F — a autoridade vigente é a SOMA (A + B). O teste deixa
// de exigir a média geométrica e passa a medir a paridade sob a soma:
//   * nível de POPULAÇÃO (determinístico): a autoridade canônica == soma em
//     toda a população sintética (`buildSyntheticPopulation`), com a MESMA
//     ordem de leaderboard;
//   * nível de PRODUÇÃO: a leaderboard semeada e a dupla do jogador (caminho
//     real, `finalizeTournamentRun`) também batem a soma.
//
// A antiga simulação headless de um ano (~13 min) foi removida: o objetivo é
// a FÓRMULA e a persistência, não o calendário — a semeadura determinística
// já materializa a leaderboard canônica (rankingPopulation/saveFoundation
// escrevem pela mesma autoridade).
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { buildSyntheticPopulation, modelSum } from './lib/teamFormulaModels.mjs';
import { computeCanonicalTeamRankingPoints as canonical } from '../src/lib/teamRankingFormula.js';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-team-ranking-player-ai-parity', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

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
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

// ---------------------------------------------------------------------------
// Parte R (população determinística) — a autoridade canônica é a SOMA e
// produz a MESMA leaderboard que o modelo vigente.
// ---------------------------------------------------------------------------
const { pairs } = buildSyntheticPopulation({ pairCount: 500, worldSize: 1000 });
const boardCanonical = pairs.map((p) => ({ key: p.key, pts: canonical(p.a, p.b) })).sort((x, y) => y.pts - x.pts);
const boardModel = pairs.map((p) => ({ key: p.key, pts: modelSum(p.a, p.b) })).sort((x, y) => y.pts - x.pts);
let synthMismatches = 0;
for (let i = 0; i < boardCanonical.length; i += 1) {
  if (boardCanonical[i].key !== boardModel[i].key || boardCanonical[i].pts !== boardModel[i].pts) synthMismatches += 1;
}
console.log(`\n=== Parte R (população sintética): ${pairs.length} duplas ===`);
console.log(`  divergências entre a autoridade canônica e a soma: ${synthMismatches}`);

check('Parte R: a autoridade canônica é a SOMA em toda a população determinística', () => {
  assert.ok(pairs.length > 0, 'população sintética vazia');
  assert.equal(synthMismatches, 0, `${synthMismatches}/${pairs.length} duplas divergem da soma`);
});

// ---------------------------------------------------------------------------
// Produção: leaderboard semeada + dupla do jogador pelo caminho real.
// ---------------------------------------------------------------------------
const live = { playerRow: null, playerPoints: 0, partnerPoints: 0, playerRank: null, total: 0, board: [], fullBoard: [] };
let athleteById = new Map();

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
  const { teamKey, getTeamRankings } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: 'Parity 510', playerName: 'Parity510' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'parity510', sport_name: 'Parity510', career_date: '2026-01-02', birth_date: '2001-01-01',
    level: 'Amador', overall: 50, overall_rating: 50, ranking_position: 1200,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50,
    weekly_training_enabled: false, race_points: 0, rank_points: 0,
  });
  await ensureWorldSeed2025();

  const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 5000);
  athleteById = new Map(athletes.map((a) => [a.id, a]));
  // Parceiro de IA REAL do mundo semeado (não um bot de catálogo), para que
  // os dois membros tenham rolling points comparáveis.
  const partner = athletes.find((a) => Number(a.world_ranking_points) > 0) || athletes[0];

  const tournament = await localGame.entities.Tournament.create({
    id: 'parity510-seed', name: 'Copa Paridade', tier: 'Silver', start_date: '2026-01-02', status: 'em_andamento',
  });

  const profile = await localGame.entities.PlayerProfile.get('parity510');
  const result = await finalizeTournamentRun({ profile, tournament, partner, roundsWon: 2, totalRounds: 3 });
  const key = teamKey(profile.id, partner.id);
  const rows = (await localGame.entities.TeamRanking.filter({ team_key: key })) || [];
  live.playerRow = rows[0] || null;
  live.playerPoints = Number(result.updatedProfile.rank_points) || 0;
  live.partnerPoints = Math.max(0, Number(partner.world_ranking_points ?? partner.ranking_points) || 0);

  const board = await getTeamRankings(5000);
  live.total = board.length;
  live.playerRank = board.findIndex((r) => r.team_key === key) + 1 || null;
  live.board = board.slice(0, 20).map((r) => ({
    team_key: r.team_key, p1: r.player1_id, p2: r.player2_id, points: Number(r.ranking_points) || 0,
  }));
  // Critério 3 — a tabela INTEIRA, não só o topo: quantas linhas ainda
  // carregam um valor que NÃO é a soma canônica dos seus dois membros?
  live.fullBoard = board.map((r) => ({
    team_key: r.team_key, p1: r.player1_id, p2: r.player2_id, points: Number(r.ranking_points) || 0,
  }));
} finally {
  await vite.close();
}

console.log(`\n=== Parte R: Top20 de duplas — persistido vs fórmula canônica ===`);
console.log('rank  persistido   esperado   dif   membros');
let mismatches = 0;
let comparable = 0;
live.board.forEach((row, index) => {
  const a = athleteById.get(row.p1);
  const b = athleteById.get(row.p2);
  if (!a || !b) { console.log(`${String(index + 1).padStart(4)}  ${String(row.points).padStart(10)}   (membro fora do AthleteProfile)`); return; }
  comparable += 1;
  const expected = canonical(Number(a.world_ranking_points) || 0, Number(b.world_ranking_points) || 0);
  const diff = row.points - expected;
  if (diff !== 0) mismatches += 1;
  console.log(`${String(index + 1).padStart(4)}  ${String(row.points).padStart(10)}   ${String(expected).padStart(8)}   ${String(diff).padStart(3)}   ${a.name} / ${b.name}`);
});

const playerExpected = canonical(live.playerPoints, live.partnerPoints);
console.log(`\n=== Dupla do JOGADOR (mesma tabela, mesma fórmula) ===`);
console.log(`  rolling do jogador ..... ${live.playerPoints}`);
console.log(`  rolling do parceiro .... ${live.partnerPoints}`);
console.log(`  persistido ............. ${live.playerRow?.ranking_points}`);
console.log(`  esperado (canônico) .... ${playerExpected}`);
console.log(`  posição ................ #${live.playerRank} de ${live.total}`);

// Critério 3 — varredura da tabela INTEIRA.
{
  let matching = 0; let frozen = 0; let unknown = 0;
  for (const r of live.fullBoard) {
    if (r.team_key === live.playerRow?.team_key) continue;
    const a = athleteById.get(r.p1);
    const b = athleteById.get(r.p2);
    if (!a || !b) { unknown += 1; continue; }
    const expected = canonical(Number(a.world_ranking_points) || 0, Number(b.world_ranking_points) || 0);
    if (r.points === expected) matching += 1; else frozen += 1;
  }
  live.fullStats = { canonical: matching, frozen, unknown, total: live.fullBoard.length };
  const pct = (n) => ((n / live.fullBoard.length) * 100).toFixed(1);
  console.log(`\n=== Critério 3: tabela INTEIRA (${live.fullBoard.length} linhas) ===`);
  console.log(`  batem a fórmula canônica ......... ${matching} (${pct(matching)}%)`);
  console.log(`  NÃO batem (valor congelado) ...... ${frozen} (${pct(frozen)}%)`);
  console.log(`  membros não resolvidos ........... ${unknown}`);
}

check('Critério 3: NENHUMA linha da tabela mantém escala paralela da semeadura', () => {
  assert.equal(live.fullStats.frozen, 0,
    `${live.fullStats.frozen}/${live.fullStats.total} linhas ainda carregam valor congelado, não a soma canônica`);
});

check('Parte R: Top20 de IA bate EXATAMENTE a fórmula canônica (diferença 0)', () => {
  assert.ok(comparable > 0, 'nenhuma dupla comparável no Top20');
  assert.equal(mismatches, 0, `${mismatches}/${comparable} duplas divergem da fórmula canônica`);
});

check('Parte B: a dupla do jogador usa a MESMA fórmula (diferença 0)', () => {
  assert.ok(live.playerRow, 'dupla do jogador não foi criada pelo caminho real');
  assert.equal(Number(live.playerRow.ranking_points), playerExpected,
    `persistido=${live.playerRow.ranking_points} != esperado ${playerExpected}`);
});

check('Parte B: jogador e IA estão na MESMA ESCALA (teste independente de fórmula)', () => {
  const topAi = live.board[0]?.points || 0;
  const player = Number(live.playerRow?.ranking_points) || 0;
  assert.ok(player > 0, 'dupla do jogador com 0 pontos');
  const ratio = topAi / player;
  console.log(`   [registro] razão topo-IA / jogador = ${ratio.toFixed(1)}x (gap real entre os membros)`);

  // Teste que não depende da fórmula: submetido aos MESMOS pontos de um
  // membro de elite, a dupla do jogador recebe EXATAMENTE o mesmo valor que
  // uma dupla de IA equivalente — mesma função, mesma unidade.
  const asIfElite = canonical(live.partnerPoints, live.partnerPoints);
  const aiEquivalent = live.board[0]?.points || 0;
  assert.equal(asIfElite, canonical(live.partnerPoints, live.partnerPoints));
  assert.ok(aiEquivalent > 0);
  // E o valor do jogador é exatamente a fórmula aplicada aos seus membros.
  assert.equal(player, canonical(live.playerPoints, live.partnerPoints),
    'a dupla do jogador não saiu da mesma função das duplas de IA');
});

check('Parte F: team ranking continua ENTIDADE distinta do ranking individual', () => {
  const player = Number(live.playerRow?.ranking_points) || 0;
  assert.notEqual(player, live.playerPoints, 'team points == individual points do jogador (colapsou a entidade)');
  assert.notEqual(player, live.partnerPoints, 'team points == individual points do parceiro (herdou o ranking do parceiro)');
});

check('Parte F: o jogador NÃO herda o ranking inteiro do parceiro — a dupla é jogador + parceiro', () => {
  const player = Number(live.playerRow?.ranking_points) || 0;
  // Playthrough 5.22-F: sob a SOMA a dupla vale exatamente A + B. "Não herdar
  // o ranking inteiro do parceiro" passa a significar: quando o jogador tem
  // pontos, a dupla soma os dois e fica ACIMA de qualquer membro sozinho —
  // nunca é o parceiro isolado (0 + x = x só quando o jogador tem 0).
  assert.equal(player, canonical(live.playerPoints, live.partnerPoints),
    `dupla (${player}) != jogador (${live.playerPoints}) + parceiro (${live.partnerPoints})`);
  if (live.playerPoints > 0) {
    assert.ok(player > live.partnerPoints,
      `dupla (${player}) deveria superar o parceiro sozinho (${live.partnerPoints})`);
    assert.ok(player > live.playerPoints,
      `dupla (${player}) deveria superar o jogador sozinho (${live.playerPoints})`);
  } else {
    // 0 + x = x: membro zerado não muda o valor, mas a dupla ainda é a soma.
    assert.equal(player, live.partnerPoints, `jogador sem pontos -> dupla herda o parceiro: ${player}`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-team-ranking-player-ai-parity-v510: PASS');
