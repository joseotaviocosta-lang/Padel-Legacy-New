// Playthrough 5.18-G, Partes D/E/H/I — ADMISSÃO AUDITADA NO INSTANTE.
//
// A 5.18-F tentou auditar o corte reconstruindo a fila de fora e mediu 62% de
// deriva. Havia DOIS erros embutidos, não um:
//   - o instante era outro (fila recomputada depois do sorteio);
//   - a AUTORIDADE era outra. A reconstrução usava a semântica de
//     `applyEntryPriority`, mas quem corta no sorteio D-3 é `blendedCutScore`
//     (WorldTourLifecycle.js:588). O próprio código registra que
//     `applyEntryPriority` foi testada nesse ponto e descartada.
//
// Aqui não se reconstrói nada: a decisão é capturada quando é tomada.
// Gate central (Parte E): admitidos == os `drawSize` primeiros da ordem da
// própria autoridade. Se isso falhar, a captura não representa a decisão.
import assert from 'node:assert/strict';
import { runFinalHarness } from './lib/drawAdmissionHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const run = await runFinalHarness({ label: 'admission-snapshot', years: 1, cohortSize: 20 });
const A = run.admissions;
console.log(`\n=== ${A.length} decisões de admissão capturadas no instante do sorteio ===\n`);

// ------------------------------------------------------------- Parte E
check('Parte E: admitidos são exatamente os primeiros da ordem da autoridade', () => {
  const bad = [];
  for (const d of A) {
    const normal = d.candidates.filter((c) => !c.viaRescue);
    const admitted = normal.filter((c) => c.admitted).map((c) => c.pairId);
    const expected = normal.slice(0, Math.min(d.drawSize, normal.length)).map((c) => c.pairId);
    if (admitted.length !== expected.length || admitted.some((id, i) => id !== expected[i])) {
      bad.push(`${d.tournamentId} (${d.tier}): admitidos=${admitted.length} esperados=${expected.length}`);
    }
  }
  note(`decisões verificadas: ${A.length} | divergentes: ${bad.length}`);
  for (const b of bad.slice(0, 5)) note(`  ${b}`);
  assert.equal(bad.length, 0, bad.slice(0, 3).join(' | '));
});

check('Parte E: a captura tem deriva estruturalmente nula', () => {
  // Não há reconstrução: candidatos e admitidos saem do MESMO objeto, criado
  // dentro da decisão. A asserção protege a propriedade, não a mede.
  const withoutCandidates = A.filter((d) => !d.candidates?.length);
  note(`decisões sem lista de candidatos: ${withoutCandidates.length}`);
  assert.equal(withoutCandidates.length, 0);
});

check('Parte E: nenhum campo admite mais duplas que o tamanho da chave', () => {
  const over = A.filter((d) => d.candidates.filter((c) => c.admitted).length > d.drawSize);
  for (const o of over.slice(0, 5)) note(`  ${o.tier} ${o.tournamentId}: ${o.candidates.filter((c) => c.admitted).length} > ${o.drawSize}`);
  assert.equal(over.length, 0, `${over.length} campos acima da chave`);
});

// ------------------------------------------------------------- Parte I
const byTier = new Map();
for (const d of A) {
  if (!byTier.has(d.tier)) byTier.set(d.tier, { n: 0, queue: 0, admitted: 0, contested: 0, rescue: 0 });
  const b = byTier.get(d.tier);
  b.n += 1;
  b.queue += d.queueSize;
  b.admitted += d.candidates.filter((c) => c.admitted).length;
  if (d.queueSize > d.drawSize) b.contested += 1;
  if (d.rescue.triggered) b.rescue += 1;
}
console.log(`${'tier'.padEnd(10)}${'eventos'.padEnd(9)}${'filaMédia'.padEnd(11)}${'admMédia'.padEnd(10)}${'disputados'.padEnd(12)}${'resgates'}`);
for (const [tier, b] of [...byTier].sort((x, y) => y[1].n - x[1].n)) {
  console.log(`${tier.padEnd(10)}${String(b.n).padEnd(9)}${(b.queue / b.n).toFixed(1).padEnd(11)}${(b.admitted / b.n).toFixed(1).padEnd(10)}${String(b.contested).padEnd(12)}${b.rescue}`);
}
console.log('');

check('Parte I: a instrumentação cobre vários tiers, não só Masters', () => {
  note(`tiers observados: ${[...byTier.keys()].join(', ')}`);
  assert.ok(byTier.size >= 4, `só ${byTier.size} tiers observados`);
});

// ------------------------------------------------------------- Parte H
const masters = A.filter((d) => d.tier === 'Masters');
console.log(`=== Parte H — Masters (${masters.length} eventos, chave fixa 24) ===\n`);
let mTop10In = 0; let mTop10Adm = 0; let mTop20In = 0; let mTop20Adm = 0;
for (const d of masters) {
  const top10 = d.candidates.filter((c) => c.teamRank && c.teamRank <= 10);
  const top20 = d.candidates.filter((c) => c.teamRank && c.teamRank <= 20);
  mTop10In += top10.length; mTop10Adm += top10.filter((c) => c.admitted).length;
  mTop20In += top20.length; mTop20Adm += top20.filter((c) => c.admitted).length;
}
note(`Masters: chave=${[...new Set(masters.map((d) => d.drawSize))].join('/')} | fila média=${masters.length ? (masters.reduce((s, d) => s + d.queueSize, 0) / masters.length).toFixed(1) : '—'}`);
note(`Top10 no pool: ${mTop10In} | admitidos: ${mTop10Adm}`);
note(`Top20 no pool: ${mTop20In} | admitidos: ${mTop20Adm}`);
const excluded = [];
for (const d of masters) {
  for (const c of d.candidates) {
    if (!c.admitted && c.teamRank && c.teamRank <= 20) {
      excluded.push(`${d.careerDate} ${d.tournamentId.slice(-12)}: #${c.teamRank} fora (cut=${c.blendedCutScore.toFixed(1)}, linha=${d.cutLine?.toFixed(1)}, fit=${c.tierFit})`);
    }
  }
}
for (const e of excluded.slice(0, 8)) note(`  ${e}`);

check('Parte H/Y: Masters permanece com chave 24', () => {
  const sizes = [...new Set(masters.map((d) => d.drawSize))];
  note(`tamanhos de chave observados em Masters: ${sizes.join(', ')}`);
  assert.ok(sizes.every((s) => s === 24), `Masters com chave ${sizes.join('/')}`);
});

check('Parte H: houve Masters suficientes para medir', () => {
  note(`Masters observados na temporada: ${masters.length}`);
  assert.ok(masters.length >= 4, `só ${masters.length} Masters`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
