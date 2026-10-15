// Playthrough 5.15 (continuação final), Partes C/D/J — a SÉRIE TEMPORAL que
// faltava: composição do ranking de duplas em quatro momentos.
//
//   T0 = seed (sem simulação)
//   T1 = ~2 meses
//   T2 = ~6 meses
//   T3 = 1 temporada
//
// Expectativa (Parte D): a elite começa predominantemente real; procedurais
// podem subir ORGANICAMENTE ao longo do ano. Não se exige Top50 100% real —
// exige-se que quem sobe tenha pontos que os membros sustentem.
//
// Playthrough 5.22-F — a autoridade vigente é a SOMA (A + B, 5.22-E), não
// mais a média geométrica (5.11). A geométrica SUPRIMIA assimetrias, então
// os tetos antigos ("Top10 >= 7 RR", Top20 >= 18 no seed) foram calibrados
// para um mundo em que procedurais quase não subiam. Sob a soma, medido nos
// quatro momentos: a elite (Top10/Top20) permanece 100% real; procedurais
// entram só no Top50, de 0 (seed/T1) para 5 (T2) e 7 (T3), sempre
// sustentados pela soma dos membros (unsupported = 0). As expectativas
// abaixo refletem esse baseline de SOMA, não o teto geométrico.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';
import { buildOriginIndex, originMix, classifyPair, formatMix } from './lib/originClassifier.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

// Um ponto da linha do tempo = uma simulação de N dias a partir do mesmo
// seed determinístico. O harness recebe anos; frações viram dias.
const CHECKPOINTS = [
  { id: 'T0', label: 'seed', years: 0 },
  { id: 'T1', label: '~2 meses', years: 61 / 365 },
  { id: 'T2', label: '~6 meses', years: 182 / 365 },
  { id: 'T3', label: '1 temporada', years: 1 },
];

const points = [];
for (const cp of CHECKPOINTS) {
  const captured = {};
  await runHeadlessWorldSimulation({
    years: cp.years, label: `v515-timeline-${cp.id}`, trackWeeklyDraws: false, includeRankingResults: true,
    onBeforeClose: async ({ localGame, vite }) => {
      captured.teams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
      const athletesNow = await localGame.entities.AthleteProfile.list(null, 5000);
      captured.originIndex = await buildOriginIndex(vite, athletesNow);
      captured.athletes = athletesNow;
      const { computeCanonicalTeamRankingPoints } = await vite.ssrLoadModule('/src/lib/teamRanking.js');
      captured.canonical = computeCanonicalTeamRankingPoints;
    },
  });

  const { originById } = captured.originIndex;
  const teams = captured.teams;
  const byId = new Map(captured.athletes.map((a) => [a.id, a]));

  // Parte B/D — toda PP que aparece no Top50 precisa ser sustentada pelos
  // membros (nada de valor congelado).
  const ppTop50 = teams.slice(0, 50)
    .map((t, i) => ({ row: t, rank: i + 1 }))
    .filter((x) => classifyPair(originById, x.row.player1_id, x.row.player2_id) === 'PP');
  const unsupported = ppTop50.filter((x) => {
    const a = byId.get(x.row.player1_id);
    const b = byId.get(x.row.player2_id);
    if (!a || !b) return true;
    const expected = captured.canonical(
      Number(a.world_ranking_points) || 0, Number(b.world_ranking_points) || 0,
    );
    return Number(x.row.ranking_points) !== expected;
  });

  points.push({
    ...cp,
    top10: originMix(teams, originById, { limit: 10 }),
    top20: originMix(teams, originById, { limit: 20 }),
    top50: originMix(teams, originById, { limit: 50 }),
    ppTop50: ppTop50.length,
    unsupported: unsupported.length,
    unsupportedSamples: unsupported.slice(0, 3).map((x) => `#${x.rank} ${x.row.player1_name}/${x.row.player2_name}`),
  });
  const last = points.at(-1);
  console.log(`[${cp.id} ${cp.label}] PP Top50=${last.ppTop50} sem sustentação=${last.unsupported}`);
  console.log(`   ${formatMix('Top10', last.top10)}`);
  console.log(`   ${formatMix('Top20', last.top20)}`);
  console.log(`   ${formatMix('Top50', last.top50)}`);
}

console.log('\n=== PARTE C/6-11: evolução real × procedural ===');
console.log('ponto  momento        Top10 RR   Top20 RR   Top50 RR   PP Top50   sem sustentação');
for (const p of points) {
  console.log(`${p.id.padEnd(7)}${p.label.padEnd(15)}${String(p.top10.RR).padStart(8)}${String(p.top20.RR).padStart(11)}${String(p.top50.RR).padStart(11)}${String(p.ppTop50).padStart(11)}${String(p.unsupported).padStart(17)}`);
}

check('Parte C: os quatro momentos foram medidos', () => {
  assert.equal(points.length, 4);
});

check('Parte D/6: no SEED a elite é 100% real (procedurais começam em 0 pontos)', () => {
  const t0 = points[0];
  console.log(`   [registro] T0 Top10 RR=${t0.top10.RR} Top20 RR=${t0.top20.RR} Top50 RR=${t0.top50.RR}`);
  // O seed é determinístico e a população procedural começa sem pontos de
  // circuito: 0 + 0 = 0 (convenção "sem ranking"), então nenhuma dupla
  // procedural alcança o Top10/Top20. Baseline recalculado sob a SOMA.
  assert.equal(t0.top10.RR, 10, `Top10 do seed tem ${t0.top10.RR} duplas reais`);
  assert.equal(t0.top20.RR, 20, `Top20 do seed tem ${t0.top20.RR} reais`);
});

check('Parte B/N (critério 2): NENHUMA PP do Top50 é seed-inflated, em nenhum momento', () => {
  for (const p of points) {
    assert.equal(p.unsupported, 0,
      `${p.id}: ${p.unsupported} duplas procedurais sem sustentação — ${p.unsupportedSamples.join(' | ')}`);
  }
});

check('Parte D: a elite do Top10 continua real ao longo do ano (faixa da SOMA)', () => {
  for (const p of points) {
    // Baseline medido sob a SOMA: Top10 RR=10 em T0..T3. A faixa tolera que
    // uma dupla procedural suba por mérito (soma de dois membros fortes),
    // mas nunca permite dominância procedural no Top10.
    assert.ok(p.top10.RR >= 8, `${p.id}: só ${p.top10.RR} duplas reais no Top10`);
    assert.ok(p.top10.PP <= 2, `${p.id}: ${p.top10.PP} duplas procedurais no Top10 (dominância)`);
  }
});

check('Parte D: sob a SOMA procedurais podem subir, mas o Top50 segue majoritariamente real', () => {
  for (const p of points) {
    // Medido: Top50 RR=50 (T0/T1) -> 45 (T2) -> 43 (T3). O teto geométrico
    // foi substituído por uma faixa de maioria real recalibrada.
    assert.ok(p.top50.RR >= 30, `${p.id}: só ${p.top50.RR}/50 duplas reais no Top50`);
  }
});

check('Parte D/J: procedurais sobem ORGANICAMENTE (o Top50 abre espaço com o tempo)', () => {
  const t0 = points[0];
  const t3 = points.at(-1);
  console.log(`   [registro] PP no Top50: T0=${t0.ppTop50} -> T3=${t3.ppTop50}`);
  // Não se exige crescimento; exige-se que, se houver, seja sustentado — já
  // coberto acima. Aqui só registramos a direção.
  assert.ok(t3.ppTop50 >= t0.ppTop50 || t3.ppTop50 === 0,
    `PP no Top50 caiu de ${t0.ppTop50} para ${t3.ppTop50} sem explicação`);
});

check('Parte J: nenhuma faixa fica sem duplas (distribuição reportável)', () => {
  for (const p of points) {
    assert.equal(p.top10.total, 10, `${p.id}: Top10 incompleto`);
    assert.equal(p.top50.total, 50, `${p.id}: Top50 incompleto`);
  }
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-real-vs-procedural-timeline-v515: PASS');
