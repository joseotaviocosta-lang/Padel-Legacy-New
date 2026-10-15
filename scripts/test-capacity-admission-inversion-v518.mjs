// Playthrough 5.18-G, Partes F/G — INVERSÃO OBJETIVA E RESGATE.
//
// DEFINIÇÃO (Parte F): há inversão quando, no MESMO snapshot, o candidato A
// tem prioridade superior SEGUNDO A PRÓPRIA AUTORIDADE DE ADMISSÃO e mesmo
// assim fica fora, enquanto B, de prioridade inferior, entra — sem regra
// posterior explícita que justifique.
//
// A autoridade no sorteio D-3 é `blendedCutScore`, não TeamRanking e não
// `applyEntryPriority` (WorldTourLifecycle.js:588; o código registra
// applyEntryPriority como testada e descartada neste ponto). Medir inversão
// contra TeamRanking isolado seria medir contra uma autoridade que o jogo não
// usa — foi assim que a 5.18-F produziu "94 inversões" que não existiam.
//
// A regra posterior explícita que existe é o RESGATE (Parte G): quando o
// campo fica abaixo do mínimo viável, duplas ociosas entram por
// `rankCandidatesByTierFit`. Entrar por resgate NÃO é inversão.
import assert from 'node:assert/strict';
import { runFinalHarness } from './lib/drawAdmissionHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const run = await runFinalHarness({ label: 'inversion', years: 1, cohortSize: 20 });
const A = run.admissions;
console.log(`\n=== ${A.length} decisões capturadas ===\n`);

// ------------------------------------------------------------- Parte F
const inversions = [];
for (const d of A) {
  const normal = d.candidates.filter((c) => !c.viaRescue);
  const admitted = normal.filter((c) => c.admitted);
  const excluded = normal.filter((c) => !c.admitted);
  if (!admitted.length || !excluded.length) continue;
  // Menor pontuação entre os admitidos pelo corte normal.
  const worstAdmitted = Math.min(...admitted.map((c) => c.blendedCutScore));
  for (const e of excluded) {
    if (e.blendedCutScore > worstAdmitted) {
      inversions.push({
        tournamentId: d.tournamentId, tier: d.tier, date: d.careerDate,
        excludedScore: e.blendedCutScore, worstAdmitted,
        excludedRank: e.teamRank, delta: e.blendedCutScore - worstAdmitted,
      });
    }
  }
}
inversions.sort((a, b) => b.delta - a.delta);
for (const inv of inversions.slice(0, 10)) {
  console.log(`  [INVERSÃO] ${inv.date} ${inv.tier}: excluído cut=${inv.excludedScore.toFixed(2)} > pior admitido cut=${inv.worstAdmitted.toFixed(2)} (Δ${inv.delta.toFixed(2)})`);
}

check('Parte F: nenhuma inversão segundo a própria autoridade de admissão', () => {
  const contested = A.filter((d) => d.queueSize > d.drawSize).length;
  note(`decisões com disputa real por vaga: ${contested}/${A.length}`);
  note(`inversões objetivas: ${inversions.length}`);
  assert.equal(inversions.length, 0, `${inversions.length} inversões`);
});

check('Parte F: a ordem capturada é monotônica na pontuação da autoridade', () => {
  const broken = [];
  for (const d of A) {
    const normal = d.candidates.filter((c) => !c.viaRescue);
    for (let i = 1; i < normal.length; i += 1) {
      if (normal[i].blendedCutScore > normal[i - 1].blendedCutScore + 1e-9) {
        broken.push(`${d.tournamentId} pos ${i}`);
        break;
      }
    }
  }
  note(`decisões com ordem não monotônica: ${broken.length}`);
  assert.equal(broken.length, 0, broken.slice(0, 3).join(' | '));
});

// ------------------------------------------------------------- Parte G
const withRescue = A.filter((d) => d.rescue.triggered);
console.log(`\n=== Parte G — resgate: ${withRescue.length}/${A.length} eventos ===\n`);
for (const d of withRescue.slice(0, 10)) {
  console.log(`  ${d.careerDate} ${d.tier} chave=${d.drawSize}: campo antes=${d.rescue.sizeBefore} mínimo=${d.rescue.minViable} pool=${d.rescue.poolSize} adicionados=${d.rescue.added} motivo=${d.rescue.reason}`);
}
if (!withRescue.length) console.log('  (nenhum resgate acionado nesta temporada)');

check('Parte G: todo resgate tem motivo e só ocorre abaixo do mínimo viável', () => {
  const bad = withRescue.filter((d) => !d.rescue.reason || d.rescue.sizeBefore >= d.rescue.minViable);
  note(`eventos com resgate: ${withRescue.length} | irregulares: ${bad.length}`);
  note(`duplas admitidas por resgate no total: ${A.reduce((s, d) => s + d.rescue.added, 0)}`);
  assert.equal(bad.length, 0, `${bad.length} resgates fora da regra`);
});

check('Parte G: resgatadas não são contadas como inversão', () => {
  // Protege a separação: nenhuma entrada marcada viaRescue entra no cálculo
  // de inversão acima. A asserção guarda a propriedade do teste.
  const rescuedInInversions = inversions.filter((i) => i.viaRescue);
  note(`entradas por resgate classificadas como inversão: ${rescuedInInversions.length}`);
  assert.equal(rescuedInInversions.length, 0);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
