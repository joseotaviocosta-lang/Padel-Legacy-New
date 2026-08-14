// Mobile M2.1 — Device Hotfix (docs/MOBILE_M2_1_DEVICE_HOTFIX.md).
//
// Por que os checks 6/7 de test-mobile-m2-shell.mjs ficaram verdes com o
// sino ainda quebrado em landscape no aparelho real: eles só verificavam a
// folga geométrica do FloatingUtilityRail (o "dock" de Guia/BETA/Carreiras/
// Som) — mas o sino nunca fez parte desse componente. Ele vive dentro do
// <header> fixo do AppLayout, que tem pl-safe-t (topo) mas nunca teve
// tratamento nenhum para safe-area lateral (esquerda/direita). Em portrait
// os insets laterais são ~0 (não há notch nas bordas), então o bug nunca
// aparecia; em landscape, o recorte de câmera/notch costuma migrar para uma
// borda lateral, empurrando o controle mais à direita do header — o sino —
// para dentro (ou perto) da área não seletável. Aumentar a folga de um
// componente que não contém o sino não podia ter efeito nenhum sobre ele.
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

const appLayout = read('src/components/AppLayout.jsx');
const floatingRail = read('src/components/system/FloatingUtilityRail.jsx');
const bell = read('src/components/communications/CommunicationBell.jsx');
const overlayBehavior = read('src/components/design-system/useOverlayBehavior.js');
const overlayBackStack = read('src/components/design-system/overlayBackStack.js');
const hitTestProbe = read('src/lib/hitTestProbe.js');
const mainJsx = read('src/main.jsx');
const pkg = JSON.parse(read('package.json'));

// ── SINO EM LANDSCAPE — causa raiz real: header sem safe-area lateral ──────

check(
  'header mobile perdeu o padding-left combinado com --pl-safe-l (regressão da correção do hamburger)',
  /pl-\[calc\([\d.]+rem\+var\(--pl-safe-l\)\)\][^"]*md:hidden|md:hidden[^"]*pl-\[calc\([\d.]+rem\+var\(--pl-safe-l\)\)\]/.test(appLayout)
  || /<header[^>]*pl-\[calc\([\d.]+rem\+var\(--pl-safe-l\)\)\]/.test(appLayout),
);
check(
  'header mobile perdeu o padding-right combinado com --pl-safe-r (é onde o sino fica — a causa raiz real do bug)',
  /<header[^>]*pr-\[calc\([\d.]+rem\+var\(--pl-safe-r\)\)\]/.test(appLayout),
);
check(
  'header mobile voltou a usar px-2.5 solto (sem safe-area lateral) em vez do padding combinado',
  !/<header className="[^"]*\bpx-2\.5\b/.test(appLayout),
);
check(
  'barra desktop (ativa quando um landscape largo cruza o breakpoint md) perdeu o padding lateral combinado com safe-area',
  /app-desktop-bar[^"]*pl-\[calc\([\d.]+rem\+var\(--pl-safe-l\)\)\][^"]*pr-\[calc\([\d.]+rem\+var\(--pl-safe-r\)\)\]/.test(appLayout),
);
check(
  'CommunicationBell continua com o mesmo handleToggle de sempre (a causa não era o componente do sino em si)',
  bell.includes('function handleToggle') && bell.includes('onClick={handleToggle}'),
);
check(
  'FloatingUtilityRail perdeu a defesa pointer-events (correção do M1.1/M2, não pode regredir mesmo não sendo a causa do sino)',
  /<aside[\s\S]{0,200}pointer-events-none/.test(floatingRail) && (floatingRail.match(/pointer-events-auto/g) || []).length >= 3,
);

// ── DRAWER / HAMBURGER — causa raiz real: implementação própria sem DrawerShell ─

check(
  'drawer mobile passou a usar o DrawerShell (não deveria — ele é ancorado à direita; o hamburger abre pela esquerda)',
  !appLayout.includes("from '@/components/design-system/DrawerShell") && !/<DrawerShell/.test(appLayout),
);
check(
  'drawer mobile (motion.aside) perdeu o pl-safe-t (X voltaria a invadir a status bar/notch)',
  /<motion\.aside[^>]*pl-safe-t/.test(appLayout),
);
check(
  'drawer mobile (motion.aside) perdeu o pl-safe-b (ações do rodapé — Gerenciar carreiras/Sair — voltariam a colar na borda inferior/gesture bar)',
  /<motion\.aside[^>]*pl-safe-b/.test(appLayout),
);
check(
  'drawer mobile (motion.aside) perdeu o padding-left ligado a --pl-safe-l (borda esquerda, onde o drawer é ancorado)',
  /<motion\.aside[^>]*pl-\[var\(--pl-safe-l\)\]/.test(appLayout),
);
check(
  'botão X do drawer mobile perdeu o marcador de toque mínimo (pl-icon-tap)',
  /<button ref=\{mobileDrawerCloseRef\}[\s\S]{0,150}className="pl-icon-tap/.test(appLayout),
);
check(
  'AppLayout não importa mais useOverlayBehavior (scroll-lock/focus-trap/Android-Back do drawer do hamburger)',
  appLayout.includes("import { useOverlayBehavior } from '@/components/design-system/useOverlayBehavior'"),
);
check(
  'drawer do hamburger não usa mais useOverlayBehavior com open ligado a mobileOpen',
  /useOverlayBehavior\(\{\s*open:\s*mobileOpen/.test(appLayout),
);
check(
  'aside do drawer do hamburger perdeu o ref do useOverlayBehavior (focus-trap/Tab não funcionaria mais)',
  /<motion\.aside ref=\{mobileDrawerPanelRef\}/.test(appLayout),
);
check(
  'botão X do drawer do hamburger perdeu o ref do useOverlayBehavior (foco inicial ao abrir)',
  /ref=\{mobileDrawerCloseRef\}/.test(appLayout),
);
check(
  'drawer do hamburger ganhou dependência de :hover (quebraria em touch — nenhum item essencial pode depender só de hover)',
  !/<motion\.aside[\s\S]{0,2000}group-hover:opacity|<motion\.aside[\s\S]{0,2000}opacity-0 hover:opacity-100/.test(appLayout),
);

// ── ANDROID BACK — infraestrutura compartilhada não pode regredir ──────────

check(
  'useOverlayBehavior não registra mais no overlayBackStack (Android Back pararia de fechar overlays)',
  overlayBehavior.includes('registerOverlay(overlayId') && overlayBehavior.includes('unregisterOverlay(overlayId)'),
);
check(
  'overlayBackStack.js perdeu registerOverlay/unregisterOverlay',
  overlayBackStack.includes('export function registerOverlay') && overlayBackStack.includes('export function unregisterOverlay'),
);

// ── DEEP-LINKS — não podiam ser tocados nesta fase (Parte 11) ──────────────

check(
  'CommunicationBell parou de usar o handler central resolveAndOpenNotification (deep-link não podia ser alterado nesta fase)',
  bell.includes('resolveAndOpenNotification(message'),
);

// ── DIAGNÓSTICO CONTROLADO (Parte 3) ────────────────────────────────────────

check('script hitTestProbe.js ausente', exists('src/lib/hitTestProbe.js'));
check(
  'hitTestProbe roda automaticamente sem opt-in explícito (deveria exigir ?hitdebug=1 ou a flag em localStorage)',
  hitTestProbe.includes('function isEnabled') && hitTestProbe.includes("STORAGE_KEY") && hitTestProbe.includes('if (!isEnabled()) return;'),
);
check(
  'main.jsx não inicializa mais o hitTestProbe (ficaria indisponível no build de produção que roda no aparelho físico)',
  mainJsx.includes("import { initHitTestProbe } from '@/lib/hitTestProbe.js'") && mainJsx.includes('initHitTestProbe();'),
);

check('script registrado', pkg.scripts?.['test:mobile-m2-device-hotfix'] === 'node scripts/test-mobile-m2-1-device-hotfix.mjs');

console.log(`test:mobile-m2-device-hotfix OK — ${checks} verificações.`);
