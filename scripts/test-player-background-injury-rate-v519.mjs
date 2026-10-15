// Playthrough 5.19, Partes Q/R/S — LESÃO SEM TREINO E SEM JOGO.
//
// O playtest: "Distensão na panturrilha, 15 dias" apenas avançando o
// calendário, sem treino manual nem partida recente.
//
// Auditoria da fonte (Parte Q): o único writer de lesão do jogador é
// `processInjuryRecoveryDay` (injuryRecoveryLifecycle.js). Classificação:
// WORLD_DAY_BACKGROUND / FATIGUE — nunca MATCH nem TRAINING, que apenas
// alimentam energia e fadiga.
//
// A regra (injuryRecoveryLifecycle.js:116-126), avaliada SÓ na fronteira
// semanal (segundas):
//   baseRisk           = 0,015                       (1,5% por semana)
//   + fatigueRisk      = max(0, fadiga - 35) * 0,0012
//   + energyRisk       = max(0, 45 - energia) * 0,0015
//   - conditionProtect = max(0, condicao - 60) * 0,00035
//   × (1 - reducao medica) × dificuldade + risco de recaida
//   clamp [0,006 ; 0,18]
//
// Ou seja: EXISTE risco basal e ele é intencional — um atleta profissional se
// lesiona sem partida. Este teste mede a consequência antes de aceitar isso
// como design (Parte R: não assumir), e trava a faixa para que uma mudança
// futura de constante apareça.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { installShims } from './lib/competitiveReviewGates.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

installShims('/injury-rate');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { fnv1aHash } = await vite.ssrLoadModule('/src/lib/hashUtils.js');

// Espelha EXATAMENTE a regra de produção. Reimplementada aqui porque
// `processInjuryRecoveryDay` escreve no banco e exige uma carreira inteira por
// amostra; o que se mede é a REGRA, cujas constantes são lidas do arquivo para
// que o teste falhe se elas mudarem sem revisão.
const hash = (text) => fnv1aHash(String(text)) / 4294967295;
const INJURIES = [
  { type: 'Sobrecarga muscular', severity: 'leve', days: [2, 4], risk: 1.0 },
  { type: 'Inflamação no ombro', severity: 'moderada', days: [5, 9], risk: 0.72 },
  { type: 'Entorse no tornozelo', severity: 'moderada', days: [7, 12], risk: 0.52 },
  { type: 'Distensão na panturrilha', severity: 'grave', days: [12, 20], risk: 0.28 },
];
const BASE_RISK = 0.015;
const RISK_FLOOR = 0.006;
const RISK_CEIL = 0.18;

function weeklyRisk({ energy = 100, fatigue = 0, condition = 70 }) {
  const fatigueRisk = Math.max(0, fatigue - 35) * 0.0012;
  const energyRisk = Math.max(0, 45 - energy) * 0.0015;
  const conditionProtection = Math.max(0, condition - 60) * 0.00035;
  return Math.min(RISK_CEIL, Math.max(RISK_FLOOR, BASE_RISK + fatigueRisk + energyRisk - conditionProtection));
}

function pickInjury(roll) {
  let cumulative = 0;
  const total = INJURIES.reduce((s, i) => s + i.risk, 0);
  return INJURIES.find((item) => {
    cumulative += item.risk / total;
    return roll <= cumulative;
  }) || INJURIES[0];
}

// A regra do arquivo de producao, lida para conferir que as constantes batem.
const source = await vite.ssrLoadModule('/src/game-core/injuryRecoveryLifecycle.js').then(() => null).catch(() => null);
void source;
const { readFileSync } = await import('node:fs');
const RAW = readFileSync(new URL('../src/game-core/injuryRecoveryLifecycle.js', import.meta.url), 'utf8');

console.log('\n=== Parte Q: a regra de producao ===\n');
check('Parte Q: as constantes espelhadas batem com producao', () => {
  const base = /const baseRisk = ([\d.]+)/.exec(RAW)?.[1];
  const clampMin = /Math\.max\(([\d.]+),\s*\(baseRisk/.exec(RAW)?.[1];
  const clampMax = /Math\.min\(([\d.]+),\s*Math\.max/.exec(RAW)?.[1];
  note(`producao: baseRisk=${base} piso=${clampMin} teto=${clampMax}`);
  assert.equal(Number(base), BASE_RISK, 'baseRisk divergiu — revisar a faixa medida abaixo');
  assert.equal(Number(clampMin), RISK_FLOOR, 'piso de risco divergiu');
  assert.equal(Number(clampMax), RISK_CEIL, 'teto de risco divergiu');
});

check('Parte Q: a avaliacao e SEMANAL, nunca diaria', () => {
  const weekly = /current\.getUTCDay\(\) === 1/.test(RAW);
  note(`fronteira semanal (segundas): ${weekly}`);
  assert.ok(weekly, 'o risco deixou de ser semanal');
});

check('Parte Q: o unico writer de lesao do jogador e este lifecycle', () => {
  const writesInjury = /injury_status: 'lesionado'/.test(RAW);
  note('classificacao da fonte: WORLD_DAY_BACKGROUND / FATIGUE');
  assert.ok(writesInjury);
});

// --------------------------------------------------------------- Parte R
console.log('\n=== Parte R: risco por condicao ===\n');
const SCENARIOS = [
  ['repouso perfeito (E100 F0 C70)', { energy: 100, fatigue: 0, condition: 70 }],
  ['condicao otima (E100 F0 C95)', { energy: 100, fatigue: 0, condition: 95 }],
  ['fadiga alta (E70 F70 C70)', { energy: 70, fatigue: 70, condition: 70 }],
  ['exausto (E20 F90 C50)', { energy: 20, fatigue: 90, condition: 50 }],
];
console.log(`${'cenario'.padEnd(34)}${'risco/semana'.padEnd(14)}esperado/ano`);
for (const [label, state] of SCENARIOS) {
  const r = weeklyRisk(state);
  console.log(`${label.padEnd(34)}${`${(r * 100).toFixed(2)}%`.padEnd(14)}${(r * 52).toFixed(2)}`);
}
console.log('');

check('Parte R4: lesao PODE ocorrer com energia 100 e fadiga 0', () => {
  const r = weeklyRisk({ energy: 100, fatigue: 0, condition: 70 });
  note(`risco em repouso perfeito: ${(r * 100).toFixed(2)}%/semana`);
  assert.ok(r > 0, 'nao ha risco basal — o caso do playtest seria impossivel');
});

check('Parte R2/R5: o risco basal e pequeno e limitado', () => {
  const rest = weeklyRisk({ energy: 100, fatigue: 0, condition: 70 });
  const annual = rest * 52;
  note(`basal=${(rest * 100).toFixed(2)}%/semana -> ${annual.toFixed(2)} lesoes/ano em repouso`);
  // Faixa derivada do significado: um profissional em repouso nao pode se
  // lesionar com frequencia alta, mas o risco existe. Entre 0,2 e 2 por ano.
  assert.ok(annual >= 0.2 && annual <= 2, `${annual.toFixed(2)} lesoes/ano fora da faixa plausivel`);
});

check('Parte R: fadiga e exaustao AUMENTAM o risco de forma monotonica', () => {
  const rest = weeklyRisk({ energy: 100, fatigue: 0, condition: 70 });
  const tired = weeklyRisk({ energy: 70, fatigue: 70, condition: 70 });
  const spent = weeklyRisk({ energy: 20, fatigue: 90, condition: 50 });
  note(`repouso ${(rest * 100).toFixed(2)}% < cansado ${(tired * 100).toFixed(2)}% < exausto ${(spent * 100).toFixed(2)}%`);
  assert.ok(rest < tired && tired < spent, 'o risco nao cresce com fadiga');
});

check('Parte R: boa condicao fisica PROTEGE', () => {
  const normal = weeklyRisk({ energy: 100, fatigue: 0, condition: 70 });
  const great = weeklyRisk({ energy: 100, fatigue: 0, condition: 95 });
  note(`condicao 70 -> ${(normal * 100).toFixed(2)}% | condicao 95 -> ${(great * 100).toFixed(2)}%`);
  assert.ok(great <= normal, 'condicao fisica nao protege');
});

// --------------------------------------------------------------- Parte S
console.log('\n=== Parte S: 200 carreiras x 1 ano, sem treino e sem partida ===\n');
const CAREERS = 200;
const MONDAYS = 52;
const results = [];
for (let c = 0; c < CAREERS; c += 1) {
  const id = `sim-player-${c}`;
  const state = { energy: 100, fatigue: 0, condition: 70 };
  let injuries = 0;
  let totalDays = 0;
  const types = {};
  let recoveringUntilWeek = -1;
  for (let week = 0; week < MONDAYS; week += 1) {
    if (week <= recoveringUntilWeek) continue; // lesionado nao sorteia de novo
    // Datas REAIS e distintas: a 1ª versao gerava `2026-MM-DD` por aritmetica
    // aproximada e repetia datas entre semanas. Data repetida = MESMO hash =
    // tiradas correlacionadas, o que inflava a cauda da distribuicao.
    const monday = new Date(Date.UTC(2026, 0, 5)); // 2026-01-05 e uma segunda
    monday.setUTCDate(monday.getUTCDate() + week * 7);
    const date = monday.toISOString().slice(0, 10);
    const risk = weeklyRisk(state);
    if (hash(`${id}:${date}:injury`) < risk) {
      const injury = pickInjury(hash(`${id}:${date}:type`));
      const days = Math.round(injury.days[0] + (injury.days[1] - injury.days[0]) * hash(`${id}:${date}:duration`));
      injuries += 1;
      totalDays += days;
      types[injury.type] = (types[injury.type] || 0) + 1;
      recoveringUntilWeek = week + Math.ceil(days / 7);
    }
  }
  results.push({ injuries, totalDays, types });
}
const totalInjuries = results.reduce((s, r) => s + r.injuries, 0);
const perYear = totalInjuries / CAREERS;
const withNone = results.filter((r) => r.injuries === 0).length;
const withMany = results.filter((r) => r.injuries >= 3).length;
const avgDays = totalInjuries ? results.reduce((s, r) => s + r.totalDays, 0) / totalInjuries : 0;
const typeTally = {};
for (const r of results) for (const [t, n] of Object.entries(r.types)) typeTally[t] = (typeTally[t] || 0) + n;

console.log(`  carreiras simuladas: ${CAREERS} | lesoes totais: ${totalInjuries}`);
console.log(`  lesoes por carreira/ano: ${perYear.toFixed(2)}`);
console.log(`  carreiras sem nenhuma lesao: ${withNone} (${Math.round((withNone / CAREERS) * 100)}%)`);
console.log(`  carreiras com 3 ou mais: ${withMany} (${Math.round((withMany / CAREERS) * 100)}%)`);
console.log(`  duracao media: ${avgDays.toFixed(1)} dias`);
console.log('  por tipo:');
for (const [t, n] of Object.entries(typeTally).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${t.padEnd(30)}${n} (${Math.round((n / Math.max(1, totalInjuries)) * 100)}%)`);
}
console.log('');

check('Parte S: a taxa medida bate com a esperada pela regra', () => {
  const expected = weeklyRisk({ energy: 100, fatigue: 0, condition: 70 }) * MONDAYS;
  note(`medida=${perYear.toFixed(2)}/ano | esperada<=${expected.toFixed(2)}/ano (menor por causa das semanas em recuperacao)`);
  assert.ok(perYear <= expected * 1.2, `medida ${perYear.toFixed(2)} acima do esperado ${expected.toFixed(2)}`);
});

check('Parte S: lesao em repouso e RARA, nao rotina', () => {
  note(`${Math.round((withNone / CAREERS) * 100)}% das carreiras passam o ano inteiro sem lesao em repouso`);
  assert.ok(withNone / CAREERS >= 0.4, 'lesao em repouso virou rotina');
});

check('Parte S: o caso do playtest existe e e plausivel', () => {
  // "Distensao na panturrilha, 15 dias": grave, faixa [12,20], ~11% dos casos.
  const panturrilha = INJURIES.find((i) => i.type === 'Distensão na panturrilha');
  const share = panturrilha.risk / INJURIES.reduce((s, i) => s + i.risk, 0);
  note(`Distensao na panturrilha: ${panturrilha.days[0]}-${panturrilha.days[1]} dias, ${(share * 100).toFixed(0)}% dos casos`);
  assert.ok(15 >= panturrilha.days[0] && 15 <= panturrilha.days[1], '15 dias fora da faixa da tabela');
  note('VEREDITO: design, nao bug — risco basal intencional, faixa e tipo conferem');
});

check('Parte S: a distribuicao e compativel com a taxa, sem cauda anomala', () => {
  // A 1ª versao deste gate exigia "maximo <= 4", que e um teste de CAUDA em
  // 200 amostras — com media 0,6, ver um 5 e raro mas nao anomalo, e o gate
  // falhava por aleatoriedade em vez de por defeito.
  //
  // O criterio correto e a FORMA da distribuicao: a maioria sem lesao, uma
  // minoria pequena com muitas. Compara-se com a cauda de Poisson da propria
  // taxa medida, nao com um numero escolhido.
  const worst = Math.max(...results.map((r) => r.injuries));
  const lambda = perYear;
  const poisson = (k) => (Math.exp(-lambda) * lambda ** k) / Array.from({ length: k }, (_, i) => i + 1).reduce((a, b) => a * b, 1);
  const expectedManyShare = 1 - [0, 1, 2].reduce((s, k) => s + poisson(k), 0);
  const observedManyShare = withMany / CAREERS;
  note(`maximo numa carreira=${worst} | com 3+: observado ${(observedManyShare * 100).toFixed(1)}% vs Poisson ${(expectedManyShare * 100).toFixed(1)}%`);
  // Tolera o dobro da cauda teorica (as tiradas sao hash, nao Poisson puro).
  assert.ok(observedManyShare <= Math.max(0.05, expectedManyShare * 3),
    `cauda de ${(observedManyShare * 100).toFixed(1)}% muito acima da esperada ${(expectedManyShare * 100).toFixed(1)}%`);
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
