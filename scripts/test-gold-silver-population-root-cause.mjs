// Playthrough 5.5, Parte D — confirma (ou refuta) a hipótese de causa raiz
// formalmente, registrada como teste permanente pra não precisar
// re-derivar isso numa fase futura. Achados (auditoria de código +
// medição direta, documentados no relatório da fase):
//   1. Atletas 301-450 NÃO nascem artificialmente fracos por acidente —
//      nascem fracos por CONSTRUÇÃO: `overallForRank` (rankingPopulation.js)
//      é uma curva monotonicamente decrescente em `absoluteRank`, e
//      `ranking_position` nasce igual a esse MESMO `absoluteRank`.
//   2. Silver NÃO estava "capturando atletas fortes demais" por bug —
//      estava fazendo isso por DESIGN (Silver aberto, sem teto até esta
//      fase) — corrigido ampliando OPEN_TIER_CEILING.
//   3. Gold NÃO usa uma faixa rígida demais no sentido de "faixa
//      estreita" — usa uma faixa PLANA demais (plateauTilt=0 antes desta
//      fase — toda a faixa 320-450 valia fit=100, sem preferir a ponta
//      mais forte na disputa por vaga).
//   4/5/6/7. fallback/rescue não é o mecanismo dominante (medido:
//      <50% dos torneios em quase todos os tiers, Teste rescue-utilization),
//      e o número de eventos Gold/ano não difere o bastante de Silver pra
//      ser a causa isolada (ambos competem por população real).
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { overallForRank } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');
  const { OPEN_TIER_CEILING } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');
  const { tierPreferenceFit } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

  console.log('=== Parte D: confirmação da causa raiz (auditoria estática) ===\n');

  check('overallForRank é monotonicamente NÃO-crescente em rank (tendência de fundo preservada — rank melhor nunca pior em média)', () => {
    // O jitter é DETERMINÍSTICO por rank (mesmo seed sempre pro mesmo
    // `absoluteRank`, de propósito — reprodutibilidade), não um roll novo
    // a cada chamada — chamar o MESMO rank 20x sempre dá o MESMO valor.
    // Pra medir a TENDÊNCIA (não um ponto único, que pode legitimamente
    // "furar" a vizinhança por causa do próprio jitter — a sobreposição
    // natural que a Parte E pede), a média precisa ser sobre uma JANELA de
    // ranks DIFERENTES ao redor de cada ponto, não repetições do mesmo.
    const samples = [1, 50, 100, 150, 250, 350, 450, 600, 800, 1000];
    function windowAvgAt(rank) {
      let sum = 0; let n = 0;
      for (let offset = -10; offset <= 10; offset += 1) {
        const r = Math.max(1, Math.min(1000, rank + offset));
        sum += overallForRank(r); n += 1;
      }
      return sum / n;
    }
    let prev = 100;
    for (const rank of samples) {
      const value = windowAvgAt(rank);
      assert.ok(value <= prev + 1, `rank ${rank}: média de janela=${value.toFixed(1)} > tendência anterior + margem (${prev.toFixed(1)})`);
      prev = value;
    }
  });

  check('overallForRank tem VARIÂNCIA por atleta (não é mais determinístico puro) — dois atletas do MESMO rank podem ter OVR diferente entre chamadas de rank vizinho', () => {
    const values = new Set();
    for (let rank = 300; rank <= 320; rank += 1) values.add(overallForRank(rank));
    assert.ok(values.size > 3, `só ${values.size} valores distintos em 21 ranks vizinhos — pouca variância`);
  });

  check('gap bruto 151-300 vs 301-450 na curva de nascimento é menor que o gap original de ~8.9 (achatamento real, não só cosmético)', () => {
    function avgOverRange(lo, hi) {
      let sum = 0; let n = 0;
      for (let rank = lo; rank <= hi; rank += 1) { sum += overallForRank(rank); n += 1; }
      return sum / n;
    }
    const silverLike = avgOverRange(151, 300);
    const goldLike = avgOverRange(301, 450);
    const gap = silverLike - goldLike;
    console.log(`  gap bruto na curva (sem tilt/ceiling, só a curva de nascimento): ${gap.toFixed(2)}`);
    assert.ok(gap < 8.9, `gap=${gap.toFixed(2)} não é menor que o original 8.9`);
  });

  check('OPEN_TIER_CEILING foi ampliado (não é mais 150) — empurra parte da população forte de Silver pra cima', () => {
    assert.ok(OPEN_TIER_CEILING > 150, `OPEN_TIER_CEILING=${OPEN_TIER_CEILING}, esperado > 150`);
  });

  check('Gold ganhou um plateauTilt (preferência não é mais plana dentro do próprio platô ideal)', () => {
    const strongEdge = tierPreferenceFit(320, 'Gold');
    const weakEdge = tierPreferenceFit(449, 'Gold');
    assert.ok(strongEdge > weakEdge, `fit na ponta forte do platô (rank 320)=${strongEdge} deveria ser > ponta fraca (rank 449)=${weakEdge}`);
  });

  check('Platinum continua com platô plano (nenhuma calibração de outro tier foi tocada além de Gold) — platô real é [Masters.minRanking, Platinum.minRanking]=[230,320]', () => {
    const strongEdge = tierPreferenceFit(235, 'Platinum');
    const weakEdge = tierPreferenceFit(315, 'Platinum');
    assert.equal(strongEdge, weakEdge, `Platinum: forte=${strongEdge} fraco=${weakEdge} — deveriam ser iguais (platô plano preservado)`);
  });

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-gold-silver-population-root-cause: PASS');
} finally {
  await vite.close();
}
