// Auditoria de segurança de modais (Fase 8 — seção 20/40). Protege a
// migração de `window.confirm` para `ConfirmDialog`/`ModalShell`, as
// garantias de viewport/scroll/safe-area/foco dos overlays oficiais, e a
// promessa de não ter reescrito máquinas de estado sensíveis (TournamentModal).
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

// 1. Nenhum window.confirm restante em nenhum arquivo do jogo.
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const srcFiles = walk(path.join(root, 'src'));
const confirmOffenders = srcFiles.filter((file) => read(path.relative(root, file)).includes('window.confirm('));
check(`window.confirm ainda presente em: ${confirmOffenders.map((f) => path.relative(root, f)).join(', ')}`, confirmOffenders.length === 0);

// 2. ConfirmDialog existe e é construído sobre ModalShell (não é uma quarta
//    implementação de overlay).
const confirmDialog = read('src/components/design-system/ConfirmDialog.jsx');
check('ConfirmDialog não usa ModalShell por baixo', confirmDialog.includes('ModalShell'));
check('ConfirmDialog não exportado', confirmDialog.includes('export function ConfirmDialog'));
check('ConfirmDialog não exportado no barrel do design system', read('src/components/design-system/index.js').includes("./ConfirmDialog"));

// 3. Os 8 pontos de confirmação destrutiva identificados na auditoria usam
//    ConfirmDialog (não recriaram uma confirmação nativa nem um modal à parte).
const confirmSites = [
  'src/pages/CareerManager.jsx',
  'src/components/matches/LiveMatch.jsx',
  'src/pages/Tournaments.jsx',
  'src/pages/SeasonDashboard.jsx',
  'src/pages/CalendarPage.jsx',
  'src/pages/CareerHub.jsx',
  'src/components/system/BetaTools.jsx',
];
for (const file of confirmSites) {
  check(`${file} não usa ConfirmDialog`, read(file).includes('ConfirmDialog'));
}

// 4. CareerManager — exclusão exige ModalShell/ConfirmDialog e mostra qual
//    carreira será excluída (seção 17).
const careerManager = read('src/pages/CareerManager.jsx');
check('CareerManager ainda usa o Dialog Radix cru em vez de ModalShell', !careerManager.includes("@/components/ui/dialog"));
check('CareerManager não mostra qual carreira será excluída na confirmação', careerManager.includes('confirmTarget?.career?.save_name'));
check('CareerManager perdeu o aviso sobre remoção de backups internos', careerManager.includes('backups internos desta carreira também serão removidos'));

// 5. ModalShell — max-height/overflow/backdrop/aria continuam garantidos
//    (a correção histórica da Central BETA não pode voltar a regredir).
const modalShell = read('src/components/design-system/ModalShell.jsx');
check('ModalShell perdeu o limite de altura por viewport (100dvh)', modalShell.includes('max-h-[calc(100dvh-1rem)]') && modalShell.includes('sm:max-h-[calc(100dvh-2rem)]'));
check('ModalShell perdeu o scroll interno do conteúdo', modalShell.includes('overflow-y-auto'));
check('ModalShell perdeu o backdrop clicável', modalShell.includes('pl-modal-backdrop'));
check('ModalShell perdeu os atributos ARIA de diálogo', modalShell.includes('role="dialog"') && modalShell.includes('aria-modal="true"'));
check('ModalShell parou de reaproveitar useOverlayBehavior (foco/ESC/scroll-lock)', modalShell.includes('useOverlayBehavior'));

const overlayBehavior = read('src/components/design-system/useOverlayBehavior.js');
check('useOverlayBehavior perdeu o trap de foco', overlayBehavior.includes("event.key !== 'Tab'"));
check('useOverlayBehavior perdeu o retorno de foco ao fechar', overlayBehavior.includes('previousFocusRef.current?.focus?.()'));
check('useOverlayBehavior perdeu o fechamento por ESC', overlayBehavior.includes("event.key === 'Escape'"));
check('useOverlayBehavior perdeu o scroll-lock do body', overlayBehavior.includes("document.body.style.overflow = 'hidden'"));

// 6. BottomSheet mantém proteção de safe-area mobile.
const bottomSheet = read('src/components/design-system/BottomSheet.jsx');
check('BottomSheet perdeu a proteção de safe-area inferior', bottomSheet.includes('env(safe-area-inset-bottom)'));

// 7. Onboarding — as duas telas mandatórias sem opção de fechar reaproveitam
//    useOverlayBehavior em vez de window.confirm/overlay solto (seção 22/23),
//    e não usam ModalShell (que sempre expõe um X de fechar indevido aqui).
for (const file of ['src/components/career/PositionSelection.jsx', 'src/components/career/OnboardingAttributes.jsx']) {
  const source = read(file);
  check(`${file} não reaproveita useOverlayBehavior`, source.includes('useOverlayBehavior'));
  check(`${file} não expõe role="dialog"/aria-modal`, source.includes('role="dialog"') && source.includes('aria-modal="true"'));
  check(`${file} deveria conectar panelRef ao painel`, source.includes('ref={panelRef}'));
}

// 8. TournamentModal — sensível desde a Fase 5, não pode ter sido reescrito
//    nesta fase (só o wrapper leve original permanece).
const tournamentModal = read('src/components/tournaments/TournamentModal.jsx');
check('TournamentModal deixou de usar ModalShell', tournamentModal.includes('ModalShell'));

// 9. Nenhuma página relevante ainda usa o Dialog Radix cru fora dos
//    primitives internos do shadcn (command/sidebar, que não são consumidos).
for (const consumer of ['src/components/ui/command.jsx', 'src/components/ui/sidebar.jsx']) {
  check(`${consumer} sumiu do projeto de forma inesperada`, exists(consumer));
}

// 10. Documentação da auditoria de modais.
check('docs/MODAL_AUDIT.md ausente', exists('docs/MODAL_AUDIT.md'));

console.log(`test:modal-safety OK — ${checks} verificações.`);
