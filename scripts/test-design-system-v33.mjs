import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const required = [
  'src/design/tokens.js',
  'src/components/design-system/Page.jsx',
  'src/components/design-system/PageHeader.jsx',
  'src/components/design-system/Surface.jsx',
  'src/components/design-system/StatCard.jsx',
  'src/components/design-system/StatusBadge.jsx',
  'src/components/design-system/ProgressBar.jsx',
  'src/components/design-system/EmptyState.jsx',
  'src/components/design-system/LoadingState.jsx',
  'src/components/design-system/index.js',
  'DESIGN-SYSTEM-v33.md',
];

const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) throw new Error(`Arquivos ausentes: ${missing.join(', ')}`);

const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');
for (const token of ['--success:', '--warning:', '--premium:', '--info:', '.pl-page-hero', '.pl-surface', '.pl-stat-card']) {
  if (!css.includes(token)) throw new Error(`Token/classe ausente: ${token}`);
}

const components = fs.readFileSync(path.join(root, 'src/components/design-system/index.js'), 'utf8');
for (const moduleName of ['./Page', './PageHeader', './Surface', './StatCard', './StatusBadge', './ProgressBar', './EmptyState', './LoadingState']) {
  if (!components.includes(moduleName)) throw new Error(`Export ausente: ${moduleName}`);
}

console.log('DesignSystemV33Test: PASS');
console.log(`✓ ${required.length} arquivos fundamentais`);
console.log('✓ tokens semânticos e superfícies');
console.log('✓ componentes base reutilizáveis');
console.log('✓ documentação de uso');
