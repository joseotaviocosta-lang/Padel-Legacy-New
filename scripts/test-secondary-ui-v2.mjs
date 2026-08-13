// Auditoria do redesign de áreas secundárias (Fase 8 — Central BETA,
// Configurações, Saves, Auth e telas técnicas). Ver docs/SECONDARY_UI.md
// para as decisões que este teste protege. Modais são cobertos em detalhe
// por test:modal-safety — aqui só confirmamos que as superfícies certas os
// utilizam.
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

// 1. Central BETA — reorganizada em grupos visuais, sem perder nenhuma
//    ferramenta real (feedback/diagnóstico/exportação/estatísticas).
const betaTools = read('src/components/system/BetaTools.jsx');
check('BetaTools perdeu o agrupamento visual da Fase 8', betaTools.includes('const MODE_GROUPS'));
check('BetaTools perdeu a classificação de severidade (StatusBadge)', betaTools.includes('SEVERITY_META') && betaTools.includes('StatusBadge'));
for (const tab of ["['feedback', 'Relatar problema']", "['suggestion', 'Sugerir melhoria']", "['rating', 'Avaliar sistemas']", "['changelog', 'Changelog']", "['checklist', 'Checklist']", "['save', 'Proteção do save']", "['health', 'Saúde do mundo']", "['tester', 'Estatísticas']", "['insights', 'Insights']", "['inspector', 'Save Inspector']", "['analytics', 'Sessão atual']", "['diagnostic', 'Diagnóstico']"]) {
  check(`BetaTools perdeu a aba ${tab} (protegida por test:beta-analytics/test:rc-beta-intelligence)`, betaTools.includes(tab));
}
check('BetaTools deixou de usar ModalShell (correção histórica de viewport)', betaTools.includes('ModalShell'));

// 2. Configurações — página nova, dados reais (som + versão real), roteada
//    e alcançável pela navegação.
check('src/pages/Settings.jsx ausente', exists('src/pages/Settings.jsx'));
const settings = read('src/pages/Settings.jsx');
check('Settings não usa o Design System oficial', settings.includes("from '@/components/design-system'"));
check('Settings não reaproveita as preferências reais de som (uiSound.js)', settings.includes('loadUiSoundPreferences') && settings.includes('saveUiSoundPreferences'));
check('Settings inventou um toggle de performance sem implementação (deveria ser somente leitura)', !/<(button|input)[^>]*onClick[^>]*(reducedMotion|lowPower|compactViewport)/.test(settings));
check('Settings não lê a versão real do app (__APP_VERSION__)', settings.includes('__APP_VERSION__'));
check('Settings não usa BrandMark', settings.includes('BrandMark'));
check("rota /settings ausente em App.jsx", read('src/App.jsx').includes('path="/settings"'));
check("rota /settings ausente em routeModules.js", read('src/lib/routeModules.js').includes("'/settings': 'Settings'"));
check("Configurações ausente da navegação (grupo Mais)", read('src/navigation/navigationConfig.js').includes("{ to: '/settings', icon: Cog, label: 'Configurações' }"));

// 3. Saves — CareerManager usa ModalShell/ConfirmDialog (não Dialog cru nem
//    window.confirm), mostra dados de metadata leve (season/ranking/último
//    acesso) sem carregar a carreira inteira, e diferencia Continuar de
//    Excluir visualmente.
const careerManager = read('src/pages/CareerManager.jsx');
check('CareerManager não usa o Design System oficial', careerManager.includes("from '@/components/design-system'"));
check('CareerManager perdeu os campos leves de metadata (season/ranking_position/last_played_at)', ['career.season', 'career.ranking_position', 'career.last_played_at'].every((field) => careerManager.includes(field)));
check('CareerManager não chama loadCareer/readCareer só para desenhar a lista', !/(filteredCareers|sortedCareers|visibleCareers)[\s\S]{0,120}(loadCareer|readCareer)\(/.test(careerManager));
check('Botão Continuar não está marcado como ação primária', careerManager.includes('bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground'));
check('Botão Excluir perdeu o tratamento de perigo', careerManager.includes('border-rose-400/20 bg-rose-400/5') && careerManager.includes('text-rose-300'));

// 4. Telas secundárias — Admin/DatabaseManager/Season/Weather migradas para
//    o Design System oficial, sem loading global desnecessário.
for (const [file, label] of [
  ['src/pages/Admin.jsx', 'Admin'],
  ['src/pages/DatabaseManager.jsx', 'DatabaseManager'],
  ['src/pages/Season.jsx', 'Season'],
  ['src/pages/Weather.jsx', 'Weather'],
]) {
  const source = read(file);
  check(`${label} não usa o Design System oficial`, source.includes("from '@/components/design-system'"));
  check(`${label} ainda usa o LoadingScreen bloqueante legado`, !source.includes('<LoadingScreen'));
  check(`${label} não usa PageSkeleton`, source.includes('PageSkeleton'));
}
check('Season ainda usa EmptyStateCard legado', !read('src/pages/Season.jsx').includes('EmptyStateCard'));
check('Weather ainda usa EmptyStateCard legado', !read('src/pages/Weather.jsx').includes('EmptyStateCard'));

// 5. NavigationHub — confirmado como não-obsoleto (ainda serve 4 rotas de
//    hub), preservado sem remoção.
check('NavigationHub.jsx foi removido (ainda serve /development, /team-hub, /competitions, /management)', exists('src/pages/NavigationHub.jsx'));
const appJsx = read('src/App.jsx');
for (const routePath of ['/development', '/team-hub', '/competitions', '/management']) {
  check(`rota ${routePath} deixou de apontar para NavigationHub`, appJsx.includes(`path="${routePath}"`) && appJsx.includes('NavigationHub'));
}

// 6. Auth — BrandMark aparece no layout compartilhado das 4 telas de auth.
const authLayout = read('src/components/AuthLayout.jsx');
check('AuthLayout não renderiza o BrandMark oficial', authLayout.includes('<BrandMark'));

// 7. Select oficial — criado sobre o primitive Radix já existente, com pelo
//    menos duas migrações reais (não substitui todos os selects nativos).
check('design-system/Select.jsx ausente', exists('src/components/design-system/Select.jsx'));
const selectComponent = read('src/components/design-system/Select.jsx');
check('Select não usa o primitive @/components/ui/select (Radix)', selectComponent.includes("@/components/ui/select"));
check('WorldMarket não migrou para o Select oficial', read('src/pages/WorldMarket.jsx').includes('<Select'));
check('CareerManager não migrou o ordenar-por para o Select oficial', careerManager.includes('<Select'));

// 8. Dados fabricados identificados na Fase 7 — não devem ter sido tratados
//    nesta fase (fora de escopo, seção 34), só documentados.
const socialNetwork = read('src/lib/socialNetwork.js');
check('TRENDING_TOPICS deixou de existir (mudança de dados fora do escopo desta fase)', socialNetwork.includes('TRENDING_TOPICS'));

// 9. Documentação da fase.
for (const doc of ['docs/SECONDARY_UI.md', 'docs/MODAL_AUDIT.md', 'docs/REDESIGN_STATUS.md']) {
  check(`${doc} ausente`, exists(doc));
}

console.log(`test:secondary-ui-v2 OK — ${checks} verificações.`);
