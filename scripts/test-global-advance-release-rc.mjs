import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDayAdvanceController } from '../src/game-core/dayAdvanceController.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const addDay = (date) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
};

let releaseFirstSecondary;
const firstSecondaryGate = new Promise((resolve) => { releaseFirstSecondary = resolve; });
let coreCalls = 0;
let secondaryCalls = 0;
const transitions = [];
const notifications = [];
const monthlyReports = [];

const controller = createDayAdvanceController({
  advanceCore: async (profile) => {
    coreCalls += 1;
    if (profile.failPersistence) throw new Error('falha controlada de persistência');
    return { ...profile, career_date: addDay(profile.career_date) };
  },
  processSecondary: async (profile) => {
    secondaryCalls += 1;
    if (secondaryCalls === 1) await firstSecondaryGate;
    if (profile.career_date === '2026-02-17') notifications.push('TOURNAMENT_UPCOMING');
    if (profile.career_date.endsWith('-01')) monthlyReports.push(profile.career_date.slice(0, 7));
    return profile;
  },
});
controller.subscribe((processing) => transitions.push(processing));

let profile = { id: 'player-1', career_date: '2026-02-10' };
assert.equal(controller.isProcessing(), false, 'botão deve começar habilitado');
profile = await controller.run(profile);
assert.equal(profile.career_date, '2026-02-11');
assert.equal(controller.isProcessing(), false, 'core concluído deve liberar o botão mesmo com pós-processamento pendente');

profile = await controller.run(profile);
assert.equal(profile.career_date, '2026-02-12', 'segundo clique deve funcionar sem esperar tarefa secundária');
assert.equal(controller.isProcessing(), false);
releaseFirstSecondary();

for (let index = 0; index < 18; index += 1) {
  const before = profile.career_date;
  profile = await controller.run(profile);
  assert.equal(profile.career_date, addDay(before), `avanço ${index + 3} deve somar exatamente um dia`);
  assert.equal(controller.isProcessing(), false, `avanço ${index + 3} deve liberar o lock`);
}

await controller.waitForSecondaryWork();
assert.equal(profile.career_date, '2026-03-02', '20 avanços desde 10/02 devem terminar em 02/03');
assert.equal(coreCalls, 20, 'cada clique deve executar um único core');
assert.equal(secondaryCalls, 20, 'cada avanço deve possuir um pós-processamento finito');
assert.deepEqual(notifications, ['TOURNAMENT_UPCOMING'], 'notificação de torneio não pode reter ou duplicar o lock');
assert.deepEqual(monthlyReports, ['2026-03'], 'virada do mês deve gerar relatório e concluir');

await assert.rejects(controller.run({ ...profile, failPersistence: true }), /falha controlada de persistência/);
assert.equal(controller.isProcessing(), false, 'erro de persistência deve liberar o botão no finally real');
assert.deepEqual(transitions.slice(0, 3), [false, true, false]);
assert.equal(transitions.at(-1), false);

const coordinatorSource = read('src/game-core/dayAdvanceCoordinator.js');
const controllerSource = read('src/game-core/dayAdvanceController.js');
const controlSource = read('src/components/career/CareerDayControl.jsx');
const pkg = JSON.parse(read('package.json'));
const sourceChecks = [
  ['label observa somente o lock do avanço', controlSource.includes('subscribeCareerDayAdvance(setProcessing)') && controlSource.includes("'Processando...'")],
  ['core adia GameState e living world', coordinatorSource.includes('deferGameState: true') && coordinatorSource.includes('deferGlobalProcessing: true')],
  ['tarefas secundárias usam o GameState central', coordinatorSource.includes('processGameStateDay(fresh, previousDate, currentDate)')],
  ['liberação antecede o agendamento secundário', controllerSource.includes('if (!next && completedCore)') && controllerSource.includes('queueMicrotask(() => scheduleSecondary(descriptor))')],
  ['instrumentação DEV cobre click, lock, core, persistência e eventos', ['[GlobalAdvance] click', '[GlobalAdvance] lock=', '[GlobalAdvance] advanceCareerDay:start', '[GlobalAdvance] advanceCareerDay:done', '[GlobalAdvance] persist:done', '[GlobalAdvance] postDayEvents:start', '[GlobalAdvance] postDayEvents:done', '[AdvanceState]'].every((token) => `${coordinatorSource}\n${controllerSource}\n${controlSource}`.includes(token))],
  ['sem timeout, reload ou reset por mudança de data', !controlSource.includes('setTimeout') && !coordinatorSource.includes('setTimeout') && !controllerSource.includes('setTimeout') && !coordinatorSource.includes('location.reload')],
  ['script npm registrado', pkg.scripts?.['test:global-advance-release'] === 'node scripts/test-global-advance-release-rc.mjs'],
];

for (const [name, ok] of sourceChecks) {
  assert.equal(ok, true, `FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

console.log('GlobalAdvanceReleaseRCTest: PASS');
console.log('✓ 20 avanços consecutivos: 10/02/2026 → 02/03/2026');
console.log('✓ virada mensal, notificação, erro de persistência e secondary work pendente liberam o botão');
