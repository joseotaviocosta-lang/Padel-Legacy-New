import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'src/components/design-system/TooltipHint.jsx',
  'src/components/design-system/PageSkeleton.jsx',
  'src/components/design-system/ModalShell.jsx',
  'src/components/design-system/EmptyState.jsx',
];
const failures = [];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`Ausente: ${file}`);
const index = fs.readFileSync(path.join(root, 'src/components/design-system/index.js'), 'utf8');
for (const name of ['TooltipHint', 'PageSkeleton', 'ModalShell']) if (!index.includes(name)) failures.push(`Design System não exporta ${name}`);
const migrated = ['Press.jsx', 'Athletes.jsx', 'Coaches.jsx', 'WorldMarket.jsx', 'Relationships.jsx'];
for (const page of migrated) {
  const content = fs.readFileSync(path.join(root, 'src/pages', page), 'utf8');
  if (!content.includes('PageSkeleton') && !content.includes('LoadingScreen')) failures.push(`${page} sem skeleton premium`);
}
const modal = fs.readFileSync(path.join(root, 'src/components/design-system/ModalShell.jsx'), 'utf8');
// Fase de validação final (hotfix de persistência): 'event.key === Escape' e o
// z-index literal '10000' migraram para fora de ModalShell.jsx num refactor
// já em produção — Escape/foco-trap/scroll-lock foram extraídos para o hook
// compartilhado useOverlayBehavior.js (reusado por ModalShell/BottomSheet/
// DrawerShell, ver seu comentário de topo), e o z-index virou o token de
// design system --z-modal (index.css), não mais um literal solto. A
// funcionalidade nunca deixou de existir — o teste checava o arquivo/formato
// errado. Ajustado para verificar as fontes atuais em vez de reintroduzir o
// padrão antigo.
for (const token of ['createPortal', '100dvh', 'overflow-y-auto']) if (!modal.includes(token)) failures.push(`ModalShell sem proteção: ${token}`);
if (!modal.includes('useOverlayBehavior')) failures.push('ModalShell não usa useOverlayBehavior (Escape/foco-trap compartilhado)');
const overlayBehavior = fs.readFileSync(path.join(root, 'src/components/design-system/useOverlayBehavior.js'), 'utf8');
if (!overlayBehavior.includes("event.key === 'Escape'")) failures.push('useOverlayBehavior sem tratamento de Escape');
const indexCss = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
if (!indexCss.includes('--z-modal') || !modal.includes('pl-modal-backdrop')) failures.push('ModalShell sem token de z-index (--z-modal)');
const empty = fs.readFileSync(path.join(root, 'src/components/design-system/EmptyState.jsx'), 'utf8');
if (!empty.includes('secondaryAction')) failures.push('EmptyState sem ação secundária');
if (failures.length) {
  console.error('UXInterfacesV36_3_2Test: FAIL');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log('UXInterfacesV36_3_2Test: PASS (5 páginas migradas + 3 componentes base)');
