import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const layout = read('src/components/AppLayout.jsx');
const dayControl = read('src/components/career/CareerDayControl.jsx');
const floatingRail = read('src/components/system/FloatingUtilityRail.jsx');
const modal = read('src/components/design-system/ModalShell.jsx');
const overlayBehavior = read('src/components/design-system/useOverlayBehavior.js');
const registration = read('src/components/calendar/TournamentRegistrationModal.jsx');
const page = read('src/components/design-system/Page.jsx');
const css = read('src/index.css');
const pkg = JSON.parse(read('package.json'));

const migratedSources = [
  'src/components/calendar/TournamentRegistrationModal.jsx',
  'src/components/athletes/AthleteDetail.jsx',
  'src/components/coaches/CoachDetail.jsx',
  'src/components/shop/ItemDetailModal.jsx',
  'src/components/press/InterviewModal.jsx',
  'src/pages/Press.jsx',
  'src/pages/Communications.jsx',
  'src/pages/WorldMarket.jsx',
  'src/components/partner/PartnerOffersPanel.jsx',
  'src/components/fans/FanBaseDetail.jsx',
  'src/components/calendar/DayAdvanceSummary.jsx',
  'src/components/tournaments/TournamentModal.jsx',
].map(read);

const checks = [
  ['botão global usa Avançar', dayControl.includes("'Avançar'")],
  ['label +1 DIA removida', !dayControl.includes('+1 DIA')],
  ['data completa preservada', dayControl.includes('date.fullDate') && dayControl.includes('whitespace-nowrap')],
  ['dia da semana preservado', dayControl.includes('date.weekday') && dayControl.includes('date.weekdayShort')],
  ['BETA não ocupa o header', !layout.includes('<BetaTools') && layout.includes('<FloatingUtilityRail')],
  ['Carreiras saiu das ações do header', floatingRail.includes('Gerenciar carreiras') && layout.includes('onOpenCareers={openCareerManager}')],
  ['atalhos flutuantes possuem safe area', floatingRail.includes('data-floating-utility-rail') && floatingRail.includes('safe-area-inset-right')],
  ['shell global impede overflow horizontal', layout.includes('overflow-x-hidden')],
  ['inscrição usa ModalShell', registration.includes('<ModalShell') && !registration.includes('fixed inset-0')],
  ['modal global usa portal no body', modal.includes('createPortal') && modal.includes('document.body')],
  ['overlay global fica fixo na viewport', modal.includes('fixed inset-0') && modal.includes('data-app-modal')],
  ['painel respeita altura da viewport', modal.includes('max-h-[calc(100dvh-1rem)]')],
  ['conteúdo grande possui scroll interno', modal.includes('overflow-y-auto') && modal.includes('overscroll-contain')],
  // O bloqueio de scroll e a restauração de foco foram extraídos para um hook
  // compartilhado (useOverlayBehavior) reutilizado por ModalShell e DrawerShell,
  // para não duplicar essa lógica entre os dois padrões de overlay.
  ['scroll de fundo e foco são restaurados', modal.includes('useOverlayBehavior') && overlayBehavior.includes("document.body.style.overflow = 'hidden'") && overlayBehavior.includes('previousFocusRef.current?.focus')],
  ['z-index segue escala global', ['--z-header: 40', '--z-floating: 50', '--z-dropdown: 60', '--z-modal: 100', '--z-toast: 120', '--z-critical: 200'].every(token => css.includes(token))],
  // M1 Foundation (docs/MOBILE_M1_FOUNDATION.md) conectou pl-auto-contain a
  // Page.jsx de propósito (era a causa raiz do baseline de
  // test:performance-responsive-v36). O que este teste protege continua
  // válido — overlays "fixed" não podem ficar presos por content-visibility
  // — só que agora por dois mecanismos: o guard de CSS que descontém quando
  // há um .fixed.inset-0 dentro do container, e o fato de ModalShell/
  // DrawerShell usarem portal direto para document.body (fora da árvore de
  // Page.jsx, então nunca ficam contidos por ela).
  ['pl-auto-contain de Page.jsx não prende overlays fixed (guard CSS presente e modais usam portal, não renderização inline)', css.includes('.pl-auto-contain:has(.fixed.inset-0)') && css.includes('contain: none !important') && modal.includes('createPortal') && modal.includes('document.body')],
  ['principais fluxos usam o padrão global', migratedSources.every(source => source.includes('ModalShell'))],
  ['não existe correção por scrollIntoView', ![layout, registration, ...migratedSources].some(source => source.includes('scrollIntoView'))],
  ['script registrado', pkg.scripts?.['test:global-header-overlay'] === 'node scripts/test-global-header-overlay-rc.mjs'],
];

for (const [name, ok] of checks) {
  assert.equal(ok, true, `FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

console.log(`GlobalHeaderOverlayRCTest: PASS (${checks.length}/${checks.length})`);
