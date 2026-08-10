import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getCareerDatePresentation } from '../src/lib/careerDatePresentation.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const layout = read('src/components/AppLayout.jsx');
const control = read('src/components/career/CareerDayControl.jsx');
const coordinator = read('src/game-core/dayAdvanceCoordinator.js');
const lifecycle = read('src/game-core/calendarLifecycle.js');
const calendarPage = read('src/pages/CalendarPage.jsx');
const trainingPage = read('src/pages/Training.jsx');
const careerCalendar = read('src/components/career/CareerCalendar.jsx');

assert.deepEqual(getCareerDatePresentation('2026-01-01'), {
  fullDate: '01/01/2026', compactDate: '01/01', weekday: 'Quinta-feira', weekdayShort: 'QUI',
});
assert.equal(getCareerDatePresentation('2026-01-02').weekday, 'Sexta-feira');
assert.equal(getCareerDatePresentation('2026-01-03').weekday, 'Sábado');

const checks = [
  ['controle global presente nas barras mobile e desktop', (layout.match(/<CareerDayControl/g) || []).length === 2],
  ['data derivada do perfil já carregado', control.includes('profile?.career_date') && !control.includes('localGame')],
  ['locale pt-BR centralizado', read('src/lib/careerDatePresentation.js').includes("Intl.DateTimeFormat('pt-BR'")],
  ['ação +1 dia visível', control.includes("'+1 DIA'") && control.includes("'+1'")],
  ['coordenador reutiliza a porta oficial', coordinator.includes("import { advanceCareerDay } from './calendarLifecycle'") && coordinator.includes('activeRequest = advanceCareerDay(profile)')],
  ['single-flight impede processamento duplicado', coordinator.includes('if (activeRequest) return activeRequest')],
  ['estado sempre limpo após sucesso ou erro', coordinator.includes('.finally(() =>') && coordinator.includes('publishProcessing(false)')],
  ['feedback de erro e desbloqueio preservados', control.includes("variant: 'destructive'") && control.includes('subscribeCareerDayAdvance')],
  ['bloqueios oficiais permanecem no fluxo', lifecycle.includes('advanceDay(profile') && lifecycle.includes('processGameStateDay')],
  ['todos os atalhos de um dia usam o coordenador', [calendarPage, trainingPage, careerCalendar].every((source) => source.includes('advanceCareerDayOnce'))],
  ['nenhum atalho de UI chama advanceDay diretamente', [calendarPage, trainingPage, careerCalendar].every((source) => !/\badvanceDay\s*\(/.test(source))],
  ['largura mínima e data sem quebra', control.includes('min-w-[3.75rem]') && control.includes('min-w-[7.35rem]') && control.includes('whitespace-nowrap')],
  ['layout protege contra overflow horizontal', layout.includes('overflow-x-hidden')],
  ['acessibilidade do botão', control.includes('aria-label="Avançar carreira em um dia"') && control.includes('aria-busy={processing}') && control.includes('title="Avançar carreira em um dia"')],
  ['sem polling ou processamento durante render', !control.includes('setInterval') && !control.includes('localGame')],
];

for (const [name, ok] of checks) {
  assert.equal(ok, true, `FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

console.log(`GlobalHeaderCalendarRCTest: PASS (${checks.length + 3}/${checks.length + 3})`);
