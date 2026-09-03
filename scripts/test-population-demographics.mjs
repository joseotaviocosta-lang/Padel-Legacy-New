// Fase 2C — valida a pirâmide etária e a distribuição de nacionalidade da
// população gerada (100 reais + 900 procedurais).
const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { getRealAthleteRegistry } = await vite.ssrLoadModule('/src/players/realAthleteRegistry.js');
  const { buildSupplementalRankingPopulation, WORLD_RANKING_TARGET } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');

  const reals = getRealAthleteRegistry();
  const supplemental = buildSupplementalRankingPopulation(reals, []);
  console.log(`reais: ${reals.length}, procedurais gerados: ${supplemental.athletes.length}, total: ${reals.length + supplemental.athletes.length}`);

  const all = [...reals, ...supplemental.athletes];
  const buckets = { '17-20': 0, '21-24': 0, '25-28': 0, '29-32': 0, '33-36': 0, '37+': 0 };
  for (const a of all) {
    const age = Number(a.age);
    if (age <= 20) buckets['17-20'] += 1;
    else if (age <= 24) buckets['21-24'] += 1;
    else if (age <= 28) buckets['25-28'] += 1;
    else if (age <= 32) buckets['29-32'] += 1;
    else if (age <= 36) buckets['33-36'] += 1;
    else buckets['37+'] += 1;
  }
  console.log('\n=== pirâmide etária (meta: 150/220/240/210/130/50) ===');
  console.log(Object.entries(buckets).map(([k, v]) => `${k}:${v}`).join(' '));

  function countryBreakdown(rows, label) {
    const counts = {};
    for (const r of rows) counts[r.country] = (counts[r.country] || 0) + 1;
    const total = rows.length;
    const espArg = ((counts.Espanha || 0) + (counts.Argentina || 0)) / total * 100;
    console.log(`\n=== nacionalidade ${label} (n=${total}) — ESP+ARG=${espArg.toFixed(1)}% ===`);
    console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(' '));
    return espArg;
  }

  countryBreakdown(reals, 'top 100 (reais)');
  const pos101to400 = supplemental.athletes.slice(0, 300); // absoluteRank 101-400
  const espArg101 = countryBreakdown(pos101to400, '101-400');
  // "cai progressivamente de ~82% para ~50%" descreve os EXTREMOS do
  // intervalo 401-1000, não a média do intervalo inteiro (que fica no
  // meio do caminho, ~65-70%, exatamente porque é progressivo) — valida
  // as pontas: logo depois de 400 (perto de 82%) e perto de 1000 (perto
  // de 50%).
  const posNear401 = supplemental.athletes.slice(300, 400); // absoluteRank ~401-500
  const posNear1000 = supplemental.athletes.slice(800); // absoluteRank ~901-1000
  const espArgNear401 = countryBreakdown(posNear401, '~401-500 (início da diversificação)');
  const espArgNear1000 = countryBreakdown(posNear1000, '~901-1000 (fim da diversificação)');

  const brCount = supplemental.athletes.filter((a) => a.country === 'Brasil').length;
  console.log(`\nBrasil na base procedural (901): ${brCount} (${(brCount / supplemental.athletes.length * 100).toFixed(1)}%)`);

  const failures = [];
  if (supplemental.athletes.length !== WORLD_RANKING_TARGET - reals.length) failures.push('contagem de procedurais errada');
  const pyramidTotal = Object.values(buckets).reduce((s, v) => s + v, 0);
  if (pyramidTotal !== 1000) failures.push(`pirâmide não soma 1000 (${pyramidTotal})`);
  for (const [key, target] of Object.entries({ '17-20': 150, '21-24': 220, '25-28': 240, '29-32': 210, '33-36': 130, '37+': 50 })) {
    if (Math.abs(buckets[key] - target) > target * 0.15 + 5) failures.push(`faixa ${key}: ${buckets[key]}, meta ${target} (fora de +-15%)`);
  }
  if (espArg101 < 70) failures.push(`101-400 deveria espelhar o topo (ESP+ARG alto), ficou em ${espArg101.toFixed(1)}%`);
  if (espArgNear401 < 70) failures.push(`~401-500 deveria estar perto de 82%, ficou em ${espArgNear401.toFixed(1)}%`);
  if (espArgNear1000 > 60 || espArgNear1000 < 40) failures.push(`~901-1000 deveria estar perto de 50%, ficou em ${espArgNear1000.toFixed(1)}%`);
  if (brCount < 30) failures.push(`representação brasileira baixa na base: ${brCount}`);

  if (failures.length) {
    console.log('\nFAIL:');
    for (const f of failures) console.log(' -', f);
    process.exitCode = 1;
  } else {
    console.log('\nPASS — pirâmide etária dentro da tolerância, nacionalidade espelha o topo em 101-400 e diversifica até 1000, representação brasileira presente.');
  }
} finally {
  await vite.close();
}
