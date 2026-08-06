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
  if (!content.includes('PageSkeleton')) failures.push(`${page} sem skeleton premium`);
}
const modal = fs.readFileSync(path.join(root, 'src/components/design-system/ModalShell.jsx'), 'utf8');
for (const token of ['createPortal', '10000', '100dvh', 'overflow-y-auto', "event.key === 'Escape'"]) if (!modal.includes(token)) failures.push(`ModalShell sem proteção: ${token}`);
const empty = fs.readFileSync(path.join(root, 'src/components/design-system/EmptyState.jsx'), 'utf8');
if (!empty.includes('secondaryAction')) failures.push('EmptyState sem ação secundária');
if (failures.length) {
  console.error('UXInterfacesV36_3_2Test: FAIL');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log('UXInterfacesV36_3_2Test: PASS (5 páginas migradas + 3 componentes base)');
