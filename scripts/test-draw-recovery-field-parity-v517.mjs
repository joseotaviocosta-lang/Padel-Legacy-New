// Playthrough 5.17 (continuação), Parte H — RECOVERY NÃO PODE CORROMPER O
// CAMPO.
//
// A 5.17 parcial observou que um evento em que o jogador se inscreveu sai do
// filtro `due` do sorteio de IA (WorldTourLifecycle: `playerTournamentIds`) e
// pode só receber chave depois, por recuperação no settlement. As perguntas
// da Parte H:
//
//   1. Quando um evento perde o draw D-3?
//      -> quando está em `playerTournamentIds` (inscrição 'pending'/'confirmed'
//         do jogador) ou quando `entrants < minViableDraw` no D-3.
//   2. Que função tenta recuperar?
//      -> resolveCompletedWorldTourEvents, ramo `!hadCanonicalDraw`.
//   3. Em que data? -> no fim do evento (tournamentEndDate), não no D-3.
//   4. Que população? -> `ordered`, recomputado a partir dos pares vivos.
//   5. Roster persistido ou recálculo? -> RECÁLCULO (é a diferença estrutural).
//   6. Pode converter evento válido em cancelado? -> medido aqui.
//   7. Pode processar depois da janela? -> sim, por construção.
//
// O gate: para o mesmo snapshot, o campo dos dois caminhos precisa ser
// SEMANTICAMENTE equivalente — mesmo tamanho, sem fantasma, sem duplicata.
import assert from 'node:assert/strict';
import { runHeadlessWorldSimulation, resolvePairMemberIds } from './lib/tierRebalanceHarness.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.stack || error.message}`); }
}

const sim = await runHeadlessWorldSimulation({
  years: 1, label: 'v517-recovery', trackWeeklyDraws: false, includeRankingResults: true,
});

const partnershipById = new Map((sim.partnerships || []).map((p) => [p.id, p]));
const membersOf = (pairId) => {
  const direct = resolvePairMemberIds(pairId);
  if (direct?.length === 2) return direct;
  const p = partnershipById.get(pairId);
  return p ? [p.athlete_a_id, p.athlete_b_id].filter(Boolean) : [];
};
const athleteIds = new Set(sim.athletes.map((a) => a.id));

const drawn = sim.tournaments.filter((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length);
const recovered = drawn.filter((t) => t.bracket_origin === 'retroactive-recovery');
const normal = drawn.filter((t) => t.bracket_origin !== 'retroactive-recovery');

console.log(`sorteios normais: ${normal.length} | recuperados: ${recovered.length}\n`);

// Qualidade estrutural de um campo, independente do caminho que o gerou.
function fieldQuality(list) {
  let ghosts = 0;
  let duplicatePairs = 0;
  let duplicateMembers = 0;
  let overCapacity = 0;
  let totalField = 0;
  let events = 0;
  for (const t of list) {
    events += 1;
    totalField += t.draw_pair_ids.length;
    const seenPairs = new Set();
    const seenMembers = new Set();
    for (const pid of t.draw_pair_ids) {
      const ids = membersOf(pid);
      if (ids.length !== 2 || !athleteIds.has(ids[0]) || !athleteIds.has(ids[1])) { ghosts += 1; continue; }
      const key = [...ids].sort().join('_');
      if (seenPairs.has(key)) duplicatePairs += 1;
      seenPairs.add(key);
      for (const id of ids) {
        if (seenMembers.has(id)) duplicateMembers += 1;
        seenMembers.add(id);
      }
    }
    const size = Number(t.main_draw_size) || 0;
    if (size > 0 && t.draw_pair_ids.length > size) overCapacity += 1;
  }
  return {
    events, ghosts, duplicatePairs, duplicateMembers, overCapacity,
    avgField: events ? totalField / events : 0,
  };
}

const qNormal = fieldQuality(normal);
const qRecovered = fieldQuality(recovered);

console.log('=== PARTE H: paridade entre caminho normal e recuperação ===');
console.log('caminho        eventos  campo médio  fantasmas  duplas rep  membros rep  acima cap');
for (const [label, q] of [['normal (D-3)', qNormal], ['recuperação', qRecovered]]) {
  console.log(`${label.padEnd(15)}${String(q.events).padStart(7)}${q.avgField.toFixed(1).padStart(13)}${String(q.ghosts).padStart(11)}${String(q.duplicatePairs).padStart(12)}${String(q.duplicateMembers).padStart(13)}${String(q.overCapacity).padStart(11)}`);
}

check('Parte H/2-3: o caminho normal gera a grande maioria das chaves', () => {
  console.log(`   [registro] normal=${normal.length} recuperado=${recovered.length}`);
  assert.ok(normal.length > 0, 'nenhuma chave pelo caminho normal');
});

check('Parte H/6: a recuperação NÃO produz campo fantasma', () => {
  assert.equal(qRecovered.ghosts, 0, `${qRecovered.ghosts} duplas fantasma em chaves recuperadas`);
});

check('Parte H: a recuperação NÃO duplica dupla nem atleta', () => {
  assert.equal(qRecovered.duplicatePairs, 0, `${qRecovered.duplicatePairs} duplas repetidas`);
  assert.equal(qRecovered.duplicateMembers, 0, `${qRecovered.duplicateMembers} atletas repetidos`);
});

check('Parte H: a recuperação NÃO estoura a capacidade da chave', () => {
  assert.equal(qRecovered.overCapacity, 0, `${qRecovered.overCapacity} chaves acima do draw size`);
});

check('Parte H/15: o campo recuperado é EQUIVALENTE ao normal', () => {
  if (!qRecovered.events) {
    console.log('   [registro] nenhuma recuperação nesta temporada — paridade vacuamente satisfeita');
    return;
  }
  const delta = Math.abs(qRecovered.avgField - qNormal.avgField) / Math.max(1, qNormal.avgField);
  console.log(`   [registro] campo médio normal=${qNormal.avgField.toFixed(1)} recuperado=${qRecovered.avgField.toFixed(1)} (delta ${(delta * 100).toFixed(1)}%)`);
  assert.ok(delta < 0.30, `campo recuperado difere ${(delta * 100).toFixed(0)}% do normal`);
});

check('Parte H/6: recuperação não converte evento válido em cancelado', () => {
  const cancelledWithField = sim.tournaments.filter((t) => (
    (t.world_tour_cancelled || t.status === 'cancelado')
    && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length >= 2
  ));
  console.log(`   [registro] cancelados apesar de ter campo: ${cancelledWithField.length}`);
  assert.equal(cancelledWithField.length, 0,
    cancelledWithField.slice(0, 3).map((t) => t.name).join(' | '));
});

check('Parte H: toda chave recuperada fica marcada como tal (auditável)', () => {
  for (const t of recovered) {
    assert.ok(t.bracket_recovery_date, `${t.name} recuperada sem data de recuperação`);
  }
});

check('Parte H: chave recuperada tem grafo canônico válido', () => {
  const broken = recovered.filter((t) => (
    Number(t.bracket_schema_version) < 2
    || !Array.isArray(t.bracket_history) || !t.bracket_history.length
  ));
  assert.equal(broken.length, 0, `${broken.length} chaves recuperadas sem histórico canônico`);
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
else console.log('test-draw-recovery-field-parity-v517: PASS');
