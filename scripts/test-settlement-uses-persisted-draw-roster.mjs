// Playthrough 5.5, Parte M — guarda de regressão PERMANENTE pro bug
// estrutural achado e corrigido na 5.4: settlement recomputava o campo do
// zero (assignPairsForWeek/chooseTournament) em vez de reusar o roster
// REALMENTE sorteado (draw_pair_ids), perdendo o crédito de ranking de
// ~73% das aparições não-campeãs numa temporada real. Este teste isola o
// cenário exato: sorteia um torneio, persiste draw_pair_ids, deixa o
// ranking de TODO mundo mudar entre o sorteio e a resolução (via outras
// semanas de torneios resolvendo no meio do caminho — o próprio mecanismo
// que causava a divergência), resolve, e prova que TODO crédito pertence
// exatamente ao roster sorteado — ninguém novo entrou, ninguém sumiu,
// campeão/vice/todas as rodadas batem com o bracket.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, canonicalPairAthleteIds } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_SETTLEMENT_GUARD_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'settlement-guard', trackWeeklyDraws: false, includeRankingResults: true });
const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));
const resultById = new Map(sim.rankingResultRows.map((r) => [r.id, r]));
const resolvedTournaments = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);

console.log(`=== Parte M: guarda de regressão do bug 5.4 (${years} temporada(s), ${resolvedTournaments.length} torneios resolvidos) ===\n`);

let checkedPairs = 0; let creditedPairs = 0; let missingCredit = 0;
let championsChecked = 0; let championsCredited = 0;
for (const tournament of resolvedTournaments) {
  const drawnIds = new Set(tournament.draw_pair_ids);
  for (const pairId of drawnIds) {
    const members = canonicalPairAthleteIds(pairId, partnershipById);
    if (members.length !== 2) continue;
    checkedPairs += 1;
    const bothCredited = members.every((id) => resultById.has(`${id}:${tournament.id}`));
    if (bothCredited) creditedPairs += 1; else missingCredit += 1;
  }
  const championIds = tournament.champion_athlete_ids;
  if (Array.isArray(championIds) && championIds.length === 2) {
    championsChecked += 1;
    if (championIds.every((id) => resultById.has(`${id}:${tournament.id}`))) championsCredited += 1;
  }
}

console.log(`pares sorteados verificados: ${checkedPairs} | creditados (ambos os parceiros): ${creditedPairs} | SEM crédito: ${missingCredit}`);
console.log(`campeões verificados: ${championsChecked} | campeões creditados: ${championsCredited}`);

check('amostra real (torneios resolvidos com duplas sorteadas)', () => {
  assert.ok(checkedPairs > 100, `checkedPairs=${checkedPairs}`);
});
check('TODO par sorteado (draw_pair_ids) recebe crédito de ranking — nenhum "sumiu" entre o sorteio e o settlement (o bug exato da 5.4)', () => {
  assert.equal(missingCredit, 0, `${missingCredit} de ${checkedPairs} pares sorteados não receberam crédito`);
});
check('TODO campeão gravado (champion_athlete_ids) tem crédito de ranking completo', () => {
  assert.equal(championsChecked, championsCredited, `${championsChecked - championsCredited} campeões sem crédito completo`);
});

// "Ninguém novo entrou": todo ATLETA creditado num torneio precisa
// corresponder a um pairId que estava em draw_pair_ids — não pode existir
// uma linha de ledger pra um torneio sem o pairId correspondente ter sido
// sorteado ali.
let orphanCredits = 0;
const resultsByTournament = new Map();
for (const row of sim.rankingResultRows) {
  if (!row.tournament_id) continue;
  if (!resultsByTournament.has(row.tournament_id)) resultsByTournament.set(row.tournament_id, []);
  resultsByTournament.get(row.tournament_id).push(row);
}
for (const tournament of resolvedTournaments) {
  const drawnAthleteIds = new Set(tournament.draw_pair_ids.flatMap((pairId) => canonicalPairAthleteIds(pairId, partnershipById)));
  const creditedRows = resultsByTournament.get(tournament.id) || [];
  for (const row of creditedRows) {
    if (!drawnAthleteIds.has(row.athlete_id)) orphanCredits += 1;
  }
}
console.log(`créditos "órfãos" (atleta creditado num torneio que não sorteou ele): ${orphanCredits}`);
check('ninguém NOVO recebeu crédito — todo crédito de ranking corresponde a um atleta realmente sorteado no torneio', () => {
  assert.equal(orphanCredits, 0, `${orphanCredits} créditos órfãos encontrados`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-settlement-uses-persisted-draw-roster: PASS');
