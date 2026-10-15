// Playthrough 5.18-H, Partes R.2/T — SEMANA SEM EVENTO É ATRIBUÍDA, NÃO É FALHA.
//
// O segundo vermelho pré-existente: `test-field-selection-no-better-pair-drop-v515`
// falhava com "46% das duplas Top20 não disputaram NADA na semana de um
// Masters". A própria saída daquele teste mostrava a causa: 111 das 240
// avaliações eram semanas em que NÃO HAVIA torneio nenhum no calendário para
// aquela dupla. Exigir atividade onde não existe evento é uma asserção
// mal-posta, não um defeito do mundo.
//
// A Parte R.2 dá o critério: se o teste exige atividade quando não existe
// evento compatível, corrigir o TESTE; se o calendário deveria ter evento e
// não tem, corrigir o calendário. Este teste separa as duas coisas — uma
// semana ociosa sem evento elegível tem de ser classificada como
// NO_EVENTS/NO_ELIGIBLE_EVENT, nunca contada como inatividade inexplicada.
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

installShims('/idle-no-event');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const sel = await vite.ssrLoadModule('/src/gameplay/worldTour/TournamentSelectionAI.js');
const { chooseTournament, CHOOSE_NONE_REASONS } = sel;

const elite = { id: 'e1', energy: 100, rank: 5, ranking_position: 5, overall_rating: 92, age: 27 };
const mk = (id, tier) => ({ id, tier, name: id, start_date: '2026-05-04', end_date: '2026-05-07', world_region: 'Europa' });

console.log('\n=== Parte T: a semana ociosa da elite, classificada ===\n');

check('Parte T: semana sem NENHUM torneio -> NO_EVENTS', () => {
  const r = chooseTournament([], elite, { aiFieldContext: true });
  note(`decisao=${r.decision} codigo=${r.reasonCode}`);
  assert.equal(r.reasonCode, CHOOSE_NONE_REASONS.NO_EVENTS);
});

check('Parte T: semana so com torneio inacessivel -> NO_ELIGIBLE_EVENT', () => {
  // Uma dupla #5 e overqualified para Bronze/Silver: existe torneio na semana,
  // mas nenhum que ela dispute. Isto e o caso das 111 avaliacoes do v515.
  const r = chooseTournament([mk('b', 'Bronze'), mk('s', 'Silver')], elite, { aiFieldContext: true });
  note(`decisao=${r.decision} codigo=${r.reasonCode} elegiveis=${r.options.length}`);
  assert.equal(r.reasonCode, CHOOSE_NONE_REASONS.NO_ELIGIBLE_EVENT);
});

check('Parte T: as duas situacoes sao DISTINGUIVEIS', () => {
  // O ponto da Parte T: antes desta fase as duas devolviam a mesma frase, e
  // por isso "elite ociosa" parecia um so fenomeno.
  const a = chooseTournament([], elite, { aiFieldContext: true });
  const b = chooseTournament([mk('b', 'Bronze')], elite, { aiFieldContext: true });
  note(`sem calendario=${a.reasonCode} | so tier inacessivel=${b.reasonCode}`);
  assert.notEqual(a.reasonCode, b.reasonCode);
});

check('Parte T: com evento compativel a elite compete', () => {
  const r = chooseTournament([mk('m', 'Masters')], elite, { aiFieldContext: true });
  note(`decisao=${r.decision} torneio=${r.tournament?.id}`);
  assert.equal(r.decision, 'play');
});

check('Parte R.2: ociosidade sem evento nao e inatividade inexplicada', () => {
  // Gate metodologico: toda semana em que a dupla nao joga tem de ter codigo,
  // e o codigo distingue "o mundo nao ofereceu" de "a dupla recusou".
  const semanas = [
    { label: 'sem calendario', events: [] },
    { label: 'so Bronze/Silver', events: [mk('b', 'Bronze'), mk('s', 'Silver')] },
    { label: 'com Masters', events: [mk('m', 'Masters')] },
  ];
  const semOferta = new Set([CHOOSE_NONE_REASONS.NO_EVENTS, CHOOSE_NONE_REASONS.NO_ELIGIBLE_EVENT]);
  let ofertadas = 0; let naoOfertadas = 0;
  for (const s of semanas) {
    const r = chooseTournament(s.events, elite, { aiFieldContext: true });
    if (r.decision === 'play') { ofertadas += 1; continue; }
    assert.ok(r.reasonCode, `${s.label}: recusa sem codigo`);
    if (semOferta.has(r.reasonCode)) naoOfertadas += 1;
    note(`${s.label}: ${r.decision}${r.reasonCode ? ` (${r.reasonCode})` : ''}`);
  }
  note(`semanas com oferta real: ${ofertadas} | sem oferta do mundo: ${naoOfertadas}`);
  assert.equal(ofertadas + naoOfertadas, semanas.length, 'alguma semana ficou sem classificacao');
});

check('Parte R.2: a ociosidade da elite nao vem de recusa quando ha evento', () => {
  // Com energia cheia e Masters disponivel, nao existe razao de recusa.
  const r = chooseTournament([mk('m', 'Masters'), mk('c', 'Crown')], elite, { aiFieldContext: true });
  note(`restScore=${r.restScore} melhorScore=${r.options[0]?.score} decisao=${r.decision}`);
  assert.equal(r.decision, 'play');
  assert.equal(r.restScore, 0, 'elite descansada com restScore acima de zero');
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
