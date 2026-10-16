// Fase 5.30 — hierarquia da Home: status → o que vem agora → prioridades →
// agenda/progresso → atalhos; UM primário (o do compromisso).
import { afterMeasurements, componentSource, functionalRuns, gateRunner, homeSource } from './lib/v530HomeKit.mjs';

const { gate, finish } = gateRunner('test-home-primary-hierarchy-v530');
const src = homeSource();
const order = ['<HomeStatusCard', '<HomeNextCommitment', '<HomePriorities', '<HomeAgenda', '<HomeProgress', '<HomeQuickActions', '<CareerToolsSection'].map((tag) => src.indexOf(tag));
gate('1. blocos na ordem status → compromisso → prioridades → agenda → progresso → atalhos → ferramentas', order.every((idx, i) => idx > 0 && (i === 0 || idx > order[i - 1])), order.join(' < '));
gate('2. blocos antigos que competiam saíram da Home (PageHeader+HUD, planejamento, calendário, mundo, atenção)', !/<IdentityHeader|<WeeklyTournamentPlanningSection|<CareerCalendar|<WorldHighlights|<AttentionList|<PriorityActionsPanel|<NextObjectiveCard/.test(src));
const primaryOutsideCommitment = ['HomeStatusCard', 'HomePriorities', 'HomeAgenda', 'HomeProgress', 'HomeQuickActions'].filter((name) => /level="primary"|pl-game-primary|bg-primary text-primary-foreground/.test(componentSource(name)));
gate('3. nenhum outro bloco da Home tem botão primário', primaryOutsideCommitment.length === 0, primaryOutsideCommitment.join(','));
gate('4. o primário do compromisso é o heroStep (fonte canônica: tutorial ou getCareerNextAction)', /<HomeNextCommitment[^>]*step=\{heroStep\}/.test(src) && src.includes('return onboardingNextAction || fallbackHeroStep;'));
for (const r of afterMeasurements().results.filter((m) => ['360', '390'].includes(m.viewport))) {
  gate(`5. [${r.state} ${r.viewport}] exatamente 1 primário visível na Home`, r.primaryCount === 1, `${r.primaryCount}: ${r.primaryLabels.join(' | ')}`);
  gate(`6. [${r.state} ${r.viewport}] primeiro primário na primeira dobra (y=${r.firstPrimaryY} ≤ ${r.vh})`, r.firstPrimaryY != null && r.firstPrimaryY <= r.vh);
}
for (const run of functionalRuns()) gate(`7. [${run.state}] cliques reais confirmam a ordem dos blocos`, run.checks.some((c) => /ordem status/.test(c.name) && c.ok));
finish();
