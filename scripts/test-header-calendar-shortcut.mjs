// Hotfix 14.1 (docs/HOTFIX_14_1_MATCH_UX_INTERVIEWS.md, Parte 17-21/26).
//
// Estrutural: CareerDayControl.jsx (fonte real, único componente — usado
// tanto no header mobile compact quanto no desktop, Parte 17) + confirma
// a rota canônica (/game/calendar, já usada por describeCalendarBlock/
// CareerCalendar.jsx — nenhuma rota nova/duplicada).
import { readFileSync } from 'node:fs';

let gates = 0;
function gate(label, condition) {
  gates += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) throw new Error(`GATE FALHOU: ${label}`);
}

const source = readFileSync('src/components/career/CareerDayControl.jsx', 'utf8');
const appSource = readFileSync('src/App.jsx', 'utf8');

gate('Rota canônica /game/calendar existe em App.jsx (nenhuma rota nova/duplicada criada)', /path="\/game\/calendar"/.test(appSource));

gate('Botão navega para a rota canônica do calendário', /onClick=\{\(\) => navigate\(APP_ROUTES\.CALENDAR\)\}/.test(source));
gate('Data é um <button> real (semântico, focável, Enter/Space nativos) — não mais um <div> só informativo', /<button[\s\S]{0,800}date\.weekdayShort/.test(source));
gate('Acessibilidade: aria-label "Abrir calendário" presente', /aria-label="Abrir calendário"/.test(source));
gate('Tooltip discreto presente (title)', /title="Abrir calendário"/.test(source));
gate('Hover discreto (mudança de fundo), não um CTA grande — nenhuma classe bg-primary/bg-emerald/bg-green no botão da data', /hover:bg-secondary\/60/.test(source) && !/hover:bg-secondary\/60[\s\S]{0,50}bg-(primary|emerald|green)/.test(source));
gate('Foco visível (focus-visible:ring) para navegação por teclado', /focus-visible:ring-2 focus-visible:ring-primary/.test(source));

// Botão "Avançar" continua separado e intocado (Parte 19): mesmo texto,
// mesmo handler (handleAdvance), mesma função — não reaproveitado pelo
// clique na data.
gate('Botão "Avançar" continua um elemento separado com seu próprio onClick={handleAdvance} (não foi fundido com o botão da data)', /onClick=\{handleAdvance\}/.test(source));
gate('handleAdvance não foi alterado — ainda chama advanceCareerDayOnce e describeCalendarBlock (Parte 20: navegação para o calendário não é uma forma de avanço)', /await advanceCareerDayOnce\(profile\)/.test(source) && /describeCalendarBlock\(error\?\.blockingEvent\)/.test(source));

// Parte 20: nenhum bypass de recovery foi introduzido — confirma que a
// navegação do header nunca teve um guard de recovery pra começo de
// conversa (BottomNav/AppLayout não bloqueiam nenhum link durante
// recovery), então o novo atalho não abre uma exceção nova.
const bottomNavSource = readFileSync('src/components/BottomNav.jsx', 'utf8');
const appLayoutSource = readFileSync('src/components/AppLayout.jsx', 'utf8');
gate('Nenhum outro item de navegação do shell é bloqueado por recovery de partida hoje (BottomNav/AppLayout não referenciam recovery para desabilitar navegação) — o atalho da data não cria uma exceção nova', !/hasTournamentRecoveryAction|activeTournamentRecovery/.test(bottomNavSource) && !/disabled=\{.*[Rr]ecovery/.test(appLayoutSource));

gate('CareerDayControl é usado nos 2 pontos do header (mobile compact + desktop) — mesmo componente, sem segunda implementação', (appLayoutSource.match(/<CareerDayControl /g) || []).length === 2);

console.log(`\n${gates} gates executados, todos PASS — Atalho de calendário no header (Hotfix 14.1): data clicável, rota canônica, Avançar intocado.`);
