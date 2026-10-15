// Playthrough 5.18-H, Partes B/C/J/K — OBSERVABILIDADE DA ESCOLHA.
//
// Antes desta fase, os DOIS ramos de `rest` em chooseTournament devolviam a
// MESMA frase, de modo que "nenhum evento elegível" era indistinguível de "a
// dupla preferiu descansar". A 5.18-G mediu 98,5% das semanas ociosas da
// elite caindo em CHOOSE_NONE — inútil como diagnóstico, justamente por isso.
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

installShims('/choose-observability');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const sel = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentSelectionAI.js');
const { chooseTournament, setChoiceObserver, CHOOSE_NONE_REASONS } = sel;

const mkEvent = (id, tier, start = '2026-03-02') => ({
  id, tier, name: id, start_date: start, end_date: '2026-03-05', world_region: 'Europa',
});
const athlete = (energy, rank) => ({ id: 'a', energy, rank, ranking_position: rank, overall_rating: 80, age: 26 });

console.log('\n=== Parte C: cada ramo tem codigo proprio ===\n');

check('Parte C: sem torneio na semana -> NO_EVENTS', () => {
  const r = chooseTournament([], athlete(100, 50));
  note(`decisao=${r.decision} codigo=${r.reasonCode}`);
  assert.equal(r.decision, 'rest');
  assert.equal(r.reasonCode, CHOOSE_NONE_REASONS.NO_EVENTS);
});

check('Parte C: torneios existem mas nenhum elegivel -> NO_ELIGIBLE_EVENT', () => {
  // Rank 50 fica "overqualified" para Bronze (teto 400) e nao ha tier superior aqui.
  const r = chooseTournament([mkEvent('t-bronze', 'Bronze')], athlete(100, 50), { aiFieldContext: true });
  note(`decisao=${r.decision} codigo=${r.reasonCode} elegiveis=${r.options.length}`);
  assert.equal(r.reasonCode, CHOOSE_NONE_REASONS.NO_ELIGIBLE_EVENT);
});

check('Parte C: elegivel mas exausto -> REST_POLICY', () => {
  const r = chooseTournament([mkEvent('t-gold', 'Gold')], athlete(10, 500), { aiFieldContext: true });
  note(`decisao=${r.decision} codigo=${r.reasonCode} restScore=${r.restScore} melhorScore=${r.options[0]?.score}`);
  assert.equal(r.decision, 'rest');
  assert.equal(r.reasonCode, CHOOSE_NONE_REASONS.REST_POLICY);
});

check('Parte C: elegivel e descansado -> play, sem codigo de recusa', () => {
  const r = chooseTournament([mkEvent('t-gold', 'Gold')], athlete(100, 500), { aiFieldContext: true });
  note(`decisao=${r.decision} torneio=${r.tournament?.id} restScore=${r.restScore}`);
  assert.equal(r.decision, 'play');
  assert.equal(r.reasonCode, undefined);
});

check('Parte C: nenhum ramo devolve recusa sem codigo', () => {
  const cases = [
    [[], athlete(100, 50)],
    [[mkEvent('b', 'Bronze')], athlete(100, 50)],
    [[mkEvent('g', 'Gold')], athlete(5, 500)],
    [[mkEvent('g', 'Gold')], athlete(100, 500)],
  ];
  for (const [events, a] of cases) {
    const r = chooseTournament(events, a, { aiFieldContext: true });
    if (r.decision !== 'play') assert.ok(r.reasonCode, `recusa sem codigo: ${JSON.stringify(r).slice(0, 120)}`);
  }
  note(`${cases.length} combinacoes verificadas, nenhuma recusa sem codigo`);
});

console.log('\n=== Parte B: captura no instante da decisao ===\n');

check('Parte B: o observador recebe o detalhe por evento', () => {
  let captured = null;
  setChoiceObserver((rec) => { captured = rec; });
  chooseTournament([mkEvent('t1', 'Gold'), mkEvent('t2', 'Bronze')], athlete(100, 500), { aiFieldContext: true });
  setChoiceObserver(null);
  assert.ok(captured, 'observador nao foi chamado');
  note(`eventos observados=${captured.availableEvents.length} elegiveis=${captured.eligibleCount} energia=${captured.energy}`);
  assert.equal(captured.availableEvents.length, 2);
  for (const ev of captured.availableEvents) {
    assert.ok(ev.tournamentId && ev.tier, 'evento sem identidade');
    assert.ok(typeof ev.eligible === 'boolean', 'elegibilidade ausente');
    assert.ok(ev.eligibilityReason, 'motivo de elegibilidade ausente');
    if (ev.eligible) assert.ok(Number.isFinite(ev.finalChoiceScore), 'score final ausente em evento elegivel');
  }
});

check('Parte B: o observador e opcional e null por padrao', () => {
  setChoiceObserver(null);
  const r = chooseTournament([mkEvent('t', 'Gold')], athlete(100, 500), { aiFieldContext: true });
  note(`sem observador: decisao=${r.decision}`);
  assert.equal(r.decision, 'play');
});

check('Parte B: setChoiceObserver ignora valores nao-funcao', () => {
  setChoiceObserver('nao-funcao');
  const r = chooseTournament([mkEvent('t', 'Gold')], athlete(100, 500), { aiFieldContext: true });
  note('valor invalido nao quebra a decisao');
  assert.equal(r.decision, 'play');
  setChoiceObserver(null);
});

console.log('\n=== Parte J/K: a fronteira de energia ===\n');
console.log(`${'energia'.padEnd(9)}${'restScore'.padEnd(11)}${'melhorScore'.padEnd(13)}decisao`);
const boundary = [];
for (const e of [0, 20, 40, 55, 60, 70, 75, 79, 80, 100]) {
  const r = chooseTournament([mkEvent('t-gold', 'Gold')], athlete(e, 500), { aiFieldContext: true });
  boundary.push({ e, rest: r.restScore, best: r.options[0]?.score ?? null, decision: r.decision });
  console.log(`${String(e).padEnd(9)}${String(r.restScore).padEnd(11)}${String(r.options[0]?.score ?? '-').padEnd(13)}${r.decision}`);
}
console.log('');

check('Parte J/K: restScore zera em energia 80 (origem do alvo de recuperacao)', () => {
  const at80 = boundary.find((b) => b.e === 80);
  note(`energia 80 -> restScore ${at80.rest}`);
  assert.equal(at80.rest, 0, 'a formula nao zera em 80 — o alvo de recuperacao perde a justificativa');
});

check('Parte J/K: energia alta sempre permite competir', () => {
  const high = boundary.filter((b) => b.e >= 80);
  note(`decisoes com energia >=80: ${high.map((b) => `${b.e}=${b.decision}`).join(' ')}`);
  for (const b of high) assert.equal(b.decision, 'play', `energia ${b.e} recusou competir`);
});

check('Parte J/K: exaustao produz recusa (o mecanismo existe de proposito)', () => {
  const low = boundary.filter((b) => b.e <= 20);
  note(`decisoes com energia <=20: ${low.map((b) => `${b.e}=${b.decision}`).join(' ')}`);
  for (const b of low) assert.equal(b.decision, 'rest', `energia ${b.e} deveria priorizar recuperacao`);
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
