// Playthrough 5.4, TESTE 6/Parte M — acumulação de múltiplos resultados:
// recomputa, a partir do LEDGER bruto (`AthleteRankingResult`, todas as
// linhas de cada atleta), o valor esperado de `world_ranking_points` via
// `computeRollingPoints` (a mesma função pura usada em produção,
// rankingWindow.js) e compara contra o valor efetivamente persistido em
// `AthleteProfile.world_ranking_points` no fim da simulação — prova
// ausência de duplicação, perda, overwrite ou snapshot obsoleto (o "total"
// e o "ledger" nunca podem divergir).
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_ACCUMULATION_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'multi-result-accum', trackWeeklyDraws: false, includeRankingResults: true });

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { computeRollingPoints, groupResultsByAthlete } = await vite.ssrLoadModule('/src/game-core/rankingWindow.js');

  const resultsByAthlete = groupResultsByAthlete(sim.rankingResultRows);
  const touchedAthletes = sim.athletes.filter((a) => resultsByAthlete.has(a.id));

  console.log(`=== simulação: ${years} temporada(s), ${sim.rankingResultRows.length} linhas de resultado, ${touchedAthletes.length} atletas com ao menos 1 resultado ===\n`);

  let matched = 0; let mismatched = []; let multiResultAthletes = 0;
  for (const athlete of touchedAthletes) {
    const rows = resultsByAthlete.get(athlete.id) || [];
    if (rows.length > 1) multiResultAthletes += 1;
    const expected = computeRollingPoints(rows, [], sim.finalDate);
    const actual = Number(athlete.world_ranking_points) || 0;
    if (expected === actual) matched += 1;
    else if (mismatched.length < 8) mismatched.push({ id: athlete.id, name: athlete.name, resultsCount: rows.length, expected, actual });
  }

  console.log(`atletas com MÚLTIPLOS resultados na janela (>=2 linhas): ${multiResultAthletes}`);
  console.log(`atletas cujo world_ranking_points persistido bate com o recomputado do ledger: ${matched}/${touchedAthletes.length}`);
  if (mismatched.length) {
    console.log('exemplos de divergência (snapshot != ledger recomputado):');
    for (const m of mismatched) console.log(`  ${m.name} (${m.resultsCount} resultados): persistido=${m.actual} recomputado=${m.expected}`);
  }

  check('amostra real: há atletas com múltiplos resultados na janela (torneios acumulam, não é um único evento isolado)', () => {
    assert.ok(multiResultAthletes > 0, `multiResultAthletes=${multiResultAthletes}`);
  });
  check('world_ranking_points persistido == recomputado a partir do ledger bruto para TODOS os atletas tocados (sem duplicação/perda/overwrite/snapshot obsoleto)', () => {
    assert.equal(matched, touchedAthletes.length, `${touchedAthletes.length - matched} de ${touchedAthletes.length} atletas divergem entre snapshot e ledger`);
  });

  // Amostra de um atleta com muitos resultados: confirma que a soma bate
  // com "os N melhores dentro da janela", não com "todos os resultados"
  // (best-N, não sum-all) — ligado à Parte O/N.
  const richest = touchedAthletes.filter((a) => (resultsByAthlete.get(a.id) || []).length >= 3).sort((a, b) => (resultsByAthlete.get(b.id) || []).length - (resultsByAthlete.get(a.id) || []).length)[0];
  if (richest) {
    const rows = resultsByAthlete.get(richest.id) || [];
    const sumAll = rows.reduce((s, r) => s + (Number(r.points) || 0), 0);
    check(`amostra "${richest.name}" (${rows.length} resultados): world_ranking_points é o melhor-N dentro da janela, não a soma de TUDO (a menos que N já cubra tudo)`, () => {
      const actual = Number(richest.world_ranking_points) || 0;
      if (rows.length <= 22) assert.equal(actual, sumAll, `com <=22 resultados, deveria bater com a soma de tudo — actual=${actual} sumAll=${sumAll}`);
      else assert.ok(actual <= sumAll, `com >22 resultados, o total deveria ser <= soma de tudo (best-N corta o excesso) — actual=${actual} sumAll=${sumAll}`);
    });
  }

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-circuit-multi-result-accumulation: PASS');
} finally {
  await vite.close();
}
