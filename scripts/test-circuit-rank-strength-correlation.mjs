// Playthrough 5.4, TESTE 3/Parte H — correlação de Spearman entre
// `ranking_position` (menor = melhor) e `overall_rating` (maior = melhor)
// na população inteira, ao fim de uma temporada simulada. Expectativa
// (Parte I): resultado deve ser autoridade sobre OVR (um atleta de OVR
// menor PODE rankear acima via resultados melhores — correlação nunca
// precisa ser perfeita), mas a correlação AGREGADA deve ser
// "monotonicamente plausível" — direção correta (rank melhor ~ OVR maior)
// e magnitude moderada/forte, não ausente nem invertida.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

function spearman(pairs) {
  // pairs: [[x, y], ...] — rankeia cada coluna independentemente, aplica
  // Pearson nos ranks (empates via rank médio).
  function ranksOf(values) {
    const indexed = values.map((v, i) => [v, i]);
    indexed.sort((a, b) => a[0] - b[0]);
    const ranks = new Array(values.length);
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j + 1 < indexed.length && indexed[j + 1][0] === indexed[i][0]) j += 1;
      const avgRank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) ranks[indexed[k][1]] = avgRank;
      i = j + 1;
    }
    return ranks;
  }
  const xs = pairs.map((p) => p[0]); const ys = pairs.map((p) => p[1]);
  const rx = ranksOf(xs); const ry = ranksOf(ys);
  const n = pairs.length;
  const meanRx = rx.reduce((s, v) => s + v, 0) / n; const meanRy = ry.reduce((s, v) => s + v, 0) / n;
  let cov = 0; let varX = 0; let varY = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (rx[i] - meanRx) * (ry[i] - meanRy);
    varX += (rx[i] - meanRx) ** 2;
    varY += (ry[i] - meanRy) ** 2;
  }
  return cov / Math.sqrt(varX * varY);
}

const years = Number(process.env.PADEL_CORRELATION_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'rank-strength-corr', trackWeeklyDraws: false });

const ranked = sim.athletes.filter((a) => Number(a.ranking_position) > 0 && Number(a.overall_rating) > 0);
console.log(`=== simulação: ${years} temporada(s), ${ranked.length} atletas com rank e OVR válidos ===\n`);

// rank invertido (1/rank_position) pra que "maior = melhor" nos dois eixos
// — mais intuitivo pro sinal do coeficiente (positivo = alinhado).
const pairs = ranked.map((a) => [1 / Number(a.ranking_position), Number(a.overall_rating)]);
const rho = spearman(pairs);
console.log(`Spearman rho (1/rank_position vs overall_rating): ${rho.toFixed(3)}`);

// Faixas de referência (por bucket de rank) pra contexto visual, sem
// virar checagem própria (Parte G tem seu próprio teste dedicado).
const buckets = [[1, 50], [51, 100], [101, 200], [201, 300], [301, 450], [451, 600], [601, 99999]];
for (const [lo, hi] of buckets) {
  const inBucket = ranked.filter((a) => a.ranking_position >= lo && a.ranking_position <= hi);
  if (!inBucket.length) continue;
  const avgOVR = inBucket.reduce((s, a) => s + Number(a.overall_rating), 0) / inBucket.length;
  console.log(`rank ${lo}-${hi === 99999 ? '+' : hi}: n=${inBucket.length} avgOVR=${avgOVR.toFixed(1)}`);
}

check('amostra real (população rankeada > 100)', () => {
  assert.ok(ranked.length > 100, `ranked.length=${ranked.length}`);
});
check('correlação rank↔OVR tem o SINAL correto (positiva — rank melhor tende a OVR maior, não invertida)', () => {
  assert.ok(rho > 0, `rho=${rho.toFixed(3)} — correlação invertida ou nula seria uma distorção grave`);
});
check('correlação é MODERADA OU FORTE (rho > 0.25) — resultado tem autoridade real (não precisa ser perfeita, Parte I), mas rank não pode ser essencialmente independente de força', () => {
  assert.ok(rho > 0.25, `rho=${rho.toFixed(3)} — abaixo do piso de plausibilidade`);
});
// Parte I, literal: "um atleta de OVR menor PODE rankear acima via
// resultado melhor" — não exige que a correlação agregada fique abaixo de
// um teto arbitrário (rho alto é esperado e são: OVR influencia resultado,
// então os dois deveriam mesmo caminhar juntos na maior parte da
// população). O teste real de "resultado tem autoridade" é a
// possibilidade de INVERSÃO individual — existe alguma dupla de atletas
// onde o de OVR MENOR tem rank MELHOR (número menor) que um de OVR maior?
let inversions = 0;
const sampleSize = Math.min(ranked.length, 300);
const sample = ranked.slice(0, sampleSize);
for (let i = 0; i < sample.length; i += 1) {
  for (let j = i + 1; j < sample.length; j += 1) {
    const a = sample[i]; const b = sample[j];
    const aBetterRank = a.ranking_position < b.ranking_position;
    const aLowerOVR = a.overall_rating < b.overall_rating;
    if (aBetterRank && aLowerOVR) inversions += 1;
  }
}
console.log(`inversões OVR↔rank encontradas numa amostra de ${sampleSize} atletas (par com OVR menor rankeando acima de um de OVR maior): ${inversions}`);
check('existe ao menos uma inversão real (OVR menor rankeando acima de OVR maior) — resultado tem autoridade de verdade, rank não é um espelho puro de OVR (Parte I)', () => {
  assert.ok(inversions > 0, 'nenhuma inversão encontrada na amostra — rank pode estar sendo um espelho direto de OVR, sem margem pra resultado superar talento');
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-circuit-rank-strength-correlation: PASS');
