// Playthrough 5.4, TESTE 9/Parte C (continuidade) — complementa o Teste 1
// (contagem TOTAL de participações): confirma que a participação de
// duplas de elite reais está DISTRIBUÍDA ao longo da temporada inteira
// (pelo menos 3 dos 4 trimestres), não concentrada só no início e depois
// sumindo — um padrão que a contagem total sozinha não detectaria (ex.: um
// bug que trava a dupla depois de uma certa data ainda passaria no Teste
// 1 se o total acumulado até aquele ponto já fosse > 0).
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, canonicalPairAthleteIds } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_FULLSEASON_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'full-season-elite', trackWeeklyDraws: false });
const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));
const resolvedTournaments = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);

const TARGET_PAIRS = [
  { label: 'Coello/Tapia', nameRegexes: [/coello/i, /tapia/i] },
  { label: 'Galán/Chingotto', nameRegexes: [/gal[aá]n/i, /chingotto/i] },
];

function findAthlete(regex) { return sim.athletes.find((a) => regex.test(a.name || '')); }
function quarterOf(dateStr) {
  if (!dateStr) return null;
  const month = Number(String(dateStr).slice(5, 7));
  return Math.ceil(month / 3);
}

console.log(`=== simulação: ${years} temporada(s), ${resolvedTournaments.length} torneios resolvidos ===\n`);

for (const target of TARGET_PAIRS) {
  const [athleteA, athleteB] = target.nameRegexes.map(findAthlete);
  if (!athleteA || !athleteB) {
    console.log(`(${target.label}: não encontrada nesta seed — pulando)`);
    continue;
  }
  const idA = athleteA.id; const idB = athleteB.id;
  const appearanceDates = [];
  for (const tournament of resolvedTournaments) {
    for (const pairId of tournament.draw_pair_ids) {
      const memberIds = canonicalPairAthleteIds(pairId, partnershipById);
      if (memberIds.includes(idA) && memberIds.includes(idB)) {
        appearanceDates.push(tournament.draw_date || tournament.start_date);
      }
    }
  }
  const quarters = new Set(appearanceDates.map(quarterOf).filter(Boolean));
  console.log(`${target.label}: ${appearanceDates.length} participações, trimestres com atividade: [${[...quarters].sort().join(', ')}]`);

  check(`${target.label}: participação distribuída em pelo menos 3 dos 4 trimestres da temporada (${years >= 1 ? 'não fica travada depois de um ponto' : 'amostra menor que 1 ano, checagem relaxada'})`, () => {
    if (years < 1) { assert.ok(quarters.size >= 1); return; }
    assert.ok(quarters.size >= 3, `apareceu em só ${quarters.size} trimestre(s): [${[...quarters].sort().join(', ')}] — possível travamento após uma certa data`);
  });
}

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-full-season-elite-participation: PASS');
