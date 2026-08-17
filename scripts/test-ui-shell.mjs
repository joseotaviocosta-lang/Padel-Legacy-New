// Auditoria do Shell (Fase 3 — Sidebar, Bottom Nav e Header).
// Ver docs/NAVIGATION_ARCHITECTURE.md para a arquitetura que este teste protege.
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

// 1. As 6 macroáreas conceituais existem, com forma consistente.
const navConfig = read('src/navigation/navigationConfig.js');
check('navigationConfig.js não exporta NAV_GROUPS', navConfig.includes('export const NAV_GROUPS'));
check('navigationConfig.js não exporta ALL_SHELL_ITEMS', navConfig.includes('export const ALL_SHELL_ITEMS'));
check('navigationConfig.js não exporta groupForPath', navConfig.includes('export const groupForPath'));
check('navigationConfig.js não exporta LEGACY_AREA_TO_GROUP (compatibilidade das rotas de hub antigas)', navConfig.includes('export const LEGACY_AREA_TO_GROUP'));
for (const groupId of ["id: 'home'", "id: 'career'", "id: 'competition'", "id: 'world'", "id: 'management'", "id: 'more'"]) {
  check(`grupo de navegação ausente: ${groupId}`, navConfig.includes(groupId));
}
check('grupo "Mais" não deveria ter rota própria (to: null — abre inline/sheet, não navega)', /id: 'more'[\s\S]{0,500}to: null/.test(navConfig));
check('grupo "Início" deveria ter zero itens (link direto, sem expandir)', /id: 'home'[\s\S]{0,220}items: \[\],/.test(navConfig));

// 2. Nenhuma rota foi perdida na reorganização — todo item da IA anterior
//    (35 rotas de conteúdo, ver docs/UI_UX_AUDIT.md seção 3) continua
//    presente em algum grupo novo.
const PRESERVED_ROUTES = [
  '/profile', '/character', '/game/missions', '/game/training', '/training-center', '/game/inventory', '/game/shop',
  '/partners', '/coaches', '/staff', '/relationships', '/fans',
  '/tournaments', '/game/calendar', '/matches', '/ranking', '/game/season',
  '/journal', '/world-events', '/press', '/community', '/athletes', '/clubs', '/weather',
  '/game/economy', '/world-market', '/admin', '/database',
  '/game/stats', '/game/legacy', '/achievements', '/communications', '/history', '/hall-of-fame', '/encyclopedia',
];
for (const routePath of PRESERVED_ROUTES) {
  check(`rota perdida na reorganização do shell: ${routePath}`, navConfig.includes(`'${routePath}'`));
}
check(`contagem de rotas preservadas incorreta (esperado ${PRESERVED_ROUTES.length})`, PRESERVED_ROUTES.length === 35);

// 3. Rotas de hub legadas continuam registradas em App.jsx (nenhuma rota
//    removida/renomeada — o tutorial depende de /development e /team-hub
//    existirem literalmente, ver src/onboarding/tutorialSteps.js).
const appJsx = read('src/App.jsx');
for (const routePath of ['/development', '/team-hub', '/competitions', '/world', '/management', '/game']) {
  check(`rota de hub legada removida de App.jsx: ${routePath}`, appJsx.includes(`path="${routePath}"`));
}
check('App.jsx não deveria ter ganhado redirects novos para /development ou /team-hub (mudariam o contrato do tutorial)', !appJsx.includes('to="/career"') && !appJsx.includes('to="/more"'));

// 4. Sidebar desktop e drawer mobile consomem a mesma fonte de dados (NAV_GROUPS).
// Hotfix hierarquia de páginas (docs/PAGE_HIERARCHY_ATHLETES_HOTFIX.md):
// ALL_SHELL_ITEMS só existia em AppLayout.jsx para derivar o título de rota
// que o cabeçalho global reimprimia (currentItem/currentTitle) — removido
// nesse hotfix porque duplicava a identidade que o PageHeader de cada
// página já mostra. NAV_GROUPS/groupForPath (a fonte real da sidebar e do
// drawer mobile, que é o que este bloco protege) continuam intactos.
const appLayout = read('src/components/AppLayout.jsx');
check('AppLayout.jsx não importa NAV_GROUPS/groupForPath', /NAV_GROUPS/.test(appLayout) && appLayout.includes('groupForPath'));
check('AppLayout.jsx ainda referencia a navegação antiga (NAVIGATION_AREAS/areaForPath)', !appLayout.includes('NAVIGATION_AREAS') && !appLayout.includes('areaForPath'));
check('Sidebar recolhível (estado + persistência local) ausente', appLayout.includes('COLLAPSED_SIDEBAR_KEY') && appLayout.includes('sidebarCollapsed'));
check('Clique no ícone "Mais" recolhido não reabre a sidebar (grupo ficaria inalcançável)', appLayout.includes('onRequestExpandSidebar') || appLayout.includes('requestExpandSidebar'));
check('Sidebar não usa BrandMark oficial', appLayout.includes('BrandMark'));

// 5. Bottom nav mobile — 4 abas diretas + "Mais" abrindo bottom sheet, sem perder Gestão.
const bottomNav = read('src/components/BottomNav.jsx');
check('BottomNav.jsx não usa NAV_GROUPS', bottomNav.includes('NAV_GROUPS'));
check('BottomNav.jsx perdeu a aba "Mais"', bottomNav.includes("'more'") || bottomNav.includes('moreGroup'));
check('BottomNav.jsx não abre um BottomSheet para "Mais"', bottomNav.includes('BottomSheet'));
check('BottomNav "Mais" não inclui o grupo Gestão (ficaria inalcançável no mobile)', bottomNav.includes('managementGroup'));
check('BottomNav.jsx perdeu a env(safe-area-inset-bottom)', bottomNav.includes('env(safe-area-inset-bottom)'));
check('BottomNav.jsx ainda referencia rotas de hub antigas diretamente (deveria usar NAV_GROUPS)', !bottomNav.includes("'/development'") && !bottomNav.includes("'/team-hub'"));

// 6. NavigationHub (usado pelas 4 rotas de hub) migrado para a fonte nova + design-system oficial.
const navigationHub = read('src/pages/NavigationHub.jsx');
check('NavigationHub.jsx não usa LEGACY_AREA_TO_GROUP/NAV_GROUPS', navigationHub.includes('LEGACY_AREA_TO_GROUP') && navigationHub.includes('NAV_GROUPS'));
check('NavigationHub.jsx ainda importa da biblioteca-sombra padel/ui', !navigationHub.includes("from '@/components/padel/ui'"));
check('NavigationHub.jsx não usa Page/PageHeader oficiais', navigationHub.includes("from '@/components/design-system'"));

// 7. Header global — data sempre legível, energia/fadiga/ranking/dinheiro compactos, sino com NotificationBadge oficial.
const careerHud = read('src/components/career/CareerHud.jsx');
for (const label of ['Ranking', 'Moedas', 'Energia', 'Fadiga']) {
  check(`CareerHud não mostra "${label}" no header`, careerHud.includes(label));
}
const dayControl = read('src/components/career/CareerDayControl.jsx');
check('CareerDayControl não usa getCareerDatePresentation (dia sempre visível, ver docs/UI_UX_AUDIT.md seção 3)', dayControl.includes('getCareerDatePresentation'));
check('CareerDayControl não distingue formato completo (desktop) do compacto (mobile)', dayControl.includes('fullDate') && dayControl.includes('compactDate'));
const bell = read('src/components/communications/CommunicationBell.jsx');
check('CommunicationBell não usa o NotificationBadge oficial do design-system', bell.includes("from '@/components/design-system'") && bell.includes('NotificationBadge'));
check('CommunicationBell perdeu o aria-label acessível', bell.includes('aria-label'));

// 8. Guia da carreira e Assistente continuam acessíveis e fora do caminho do BottomNav (safe-area-aware).
const onboardingGuide = read('src/components/onboarding/OnboardingGuide.jsx');
check('OnboardingGuide (botão "?") sem env(safe-area-inset-bottom)', onboardingGuide.includes('env(safe-area-inset-bottom)'));
const careerAssistant = read('src/components/career/CareerAssistant.jsx');
check('CareerAssistant (FAB) sem env(safe-area-inset-bottom)', careerAssistant.includes('env(safe-area-inset-bottom)'));
check('CareerAssistant não fica ancorado no canto inferior direito no desktop', careerAssistant.includes('md:right-5'));

// 9. Nenhum import novo da biblioteca-sombra no shell (design-system oficial apenas — instrução Fase 3, seção 2).
for (const file of ['src/components/AppLayout.jsx', 'src/components/BottomNav.jsx', 'src/pages/NavigationHub.jsx']) {
  const source = read(file);
  check(`${file} importa de padel/ui.jsx (deveria usar design-system oficial)`, !source.includes("from '@/components/padel/ui'"));
  check(`${file} importa de padel/GameShared.jsx (deveria usar design-system oficial)`, !source.includes("from '@/components/padel/GameShared'"));
  check(`${file} importa de padel/Shared.jsx (deveria usar design-system oficial)`, !source.includes("from '@/components/padel/Shared'"));
}

console.log('UiShellTest: PASS');
console.log(`✓ ${checks} verificações — navegação, sidebar, bottom nav, header, sino, guia/assistente e rotas`);
