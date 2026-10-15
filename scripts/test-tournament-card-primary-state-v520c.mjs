// Playthrough 5.20-C, item 1 — UM ESTADO PRINCIPAL POR CARD DE TORNEIO.
//
// O card empilhava ate cinco selos simultaneos (tier, "escolha estrategica",
// estado terminal, aviso de inscricao e o caminho da analise do treinador).
// A 5.20-B mediu ~340px de altura por card em 360px sem nenhuma hierarquia.
//
// O resolvedor NAO cria uma segunda verdade: ele classifica o que
// `getPlayerTournamentRegistrationState` e `getTournamentDrawState` ja
// decidiram. Este teste cobra tres coisas:
//   1. os 8 estados do briefing existem e tem apresentacao propria;
//   2. terminal vence situacional (o defeito da 4.5C, em que "Encerrado"
//      generico cobria cancelado E concluido, era exatamente a falta disso);
//   3. o card renderiza UM selo de estado, nao uma cadeia deles.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let passed = 0; let failed = 0;
const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
function check(label, fn) {
  try { fn(); passed += 1; console.log(`${PASS} ${label}`); }
  catch (error) { failed += 1; console.log(`${FAIL} ${label}`); console.log(`   ${error.message}`); }
}
const note = (msg) => console.log(`   [registro] ${msg}`);

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const {
  resolveTournamentCardState, getTournamentCardPresentation,
  TOURNAMENT_CARD_STATE, ALL_TOURNAMENT_CARD_STATES,
} = await server.ssrLoadModule('/src/lib/tournamentCardState.js');
const { TOURNAMENT_REGISTRATION_STATE: S } = await server.ssrLoadModule('/src/lib/tournamentRegistrationState.js');
const CARD = readFileSync(new URL('../src/pages/Tournaments.jsx', import.meta.url), 'utf8');

console.log('\n=== Item 1: os 8 estados do briefing ===');
const EXIGIDOS = ['OPEN', 'REGISTERED', 'AWAITING_DRAW', 'DRAWN', 'PLAY_TODAY', 'ELIMINATED', 'COMPLETED', 'CANCELLED'];
check('item 1 (gate): os 8 estados do briefing existem', () => {
  const faltando = EXIGIDOS.filter((e) => !TOURNAMENT_CARD_STATE[e]);
  assert.deepEqual(faltando, [], `estados ausentes: ${faltando.join(', ')}`);
});
check('item 1: todo estado declarado tem rotulo e tom proprios', () => {
  const mudos = ALL_TOURNAMENT_CARD_STATES.filter((e) => {
    const p = getTournamentCardPresentation(e);
    return !p || !p.label || !p.tone;
  });
  assert.deepEqual(mudos, [], `estado sem apresentacao: ${mudos.join(', ')}`);
});
check('item 1: rotulos sao distintos entre si', () => {
  const labels = ALL_TOURNAMENT_CARD_STATES.map((e) => getTournamentCardPresentation(e).label);
  const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
  assert.deepEqual(dup, [], `rotulo repetido em dois estados: ${dup.join(', ')}`);
});

console.log('\n=== Item 1: classificacao ===');
const CASOS = [
  ['inscricoes abertas', { registrationState: S.REGISTRATION_OPEN }, 'OPEN'],
  ['inscrito', { registrationState: S.REGISTERED }, 'REGISTERED'],
  ['aguardando sorteio', { registrationState: S.REGISTERED, isPast: true }, 'AWAITING_DRAW'],
  ['chave definida', { registrationState: S.DRAWN }, 'DRAWN'],
  ['em andamento conta como chave definida', { registrationState: S.IN_PROGRESS }, 'DRAWN'],
  ['jogar hoje', { registrationState: S.IN_PROGRESS, playableToday: true }, 'PLAY_TODAY'],
  ['eliminado', { registrationState: S.ELIMINATED }, 'ELIMINATED'],
  ['concluido', { registrationState: S.COMPLETED }, 'COMPLETED'],
  ['cancelado', { registrationState: S.REGISTERED, cancelled: true }, 'CANCELLED'],
  ['fora da janela, data passada', { registrationState: S.REGISTRATION_CLOSED, isPast: true }, 'CLOSED'],
  ['desistencia encerra o evento para o jogador', { registrationState: S.WITHDRAWN }, 'CLOSED'],
];
console.log('caso                                          estado');
for (const [nome, entrada, esperado] of CASOS) {
  console.log(`${nome.padEnd(45)} ${resolveTournamentCardState(entrada)}`);
}
check('item 1 (gate): cada situacao resolve para o estado correto', () => {
  for (const [nome, entrada, esperado] of CASOS) {
    assert.equal(resolveTournamentCardState(entrada), TOURNAMENT_CARD_STATE[esperado], `${nome}`);
  }
});

console.log('\n=== Item 1: terminal vence situacional ===');
check('item 1 (gate): cancelado vence qualquer situacao', () => {
  for (const estado of [S.REGISTRATION_OPEN, S.REGISTERED, S.DRAWN, S.IN_PROGRESS]) {
    assert.equal(
      resolveTournamentCardState({ registrationState: estado, cancelled: true, playableToday: true }),
      TOURNAMENT_CARD_STATE.CANCELLED,
      `cancelado perdeu para ${estado}`,
    );
  }
});
check('item 1 (gate): eliminado nao volta a ser jogavel', () => {
  assert.equal(
    resolveTournamentCardState({ registrationState: S.ELIMINATED, playableToday: true }),
    TOURNAMENT_CARD_STATE.ELIMINATED,
  );
});
check('item 1 (gate): concluido nao volta a ser jogavel', () => {
  assert.equal(
    resolveTournamentCardState({ registrationState: S.COMPLETED, playableToday: true }),
    TOURNAMENT_CARD_STATE.COMPLETED,
  );
});
check('item 1: entrada vazia nao explode nem mente', () => {
  const r = resolveTournamentCardState({});
  assert.ok(ALL_TOURNAMENT_CARD_STATES.includes(r), `estado invalido: ${r}`);
  assert.notEqual(r, TOURNAMENT_CARD_STATE.OPEN, 'sem dado nenhum nao se anuncia inscricao aberta');
});

console.log('\n=== Item 1: o card renderiza UM selo ===');
const cardBody = CARD.slice(CARD.indexOf('function TournamentCard'));
const selos = (cardBody.match(/<StatusBadge/g) || []).length;
note(`StatusBadge dentro do card=${selos}`);
check('item 1 (gate): o card nao empilha cadeia de selos de estado', () => {
  assert.ok(selos <= 2, `${selos} StatusBadge no card; o estado principal deve ser um so`);
});
check('item 1 (gate): o card consome o resolvedor, nao reimplementa estado', () => {
  assert.ok(CARD.includes('resolveTournamentCardState('), 'card nao usa o resolvedor');
  assert.ok(!cardBody.includes('>Cancelado<'), 'rotulo de estado ainda escrito a mao no card');
  assert.ok(!cardBody.includes('>Encerrado<'), 'rotulo de estado ainda escrito a mao no card');
});
check('item 1: a descricao longa foi rebaixada para os detalhes', () => {
  assert.ok(!cardBody.includes('line-clamp-2'), 'descricao ainda ocupa o card');
});

await server.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
