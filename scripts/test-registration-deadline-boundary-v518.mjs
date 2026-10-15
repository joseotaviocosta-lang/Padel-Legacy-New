// Playthrough 5.18-H, Partes R/S — A FRONTEIRA DA JANELA DE INSCRIÇÃO.
//
// Autoridade (Playthrough 4.9, Parte C): `registration_deadline < draw_date`,
// NUNCA igual. O sorteio sai em D-3 (TOURNAMENT_DRAW_LEAD_DAYS), então a
// inscrição fecha em D-4 (`defaultCloseDaysBeforeStart: 4`), deixando um dia
// de folga real. Com os dois no mesmo dia, "fechado" dependia da ordem de
// processamento do tick — uma corrida sem vencedor definido.
//
// O vermelho pré-existente que esta fase resolveu estava no TESTE, não na
// regra: `test-tournament-registration-v2` ainda exigia fechamento em D-3
// (esperava closesAt 2026-01-05 para um torneio de 2026-01-08, quando D-4 é
// 2026-01-04). Este teste cobre a fronteira dia a dia para que a confusão não
// volte, incluindo persistência e releitura (Parte S).
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

installShims('/registration-boundary');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const reg = await vite.ssrLoadModule('/src/lib/tournamentRegistration.js');
const draw = await vite.ssrLoadModule('/src/lib/tournamentDraw.js').catch(() => ({}));

const START = '2026-01-08';
const tournament = {
  id: 'boundary', name: 'Boundary Open', tier: 'Silver',
  start_date: START, end_date: '2026-01-10', entry_fee: 100, max_participants: 16,
};
const player = { id: 'p1', partner_id: 'q1', career_date: '2026-01-01', coins: 5000, energy: 100, age: 24 };
const partner = { id: 'q1', status: 'active' };

const rules = reg.TOURNAMENT_REGISTRATION_RULES;
const drawLead = Number(draw.TOURNAMENT_DRAW_LEAD_DAYS ?? 3);
console.log(`\n=== fechamento em D-${rules.defaultCloseDaysBeforeStart} | sorteio em D-${drawLead} | torneio ${START} ===\n`);

const window = reg.getTournamentRegistrationWindow(tournament);
console.log(`janela: abre ${window.opensAt} | fecha ${window.closesAt}\n`);

const DAYS = [
  ['2026-01-02', 'D-6', true],
  ['2026-01-03', 'D-5', true],
  ['2026-01-04', 'D-4 (ultimo dia)', true],
  ['2026-01-05', 'D-3 (dia do sorteio)', false],
  ['2026-01-06', 'D-2', false],
  ['2026-01-07', 'D-1', false],
  ['2026-01-08', 'D-0 (comeco)', false],
];
console.log(`${'data'.padEnd(13)}${'dia'.padEnd(24)}${'permitido'.padEnd(11)}motivo`);
const observed = [];
for (const [date, label, expected] of DAYS) {
  const r = reg.evaluateTournamentRegistration({ player, partner, tournament, currentDate: date });
  observed.push({ date, label, expected, allowed: r.allowed, reasons: r.reasons.map((x) => x.code) });
  console.log(`${date.padEnd(13)}${label.padEnd(24)}${String(r.allowed).padEnd(11)}${r.reasons.map((x) => x.code).join(',') || '-'}`);
}
console.log('');

check('Parte S: a janela fecha exatamente em D-4', () => {
  note(`closesAt=${window.closesAt}`);
  assert.equal(window.closesAt, '2026-01-04');
});

check('Parte S: D-5 e D-4 aceitam, D-3 em diante recusa', () => {
  for (const o of observed) {
    assert.equal(o.allowed, o.expected, `${o.label} (${o.date}): esperado ${o.expected}, veio ${o.allowed} [${o.reasons.join(',')}]`);
  }
  note(`${observed.length} dias verificados na fronteira`);
});

check('Parte S: o invariante deadline < draw_date vale', () => {
  // O dia do sorteio precisa ser ESTRITAMENTE posterior ao fechamento.
  const closes = window.closesAt;
  const drawDate = new Date(`${START}T00:00:00Z`);
  drawDate.setUTCDate(drawDate.getUTCDate() - drawLead);
  const drawIso = drawDate.toISOString().slice(0, 10);
  note(`fechamento=${closes} | sorteio=${drawIso}`);
  assert.ok(closes < drawIso, `fechamento (${closes}) nao e anterior ao sorteio (${drawIso})`);
});

check('Parte S: a recusa em D-3 e por prazo, nao por outro motivo', () => {
  const d3 = observed.find((o) => o.date === '2026-01-05');
  note(`D-3 motivos: ${d3.reasons.join(',')}`);
  assert.ok(d3.reasons.includes('REGISTRATION_CLOSED'), `D-3 recusou por ${d3.reasons.join(',')}`);
});

check('Parte S: a janela sobrevive a persistencia e releitura', () => {
  // Serializa e relê o torneio, como um save faria: a janela derivada tem de
  // ser idêntica (nao depende de estado em memoria).
  const roundTripped = JSON.parse(JSON.stringify(tournament));
  const again = reg.getTournamentRegistrationWindow(roundTripped);
  note(`apos releitura: abre ${again.opensAt} fecha ${again.closesAt}`);
  assert.deepEqual(again, window);
});

check('Parte S: deadline explicito no torneio tem precedencia', () => {
  const custom = { ...tournament, registration_deadline: '2026-01-06' };
  const w = reg.getTournamentRegistrationWindow(custom);
  const at06 = reg.evaluateTournamentRegistration({ player, partner, tournament: custom, currentDate: '2026-01-06' });
  const at07 = reg.evaluateTournamentRegistration({ player, partner, tournament: custom, currentDate: '2026-01-07' });
  note(`deadline explicito ${w.closesAt}: 01-06 permitido=${at06.allowed} | 01-07 permitido=${at07.allowed}`);
  assert.equal(w.closesAt, '2026-01-06');
  assert.equal(at06.allowed, true);
  assert.equal(at07.allowed, false);
});

check('Parte S: virada de dia nao desloca a fronteira', () => {
  // Datas de jogo sao strings YYYY-MM-DD; horario nao participa da comparacao.
  // Um deslize de timezone apareceria como fronteira de um dia errada.
  const withTime = reg.evaluateTournamentRegistration({ player, partner, tournament, currentDate: '2026-01-04' });
  const nextDay = reg.evaluateTournamentRegistration({ player, partner, tournament, currentDate: '2026-01-05' });
  note(`01-04 permitido=${withTime.allowed} | 01-05 permitido=${nextDay.allowed}`);
  assert.equal(withTime.allowed, true);
  assert.equal(nextDay.allowed, false);
});

await vite.close();
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exitCode = 1;
