// Playthrough 5.10, Partes C/G — troca de parceiro e posicionamento de
// dupla NOVA sob a fórmula canônica (média dos rolling dos dois membros).
//
// O briefing manda testar explicitamente se "o jogador não herda
// indevidamente o ranking inteiro do parceiro" e, se o modelo for
// inadequado, PROVAR. Este teste mede a assimetria em vez de presumi-la.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { hostname: '127.0.0.1', pathname: '/test-team-ranking-partnership-change-v510', search: '' };
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
  const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
  const { teamKey, computeCanonicalTeamRankingPoints } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.10 Pair Change', playerName: 'P510PC' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'p510-pc', sport_name: 'P510PC', career_date: '2026-01-02', birth_date: '2001-01-01',
    level: 'Amador', overall: 52, overall_rating: 52, ranking_position: 1000,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50,
    weekly_training_enabled: false, race_points: 0, rank_points: 0,
  });

  const mkPartner = (id, points) => localGame.entities.AthleteProfile.create({
    id, bot_id: id, name: `Parceiro ${id}`, world_ranking_points: points, ranking_points: points, race_points: 0,
  });
  const mkTournament = (id, date) => localGame.entities.Tournament.create({
    id, name: `Copa ${id}`, tier: 'Silver', start_date: date, status: 'em_andamento',
  });

  // --- Parte G: A+B primeiro, depois A+C ---
  const weak = await mkPartner('pc-weak', 200);
  const strong = await mkPartner('pc-strong', 25000);

  const t1 = await mkTournament('pc-t1', '2026-02-10');
  let profile = await localGame.entities.PlayerProfile.get('p510-pc');
  const r1 = await finalizeTournamentRun({ profile, tournament: t1, partner: weak, roundsWon: 2, totalRounds: 3 });
  const keyAB = teamKey('p510-pc', 'pc-weak');
  const rowAB = ((await localGame.entities.TeamRanking.filter({ team_key: keyAB })) || [])[0];
  const playerAfter1 = Number(r1.updatedProfile.rank_points) || 0;

  const t2 = await mkTournament('pc-t2', '2026-03-10');
  profile = await localGame.entities.PlayerProfile.get('p510-pc');
  const r2 = await finalizeTournamentRun({ profile, tournament: t2, partner: strong, roundsWon: 2, totalRounds: 3 });
  const keyAC = teamKey('p510-pc', 'pc-strong');
  const rowAC = ((await localGame.entities.TeamRanking.filter({ team_key: keyAC })) || [])[0];
  const playerAfter2 = Number(r2.updatedProfile.rank_points) || 0;

  console.log('=== Parte G: troca de parceiro ===');
  console.log(`  jogador rolling após T1 .... ${playerAfter1}`);
  console.log(`  A+B (parceiro 200) ......... ${rowAB?.ranking_points} pts | matches=${rowAB?.matches_played} titles=${(rowAB?.titles || []).length}`);
  console.log(`  jogador rolling após T2 .... ${playerAfter2}`);
  console.log(`  A+C (parceiro 25000) ....... ${rowAC?.ranking_points} pts | matches=${rowAC?.matches_played} titles=${(rowAC?.titles || []).length}`);

  await check('Parte G: a dupla nova A+C é uma linha PRÓPRIA (não reaproveita A+B)', () => {
    assert.ok(rowAB && rowAC, 'faltou uma das linhas');
    assert.notEqual(rowAB.team_key, rowAC.team_key);
  });

  await check('Parte G: A+C NÃO herda partidas/títulos de A+B', () => {
    assert.equal(Number(rowAC.matches_played), 1, `A+C começou com ${rowAC.matches_played} partidas`);
    assert.equal((rowAC.titles || []).length, 0, 'A+C herdou títulos de A+B');
  });

  await check('Parte G: a linha de A+B permanece intacta após a troca', async () => {
    const still = ((await localGame.entities.TeamRanking.filter({ team_key: keyAB })) || [])[0];
    assert.ok(still, 'A+B sumiu');
    assert.equal(Number(still.ranking_points), Number(rowAB.ranking_points), 'A+B mudou de pontos após a troca');
  });

  await check('Parte G: cada dupla reflete os rolling ATUAIS dos seus dois membros', () => {
    assert.equal(Number(rowAC.ranking_points), computeCanonicalTeamRankingPoints(playerAfter2, 25000));
  });

  // --- Parte C: medir a ASSIMETRIA ---
  const playerPts = playerAfter2;
  const partnerPts = 25000;
  const teamPts = Number(rowAC.ranking_points) || 0;
  // Playthrough 5.11 — a métrica anterior (`partnerPts / 2 / teamPts`) só
  // fazia sentido sob a média simples e, depois da troca para média
  // geométrica, passava trivialmente sem medir nada. Substituída pela
  // fração do parceiro de elite que a DUPLA de fato retém, que é
  // comparável entre fórmulas.
  const retainedFromPartner = teamPts / partnerPts;

  console.log('\n=== Parte C: assimetria sob a fórmula canônica ===');
  console.log(`  jogador ........ ${playerPts} pts`);
  console.log(`  parceiro ....... ${partnerPts} pts`);
  console.log(`  dupla .......... ${teamPts} pts`);
  console.log(`  a dupla retém ${(retainedFromPartner * 100).toFixed(1)}% do nível do parceiro de elite`);
  console.log('  (Playthrough 5.22-E: regra vigente é a SOMA dos membros)');

  await check('Parte C: a dupla vale exatamente A + B (regra 5.22-E)', () => {
    assert.equal(teamPts, playerPts + partnerPts, `dupla ${teamPts} != ${playerPts} + ${partnerPts}`);
  });

  await check('Parte C: o membro de elite carrega a dupla (acima do parceiro sozinho, mas não o dobro)', () => {
    assert.ok(teamPts > partnerPts, `dupla ${teamPts} deveria superar o parceiro ${partnerPts}`);
    assert.ok(teamPts < partnerPts * 2, `dupla ${teamPts} não pode dobrar o parceiro ${partnerPts}`);
  });

  await check('Parte T: reload não altera os pontos das duas duplas', async () => {
    const again = await localGame.entities.TeamRanking.list(null, 5000);
    const ab = again.find((r) => r.team_key === keyAB);
    const ac = again.find((r) => r.team_key === keyAC);
    assert.equal(Number(ab.ranking_points), Number(rowAB.ranking_points));
    assert.equal(Number(ac.ranking_points), Number(rowAC.ranking_points));
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-team-ranking-partnership-change-v510: PASS');
} finally {
  await vite.close();
}
