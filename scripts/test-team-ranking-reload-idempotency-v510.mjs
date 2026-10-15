// Playthrough 5.10 — simulação obrigatória: 3 seeds de calibração + 3
// held-out, ao menos 1 temporada cada. Captura Top20, posição da dupla do
// jogador, contagens de reparo e linhas irresolvíveis, e prova idempotência
// de recarga (Partes L/T).
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const CALIBRATION = ['calib-a', 'calib-b', 'calib-c'];
const HELDOUT = ['held-a', 'held-b', 'held-c'];

async function runSeed(label) {
  const captured = { label, repairFirst: null, repairSecond: null, boardBefore: [], boardAfter: [] };
  const sim = await runHeadlessWorldSimulation({
    years: 1, label: `tr510-${label}`, trackWeeklyDraws: false, includeRankingResults: true,
    onBeforeClose: async ({ localGame, vite }) => {
      const { repairLegacyTeamRankings, getTeamRankings } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
      captured.boardBefore = (await getTeamRankings(5000)).slice(0, 20)
        .map((r) => ({ key: r.team_key, pts: Number(r.ranking_points) || 0 }));
      captured.repairFirst = await repairLegacyTeamRankings();
      captured.repairSecond = await repairLegacyTeamRankings();
      captured.boardAfter = (await getTeamRankings(5000)).slice(0, 20)
        .map((r) => ({ key: r.team_key, pts: Number(r.ranking_points) || 0 }));
      const athletes = await localGame.entities.AthleteProfile.list(null, 5000);
      const teams = await localGame.entities.TeamRanking.list(null, 5000);
      const ids = new Set(athletes.map((a) => a.id));
      captured.total = teams.length;
      captured.unresolved = teams.filter((t) => !ids.has(t.player1_id) || !ids.has(t.player2_id)).length;
      captured.botLike = teams.filter((t) => /^ranking-bot-\d+$/.test(String(t.player1_id))
        || /^ranking-bot-\d+$/.test(String(t.player2_id))).length;
      const counts = new Map();
      for (const t of teams) {
        if (!t.player1_id || !t.player2_id) continue;
        const k = [t.player1_id, t.player2_id].sort().join('_');
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      captured.duplicates = [...counts.values()].filter((n) => n > 1).length;
    },
  });
  captured.athletes = sim.athletes.length;
  return captured;
}

const results = [];
for (const label of [...CALIBRATION, ...HELDOUT]) {
  const r = await runSeed(label);
  results.push(r);
  console.log(`[${label}] duplas=${r.total} irresolvíveis=${r.unresolved} botLike=${r.botLike} duplicatas=${r.duplicates} | reparo1=${JSON.stringify(r.repairFirst)} reparo2=${JSON.stringify(r.repairSecond)}`);
}

const calib = results.filter((r) => CALIBRATION.includes(r.label));
const held = results.filter((r) => HELDOUT.includes(r.label));

console.log('\n=== Top5 por seed (amostra) ===');
for (const r of results) {
  console.log(`  ${r.label.padEnd(8)} ${r.boardAfter.slice(0, 5).map((x) => x.pts).join(', ')}`);
}

check('3 seeds de calibração rodaram', () => assert.equal(calib.length, 3));
check('3 seeds held-out rodaram', () => assert.equal(held.length, 3));

check('Critério 4/5: ZERO linhas ranking-bot e ZERO irresolvíveis em TODAS as seeds', () => {
  for (const r of results) {
    assert.equal(r.botLike, 0, `${r.label}: ${r.botLike} linhas ranking-bot`);
    assert.equal(r.unresolved, 0, `${r.label}: ${r.unresolved} linhas irresolvíveis`);
  }
});

check('Critério 9: ZERO duplicatas canônicas em TODAS as seeds', () => {
  for (const r of results) assert.equal(r.duplicates, 0, `${r.label}: ${r.duplicates} duplicatas`);
});

check('Parte L: numa base já correta o reparo é NO-OP (nada a remapear/normalizar/fundir)', () => {
  for (const r of results) {
    assert.equal(r.repairFirst.remapped, 0, `${r.label}: remapeou ${r.repairFirst.remapped}`);
    assert.equal(r.repairFirst.duplicatesMerged, 0, `${r.label}: fundiu ${r.repairFirst.duplicatesMerged}`);
  }
});

check('Parte L/T: segunda passada do reparo é idempotente', () => {
  for (const r of results) {
    assert.deepEqual(r.repairSecond, r.repairFirst, `${r.label}: reparo não idempotente`);
  }
});

check('Critério 11: o Top20 não muda por efeito do reparo/recarga', () => {
  for (const r of results) {
    assert.deepEqual(r.boardAfter, r.boardBefore, `${r.label}: Top20 mudou após reparo`);
  }
});

check('Critério 28: Top20 continua plausível (ordenado e estritamente positivo)', () => {
  for (const r of results) {
    const pts = r.boardAfter.map((x) => x.pts);
    assert.ok(pts.length >= 10, `${r.label}: só ${pts.length} duplas no topo`);
    assert.ok(pts.every((p) => p > 0), `${r.label}: dupla com 0 pontos no Top20`);
    for (let i = 1; i < pts.length; i += 1) {
      assert.ok(pts[i] <= pts[i - 1], `${r.label}: Top20 fora de ordem em ${i}`);
    }
  }
});

check('held-out reproduz o comportamento da calibração (mesmas invariantes)', () => {
  const invariant = (r) => [r.botLike, r.unresolved, r.duplicates].join(':');
  const calibSet = new Set(calib.map(invariant));
  for (const r of held) {
    assert.ok(calibSet.has(invariant(r)), `${r.label}: invariantes ${invariant(r)} fora do observado na calibração`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-team-ranking-reload-idempotency-v510: PASS');
