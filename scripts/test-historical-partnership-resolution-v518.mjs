// Playthrough 5.18-G, Partes A/R/S — A REGRA TEMPORAL, TESTADA.
//
// Este teste existe para que o erro da 5.18-E não possa voltar em silêncio.
// Aquele erro: traduzir `draw_pair_ids` de 2026 pelas linhas de Partnership
// lidas ao fim de 2028. Parcerias se dissolvem e se reformam, e o id de 2026
// passa a apontar para outra dupla — ou para nenhuma. Consequência medida na
// 5.18-F: 6 de 20 duplas do cohort apareciam com 0-1 semanas jogadas quando
// tinham jogado 7-29, produzindo "6 lacunas de 30-34 semanas" inexistentes.
//
// Aqui a reprodução é determinística, sem simulação: monta-se o estado de
// duas datas e mostra-se que a resolução pela data certa acerta e a resolução
// pelo estado final erra.
import assert from 'node:assert/strict';
import {
  resolvePairMembersAt, playedKeysForWeek, activeWindowGaps, pairKey, weekOf, TEMPORAL_RULE,
} from './lib/temporalIntegrity.mjs';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

console.log(`\n=== Regra: ${TEMPORAL_RULE.statement} ===\n`);

// --- cenário --------------------------------------------------------------
// Em fevereiro de 2026 a linha `partnership-X` é a dupla ana+bruno.
// Em 2028 a mesma linha foi reaproveitada e passou a ser carla+diego.
const FEB = '2026-02-12';
const FEB_WEEK = weekOf(FEB);
const partnershipsAtFeb = new Map([
  ['partnership-X', { id: 'partnership-X', athlete_a_id: 'real_ana', athlete_b_id: 'real_bruno', status: 'ativa' }],
]);
const partnershipsAtEnd = new Map([
  ['partnership-X', { id: 'partnership-X', athlete_a_id: 'real_carla', athlete_b_id: 'real_diego', status: 'ativa' }],
]);
const tournaments = [{
  id: 't-feb', start_date: FEB, end_date: '2026-02-15', draw_pair_ids: ['partnership-X'],
}];

check('Parte A: resolver pela data certa identifica a dupla que jogou', () => {
  const m = resolvePairMembersAt('partnership-X', partnershipsAtFeb);
  note(`fevereiro: partnership-X -> ${m?.join(' + ')}`);
  assert.deepEqual(m?.sort(), ['real_ana', 'real_bruno']);
});

check('Parte A: resolver pelo estado final identifica a dupla ERRADA', () => {
  const m = resolvePairMembersAt('partnership-X', partnershipsAtEnd);
  note(`estado final: partnership-X -> ${m?.join(' + ')} (era ana+bruno)`);
  assert.deepEqual(m?.sort(), ['real_carla', 'real_diego']);
  // O teste afirma o ERRO de propósito: é ele que produz lacunas fantasma.
});

check('Parte A: a diferença muda quem aparece como tendo competido', () => {
  const certo = playedKeysForWeek({ tournaments, week: FEB_WEEK, partnershipByIdAtDate: partnershipsAtFeb });
  const errado = playedKeysForWeek({ tournaments, week: FEB_WEEK, partnershipByIdAtDate: partnershipsAtEnd });
  const anaBruno = pairKey('real_ana', 'real_bruno');
  note(`pela data:  ana+bruno jogou = ${certo.has(anaBruno)}`);
  note(`pelo final: ana+bruno jogou = ${errado.has(anaBruno)}`);
  assert.ok(certo.has(anaBruno), 'resolução correta perdeu o jogo');
  assert.ok(!errado.has(anaBruno), 'o cenário não reproduz o erro');
});

check('Parte A: o erro vira lacuna fantasma na contagem semanal', () => {
  const mk = (week, played) => ({ date: FEB, week, mutual: true, played });
  // 30 semanas em que a dupla existe e compete em todas.
  const semanas = Array.from({ length: 30 }, (_, i) => mk(FEB_WEEK + i, true));
  const gapsCertos = activeWindowGaps(semanas);
  // Mesmas 30 semanas, lidas com a tradução errada: nunca competiu.
  const semanasErradas = semanas.map((w) => ({ ...w, played: false }));
  const gapsErrados = activeWindowGaps(semanasErradas);
  note(`resolução correta: ${gapsCertos.length} lacunas`);
  note(`resolução por estado final: ${gapsErrados.length} lacuna de ${gapsErrados[0]?.length} semanas`);
  assert.equal(gapsCertos.length, 0);
  assert.equal(gapsErrados[0]?.length, 30, 'o cenário não reproduz a lacuna de 30 semanas');
});

check('Parte R: profile-pair resolve sem depender de Partnership alguma', () => {
  // O id sintético carrega os membros; é imune ao problema acima.
  const m = resolvePairMembersAt('profile-pair:real_ana:real_bruno', partnershipsAtEnd);
  note(`profile-pair resolvido com o mapa ERRADO: ${m?.join(' + ')}`);
  assert.deepEqual(m?.sort(), ['real_ana', 'real_bruno']);
});

check('Parte R: ids de atleta com underscore não quebram a chave', () => {
  // `real_arturo_coello` contém underscores; qualquer split('_') destrói a
  // chave. Erro cometido e corrigido na 5.18-F.
  const k = pairKey('real_arturo_coello', 'real_agustin_tapia');
  note(`chave: ${k}`);
  assert.equal(k.split('_').length, 6, 'o cenário não cobre ids com underscore');
  assert.ok(k.includes('real_arturo_coello') && k.includes('real_agustin_tapia'));
});

check('Parte A: a regra declara fontes admitidas e proibidas', () => {
  note(`admitidas: ${TEMPORAL_RULE.allowedSources.join(', ')}`);
  note(`proibidas: ${TEMPORAL_RULE.forbiddenSources.join(', ')}`);
  assert.ok(TEMPORAL_RULE.forbiddenSources.includes('partnership-lida-no-fim-da-simulacao'));
  assert.ok(TEMPORAL_RULE.allowedSources.includes('partnership-snapshot-da-data'));
});

console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
