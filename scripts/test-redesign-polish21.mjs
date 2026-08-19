// Redesign Checkpoint — Polish 2.1 (docs/REDESIGN_POLISH_2_1.md). Hotfix
// cirúrgico pós-QA visual real: redundância do torneio na Home, legibilidade
// do Calendário, reversão do dock único de floating actions, e o hotfix do
// ícone do Windows (cache do Cargo, não os assets-fonte — ver
// scripts/test-app-icon-pipeline.mjs para a validação estrutural do ICO).
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const exists = (relPath) => fs.existsSync(path.join(root, relPath));

let checks = 0;
function check(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`FALHA: ${label}`);
}

const careerHub = read('src/pages/CareerHub.jsx');
const calendarPage = read('src/pages/CalendarPage.jsx');
const dailyBriefing = read('src/lib/dailyCareerBriefing.js');
const decisionCenter = read('src/lib/careerDecisionCenter.js');
const floatingRail = read('src/components/system/FloatingUtilityRail.jsx');
const onboardingGuide = read('src/components/onboarding/OnboardingGuide.jsx');
const activityCard = read('src/components/training/TrainingActivityCard.jsx');
const trainingSystemV2 = read('src/lib/trainingSystemV2.js');
const pkg = JSON.parse(read('package.json'));

// ── HOME ─────────────────────────────────────────────────────────────────

// Causa raiz real (docs/REDESIGN_POLISH_2_1.md): o item "tournament" do
// briefing diário (puramente informativo — "Nome em X dias") duplicava
// NextEventCard, que já mostra a mesma informação sempre, com CTA. O
// Polish 2 já tinha suprimido CareerMomentStrip e o CareerCalendar para os
// mesmos casos — este era o terceiro lugar que sobrava.
check('buildPriorityActions voltou a incluir o item "tournament" do briefing diário (duplica NextEventCard)', /if \(priority\.id === 'tournament'\) continue;/.test(careerHub));
check('CareerMomentStrip voltou a mostrar o tipo "tournament" (regressão do Polish 2)', careerHub.includes("!['tournament', 'injury'].includes(careerMoment.type)"));
check('NextEventCard (fonte única do "próximo torneio" informativo) foi removido da Home', careerHub.includes('function NextEventCard') && /<NextEventCard event=\{nextEvent\}(?: embedded)? \/>/.test(careerHub));
// Evento acionável continua podendo aparecer — via decisionCenter, id diferente de "tournament".
check('decisionCenter perdeu a decisão acionável de torneio próximo (ex.: preparar torneio)', /id: `tournament-\$\{nextTournament\.id/.test(decisionCenter) && decisionCenter.includes("actionLabel: 'Preparar torneio'"));
// Nenhuma regra de torneio (dado/lógica) foi removida — só a apresentação.
check('dailyCareerBriefing.js perdeu o cálculo de daysToTournament (lógica de dados, não deveria ter sido tocada)', dailyBriefing.includes('daysToTournament'));

// ── CALENDÁRIO ───────────────────────────────────────────────────────────

for (const label of ['energia', 'fadiga']) {
  check(`Calendário perdeu o indicador "${label}"`, calendarPage.includes(`label: '${label}'`));
}
check('Calendário perdeu o contexto da agenda no HUD', calendarPage.includes('hudLabel="Agenda atual"'));
check('Calendário perdeu o próximo torneio no HUD', calendarPage.includes("label: nextTournament?.name || 'agenda livre'"));
check('+1 dia sumiu do Calendário', calendarPage.includes("'+1 dia'"));
check('+3 dias sumiu do Calendário', calendarPage.includes("'+3 dias'"));
check('+1 semana sumiu do Calendário', calendarPage.includes("'+1 semana'"));
// Labels críticos não dependem de truncamento agressivo: nem o rótulo nem o
// nome do torneio usam a classe `truncate` na nova faixa operacional.
check('DayStatusRow usa truncate no valor ou no detalhe (nome do torneio pode virar "Los A...")', !/function DayStatusRow[\s\S]{0,700}truncate/.test(calendarPage));
check('handleAdvanceDay não usa mais advanceCareerDayOnce (lógica de avanço alterada)', calendarPage.includes('advanceCareerDayOnce'));
check('handleAdvancePeriod não usa mais advanceCareerDays (lógica de avanço alterada)', calendarPage.includes('advanceCareerDays('));
check('StatCard ainda é usado na faixa operacional (deveria ter saído — objetivo 8, não usar StatCards estreitos)', !/<StatCard\s/.test(calendarPage.split('Inscrições abertas')[0] || calendarPage));

// ── FLOATING ACTIONS ────────────────────────────────────────────────────

check('FloatingUtilityRail voltou a ser um dock único (BottomSheet "Ferramentas") — UX rejeitada pelo QA real', !floatingRail.includes('<BottomSheet') && !floatingRail.includes('aria-haspopup="dialog"'));
check('botão do Guia não é mais acessado com 1 clique', onboardingGuide.includes('onClick={() => setHelpOpen(true)}'));
check('botão de Carreiras não é mais acessado com 1 clique', /onClick=\{onOpenCareers\}/.test(floatingRail));
check('botão de Som não é mais acessado com 1 clique', /onClick=\{toggleSound\}/.test(floatingRail) && !floatingRail.includes('DockRow'));
check('BETA não é mais acessado com 1 clique (voltou a exigir abrir um menu antes)', floatingRail.includes('<BetaTools compact />'));
check('botão "Abrir guia da carreira" sem aria-label', onboardingGuide.includes('aria-label="Abrir guia da carreira"'));
check('botão "Gerenciar carreiras" sem aria-label', floatingRail.includes('aria-label="Gerenciar carreiras"'));
check('Guia contextual voltou a ser acoplado ao FloatingUtilityRail', !exists('src/components/career/CareerAssistant.jsx') && !floatingRail.includes('<OnboardingGuide') && !floatingRail.includes("from '@/components/onboarding/OnboardingGuide"));
check('Guia contextual perdeu o badge de onboarding ativo', onboardingGuide.includes('active={tutorialActive}') && onboardingGuide.includes('{active &&'));
// Estratégia coordenada de offsets: o rail deriva de --pl-header-h/--pl-safe-t
// (não números soltos por botão) e o Assistente usa seu próprio offset fixo
// e documentado (bottom, não right-top) — sem overlap entre os dois grupos.
check('FloatingUtilityRail voltou a usar offset solto em vez de --pl-header-h/--pl-safe-t', /top-\[calc\(var\(--pl-header-h\)\+var\(--pl-safe-t\)\+[\d.]+rem\)\]/.test(floatingRail));
check('<aside> do rail sem pointer-events-none (mesma defesa em profundidade do M1.1/M2)', /<aside[\s\S]{0,200}pointer-events-none/.test(floatingRail));
check('algum botão do rail perdeu pointer-events-auto', (floatingRail.match(/pointer-events-auto/g) || []).length >= 3);

// ── TREINO (freeze) ──────────────────────────────────────────────────────

check('TrainingActivityCard parou de mostrar atributo atual + ganho previsto', /profile\?\.\[attribute\]/.test(activityCard) && activityCard.includes('gain.toFixed(2)'));
check('linha compacta duração/fadiga/energia foi removida do card de treino', activityCard.includes('activity.duration') && activityCard.includes('fadiga') && activityCard.includes('energia'));
for (const fn of ['getPredictedGain', 'distributeTrainingGain', 'previewTraining']) {
  check(`trainingSystemV2.js não exporta mais ${fn} (fórmula tocada)`, trainingSystemV2.includes(`export function ${fn}`));
}

// ── WINDOWS ICON ─────────────────────────────────────────────────────────

check('master do ícone (logo-mark.svg) ausente', exists('src/assets/brand/logo-mark.svg'));
const masterSvg = read('src/assets/brand/logo-mark.svg');
check('master SVG malformado (sem <svg root)', masterSvg.trim().startsWith('<svg'));
check('icon.ico ausente', exists('src-tauri/icons/icon.ico'));
const tauriConf = JSON.parse(read('src-tauri/tauri.conf.json'));
check('tauri.conf.json não referencia icons/icon.ico no bundle', (tauriConf.bundle?.icon || []).includes('icons/icon.ico'));
check('script test:app-icon-pipeline (validação estrutural do ICO) não está registrado', pkg.scripts?.['test:app-icon-pipeline'] === 'node scripts/test-app-icon-pipeline.mjs');

check('script registrado', pkg.scripts?.['test:redesign-polish21'] === 'node scripts/test-redesign-polish21.mjs');

console.log(`test:redesign-polish21 OK — ${checks} verificações.`);
