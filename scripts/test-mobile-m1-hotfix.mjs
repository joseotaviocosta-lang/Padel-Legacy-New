// Mobile M1.1 — Hotfix pós-teste em Android real (docs/MOBILE_M1_1_DEVICE_HOTFIX.md).
// M1 (docs/MOBILE_M1_FOUNDATION.md) passou nos testes automatizados mas
// falhou em dispositivo físico: toque não chegava ao header mobile/sino em
// Android real, o X do toast "Missão concluída" era invisível/pequeno demais
// para tocar, e o X do Guia da Carreira ficava atrás da status bar. Este
// teste trava as três correções estruturais para não regredirem.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

let checks = 0;
function check(label, condition) {
  checks += 1;
  if (!condition) throw new Error(`FALHA: ${label}`);
}

// ── 1. Toast viewport vazio não intercepta toque (causa raiz do header) ────
// O container do toast fica sempre montado (mesmo sem toasts), com padding
// real (pt/pb) que ocupa ~altura do header no topo da tela. Em --z-toast
// (120, acima do header/floating rail/modais) isso bloqueava o toque em
// Android real mesmo com a área visualmente vazia.

const toast = read('src/components/ui/toast.jsx');
check('TOAST_VIEWPORT_CLASS sem pointer-events-none (caixa vazia intercepta toque no header)', /const TOAST_VIEWPORT_CLASS\s*=\s*\n?\s*"[^"]*pointer-events-none/.test(toast));
check('Toast individual perdeu pointer-events-auto (toast deixaria de ser clicável)', toast.includes('group pointer-events-auto'));
check('z-index do toast foi alterado como tentativa de correção (deveria ser causa raiz, não z-index)', toast.includes('pl-layer-toast'));

// ── 2. X do toast "Missão concluída" — invisível em toque + hitbox pequena ─
// opacity-0 + :hover/group-hover nunca ativa em touchscreen (não há
// dispositivo apontador para "hover"), então o X ficava invisível em Android
// real, com hitbox de ~24px (abaixo do alvo mínimo de 44px).

check('ToastClose ainda depende de opacity-0 (invisível em toque, nunca há :hover)', !/ToastClose[\s\S]{0,400}opacity-0/.test(toast));
check('ToastClose ainda depende de group-hover para aparecer (nunca dispara em touchscreen)', !/ToastClose[\s\S]{0,400}group-hover:opacity/.test(toast));
check('ToastClose sem pl-icon-tap (hitbox de 44px reaproveitada do design system)', /ToastClose[\s\S]{0,400}pl-icon-tap/.test(toast));
check('toastVariants não reservou espaço extra (pr-12) para a hitbox maior do X', toast.includes('pr-12'));

// ── 3. FloatingUtilityRail — offset fixo sem relação com o header real ─────
// top-[4.25rem]/md:top-20 eram números soltos, sem folga real garantida
// abaixo do header (~4px de folga assumindo status bar de altura mínima).
// Em Android real, com status bar mais alta, o <aside> (z-50, acima do
// header/barra z-40) chegava a sobrepor sino/"carreira".

const floatingRail = read('src/components/system/FloatingUtilityRail.jsx');
check('FloatingUtilityRail ainda usa offset solto (top-[4.25rem]/md:top-20) em vez do token --pl-header-h', !/top-\[4\.25rem/.test(floatingRail) && !/md:top-20\b/.test(floatingRail));
check('FloatingUtilityRail não deriva o offset de --pl-header-h (mesma altura real do header)', floatingRail.includes('top-[calc(var(--pl-header-h)+var(--pl-safe-t)+0.75rem)]'));
check('FloatingUtilityRail sem safe-area-inset-right (regressão)', floatingRail.includes('safe-area-inset-right'));
check('<aside> do FloatingUtilityRail sem pointer-events-none (espaço vazio ao redor pode roubar toque do header)', /<aside[\s\S]{0,200}pointer-events-none/.test(floatingRail));
check('botão do FloatingUtilityRail perdeu pointer-events-auto (ficaria sem clique com o container pointer-events-none)', (floatingRail.match(/pointer-events-auto/g) || []).length >= 1);
check('FloatingUtilityRail aplicou z-index como tentativa de correção (deveria ser causa raiz, não z-index)', floatingRail.includes('pl-floating-utilities'));

// ── 4. DrawerShell — Guia da Carreira sem safe-area (X sob a status bar) ───
// Painel h-full, ponta a ponta, sem nenhuma safe-area — o cabeçalho (e o X)
// renderizava colado ao topo real da tela, atrás da status bar/notch.

const drawerShell = read('src/components/design-system/DrawerShell.jsx');
check('DrawerShell sem pl-safe-t (X do Guia da Carreira sob a status bar)', /pl-modal-panel[^"]*pl-safe-t/.test(drawerShell));
check('DrawerShell sem pl-safe-b (conteúdo/rodapé sob a área de gestos)', /pl-modal-panel[^"]*pl-safe-b/.test(drawerShell));
check('DrawerShell perdeu h-full (regressão de layout do painel)', drawerShell.includes('h-full'));

// ── 5. ModalShell — mesma lacuna de safe-area, corrigida centralmente ──────
// A auditoria (docs/MOBILE_AUDIT.md) já apontava ModalShell sem safe-area
// explícita. Como o painel é centralizado (não ponta a ponta), o risco é
// menor, mas a correção central evita a mesma classe de bug no futuro.

const modalShell = read('src/components/design-system/ModalShell.jsx');
check('ModalShell sem pl-safe-t/pl-safe-b (lacuna já apontada pela auditoria não foi fechada)', /pl-modal-panel[^"]*pl-safe-t[^"]*pl-safe-b/.test(modalShell));
check('ModalShell perdeu o limite de altura por viewport (regressão)', modalShell.includes('max-h-[calc(100dvh-1rem)]') && modalShell.includes('sm:max-h-[calc(100dvh-2rem)]'));

// ── 6. Nada foi "corrigido" com z-index aleatório ───────────────────────────
// A escala de camadas (docs/MOBILE_AUDIT.md) não deveria ter mudado — as
// correções são de pointer-events/posicionamento/safe-area, não de camada.

const indexCss = read('src/index.css');
for (const [token, value] of [['--z-header', '40'], ['--z-floating', '50'], ['--z-dropdown', '60'], ['--z-modal', '100'], ['--z-toast', '120'], ['--z-critical', '200']]) {
  check(`${token} mudou de valor (correção deveria ser causa raiz, não reordenar camadas)`, indexCss.includes(`${token}: ${value};`));
}

// ── 7. Regressão — Android Back / overlays / touch targets do M1 intactos ──

check('overlayBackStack.js removido (regressão do M1)', fs.existsSync(path.join(root, 'src/components/design-system/overlayBackStack.js')));
check('useOverlayBehavior perdeu a integração com Android Back (regressão do M1)', read('src/components/design-system/useOverlayBehavior.js').includes('registerOverlay(overlayId'));
check('pl-icon-tap/pl-btn-tap/pl-tab-trigger removidos do CSS (regressão do M1)', indexCss.includes('.pl-icon-tap') && indexCss.includes('.pl-btn-tap') && indexCss.includes('.pl-tab-trigger'));

console.log(`test:mobile-m1-hotfix OK — ${checks} verificações.`);
