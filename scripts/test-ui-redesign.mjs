// Auditoria automática do redesign UI/UX (Fase 2 — Design System 2.0).
// Ver docs/UI_UX_AUDIT.md e docs/DESIGN_SYSTEM_V2.md para o diagnóstico e as
// decisões que este teste protege contra regressão.
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

// 1. Design System oficial — inventário fundamental presente.
const DESIGN_SYSTEM_FILES = [
  'src/design/tokens.js',
  'src/components/design-system/index.js',
  'src/components/design-system/Page.jsx',
  'src/components/design-system/PageHeader.jsx',
  'src/components/design-system/Surface.jsx',
  'src/components/design-system/Section.jsx',
  'src/components/design-system/StatCard.jsx',
  'src/components/design-system/StatusBadge.jsx',
  'src/components/design-system/Badge.jsx',
  'src/components/design-system/ProgressBar.jsx',
  'src/components/design-system/EmptyState.jsx',
  'src/components/design-system/LoadingState.jsx',
  'src/components/design-system/PageSkeleton.jsx',
  'src/components/design-system/ModalShell.jsx',
  'src/components/design-system/DrawerShell.jsx',
  'src/components/design-system/BottomSheet.jsx',
  'src/components/design-system/ActionFeedback.jsx',
  'src/components/design-system/IconFrame.jsx',
  'src/components/design-system/TooltipHint.jsx',
  'src/components/design-system/Button.jsx',
  'src/components/design-system/IconButton.jsx',
  'src/components/design-system/Tabs.jsx',
  'src/components/design-system/Dropdown.jsx',
  'src/components/design-system/PlayerAvatar.jsx',
  'src/components/design-system/CountryFlag.jsx',
  'src/components/design-system/RankingPosition.jsx',
  'src/components/design-system/NotificationBadge.jsx',
  'src/components/design-system/BrandMark.jsx',
  'src/components/design-system/MotionPolicy.jsx',
  'src/components/design-system/Motion.jsx',
  'src/components/design-system/useOverlayBehavior.js',
];
for (const file of DESIGN_SYSTEM_FILES) check(`arquivo fundamental ausente: ${file}`, exists(file));

// 2. O barrel exporta cada componente novo — imports de `@/components/design-system` continuam válidos.
const barrel = read('src/components/design-system/index.js');
const BARREL_EXPORTS = [
  './Page', './PageHeader', './BrandMark', './Surface', './Section', './StatCard', './StatusBadge', './Badge',
  './ProgressBar', './EmptyState', './LoadingState', './TooltipHint', './PageSkeleton', './ModalShell',
  './DrawerShell', './BottomSheet', './ActionFeedback', './IconFrame', './Button', './IconButton', './Tabs',
  './Dropdown', './PlayerAvatar', './CountryFlag', './RankingPosition', './NotificationBadge',
];
for (const moduleName of BARREL_EXPORTS) check(`export ausente no barrel do design-system: ${moduleName}`, barrel.includes(moduleName));
check('MotionPolicyProvider/useMotionPolicy não exportados pelo barrel', barrel.includes('MotionPolicyProvider') && barrel.includes('useMotionPolicy'));

// 3. Tokens — categorias consolidadas nesta fase.
const tokens = read('src/design/tokens.js');
for (const token of ['export const zIndex', 'export const shadows', 'export const transitions', 'statLarge']) {
  check(`token ausente em src/design/tokens.js: ${token}`, tokens.includes(token));
}

// 4. Política de motion — não pode existir só "no papel"; precisa estar de fato
//    consultada pelos componentes decorativos e montada uma vez no shell.
const motion = read('src/components/design-system/Motion.jsx');
check('Motion.jsx não consulta useMotionPolicy — política de motion não aplicada', motion.includes('useMotionPolicy'));
const appLayout = read('src/components/AppLayout.jsx');
check('AppLayout.jsx não monta MotionPolicyProvider', appLayout.includes('MotionPolicyProvider'));
check('AppLayout.jsx não usa o BrandMark oficial', appLayout.includes('BrandMark'));
const trainingTimer = read('src/components/training/TrainingTimerModal.jsx');
check('TrainingTimerModal (único precedente de animação contínua) não respeita allowDecorativeMotion', trainingTimer.includes('allowDecorativeMotion'));

// 5. ModalShell/DrawerShell/BottomSheet continuam com a trava de altura segura
//    (o incidente antigo da Central BETA subindo para fora da tela).
for (const [file, label, requiredClass] of [
  // ModalShell/BottomSheet: centralizados/de baixo, travados por max-height.
  // DrawerShell: h-full dentro de um `fixed inset-0` — a altura já é
  // implicitamente limitada pelo viewport, sem precisar de max-height.
  ['src/components/design-system/ModalShell.jsx', 'ModalShell', 'max-h-['],
  ['src/components/design-system/DrawerShell.jsx', 'DrawerShell', 'h-full'],
  ['src/components/design-system/BottomSheet.jsx', 'BottomSheet', 'max-h-['],
]) {
  const source = read(file);
  check(`${label} perdeu a trava de altura segura (${requiredClass})`, source.includes(requiredClass));
  check(`${label} perdeu overflow-y controlado`, source.includes('overflow-y-auto'));
}
// Primitivos Radix crus (fora do ModalShell) também precisam da trava —
// endurecidos nesta fase para não repetir o incidente em uso futuro direto.
const dialogSource = read('src/components/ui/dialog.jsx');
check('ui/dialog.jsx (DialogContent) sem max-height seguro', dialogSource.includes('max-h-[calc(100dvh'));
const sheetSource = read('src/components/ui/sheet.jsx');
check('ui/sheet.jsx (SheetContent) sem max-height seguro', sheetSource.includes('max-h-[85dvh]') && sheetSource.includes('max-h-[100dvh]'));

// 6. Responsividade base — breakpoints centralizados e alvo de toque de 44px.
check('breakpoints ausentes de src/design/tokens.js', tokens.includes('export const breakpoints'));
const indexCss = read('src/index.css');
check('alvo de toque mobile não atualizado para 44px (2.75rem)', indexCss.includes('min-height: 2.75rem'));

// 7. Branding — fundação local, sem dependência do favicon de terceiros.
for (const file of [
  'src/assets/brand/logo-mark.svg',
  'src/assets/brand/logo-horizontal.svg',
  'src/assets/brand/logo-monochrome.svg',
  'public/favicon.svg',
  'public/manifest.json',
  'docs/BRANDING.md',
]) check(`asset de marca ausente: ${file}`, exists(file));

const indexHtml = read('index.html');
check('index.html ainda referencia o favicon externo da Base44', !indexHtml.includes('base44.com/logo_v2.svg'));
check('index.html não referencia o favicon local', indexHtml.includes('/favicon.svg'));
check('index.html sem theme-color', indexHtml.includes('theme-color'));

const manifest = JSON.parse(read('public/manifest.json'));
check('manifest.json sem nome', typeof manifest.name === 'string' && manifest.name.length > 0);
check('manifest.json sem ícone', Array.isArray(manifest.icons) && manifest.icons.length > 0);

// Ícones do Tauri devem continuar intocados como fallback — build não pode quebrar por causa do logo.
for (const file of ['src-tauri/icons/32x32.png', 'src-tauri/icons/128x128.png', 'src-tauri/icons/icon.ico']) {
  check(`ícone Tauri de fallback ausente (build quebraria): ${file}`, exists(file));
}

// 8. Adapters de compatibilidade documentados como @deprecated — não podem virar permanentes silenciosamente.
for (const file of ['src/components/padel/ui.jsx', 'src/components/padel/GameShared.jsx', 'src/components/padel/Shared.jsx']) {
  const source = read(file);
  check(`${file} não documenta @deprecated`, source.includes('@deprecated'));
}
// Exports mortos confirmados (0 usos, duplicata 1:1) precisam ter sido removidos de padel/ui.jsx.
const padelUi = read('src/components/padel/ui.jsx');
for (const removed of ['SimpleHeader', 'GhostButton', 'SectionTitle', 'LinkPill', 'ResultFeedback']) {
  check(`export morto ainda presente em padel/ui.jsx: ${removed}`, !new RegExp(`function ${removed}\\(`).test(padelUi));
}

check('docs/DESIGN_SYSTEM_V2.md ausente', exists('docs/DESIGN_SYSTEM_V2.md'));
check('docs/UI_UX_AUDIT.md ausente (Fase 1)', exists('docs/UI_UX_AUDIT.md'));

// 9. Rotas principais — o redesign não pode ter removido nenhuma rota ativa.
const appJsx = read('src/App.jsx');
const ACTIVE_ROUTES = [
  '/game', '/development', '/team-hub', '/competitions', '/world', '/management',
  '/game/training', '/game/missions', '/game/shop', '/game/inventory', '/game/legacy', '/game/stats',
  '/game/calendar', '/game/season', '/game/monthly-reports', '/game/annual-reports', '/game/economy',
  '/profile', '/matches', '/tournaments', '/journal', '/ranking', '/clubs', '/clubs/:clubId', '/athletes',
  '/character', '/admin', '/database', '/history', '/hall-of-fame', '/relationships', '/coaches', '/staff',
  '/training-center', '/press', '/fans', '/achievements', '/world-events', '/world-market', '/weather',
  '/encyclopedia', '/partners', '/community', '/communications',
  '/login', '/register', '/forgot-password', '/reset-password', '/careers',
];
for (const route of ACTIVE_ROUTES) {
  check(`rota ativa removida de App.jsx: ${route}`, appJsx.includes(`path="${route}"`));
}

// 10. Navegação — sidebar/bottom nav continuam apontando para módulos existentes.
check('navigationConfig.js ausente', exists('src/navigation/navigationConfig.js'));
check('BottomNav.jsx ausente', exists('src/components/BottomNav.jsx'));

// 11. Shell (Fase 3) — cobertura detalhada de sidebar/bottom-nav/header/sino/
//     guia/assistente/safe-area/rota-ativa vive em scripts/test-ui-shell.mjs
//     (npm run test:ui-shell); aqui só confirmamos que a base que o Design
//     System 2.0 promete ao shell continua de pé.
const shellTest = exists('scripts/test-ui-shell.mjs');
check('scripts/test-ui-shell.mjs ausente (gate dedicado do shell da Fase 3)', shellTest);
check('BottomSheet (base do menu "Mais" mobile) ausente', exists('src/components/design-system/BottomSheet.jsx'));
check('NotificationBadge (base do sino) ausente', exists('src/components/design-system/NotificationBadge.jsx'));

// 12. Home (Fase 4) — cobertura detalhada (objetivo, evento, CTA, jornada,
//     ferramentas recolhidas) vive em scripts/test-home-redesign.mjs
//     (npm run test:home-redesign); aqui só confirmamos que o Centro da
//     Carreira segue no design-system oficial, sem voltar à biblioteca-sombra.
check('scripts/test-home-redesign.mjs ausente (gate dedicado da Home da Fase 4)', exists('scripts/test-home-redesign.mjs'));
const careerHubSource = read('src/pages/CareerHub.jsx');
check('CareerHub.jsx (Home) voltou a importar de padel/ui.jsx', !careerHubSource.includes("from '@/components/padel/ui'"));
check('CareerHub.jsx (Home) voltou a importar de padel/GameShared.jsx', !careerHubSource.includes("from '@/components/padel/GameShared'"));
check('CareerHub.jsx (Home) voltou a importar de padel/Shared.jsx', !careerHubSource.includes("from '@/components/padel/Shared'"));

// 13. Core Gameplay (Fase 5) — cobertura detalhada de Treinos, Calendário,
//     Torneios, Ranking e Partidas vive em scripts/test-core-gameplay-ui.mjs
//     (npm run test:core-gameplay-ui); aqui só confirmamos que as 5 páginas
//     principais seguem no design-system oficial.
check('scripts/test-core-gameplay-ui.mjs ausente (gate dedicado do core gameplay da Fase 5)', exists('scripts/test-core-gameplay-ui.mjs'));
for (const [label, file] of [
  ['Training.jsx', 'src/pages/Training.jsx'],
  ['CalendarPage.jsx', 'src/pages/CalendarPage.jsx'],
  ['Ranking.jsx', 'src/pages/Ranking.jsx'],
  ['Matches.jsx', 'src/pages/Matches.jsx'],
]) {
  const source = read(file);
  check(`${label} voltou a importar de padel/ui.jsx`, !source.includes("from '@/components/padel/ui'"));
  check(`${label} não importa do design-system oficial`, source.includes("from '@/components/design-system'"));
}

// 14. Carreira (Fase 6) — cobertura detalhada de Atleta, Dupla, Comissão
//     Técnica, Equipamentos e Estatísticas vive em scripts/test-career-ui-v2.mjs
//     (npm run test:career-ui-v2); aqui só confirmamos que as páginas
//     principais seguem no design-system oficial.
check('scripts/test-career-ui-v2.mjs ausente (gate dedicado da Carreira da Fase 6)', exists('scripts/test-career-ui-v2.mjs'));
for (const [label, file] of [
  ['PlayerProfile.jsx', 'src/pages/PlayerProfile.jsx'],
  ['PartnerHub.jsx', 'src/pages/PartnerHub.jsx'],
  ['Staff.jsx', 'src/pages/Staff.jsx'],
  ['Inventory.jsx', 'src/pages/Inventory.jsx'],
  ['Shop.jsx', 'src/pages/Shop.jsx'],
  ['CareerStats.jsx', 'src/pages/CareerStats.jsx'],
]) {
  const source = read(file);
  check(`${label} voltou a importar de padel/ui.jsx`, !source.includes("from '@/components/padel/ui'"));
  check(`${label} não importa do design-system oficial`, source.includes("from '@/components/design-system'"));
}

console.log('UiRedesignTest: PASS');
console.log(`✓ ${checks} verificações — Design System 2.0, motion policy, modais, branding, adapters, shell, Home, core gameplay, Carreira e rotas`);
