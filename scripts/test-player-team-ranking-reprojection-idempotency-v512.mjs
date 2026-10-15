// Playthrough 5.12 (continuação), Partes G/I/J — a reprojeção da dupla do
// jogador não pode gerar drift, duplicar linha, nem mexer nas duplas de IA
// ou no field de Finals.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';
import { computeCanonicalTeamRankingPoints as canonical } from './lib/teamFormulaModels.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const live = {};

await runHeadlessWorldSimulation({
  years: 1, label: 'v512-reproj-idem', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame, profile, vite, processWorldCircuit, date }) => {
    const { BOTS_BY_DIFFICULTY } = await vite.ssrLoadModule('/src/lib/bots.js');
    const { startPartnership } = await vite.ssrLoadModule('/src/lib/partnershipSystem.js');
    const { finalizeTournamentRun } = await vite.ssrLoadModule('/src/game-core/tournamentLifecycle.js');
    const { teamKey } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

    const bot = (BOTS_BY_DIFFICULTY.avancado || BOTS_BY_DIFFICULTY.amador || [])[0];
    await localGame.entities.PlayerProfile.update(profile.id, { career_date: date });
    let fresh = await localGame.entities.PlayerProfile.get(profile.id);
    await startPartnership(fresh, bot, 90, 50);
    const partner = (await localGame.entities.AthleteProfile.filter({ id: bot.id }, null, 1))[0];

    const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
    const recent = tournaments.filter((t) => t.start_date && t.start_date <= date);
    const tournament = recent[recent.length - 1] || tournaments[0];
    fresh = await localGame.entities.PlayerProfile.get(profile.id);
    await finalizeTournamentRun({ profile: fresh, tournament, partner, roundsWon: 2, totalRounds: 3 });

    const key = teamKey(profile.id, bot.id);
    const snapshot = async () => {
      const rows = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
      const mine = rows.find((r) => r.team_key === key);
      return {
        rows: rows.length,
        mine: Number(mine?.ranking_points) || 0,
        mineCount: rows.filter((r) => r.team_key === key).length,
        // Guarda os ids de membro da própria linha: `team_key` não pode ser
        // fatiado por '_', porque ids reais contêm underscore
        // (ex.: `real_arturo_coello`).
        top20: rows.slice(0, 20).map((r) => ({
          key: r.team_key, pts: Number(r.ranking_points) || 0,
          p1: r.player1_id, p2: r.player2_id,
        })),
      };
    };

    const nextDate = (offset) => {
      const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };

    fresh = await localGame.entities.PlayerProfile.get(profile.id);
    await processWorldCircuit(fresh, date, nextDate(7));
    live.first = await snapshot();

    // Segunda passada SEM nenhuma mudança de estado entre elas.
    fresh = await localGame.entities.PlayerProfile.get(profile.id);
    await processWorldCircuit(fresh, nextDate(7), nextDate(8));
    live.second = await snapshot();

    // Terceira, para descartar oscilação de período.
    fresh = await localGame.entities.PlayerProfile.get(profile.id);
    await processWorldCircuit(fresh, nextDate(8), nextDate(9));
    live.third = await snapshot();

    const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
    live.athleteById = new Map(athletes.map((a) => [a.id, Number(a.world_ranking_points) || 0]));
    live.playerId = profile.id;
    live.key = key;
  },
});

console.log(`dupla do jogador: 1ª=${live.first.mine} 2ª=${live.second.mine} 3ª=${live.third.mine}`);
console.log(`linhas na tabela: ${live.first.rows} / ${live.second.rows} / ${live.third.rows}`);

check('Parte G: segunda passada não gera drift na dupla do jogador', () => {
  assert.equal(live.second.mine, live.first.mine,
    `${live.first.mine} -> ${live.second.mine}`);
});

check('Parte G: terceira passada também não gera drift', () => {
  assert.equal(live.third.mine, live.first.mine, `${live.first.mine} -> ${live.third.mine}`);
});

check('Parte G: nenhuma linha duplicada para a dupla do jogador', () => {
  for (const [label, snap] of [['1ª', live.first], ['2ª', live.second], ['3ª', live.third]]) {
    assert.equal(snap.mineCount, 1, `${label} passada: ${snap.mineCount} linhas`);
  }
});

check('Parte G: a tabela não cresce a cada passada', () => {
  assert.equal(live.second.rows, live.first.rows, `${live.first.rows} -> ${live.second.rows}`);
  assert.equal(live.third.rows, live.first.rows, `${live.first.rows} -> ${live.third.rows}`);
});

check('Parte I: o Top20 de IA é estável entre passadas', () => {
  assert.deepEqual(live.second.top20, live.first.top20, 'Top20 mudou na 2ª passada');
  assert.deepEqual(live.third.top20, live.first.top20, 'Top20 mudou na 3ª passada');
});

check('Parte I: o Top20 de IA continua diff 0 contra o helper canônico', () => {
  let checked = 0;
  for (const row of live.first.top20) {
    const a = live.athleteById.get(row.p1);
    const b = live.athleteById.get(row.p2);
    if (a === undefined || b === undefined) continue;
    assert.equal(row.pts, canonical(a, b), `${row.key}: ${row.pts} != ${canonical(a, b)}`);
    checked += 1;
  }
  console.log(`   [registro] duplas de IA do Top20 verificadas: ${checked}`);
  assert.ok(checked >= 10, `só ${checked} comparáveis`);
});

check('Parte J: o jogador NÃO foi inserido artificialmente no Top8/Top16', () => {
  const top8 = live.first.top20.slice(0, 8).map((r) => r.key);
  const top16 = live.first.top20.slice(0, 16).map((r) => r.key);
  console.log(`   [registro] dupla do jogador (${live.first.mine} pts) no Top8? ${top8.includes(live.key)} | Top16? ${top16.includes(live.key)}`);
  // Um jogador recém-formado não deve deslocar o field de elite.
  assert.ok(!top8.includes(live.key), 'jogador entrou no Top8 do nada');
});

check('Parte J: Top8 e Top16 continuam ordenados e positivos', () => {
  const pts = live.first.top20.map((r) => r.pts);
  for (let i = 1; i < 16 && i < pts.length; i += 1) {
    assert.ok(pts[i] <= pts[i - 1], `fora de ordem em ${i}`);
  }
  assert.ok(pts.slice(0, 8).every((p) => p > 0), 'dupla com 0 pontos no Top8');
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-player-team-ranking-reprojection-idempotency-v512: PASS');
