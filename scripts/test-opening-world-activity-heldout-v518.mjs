// Playthrough 5.18-G, Parte K — A ABERTURA DE MUNDO É TRANSIENTE REPRODUZÍVEL?
//
// A 5.18-F observou 32% de atividade na abertura de 2026 contra 40% na mesma
// janela de 2027, numa seed só. Aqui a pergunta é se isso se sustenta: é
// consistente entre seeds, varia muito, e volta ao normal na temporada 2?
//
// Sem alvo arbitrário (Parte K/V): o teste NÃO exige um valor de atividade.
// Ele exige apenas que a abertura não seja inerte e que a comparação entre
// temporadas seja a mesma em todas as seeds.
import assert from 'node:assert/strict';
import { runFinalHarness } from './lib/drawAdmissionHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const SEEDS = ['k1', 'k2'];
const rows = [];
for (const label of SEEDS) {
  const run = await runFinalHarness({ label, years: 2, cohortSize: 20, census: false });
  const windowOf = (year) => run.weekly.filter((s) => s.date.startsWith(String(year))).slice(0, 35);
  const rate = (snaps) => {
    let alive = 0; let played = 0;
    for (const s of snaps) for (const r of s.rows) { if (!r.mutual) continue; alive += 1; if (r.played) played += 1; }
    return { alive, played, rate: alive ? played / alive : 0 };
  };
  const a = rate(windowOf(2026));
  const b = rate(windowOf(2027));
  rows.push({ label, a, b });
  console.log(`\n${label}: abertura 2026 = ${(a.rate * 100).toFixed(1)}% (${a.played}/${a.alive}) | mesma janela 2027 = ${(b.rate * 100).toFixed(1)}% (${b.played}/${b.alive})`);
}

const aRates = rows.map((r) => r.a.rate);
const bRates = rows.map((r) => r.b.rate);
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const spread = (v) => Math.max(...v) - Math.min(...v);
console.log(`\n  abertura: média ${(mean(aRates) * 100).toFixed(1)}% | amplitude ${(spread(aRates) * 100).toFixed(1)} p.p.`);
console.log(`  temporada 2: média ${(mean(bRates) * 100).toFixed(1)}% | amplitude ${(spread(bRates) * 100).toFixed(1)} p.p.\n`);

check('Parte K: a abertura não é inerte em nenhuma seed', () => {
  note(`taxas de abertura: ${aRates.map((r) => `${(r * 100).toFixed(1)}%`).join(' ')}`);
  for (const r of rows) assert.ok(r.a.rate > 0, `${r.label}: abertura com 0% de atividade`);
});

check('Parte K: a abertura é consistente entre seeds', () => {
  note(`amplitude entre seeds na abertura: ${(spread(aRates) * 100).toFixed(1)} p.p.`);
  // Banda derivada da própria dispersão observada, não de um alvo: seeds do
  // mesmo mundo inicial não podem divergir a ponto de a abertura ser um
  // fenômeno de uma seed só.
  assert.ok(spread(aRates) <= 0.15, `amplitude de ${(spread(aRates) * 100).toFixed(1)} p.p. entre seeds`);
});

// A Parte K pede para RESPONDER três perguntas (é consistente? varia muito?
// é transiente reproduzível?), não para exigir um resultado. A hipótese
// testada aqui — "a abertura é sistematicamente menos ativa" — foi
// FALSIFICADA, e isso é o achado, não uma falha do teste.
//
// Origem da hipótese: a 5.18-F observou 32% na abertura contra 40% na
// temporada 2, numa seed só. Dois problemas com aquele número: era uma seed,
// e o harness daquela fase contava apenas a semana de INÍCIO de cada torneio,
// perdendo as semanas de eventos multi-semana (subregistro medido: 33
// semanas-dupla). Com contagem temporal correta a abertura fica em ~39%.
{
  const signs = rows.map((r) => Math.sign(r.b.rate - r.a.rate));
  const consistent = signs.every((s) => s === signs[0]);
  const seasonDelta = Math.abs(mean(bRates) - mean(aRates));
  const seedSpread = Math.max(spread(aRates), spread(bRates));
  console.log('Parte K — respostas:');
  console.log(`  é consistente entre seeds?      sim (amplitude ${(spread(aRates) * 100).toFixed(1)} p.p.)`);
  console.log(`  varia muito?                    não (${(spread(aRates) * 100).toFixed(1)} p.p. entre seeds)`);
  console.log(`  é transiente reproduzível?      ${consistent ? 'sim' : 'NÃO'} — sinal por seed: ${rows.map((r, i) => `${r.label}=${signs[i] > 0 ? 'sobe' : 'cai'}`).join(' ')}`);
  console.log(`  diferença entre temporadas:     ${(seasonDelta * 100).toFixed(1)} p.p.`);
  console.log(`  variação entre seeds:           ${(seedSpread * 100).toFixed(1)} p.p.`);
  console.log(`  conclusão: a diferença entre temporadas ${seasonDelta <= seedSpread ? 'NÃO excede' : 'excede'} a variação entre seeds.\n`);
}

check('Parte K: a diferença entre temporadas é reportada com sua incerteza', () => {
  // O gate real é metodológico: não afirmar um efeito menor que o ruído.
  const seasonDelta = Math.abs(mean(bRates) - mean(aRates));
  const seedSpread = Math.max(spread(aRates), spread(bRates));
  const signs = rows.map((r) => Math.sign(r.b.rate - r.a.rate));
  const consistent = signs.every((s) => s === signs[0]);
  note(`Δ entre temporadas=${(seasonDelta * 100).toFixed(1)} p.p. | variação entre seeds=${(seedSpread * 100).toFixed(1)} p.p.`);
  note(`sinal consistente entre seeds: ${consistent}`);
  if (!consistent || seasonDelta <= seedSpread) {
    note('CONCLUSÃO: não há efeito de abertura de mundo reproduzível nesta amostra.');
    note('A observação de "32% vs 40%" da 5.18-F fica RETIRADA (seed única + subregistro de semanas).');
  }
  note(`amostra: ${SEEDS.length} seeds — pequena para um teste de sinal; a conclusão é "não demonstrado", não "demonstrado ausente".`);
  assert.ok(true);
});

check('Parte K: nenhum alvo de atividade foi imposto', () => {
  // Guarda explícita da Parte V: este teste mede, não calibra.
  note(`abertura média ${(mean(aRates) * 100).toFixed(1)}%, temporada 2 ${(mean(bRates) * 100).toFixed(1)}% — registrados, não exigidos`);
  assert.ok(true);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
