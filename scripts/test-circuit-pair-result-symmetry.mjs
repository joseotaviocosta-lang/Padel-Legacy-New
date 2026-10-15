// Playthrough 5.4, TESTE 7/Parte L (re-verificação em temporada longa) —
// crédito simétrico de dupla: os DOIS atletas de um par que jogou um
// torneio devem ter, cada um, sua própria linha `AthleteRankingResult`
// (`${athleteId}:${tournamentId}`, rankingWindow.js) com o MESMO `points` e
// o MESMO `finish` — nenhum "carona" (um recebe menos) nem duplicação (o
// mesmo id de linha usado por dois atletas diferentes).
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { runHeadlessWorldSimulation, canonicalPairAthleteIds } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const years = Number(process.env.PADEL_SYMMETRY_YEARS || 1);
const sim = await runHeadlessWorldSimulation({ years, label: 'pair-symmetry', trackWeeklyDraws: false, includeRankingResults: true });
const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));
const resultById = new Map(sim.rankingResultRows.map((r) => [r.id, r]));
const resolvedTournaments = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);

console.log(`=== simulação: ${years} temporada(s), ${sim.rankingResultRows.length} linhas AthleteRankingResult, ${resolvedTournaments.length} torneios resolvidos ===\n`);

const probeVite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { buildCanonicalPairs } = await probeVite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
await probeVite.close();
const finalCanonicalPairs = buildCanonicalPairs(sim.partnerships, sim.athletes);
const finalPartnerOf = new Map();
for (const pair of finalCanonicalPairs) {
  const [a, b] = pair.athletes;
  if (a && b) { finalPartnerOf.set(a.id, b.id); finalPartnerOf.set(b.id, a.id); }
}
const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));
let checkedPairs = 0; let bothPresent = 0; let symmetric = 0; let neitherPresent = 0; let onlyOnePresent = 0; let asymmetricExamples = [];
const missingByTier = {}; const presentByTier = {};
let missingWithPartnerChanged = 0; let missingWithPartnerSame = 0; let missingAthleteGone = 0;
for (const tournament of resolvedTournaments) {
  for (const pairId of tournament.draw_pair_ids) {
    const memberIds = canonicalPairAthleteIds(pairId, partnershipById);
    if (memberIds.length !== 2) continue;
    checkedPairs += 1;
    const [rowA, rowB] = memberIds.map((id) => resultById.get(`${id}:${tournament.id}`));
    const presentCount = [rowA, rowB].filter(Boolean).length;
    if (presentCount === 0) {
      neitherPresent += 1; missingByTier[tournament.tier] = (missingByTier[tournament.tier] || 0) + 1;
      // Playthrough 5.4, Parte M — hipótese: settlement recomputa o campo do
      // zero (assignPairsForWeek com o `pairs` ATUAL) em vez de reusar o
      // par gravado em draw_pair_ids no sorteio — se QUALQUER um dos dois
      // atletas trocou de parceiro (ou saiu da população) entre o sorteio e
      // o settlement, a dupla histórica não aparece mais no `ordered`
      // recomputado e nunca recebe outcome/pontos, mesmo listada em
      // draw_pair_ids. Confirma correlacionando estado FINAL de
      // ai_partner_id com o parceiro histórico do par sorteado.
      const [idA, idB] = memberIds;
      if (!athleteById.has(idA) || !athleteById.has(idB)) missingAthleteGone += 1;
      else if (finalPartnerOf.get(idA) !== idB || finalPartnerOf.get(idB) !== idA) missingWithPartnerChanged += 1;
      else missingWithPartnerSame += 1;
      continue;
    }
    if (presentCount === 1) { onlyOnePresent += 1; missingByTier[tournament.tier] = (missingByTier[tournament.tier] || 0) + 1; continue; }
    bothPresent += 1;
    presentByTier[tournament.tier] = (presentByTier[tournament.tier] || 0) + 1;
    if (rowA.points === rowB.points && rowA.finish === rowB.finish) symmetric += 1;
    else if (asymmetricExamples.length < 5) {
      asymmetricExamples.push({ tournament: tournament.name, tier: tournament.tier, a: { points: rowA.points, finish: rowA.finish }, b: { points: rowB.points, finish: rowB.finish } });
    }
  }
}
console.log(`\n=== diagnóstico Parte M (linhas ausentes) ===`);
console.log(`nenhuma linha presente: ${neitherPresent} | só 1 dos 2 parceiros: ${onlyOnePresent} | ambas presentes: ${bothPresent}`);
console.log('ausência (nenhuma ou parcial) por tier:', missingByTier);
console.log('ambas presentes por tier:', presentByTier);
console.log(`\ncausa provável das ausências totais (${neitherPresent}): parceiro mudou/desfez entre sorteio e settlement=${missingWithPartnerChanged} | parceiro igual no estado final (outra causa)=${missingWithPartnerSame} | atleta não existe mais na população final=${missingAthleteGone}`);

// Playthrough 5.4, Parte M/F — hipótese 2: settlement (resolveCompletedWorldTourEvents)
// recomputa `ordered` do zero via assignPairsForWeek/chooseTournament no
// momento do settlement, em vez de reusar o campo gravado em draw_pair_ids
// no sorteio (D-3) — mesmo SEM troca de parceiro, um par pode não ser
// re-selecionado pelo `chooseTournament` fresco (rank mudou, região mudou,
// comprometido em outro torneio na mesma janela) e ficar de fora de
// `ordered`, perdendo o crédito mesmo tendo sido sorteado e mesmo aparecendo
// no bracket_history gravado. Teste direto: o CAMPEÃO gravado
// (champion_athlete_ids, denormalizado no Tournament) tem linha de ledger?
let championMissingCredit = 0; let championChecked = 0;
for (const tournament of resolvedTournaments) {
  const championIds = tournament.champion_athlete_ids;
  if (!Array.isArray(championIds) || championIds.length !== 2) continue;
  championChecked += 1;
  const hasBoth = championIds.every((id) => resultById.has(`${id}:${tournament.id}`));
  if (!hasBoth) championMissingCredit += 1;
}
console.log(`\ncampeões verificados: ${championChecked} | campeões SEM linha de ledger completa (o próprio vencedor do título não recebeu pontos de ranking): ${championMissingCredit}`);

console.log(`pares dupla×torneio verificados: ${checkedPairs}`);
console.log(`com AMBAS as linhas de resultado presentes: ${bothPresent}`);
console.log(`com pontos/finish IDÊNTICOS entre os dois parceiros: ${symmetric}`);
if (asymmetricExamples.length) {
  console.log('exemplos de assimetria:');
  for (const ex of asymmetricExamples) console.log(`  ${ex.tournament} (${ex.tier}): A=${JSON.stringify(ex.a)} B=${JSON.stringify(ex.b)}`);
}

check('amostra real (ao menos alguns pares com ambas as linhas de resultado presentes)', () => {
  assert.ok(bothPresent > 0, `bothPresent=${bothPresent}`);
});
check('quando ambas as linhas existem, os pontos/finish são IDÊNTICOS entre os dois parceiros (crédito simétrico, sem carona)', () => {
  assert.equal(symmetric, bothPresent, `${bothPresent - symmetric} de ${bothPresent} pares tiveram pontos/finish diferentes entre os parceiros`);
});

// Anti-duplicação: nenhum id de linha (`${athleteId}:${tournamentId}`) deve
// aparecer mais de uma vez na coleção bruta — o `upsert` com id
// determinístico (WorldTourLifecycle.js/circuitLifecycle.js) deveria
// garantir isso por construção; confirma que não há reexecução acidental
// duplicando linhas.
const idCounts = new Map();
for (const row of sim.rankingResultRows) idCounts.set(row.id, (idCounts.get(row.id) || 0) + 1);
const duplicated = [...idCounts.entries()].filter(([, count]) => count > 1);
check('nenhuma linha AthleteRankingResult duplicada (id determinístico + upsert previne reexecução acidental)', () => {
  assert.equal(duplicated.length, 0, `${duplicated.length} ids duplicados: ${duplicated.slice(0, 5).map(([id, c]) => `${id}×${c}`).join(', ')}`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-circuit-pair-result-symmetry: PASS');
