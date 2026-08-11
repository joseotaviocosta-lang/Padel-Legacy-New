import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));

const modalShell = read('src/components/design-system/ModalShell.jsx');
const drawerShell = read('src/components/design-system/DrawerShell.jsx');
const overlayHook = read('src/components/design-system/useOverlayBehavior.js');
const barrel = read('src/components/design-system/index.js');
const css = read('src/index.css');

const tournamentsPage = read('src/pages/Tournaments.jsx');
const calendarPage = read('src/pages/CalendarPage.jsx');
const developmentGoals = read('src/components/training/DevelopmentGoals.jsx');
const economyPage = read('src/pages/Economy.jsx');

// Every file migrated off the bespoke "fixed inset-0 z-50 ... onClick={onClose}"
// backdrop pattern in this audit (Categories 1-3 of the migration plan).
const migratedOverlayFiles = [
  'src/components/tournaments/TournamentBracket.jsx',
  'src/components/career/PartnerSelection.jsx',
  'src/components/legacy/RetirementModal.jsx',
  'src/components/legacy/NewAthleteModal.jsx',
  'src/components/partner/PartnerNegotiationModal.jsx',
  'src/components/economy/SponsorNegotiationModal.jsx',
  'src/components/matches/SimulationModal.jsx',
  'src/components/training/TrainingTimerModal.jsx',
  'src/pages/Clubs.jsx',
  'src/components/clubs/ClubEvents.jsx',
  'src/components/partner/InboxPanel.jsx',
  'src/pages/Relationships.jsx',
  'src/components/hof/HallOfFameDetail.jsx',
  'src/components/history/HistoryEntryModal.jsx',
  'src/components/encyclopedia/EncyclopediaDetail.jsx',
  'src/components/system/BetaWelcome.jsx',
  'src/components/system/BetaTools.jsx',
  'src/components/career/CareerAssistant.jsx',
  'src/components/onboarding/OnboardingGuide.jsx',
];

const bespokeBackdropPattern = /fixed inset-0 z-(\[?(50|60|100)\]?)\s+flex[^"]*"\s+onClick=\{onClose\}/;
const scrollHackPattern = /scrollIntoView\(|window\.scrollTo\(/;

const checks = [];

// 1. Global modal standard exists with the guarantees the user's spec requires.
checks.push(['ModalShell usa Portal para document.body', modalShell.includes('createPortal') && modalShell.includes('document.body')]);
checks.push(['ModalShell/hook bloqueia scroll do fundo', modalShell.includes('useOverlayBehavior') && overlayHook.includes("document.body.style.overflow = 'hidden'")]);
checks.push(['ModalShell/hook fecha com ESC', overlayHook.includes("event.key === 'Escape'")]);
checks.push(['ModalShell tem max-height e scroll interno', modalShell.includes('max-h-[calc(100dvh') && modalShell.includes('overflow-y-auto')]);
checks.push(['ModalShell define role dialog/aria-modal', modalShell.includes('role="dialog"') && modalShell.includes('aria-modal="true"')]);
checks.push(['ModalShell/hook restaura foco ao fechar', overlayHook.includes('previousFocusRef.current?.focus')]);
checks.push(['ModalShell nunca fica montado fechado', modalShell.includes('if (!open || typeof document === \'undefined\') return null;')]);

// 2. DrawerShell shares the same behavior via one hook (no second competing overlay system).
checks.push(['DrawerShell existe e reusa useOverlayBehavior', drawerShell.includes('useOverlayBehavior') && drawerShell.includes('createPortal')]);
checks.push(['ModalShell também usa useOverlayBehavior (lógica não duplicada)', modalShell.includes('useOverlayBehavior')]);
checks.push(['useOverlayBehavior centraliza scroll-lock + ESC + focus-trap', overlayHook.includes("style.overflow = 'hidden'") && overlayHook.includes("key === 'Escape'") && overlayHook.includes("key !== 'Tab'")]);
checks.push(['DrawerShell exportado no barrel do design-system', barrel.includes("./DrawerShell")]);

// 3. Tournaments.jsx (the reference page) is fully converged onto ModalShell.
checks.push(['Tournaments.jsx não contém mais overlay bespoke fixed inset-0', !bespokeBackdropPattern.test(tournamentsPage)]);
checks.push(['TournamentBracket usa ModalShell', read('src/components/tournaments/TournamentBracket.jsx').includes('<ModalShell')]);
checks.push(['PartnerSelection usa ModalShell', read('src/components/career/PartnerSelection.jsx').includes('<ModalShell')]);

// 4. The two genuine inline-in-flow bugs (Category 1) are fixed.
checks.push(['Calendário abre detalhes do dia em ModalShell, não inline', calendarPage.includes('<ModalShell') && calendarPage.includes('dayDetailsOpen')]);
checks.push([
  'Calendário só abre o modal do dia em clique explícito/deep link, não ao carregar ou avançar',
  (calendarPage.match(/setDayDetailsOpen\(true\)/g) || []).length === 2,
]);
checks.push(['Formulário de nova meta usa ModalShell, não inline', developmentGoals.includes('<ModalShell') && !developmentGoals.includes('glass rounded-2xl p-4 border border-primary/30 animate-fade-in')]);

// 5. Every Category 2/3 file lost its bespoke backdrop boilerplate.
for (const file of migratedOverlayFiles) {
  const source = read(file);
  checks.push([`${file}: sem backdrop bespoke fixed inset-0`, !bespokeBackdropPattern.test(source)]);
  checks.push([`${file}: usa ModalShell ou DrawerShell`, source.includes('<ModalShell') || source.includes('<DrawerShell')]);
}

// 6. No file in the migrated set was "fixed" with scrollIntoView/window.scrollTo instead.
for (const file of [...migratedOverlayFiles, 'src/pages/CalendarPage.jsx', 'src/components/training/DevelopmentGoals.jsx']) {
  checks.push([`${file}: não usa scrollIntoView/window.scrollTo`, !scrollHackPattern.test(read(file))]);
}

// 7. z-index scale: new dropdown/toast layer classes exist and are wired where the
// audit found hardcoded numbers that numerically duplicated the scale.
checks.push(['Escala de z-index define camada de dropdown', css.includes('--z-dropdown: 60') && css.includes('.pl-layer-dropdown { z-index: var(--z-dropdown); }')]);
checks.push(['Escala de z-index define camada de toast', css.includes('--z-toast: 120') && css.includes('.pl-layer-toast { z-index: var(--z-toast); }')]);
checks.push(['CommunicationBell usa a camada de dropdown padronizada', read('src/components/communications/CommunicationBell.jsx').includes('pl-layer-dropdown') && !read('src/components/communications/CommunicationBell.jsx').includes('z-[60]')]);
checks.push(['Toast usa a camada padronizada', read('src/components/ui/toast.jsx').includes('pl-layer-toast') && !read('src/components/ui/toast.jsx').includes('z-[120]')]);

// 8. Deep links still open the right resource (regression guard — these already worked,
// confirm the migration did not remove any of the existing query-param handling).
checks.push(['Torneios: deep link ?tournament abre modal', tournamentsPage.includes("searchParams.get('tournament')")]);
checks.push(['Calendário: deep link ?event abre modal do dia', calendarPage.includes("searchParams.get('event')") && calendarPage.includes('setDayDetailsOpen(true)')]);
checks.push(['Imprensa: deep link ?interview ainda existe', read('src/pages/Press.jsx').includes("searchParams.get('interview')")]);
checks.push(['Comunicações: deep link ?message ainda existe', read('src/pages/Communications.jsx').includes("searchParams.get('message')")]);
checks.push(['Treinadores: deep link ?coach ainda existe', read('src/pages/Coaches.jsx').includes("searchParams.get('coach')")]);
checks.push(['Ranking: deep link ?athlete ainda existe', read('src/pages/Ranking.jsx').includes("searchParams.get('athlete')")]);
checks.push(['Economia: deep link ?sponsor/?contract agora abre a aba correta', economyPage.includes("searchParams.get('sponsor')") && economyPage.includes("searchParams.get('contract')")]);

// 9. Script registered.
checks.push(['script registrado', pkg.scripts?.['test:global-overlays']?.includes('test-global-overlays-audit.mjs')]);

for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`PASS: ${name}`);
}
console.log(`GlobalOverlaysAuditTest: PASS (${checks.length}/${checks.length})`);
