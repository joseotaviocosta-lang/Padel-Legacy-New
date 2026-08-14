// Mobile M2 — Shell / Header / Bottom Navigation (docs/MOBILE_M2_SHELL.md).
// Cobre o shell global pós-M1/M1.1 + os dois hotfixes desta fase (sino em
// landscape, deep-link de notificações). A Parte 17 do enunciado do M2 é
// explícita: os testes anteriores (incluindo notification-deep-links e
// notification-system-audit) estavam todos verdes e mesmo assim os dois
// bugs escaparam para o teste físico — porque eram checks estruturais
// (strings/imports), nunca checks de COMPORTAMENTO (a função executando).
// Este arquivo continua majoritariamente estrutural (é o que dá para
// verificar sem um dispositivo real), mas o comportamento real de
// resolveAndOpenNotification (mark-read + navigate, sem destino, destino
// inválido) já ganhou cobertura comportamental própria em
// scripts/test-notification-system-audit-rc.mjs (cenários 17-20), que este
// arquivo assume como pré-requisito e não duplica.
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

const appLayout = read('src/components/AppLayout.jsx');
const bottomNav = read('src/components/BottomNav.jsx');
const bell = read('src/components/communications/CommunicationBell.jsx');
const floatingRail = read('src/components/system/FloatingUtilityRail.jsx');
const careerDayControl = read('src/components/career/CareerDayControl.jsx');
const toast = read('src/components/ui/toast.jsx');
const drawerShell = read('src/components/design-system/DrawerShell.jsx');
const modalShell = read('src/components/design-system/ModalShell.jsx');
const overlayBehavior = read('src/components/design-system/useOverlayBehavior.js');
const overlayBackStack = read('src/components/design-system/overlayBackStack.js');
const pageJsx = read('src/components/design-system/Page.jsx');
const indexCss = read('src/index.css');
const communications = read('src/pages/Communications.jsx');
const careerCommunications = read('src/lib/careerCommunications.js');

// ── 1. Header mobile respeita safe-area ─────────────────────────────────────
check('header mobile sem pl-safe-t', appLayout.includes('pl-safe-t') && appLayout.includes('md:hidden'));

// ── 2. Bottom nav respeita safe-area ────────────────────────────────────────
check('BottomNav sem env(safe-area-inset-bottom)', bottomNav.includes('env(safe-area-inset-bottom)'));

// ── 3. Touch targets estruturais do shell ───────────────────────────────────
check('hamburguer do menu mobile sem marcador de toque (pl-icon-tap)', /Abrir navegação[\s\S]{0,80}pl-icon-tap|pl-icon-tap[\s\S]{0,120}Abrir navegação/.test(appLayout) || /onClick=\{\(\) => setMobileOpen\(true\)\}[^>]*className="pl-icon-tap/.test(appLayout));
check('fechar do menu mobile sem marcador de toque (pl-icon-tap)', /Fechar navegação"[^>]*onClick=\{\(\) => setMobileOpen\(false\)\}[^>]*className="pl-icon-tap|className="pl-icon-tap[^"]*"[^>]*><X/.test(appLayout));
check('sino compacto sem marcador de toque (pl-icon-tap) — hitbox de 36px no mobile', /pl-icon-tap[^`]*compact \? 'h-9 w-9'/.test(bell));
check('botão Avançar do header sem marcador de toque (pl-btn-tap)', careerDayControl.includes('pl-btn-tap'));
check('botões individuais do FloatingUtilityRail abaixo de 44px (h-11 w-11)', floatingRail.includes('h-11 w-11'));

// ── 4. ToastViewport vazio não bloqueia o header (M1.1, não pode regredir) ─
check('TOAST_VIEWPORT_CLASS sem pointer-events-none', /const TOAST_VIEWPORT_CLASS\s*=\s*\n?\s*"[^"]*pointer-events-none/.test(toast));
check('Toast individual perdeu pointer-events-auto', toast.includes('group pointer-events-auto'));

// ── 5. FloatingUtilityRail sem caixa invisível bloqueando controles ────────
check('<aside> do dock sem pointer-events-none', /<aside[\s\S]{0,200}pointer-events-none/.test(floatingRail));
check('botão do dock perdeu pointer-events-auto', floatingRail.includes('pointer-events-auto'));

// ── 6/7. FloatingUtilityRail: folga com o header (regressão, não é o sino) ─
// Hotfix M2: aumentou a margem vertical entre o dock (Guia/BETA/Carreiras/
// Som) e o header de 0.75rem para 1.5rem. Isso é uma correção geométrica
// legítima do dock e continua protegida aqui — mas o teste físico do M2.1
// provou que essa mudança NUNCA poderia ter corrigido o sino em landscape,
// porque o CommunicationBell não é renderizado dentro do FloatingUtilityRail
// — ele vive no <header> do AppLayout, um componente diferente. A causa raiz
// real (safe-area lateral ausente no header) e sua correção estão cobertas
// em scripts/test-mobile-m2-1-device-hotfix.mjs, não aqui.
check('folga do dock com o header não deriva mais de --pl-header-h', /top-\[calc\(var\(--pl-header-h\)\+var\(--pl-safe-t\)\+[\d.]+rem\)\]/.test(floatingRail));
check('folga do dock com o header regrediu para 0.75rem (era o valor insuficiente encontrado no teste físico)', !/\+0\.75rem\)\]/.test(floatingRail));
check('CommunicationBell não é renderizado no header mobile', (appLayout.match(/<CommunicationBell/g) || []).length === 2);
check('barra desktop (landscape/≥768px) perdeu o sino', appLayout.includes('app-desktop-bar') && /app-desktop-bar[\s\S]*?<CommunicationBell/.test(appLayout));

// ── 8/9. DrawerShell/ModalShell respeitam safe-area (M1.1, não pode regredir) ─
check('DrawerShell sem pl-safe-t/pl-safe-b', /pl-modal-panel[^"]*pl-safe-t[^"]*pl-safe-b/.test(drawerShell));
check('ModalShell sem pl-safe-t/pl-safe-b', /pl-modal-panel[^"]*pl-safe-t[^"]*pl-safe-b/.test(modalShell));

// ── 10. overlayBackStack permanece integrado ────────────────────────────────
check('useOverlayBehavior não registra mais no overlayBackStack', overlayBehavior.includes('registerOverlay(overlayId') && overlayBehavior.includes('unregisterOverlay(overlayId)'));
check('overlayBackStack.js foi removido', overlayBackStack.includes('export function registerOverlay') && overlayBackStack.includes('export function unregisterOverlay'));

// ── 11. pl-auto-contain permanece conectado ─────────────────────────────────
check('Page.jsx perdeu pl-auto-contain', pageJsx.includes('pl-auto-contain'));

// ── 12. dvh permanece configurado ───────────────────────────────────────────
check('dvh sumiu do body/app-route-stage', indexCss.includes('min-height: 100dvh') && indexCss.includes('calc(100dvh - var(--pl-header-h))'));

// ── 13. Nenhuma regressão óbvia de pointer-events fora do esperado ─────────
check('touch-action: manipulation deixou de ser global', indexCss.includes('touch-action: manipulation'));
check('overscroll-behavor-y do body sumiu', indexCss.includes('overscroll-behavior-y: contain'));

// ── 14. Notification handler resolve destino ────────────────────────────────
check('resolveAndOpenNotification não resolve destino (resolveNotificationDestination)', careerCommunications.includes('resolveNotificationDestination(normalized)'));

// ── 15/16. Guia (Central de Comunicações) e sino usam o mesmo fluxo ────────
check('Central de Comunicações não usa o handler central compartilhado', communications.includes('resolveAndOpenNotification(normalized'));
check('sino não usa o handler central compartilhado', bell.includes('resolveAndOpenNotification(message'));

// ── 17. markAsRead não substitui navigate (os dois no mesmo bloco) ─────────
check('resolveAndOpenNotification não marca como lida', careerCommunications.includes('await markCareerCommunicationRead(normalized)'));
check('resolveAndOpenNotification não navega mesmo com destino acionável', /destination\.actionable[\s\S]{0,80}navigate\(destination\.route\)/.test(careerCommunications));

// ── 18. Notificação sem destino não navega arbitrariamente ─────────────────
check('navigate não está condicionado a destination.actionable (navegaria para tudo, inclusive sem destino)', /if \(destination\.actionable && typeof navigate === 'function'\)/.test(careerCommunications));

// ── 19. Destino inválido possui fallback seguro (não lança, não trava) ─────
check('markCareerCommunicationRead sem tratamento de falha (destino/ID inexistente derrubaria o clique)', careerCommunications.includes('markCareerCommunicationRead(normalized).catch(() => null)'));

// ── 20. Notificação já lida pode preservar a ação de navegar ───────────────
check('navegação ficou condicionada a isCareerMessageUnread (perderia a ação ao clicar de novo numa já lida)', !/if \(isCareerMessageUnread\(normalized\)\) \{[\s\S]{0,200}navigate\(destination\.route\)/.test(careerCommunications));

// ── 21. Overlay fecha sem cancelar a navegação ──────────────────────────────
check('Central de Comunicações abre o modal de detalhe mesmo em mensagem acionável sem decisão pendente (deveria navegar direto e não abrir overlay)', /destination\.actionable && !needsDecisionReview\)\s*\{\s*await resolveAndOpenNotification/.test(communications));

// ── 22. Nenhuma navegação dupla ─────────────────────────────────────────────
check('handleMessageClick do sino chama navigate mais de uma vez por clique', (bell.match(/navigate\(/g) || []).length <= 1);

// ── 23. Comportamento do shell não depende de hover ─────────────────────────
for (const [label, source] of [['toast.jsx', toast], ['FloatingUtilityRail.jsx', floatingRail], ['BottomNav.jsx', bottomNav], ['AppLayout.jsx (header mobile)', appLayout]]) {
  check(`${label} tem função essencial escondida atrás de opacity-0 + hover`, !/opacity-0[\s\S]{0,120}(group-)?hover:opacity-100/.test(source));
}

// ── 24. Mobile shell não introduz overflow horizontal estrutural ───────────
check('AppLayout perdeu overflow-x-hidden do <main>', appLayout.includes('overflow-x-hidden'));

console.log(`test:mobile-m2-shell OK — ${checks} verificações.`);
