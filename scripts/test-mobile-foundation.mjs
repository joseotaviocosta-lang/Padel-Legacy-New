// Mobile M1 — Foundation (docs/MOBILE_M1_FOUNDATION.md, docs/MOBILE_AUDIT.md).
// Protege a infraestrutura compartilhada entre Windows/Android/futuro iOS:
// Android Back central, safe-area, dvh, pl-auto-contain, alvos de toque e
// toast. Não testa nenhuma página específica (fora de escopo desta fase).
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

// ── 1. Android Back — infraestrutura central única ─────────────────────────

check('overlayBackStack.js ausente', exists('src/components/design-system/overlayBackStack.js'));
const backStack = read('src/components/design-system/overlayBackStack.js');
check('overlayBackStack não registra popstate', backStack.includes("addEventListener('popstate'"));
check('overlayBackStack não empurra entrada de histórico ao registrar overlay', backStack.includes('window.history.pushState'));
check('overlayBackStack não consome histórico ao desregistrar (history.back)', backStack.includes('window.history.back()'));
check('overlayBackStack liga o listener global mais de uma vez (risco de listener duplicado)', backStack.includes('if (bound') || backStack.includes('if (bound || typeof window'));
check('overlayBackStack não guarda contra popstate programático (pendingProgrammaticPops)', backStack.includes('pendingProgrammaticPops'));
check('overlayBackStack exporta registerOverlay', backStack.includes('export function registerOverlay'));
check('overlayBackStack exporta unregisterOverlay', backStack.includes('export function unregisterOverlay'));

const overlayBehavior = read('src/components/design-system/useOverlayBehavior.js');
check('useOverlayBehavior não importa registerOverlay/unregisterOverlay', overlayBehavior.includes("from './overlayBackStack'"));
check('useOverlayBehavior não chama registerOverlay ao abrir', overlayBehavior.includes('registerOverlay(overlayId'));
check('useOverlayBehavior não chama unregisterOverlay ao fechar/desmontar', overlayBehavior.includes('unregisterOverlay(overlayId)'));
check('useOverlayBehavior não usa useId para identificar o overlay (evita colisão entre instâncias)', overlayBehavior.includes('useId()'));
check('Back no useOverlayBehavior ignora closeOnEscape=false (deveria só fechar quando closeOnEscape permite, igual ao Escape)', overlayBehavior.includes('if (closeOnEscapeRef.current) onCloseRef.current'));
check('Escape continua funcionando (não foi removido ao adicionar o Back)', overlayBehavior.includes("event.key === 'Escape' && closeOnEscape"));
check('Tab/focus-trap continua funcionando (não foi removido ao adicionar o Back)', overlayBehavior.includes("event.key !== 'Tab'"));

// Os 3 overlays compartilhados usam useOverlayBehavior — nenhum reimplementa
// tratamento de Back próprio (senão haveria listeners duplicados/divergentes).
for (const file of ['src/components/design-system/ModalShell.jsx', 'src/components/design-system/BottomSheet.jsx', 'src/components/design-system/DrawerShell.jsx']) {
  const source = read(file);
  check(`${file} não usa useOverlayBehavior (herdaria Back automaticamente)`, source.includes('useOverlayBehavior'));
  check(`${file} reimplementa tratamento de Back próprio (deveria só herdar de useOverlayBehavior)`, !source.includes('popstate'));
}

// ── 2. Stack de overlays — só o do topo fecha por Back ──────────────────────

check('overlayBackStack não usa uma pilha (array) para respeitar o overlay do topo', /const stack = \[\]/.test(backStack));
check('handlePopState não usa stack.pop() (deveria fechar só o overlay do topo, não todos)', backStack.includes('stack.pop()'));

// ── 3. Safe area — tokens centralizados ─────────────────────────────────────

const indexCss = read('src/index.css');
for (const token of ['--pl-header-h', '--pl-bottom-nav-h', '--pl-touch-min', '--pl-safe-t', '--pl-safe-b', '--pl-safe-l', '--pl-safe-r']) {
  check(`token ${token} ausente de src/index.css`, indexCss.includes(token));
}
check('safe-area usa env() com fallback', indexCss.includes('env(safe-area-inset-top, 0px)'));
for (const util of ['.pl-safe-t', '.pl-safe-b', '.pl-safe-l', '.pl-safe-r', '.pl-safe-x', '.pl-safe-y']) {
  check(`utilitário ${util} ausente de src/index.css`, indexCss.includes(util));
}

const appLayout = read('src/components/AppLayout.jsx');
check('header mobile fixo sem pl-safe-t', appLayout.includes('pl-safe-t') && appLayout.includes('md:hidden'));
check('barra desktop sem pl-safe-t (tablets/telas grandes Android)', (appLayout.match(/pl-safe-t/g) || []).length >= 2);
check('main não compensa a altura do header mobile com safe-area (pt calc)', appLayout.includes('pt-[calc(4rem+env(safe-area-inset-top))]'));
check('bottom nav perdeu a safe-area já existente (regressão)', appLayout.includes('env(safe-area-inset-bottom)'));

// ── 4. Toast — cobre header/bottom-nav em vez de sobrepor ──────────────────

const toast = read('src/components/ui/toast.jsx');
check('toast não reserva a altura do header mobile + safe-area-top', toast.includes('var(--pl-header-h)') && toast.includes('var(--pl-safe-t)'));
check('toast não reserva a altura da bottom nav + safe-area-bottom na faixa 640-767px', toast.includes('sm:pb-[calc(var(--pl-bottom-nav-h)+var(--pl-safe-b)+1rem)]'));
check('toast remove o offset extra a partir de md (bottom nav já some)', toast.includes('md:pb-4'));
check('toast não usa um único ponto central (TOAST_VIEWPORT_CLASS) para Provider e Viewport (offset duplicado)', toast.includes('const TOAST_VIEWPORT_CLASS'));

// ── 5. Viewport height — dvh como progressive enhancement, não substituição ─

check('body não tem fallback dvh (regressão de min-height:100vh)', indexCss.includes('min-height: 100vh') && indexCss.includes('min-height: 100dvh'));
check('.app-route-stage não tem fallback dvh', indexCss.includes('calc(100dvh - var(--pl-header-h))'));
check('overrides globais de min-h-screen/h-screen/max-h-screen para dvh ausentes (@supports)', indexCss.includes('@supports (height: 100dvh)') && indexCss.includes('.min-h-screen { min-height: 100dvh; }'));

// ── 6. pl-auto-contain conectado ao Page.jsx ────────────────────────────────

const pageJsx = read('src/components/design-system/Page.jsx');
check('Page.jsx ainda não aplica pl-auto-contain (causa raiz do test:performance-responsive-v36 baseline)', pageJsx.includes('pl-auto-contain'));

// ── 7. Touch targets — marcadores do design system, não CSS solto por página ─

const button = read('src/components/ui/button.jsx');
check('Button "default" sem marcador pl-btn-tap', /default:\s*"[^"]*pl-btn-tap/.test(button));
check('Button "sm" sem marcador pl-btn-tap', /sm:\s*"[^"]*pl-btn-tap/.test(button));
check('Button "icon" sem marcador pl-icon-tap', /icon:\s*"[^"]*pl-icon-tap/.test(button));
check('Button "lg" ganhou marcador indevidamente (já é >=44px, não deveria mudar)', !/lg:\s*"[^"]*pl-(btn|icon)-tap/.test(button));
check('Button "touch" ganhou marcador indevidamente (já é >=44px)', !/touch:\s*"[^"]*pl-(btn|icon)-tap/.test(button));

const iconButton = read('src/components/design-system/IconButton.jsx');
check('IconButton "default" sem marcador pl-icon-tap', /default:\s*'[^']*pl-icon-tap/.test(iconButton));
check('IconButton "sm" ganhou marcador indevidamente (contexto deliberadamente compacto)', !/sm:\s*'[^']*pl-icon-tap/.test(iconButton));

const tabsSource = read('src/components/design-system/Tabs.jsx');
check('TabsTrigger sem marcador pl-tab-trigger', tabsSource.includes('pl-tab-trigger'));

check('regra CSS para .pl-btn-tap ausente', indexCss.includes('.pl-btn-tap { min-height: var(--pl-touch-min); }'));
check('regra CSS para .pl-icon-tap ausente', indexCss.includes('.pl-icon-tap { min-height: var(--pl-touch-min); min-width: var(--pl-touch-min); }'));
check('regra CSS para .pl-tab-trigger ausente', indexCss.includes('.pl-tab-trigger { min-height: var(--pl-touch-min); }'));
check('marcadores de toque vazaram para fora do @media mobile (afetariam desktop)', (() => {
  const idx = indexCss.indexOf('.pl-btn-tap { min-height: var(--pl-touch-min); }');
  const before = indexCss.slice(0, idx);
  const lastMediaOpen = before.lastIndexOf('@media (max-width: 767px)');
  const lastBraceClose = before.lastIndexOf('\n}\n');
  return lastMediaOpen !== -1 && lastMediaOpen > lastBraceClose;
})());

// Rede de segurança para botões sem tamanho explícito também cobre overlays
// (pl-modal-panel é compartilhado por ModalShell/BottomSheet/DrawerShell).
check('rede de segurança de 44px não cobre overlays (pl-modal-panel)', indexCss.includes('.pl-modal-panel :is(button, a[role="button"])'));

// ── 8. Touch-action / overscroll — fundação global, sem duplicar por página ─

check('touch-action: manipulation não é global (base button/a/[role=button])', indexCss.includes('touch-action: manipulation'));
check('regra de touch-action antiga duplicada em .app-route-stage não foi removida (números mágicos espalhados)', !indexCss.includes('.app-route-stage :is(button, a, [role="button"]) {\n    touch-action: manipulation;'));
check('body sem overscroll-behavior-y (bounce/pull-to-refresh do Android)', indexCss.includes('overscroll-behavior-y: contain'));

// ── 9. Regressão desktop — nada removido, só adicionado/tokenizado ─────────

check('ModalShell perdeu max-h-[calc(100dvh...] (regressão de segurança de viewport)', read('src/components/design-system/ModalShell.jsx').includes('max-h-[calc(100dvh-1rem)]'));
check('BottomSheet perdeu safe-area-bottom existente (regressão)', read('src/components/design-system/BottomSheet.jsx').includes('env(safe-area-inset-bottom)'));
check('BottomNav perdeu safe-area-bottom existente (regressão)', read('src/components/BottomNav.jsx').includes('env(safe-area-inset-bottom)'));

console.log(`test:mobile-foundation OK — ${checks} verificações.`);
