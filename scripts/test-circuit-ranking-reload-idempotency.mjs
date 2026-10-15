// Playthrough 5.4, TESTE 11/Parte X — persistência ao "recarregar": chama
// `processWorldCircuit` MAIS UMA VEZ, pro MESMO intervalo de datas (janela
// de 0 dias, exatamente o que aconteceria se o app fosse reaberto sem
// avançar o relógio), depois que a temporada inteira já rodou. Nenhum
// torneio novo se resolve nesse intervalo — chamar de novo não pode
// duplicar pontos, mudar ranking_position, nem criar linhas
// AthleteRankingResult novas (idempotência real, não só "não crasha").
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_IDEMPOTENCY_YEARS || 1);
let beforeReload = null; let afterReload = null;

const sim = await runHeadlessWorldSimulation({
  years, label: 'reload-idempotent', trackWeeklyDraws: false, includeRankingResults: true,
  onBeforeClose: async ({ localGame, profile, processWorldCircuit, date }) => {
    const beforeAthletes = await localGame.entities.AthleteProfile.list(null, 5000);
    const beforeResults = await localGame.entities.AthleteRankingResult.list(null, 60000);
    beforeReload = {
      athleteCount: beforeAthletes.length,
      resultCount: beforeResults.length,
      sample: beforeAthletes.slice(0, 50).map((a) => ({ id: a.id, points: a.world_ranking_points, rank: a.ranking_position })),
    };
    // Simula um "recarregar sem avançar o relógio" — mesma data de início e
    // fim, exatamente como o app chamaria no load sem novos dias passados.
    await processWorldCircuit(profile, date, date).catch(() => null);
    await processWorldCircuit(profile, date, date).catch(() => null);
    const afterAthletes = await localGame.entities.AthleteProfile.list(null, 5000);
    const afterResults = await localGame.entities.AthleteRankingResult.list(null, 60000);
    afterReload = {
      athleteCount: afterAthletes.length,
      resultCount: afterResults.length,
      sample: afterAthletes.slice(0, 50).map((a) => ({ id: a.id, points: a.world_ranking_points, rank: a.ranking_position })),
    };
  },
});

console.log(`=== simulação: ${years} temporada(s) — ${sim.athletes.length} atletas finais ===`);
console.log(`antes do "recarregar" x2: ${beforeReload.athleteCount} atletas, ${beforeReload.resultCount} linhas de resultado`);
console.log(`depois do "recarregar" x2: ${afterReload.athleteCount} atletas, ${afterReload.resultCount} linhas de resultado`);

check('recarregar não muda a contagem de atletas', () => {
  assert.equal(afterReload.athleteCount, beforeReload.athleteCount);
});
check('recarregar (chamar processWorldCircuit de novo, janela de 0 dias) não cria linhas AthleteRankingResult novas', () => {
  assert.equal(afterReload.resultCount, beforeReload.resultCount, `${beforeReload.resultCount} → ${afterReload.resultCount}`);
});

const beforeById = new Map(beforeReload.sample.map((a) => [a.id, a]));
let pointsDrift = 0; let rankDrift = 0;
for (const after of afterReload.sample) {
  const before = beforeById.get(after.id);
  if (!before) continue;
  if (Number(before.points) !== Number(after.points)) pointsDrift += 1;
  if (Number(before.rank) !== Number(after.rank)) rankDrift += 1;
}
console.log(`amostra de 50 atletas: ${pointsDrift} com pontos alterados, ${rankDrift} com rank alterado após recarregar 2x`);

check('recarregar 2x não altera world_ranking_points de nenhum atleta da amostra (idempotência real)', () => {
  assert.equal(pointsDrift, 0, `${pointsDrift}/50 atletas tiveram pontos alterados só por recarregar sem avançar o relógio`);
});
check('recarregar 2x não altera ranking_position de nenhum atleta da amostra', () => {
  assert.equal(rankDrift, 0, `${rankDrift}/50 atletas tiveram rank alterado só por recarregar sem avançar o relógio`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-circuit-ranking-reload-idempotency: PASS');
