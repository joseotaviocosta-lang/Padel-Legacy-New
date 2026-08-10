import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSingleFlightCoordinator } from '../src/game-core/singleFlightCoordinator.js';
import { compactGameStateReport } from '../src/game-core/gameStateReport.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function addDay(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function containsProfileKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'profile')) return true;
  return Object.values(value).some(containsProfileKey);
}

let currentDate = '2026-02-11';
let calls = 0;
const transitions = [];
const advance = createSingleFlightCoordinator(async (context = {}) => {
  calls += 1;
  if (context.fail) throw new Error('falha controlada');
  if (context.waitFor) await context.waitFor;
  currentDate = addDay(currentDate);
  return {
    career_date: currentDate,
    events: context.events || [],
    tournamentRun: context.tournamentRun || null,
  };
});
const unsubscribe = advance.subscribe((processing) => transitions.push(processing));

assert.equal(advance.isProcessing(), false, 'botão deve iniciar habilitado');

for (let index = 0; index < 10; index += 1) {
  const before = currentDate;
  const operation = advance.run();
  assert.equal(advance.isProcessing(), true, `avanço ${index + 1} não ativou processing`);
  const updated = await operation;
  assert.equal(updated.career_date, addDay(before), `avanço ${index + 1} não somou exatamente um dia`);
  assert.equal(advance.isProcessing(), false, `avanço ${index + 1} não liberou processing`);
}

assert.equal(currentDate, '2026-02-21', 'dez avanços consecutivos devem terminar em 21/02/2026');
assert.equal(calls, 10, 'cada avanço deve executar uma única vez');

let releaseDoubleClick;
const doubleClickGate = new Promise((resolve) => { releaseDoubleClick = resolve; });
const firstClick = advance.run({ waitFor: doubleClickGate });
const secondClick = advance.run({ waitFor: doubleClickGate });
assert.equal(firstClick, secondClick, 'clique duplo deve compartilhar a mesma Promise');
assert.equal(calls, 10, 'executor não deve iniciar antes do microtask agendado');
await Promise.resolve();
assert.equal(calls, 11, 'clique duplo deve chamar advanceDay apenas uma vez');
releaseDoubleClick();
await Promise.all([firstClick, secondClick]);
assert.equal(currentDate, '2026-02-22', 'clique duplo não pode avançar dois dias');
assert.equal(advance.isProcessing(), false, 'clique duplo deve liberar processing ao concluir');

await assert.rejects(advance.run({ fail: true }), /falha controlada/);
assert.equal(advance.isProcessing(), false, 'erro deve liberar processing no finally');

const dateAfterError = currentDate;
const specialResult = await advance.run({
  events: ['treino', 'recuperacao', 'lesao', 'entrevista', 'missao', 'notificacao', 'mundo_vivo'],
  tournamentRun: { status: 'between_rounds', nextRound: 'R16', matchDate: addDay(currentDate) },
});
assert.equal(specialResult.career_date, addDay(dateAfterError), 'eventos especiais não podem impedir o avanço');
assert.equal(specialResult.tournamentRun.nextRound, 'R16', 'próxima rodada do torneio deve ser preservada');
assert.equal(advance.isProcessing(), false, 'eventos especiais e torneio devem liberar processing');

const dateChangedOutsideOperation = addDay(currentDate);
currentDate = dateChangedOutsideOperation;
assert.equal(advance.isProcessing(), false, 'mudar currentDate sem operação não pode reativar loading');

let nestedProfile = { id: 'player-1', career_date: '2026-02-11' };
const reportSizes = [];
for (let index = 0; index < 10; index += 1) {
  const lifecycleReport = {
    previousDate: nestedProfile.career_date,
    currentDate: addDay(nestedProfile.career_date),
    world: { profile: nestedProfile, processed: 80, events: [{ id: `world-${index}` }] },
    medical: { profile: nestedProfile, recovered: index % 2 === 0 },
    staff: { profile: nestedProfile, processed: true },
  };
  const compacted = compactGameStateReport(lifecycleReport);
  assert.equal(compacted.changed, true, 'snapshot de profile embutido deve ser detectado');
  assert.equal(containsProfileKey(compacted.report), false, 'relatório persistido não pode conter profile');
  nestedProfile = {
    ...nestedProfile,
    career_date: lifecycleReport.currentDate,
    game_state_last_report: compacted.report,
  };
  reportSizes.push(JSON.stringify(nestedProfile.game_state_last_report).length);
}
assert.ok(Math.max(...reportSizes) < 1000, 'relatório diário deve permanecer compacto após dez dias');
assert.ok(reportSizes[9] < reportSizes[0] * 2, 'relatório não pode crescer recursivamente');

unsubscribe();
assert.deepEqual(transitions.slice(0, 3), [false, true, false], 'assinatura deve sincronizar estado inicial e primeiro ciclo');

const control = read('src/components/career/CareerDayControl.jsx');
const dayCoordinator = read('src/game-core/dayAdvanceCoordinator.js');
const gameState = read('src/game-core/gameStateLifecycle.js');
const calendar = read('src/game-core/calendarLifecycle.js');

const sourceChecks = [
  ['botão usa o estado operacional central', control.includes('subscribeCareerDayAdvance(setProcessing)')],
  ['botão normal volta para Avançar', control.includes("'Avançar'") && control.includes('processing ?')],
  ['header não cria outro advanceDay', dayCoordinator.includes('await advanceCareerDay(profile)')],
  ['coordenador é single-flight', dayCoordinator.includes('createSingleFlightCoordinator')],
  ['relatório final é compactado', gameState.includes('game_state_last_report: persistedReport')],
  ['save antigo contaminado é reparado', calendar.includes('compacted.changed') && calendar.includes('game_state_last_report: compacted.report')],
  ['sem timeout artificial', !control.includes('setTimeout') && !dayCoordinator.includes('setTimeout')],
  ['sem loading reativado por data', !/useEffect\([\s\S]{0,160}setProcessing\(true\)/.test(control)],
];

for (const [name, passed] of sourceChecks) {
  assert.equal(passed, true, `FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

console.log('HeaderAdvanceDayRCTest: PASS');
console.log('✓ 10 avanços consecutivos: 11/02/2026 → 21/02/2026');
console.log('✓ sucesso, erro, clique duplo, eventos especiais e torneio liberam processing');
console.log('✓ relatório do GameState permanece compacto e sem snapshots recursivos do perfil');

