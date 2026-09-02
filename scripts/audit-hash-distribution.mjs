#!/usr/bin/env node
/**
 * Fase 1C — Distribuição do hash FNV-1a-variante usado em produção.
 *
 * Achado da Fase 0.1: aiPartnershipLifecycle.js's selectPair() ordena os
 * atletas livres por hash(`${month}:${pairIndex}:${athlete.id}`) para
 * escolher a "âncora" de cada par. Trocar o ESQUEMA de id (curto/legível vs.
 * o formato longo que makeId() realmente produz em produção,
 * `${prefix}-${Date.now()}-${random6}`) mudou drasticamente o resultado
 * (0/24 vs 22/24 pares reais-reais), com tudo mais igual. Este script isola
 * a causa: gera 10.000 ids no FORMATO DE PRODUÇÃO real (usando a mesma
 * makeId() de CareerEntityRepository.js, não uma imitação), roda pelo MESMO
 * hash() de aiPartnershipLifecycle.js, e reporta a distribuição.
 *
 * NÃO aplica nenhuma correção — apenas mede e relata (achado 1C do pedido
 * Fase 0.2). A troca do hash, se confirmada necessária, precisa ser medida
 * contra a baseline oficial, que ainda não existe.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1] || 'reports/real-athletes-audit';
const N = Number(process.argv.find((a) => a.startsWith('--n='))?.split('=')[1] || 10000);
const BUCKETS = 256; // hash % 256 — granularidade suficiente pra ver concentração sem ficar ruidoso demais

// === hash() idêntico ao de aiPartnershipLifecycle.js / WorldTourLifecycle.js / etc. ===
function hash(text) {
  let value = 2166136261;
  for (const char of String(text || '')) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

// === makeId() idêntico ao de CareerEntityRepository.js ===
function makeId(prefix = 'entity') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function bucketCounts(values, bucketCount) {
  const counts = new Array(bucketCount).fill(0);
  for (const v of values) counts[v % bucketCount] += 1;
  return counts;
}

function summarizeBuckets(counts, n) {
  const expected = n / counts.length;
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const emptyBuckets = counts.filter((c) => c === 0).length;
  // qui-quadrado contra distribuição uniforme — sinaliza concentração real,
  // não só ruído de amostragem pequena.
  const chiSquare = counts.reduce((sum, c) => sum + ((c - expected) ** 2) / expected, 0);
  // graus de liberdade = buckets-1; para 255 df, p<0.001 fica perto de chiSquare~330,
  // p<0.05 perto de ~293. Não precisamos do p exato — só do tamanho do desvio.
  return { expected: Number(expected.toFixed(2)), max, min, emptyBuckets, chiSquare: Number(chiSquare.toFixed(1)) };
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // --- 1) ids "soltos", formato de produção real (makeId('athleteprofile')) ---
  const ids = [];
  for (let i = 0; i < N; i += 1) ids.push(makeId('athleteprofile'));
  const idHashes = ids.map((id) => hash(id));
  const idBuckets = bucketCounts(idHashes, BUCKETS);
  const idSummary = summarizeBuckets(idBuckets, N);

  // --- 2) o hash como É USADO de fato em selectPair(): hash(`${month}:${pairIndex}:${id}`) ---
  // Mesmos 10.000 ids, mas simulando 8 pairIndex (0-7, o teto real de
  // targetPairs) dentro de UM mês fixo — é exatamente essa chave que decide
  // quem vira "âncora" primeiro em cada rodada de pareamento.
  const month = '2026-01';
  const selectPairScores = [];
  for (let pairIndex = 0; pairIndex < 8; pairIndex += 1) {
    for (const id of ids) selectPairScores.push(hash(`${month}:${pairIndex}:${id}`));
  }
  const spBuckets = bucketCounts(selectPairScores, BUCKETS);
  const spSummary = summarizeBuckets(spBuckets, selectPairScores.length);

  // --- 3) controle: mesmos 10.000 índices, mas com ids "curtos" tipo bot_id
  // (athlete_arturo_coello-style / ranking-bot-NNNN) — é o formato que a
  // Fase 0.1 mostrou produzir pareamento saudável, serve de comparação. ---
  const shortIds = Array.from({ length: N }, (_, i) => `athlete-legacy-${String(i).padStart(5, '0')}`);
  const shortHashes = shortIds.map((id) => hash(id));
  const shortBuckets = bucketCounts(shortHashes, BUCKETS);
  const shortSummary = summarizeBuckets(shortBuckets, N);

  // --- 4) diagnóstico de causa: quanto do id é PREFIXO COMPARTILHADO? ---
  // Ids de produção nascem em rajada (bulkCreate/loop síncrono) — muitos
  // Date.now() iguais ou a poucos ms de distância. Mede quantos dos 10.000
  // ids compartilham o mesmo timestamp de milissegundo.
  const timestampCounts = new Map();
  for (const id of ids) {
    const ts = id.split('-')[1];
    timestampCounts.set(ts, (timestampCounts.get(ts) || 0) + 1);
  }
  const uniqueTimestamps = timestampCounts.size;
  const maxIdsPerTimestamp = Math.max(...timestampCounts.values());

  // --- 5) o teste que realmente explica o achado da Fase 0.1: NÃO é
  // dispersão marginal do hash (testada acima, e que já saiu razoável) — é
  // CORRELAÇÃO entre ordem de criação e posição no sort. Em produção, os 24
  // reais nascem PRIMEIRO, um de cada vez, via create() sequencial (await
  // por chamada — Date.now() avança entre eles); os procedurais nascem
  // DEPOIS, em um bulkCreate() só, num laço síncrono (por isso os 2.324
  // ids compartilhando o mesmo ms no teste #4 acima). Isso faz o PREFIXO de
  // timestamp dos 24 reais ser sistematicamente MENOR (mais cedo) que o dos
  // procedurais. Se essa diferença de prefixo empurra o hash de forma
  // consistente (não aleatória) para um lado da ordenação, os reais viram
  // sistematicamente âncoras tardias (ou nunca-âncoras) todo mês — é isso,
  // não a uniformidade marginal, que explica 0/24 pares reais-reais.
  const realCohort = [];
  for (let i = 0; i < 24; i += 1) { realCohort.push(makeId('athleteprofile')); await new Promise((r) => setTimeout(r, 2)); }
  const proceduralCohort = [];
  for (let i = 0; i < 970; i += 1) proceduralCohort.push(makeId('athleteprofile')); // laço síncrono, igual bulkCreate
  // Cenário de comparação: mesmos 24 "reais", mas com id CURTO/legível (o
  // formato que a Fase 0.1 mostrou produzir pareamento saudável), contra o
  // MESMO pool procedural de produção — isola só o formato do id dos reais.
  const realCohortShort = Array.from({ length: 24 }, (_, i) => `athlete_real_${i}`);

  // Amostra grande o bastante pra ter poder estatístico: com 994
  // candidatos e 24 reais, a chance de âncora "sem viés" é só ~2.4% por
  // sorteio — com poucos sorteios o ruído de amostragem domina qualquer
  // sinal. 300 meses × 8 pairIndex = 2400 sorteios -> ~58 âncoras
  // esperadas, o suficiente para separar sinal de ruído.
  const monthsToSample = 300;
  const pairIndexesToSample = 8;

  function runCohortTrial(realIds) {
    const allIds = [...realIds, ...proceduralCohort];
    const realSet = new Set(realIds);
    let rankSum = 0;
    let rankCount = 0;
    let anchorCount = 0;
    for (let m = 0; m < monthsToSample; m += 1) {
      const monthKey = `2026-${String((m % 12) + 1).padStart(2, '0')}-y${Math.floor(m / 12)}`;
      for (let pairIndex = 0; pairIndex < pairIndexesToSample; pairIndex += 1) {
        // Pré-computa o hash de cada id UMA vez (994 chamadas), em vez de
        // recomputar dentro do comparator (que o sort chamaria O(n log n)
        // vezes) — mesmo resultado de selectPair(), ~10x mais rápido.
        const scored = allIds.map((id) => ({ id, score: hash(`${monthKey}:${pairIndex}:${id}`) }));
        scored.sort((a, b) => a.score - b.score);
        if (realSet.has(scored[0].id)) anchorCount += 1;
        scored.forEach(({ id }, rank) => { if (realSet.has(id)) { rankSum += rank; rankCount += 1; } });
      }
    }
    return { anchorCount, rankSum, rankCount };
  }

  const prodTrial = runCohortTrial(realCohort);
  const shortTrial = runCohortTrial(realCohortShort);

  const totalDraws = monthsToSample * pairIndexesToSample;
  const expectedAnchorShare = 24 / (24 + 970); // se o real fosse escolhido com a MESMA chance que qualquer atleta
  const expectedAvgRank = (24 + 970 - 1) / 2; // rank médio esperado se a ordenação fosse uniforme/sem viés por coorte
  const observedAnchorShare = prodTrial.anchorCount / totalDraws;
  const observedAvgRank = prodTrial.rankCount ? prodTrial.rankSum / prodTrial.rankCount : null;
  const shortAnchorShare = shortTrial.anchorCount / totalDraws;
  const shortAvgRank = shortTrial.rankCount ? shortTrial.rankSum / shortTrial.rankCount : null;
  // Teste binomial aproximado: sob H0 (sem viés de coorte), cada sorteio
  // tem prob. expectedAnchorShare de a âncora sair do grupo dos 24 reais,
  // independente entre sorteios — dá um z-score pra separar sinal de ruído.
  const binomialSd = Math.sqrt(expectedAnchorShare * (1 - expectedAnchorShare) * totalDraws);
  const zApprox = binomialSd > 0 ? (prodTrial.anchorCount - expectedAnchorShare * totalDraws) / binomialSd : null;

  const report = {
    generatedAt: new Date().toISOString(),
    n: N,
    buckets: BUCKETS,
    hashFn: 'FNV-1a variante (aiPartnershipLifecycle.js/WorldTourLifecycle.js/etc.) — value=2166136261; XOR char code; Math.imul(value,16777619)',
    productionIdFormat: {
      sample: ids.slice(0, 5),
      note: 'makeId(entityName.toLowerCase()) de CareerEntityRepository.js — usado para TODA entidade sem .id explícito (reais e procedurais igualmente).',
      uniqueTimestampsMs: uniqueTimestamps,
      maxIdsSharingSameTimestampMs: maxIdsPerTimestamp,
    },
    rawIdHashDistribution: { ...idSummary, sampleBuckets: idBuckets },
    selectPairKeyDistribution: {
      ...spSummary,
      note: 'hash(`${month}:${pairIndex}:${id}`) para pairIndex 0-7 — a chave de ordenação real usada por selectPair() para escolher a âncora de cada par.',
      sampleBuckets: spBuckets,
    },
    shortIdControlDistribution: {
      ...shortSummary,
      note: 'Controle: mesmo N, ids curtos estilo bot_id/legacy (o formato que a Fase 0.1 mostrou produzir pareamento saudável).',
      sampleBuckets: shortBuckets,
    },
    creationOrderCohortBias: {
      note: '24 ids "reais" criados sequencialmente (create() com pequeno delay, como em produção) vs. 970 "procedurais" criados num laço síncrono só (como bulkCreate), comparado lado a lado com os MESMOS 24 reais usando id curto/legível — isola o efeito do FORMATO do id dos reais sobre a chance de virar âncora em selectPair(), o mecanismo real por trás do achado 0/24 da Fase 0.1.',
      totalDraws,
      expectedAnchorShareIfUnbiased: Number(expectedAnchorShare.toFixed(4)),
      expectedAvgRankIfUnbiased: Number(expectedAvgRank.toFixed(1)),
      productionFormatReals: {
        observedAnchorShare: Number(observedAnchorShare.toFixed(4)),
        anchorCount: prodTrial.anchorCount,
        observedAvgRank: observedAvgRank == null ? null : Number(observedAvgRank.toFixed(1)),
        zScoreVsExpected: zApprox == null ? null : Number(zApprox.toFixed(2)),
      },
      shortIdReals: {
        observedAnchorShare: Number(shortAnchorShare.toFixed(4)),
        anchorCount: shortTrial.anchorCount,
        observedAvgRank: shortAvgRank == null ? null : Number(shortAvgRank.toFixed(1)),
      },
    },
  };

  await fs.writeFile(path.join(OUT_DIR, 'hash-distribution-report.json'), JSON.stringify(report, null, 2));

  console.log('=== Fase 1C — distribuição do hash de produção ===');
  console.log(`ids gerados: ${N}, timestamps de ms únicos: ${uniqueTimestamps} (max ${maxIdsPerTimestamp} ids no mesmo ms)`);
  console.log('');
  console.log(`hash(id) puro        — esperado/bucket=${idSummary.expected}, min=${idSummary.min}, max=${idSummary.max}, buckets vazios=${idSummary.emptyBuckets}/${BUCKETS}, qui²=${idSummary.chiSquare}`);
  console.log(`selectPair key       — esperado/bucket=${spSummary.expected}, min=${spSummary.min}, max=${spSummary.max}, buckets vazios=${spSummary.emptyBuckets}/${BUCKETS}, qui²=${spSummary.chiSquare}`);
  console.log(`controle (id curto)  — esperado/bucket=${shortSummary.expected}, min=${shortSummary.min}, max=${shortSummary.max}, buckets vazios=${shortSummary.emptyBuckets}/${BUCKETS}, qui²=${shortSummary.chiSquare}`);
  console.log('');
  console.log(`=== viés por coorte de criação (24 reais vs. 970 procedurais, ${totalDraws} sorteios) ===`);
  console.log(`chance de âncora esperada sem viés: ${(expectedAnchorShare * 100).toFixed(2)}% | rank médio esperado sem viés: ${expectedAvgRank.toFixed(1)}`);
  console.log(`  reais c/ id de PRODUÇÃO: ${(observedAnchorShare * 100).toFixed(2)}% âncora (${prodTrial.anchorCount}/${totalDraws}, z=${zApprox?.toFixed(2)}) | rank médio ${observedAvgRank?.toFixed(1)}`);
  console.log(`  reais c/ id CURTO:       ${(shortAnchorShare * 100).toFixed(2)}% âncora (${shortTrial.anchorCount}/${totalDraws}) | rank médio ${shortAvgRank?.toFixed(1)}`);
  console.log('');
  console.log(`Relatório completo: ${path.join(OUT_DIR, 'hash-distribution-report.json')}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
